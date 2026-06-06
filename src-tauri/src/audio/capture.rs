use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use crossbeam_channel::{bounded, Receiver, Sender};
use wasapi::{DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat};

use crate::audio::{TARGET_CHANNELS, TARGET_SAMPLE_RATE};
use crate::error::{AppError, AppResult};

/// A running capture of one source, delivering 16 kHz / 16-bit / mono PCM as
/// `Vec<i16>` chunks over `rx`. The realtime WASAPI work runs on its own thread.
pub struct CaptureHandle {
    pub rx: Receiver<Vec<i16>>,
    stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
}

impl CaptureHandle {
    /// Signal the capture thread to stop and wait for it to finish.
    pub fn stop(mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(j) = self.join.take() {
            let _ = j.join();
        }
    }
}

impl Drop for CaptureHandle {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(j) = self.join.take() {
            let _ = j.join();
        }
    }
}

#[derive(Clone, Copy, Debug)]
enum Source {
    /// System output (what you hear) — captured via WASAPI loopback.
    Loopback,
    /// Microphone / default input.
    Mic,
}

/// Start capturing system audio (loopback). `device_id` selects the output device
/// to loopback, or `None` for the system default.
pub fn start_loopback_capture(device_id: Option<String>) -> AppResult<CaptureHandle> {
    start_capture(Source::Loopback, device_id)
}

/// Start capturing the microphone. `device_id` selects the input device, or `None`
/// for the system default.
pub fn start_mic_capture(device_id: Option<String>) -> AppResult<CaptureHandle> {
    start_capture(Source::Mic, device_id)
}

fn start_capture(source: Source, device_id: Option<String>) -> AppResult<CaptureHandle> {
    // Small bounded channel: if the consumer lags we drop fresh chunks rather
    // than let latency grow unbounded.
    let (tx, rx) = bounded::<Vec<i16>>(64);
    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();

    let name = match source {
        Source::Loopback => "cap-loopback",
        Source::Mic => "cap-mic",
    };

    let join = thread::Builder::new()
        .name(name.to_string())
        .spawn(move || {
            if let Err(e) = capture_thread(source, device_id, tx, stop_thread) {
                eprintln!("[audio] {source:?} capture stopped: {e}");
            }
        })
        .map_err(|e| AppError::Audio(format!("spawn capture thread: {e}")))?;

    Ok(CaptureHandle {
        rx,
        stop,
        join: Some(join),
    })
}

fn find_device_by_id(
    enumerator: &DeviceEnumerator,
    direction: &Direction,
    id: &str,
) -> AppResult<wasapi::Device> {
    let collection = enumerator
        .get_device_collection(direction)
        .map_err(|e| AppError::Audio(e.to_string()))?;
    for dev in &collection {
        let Ok(dev) = dev else { continue };
        if dev.get_id().map(|d| d == id).unwrap_or(false) {
            return Ok(dev);
        }
    }
    Err(AppError::Audio(format!("device id not found: {id}")))
}

fn capture_thread(
    source: Source,
    device_id: Option<String>,
    tx: Sender<Vec<i16>>,
    stop: Arc<AtomicBool>,
) -> AppResult<()> {
    // WASAPI is COM + blocking; this dedicated thread joins the multithreaded apartment.
    wasapi::initialize_mta()
        .ok()
        .map_err(|e| AppError::Audio(format!("COM init: {e}")))?;

    let enumerator = DeviceEnumerator::new().map_err(|e| AppError::Audio(e.to_string()))?;

    // Loopback captures the *render* (output) device; mic the *capture* (input) device.
    let device_dir = match source {
        Source::Loopback => Direction::Render,
        Source::Mic => Direction::Capture,
    };
    let device = match device_id.as_deref() {
        Some(id) => find_device_by_id(&enumerator, &device_dir, id)?,
        None => enumerator
            .get_default_device(&device_dir)
            .map_err(|e| AppError::Audio(format!("no default {device_dir} device: {e}")))?,
    };

    let mut audio_client = device
        .get_iaudioclient()
        .map_err(|e| AppError::Audio(e.to_string()))?;

    // With autoconvert, WASAPI hands us exactly Deepgram-ready PCM — 16-bit signed
    // int, 16 kHz, mono — converting from the device's native format for us.
    let desired = WaveFormat::new(
        16,
        16,
        &SampleType::Int,
        TARGET_SAMPLE_RATE as usize,
        TARGET_CHANNELS as usize,
        None,
    );
    let blockalign = desired.get_blockalign() as usize; // 2 bytes per frame (i16 mono)

    let (default_period, _min_period) = audio_client
        .get_device_period()
        .map_err(|e| AppError::Audio(e.to_string()))?;

    // Polling mode is REQUIRED for loopback (the loopback stream flag is incompatible
    // with the event-callback flag). We use polling for the mic too, for one code path.
    // Device = Render + init direction = Capture => loopback; Capture + Capture => mic.
    let mode = StreamMode::PollingShared {
        autoconvert: true,
        buffer_duration_hns: default_period,
    };
    audio_client
        .initialize_client(&desired, &Direction::Capture, &mode)
        .map_err(|e| AppError::Audio(format!("initialize_client ({source:?}): {e}")))?;

    let capture_client = audio_client
        .get_audiocaptureclient()
        .map_err(|e| AppError::Audio(e.to_string()))?;

    let mut raw: VecDeque<u8> = VecDeque::with_capacity(blockalign * TARGET_SAMPLE_RATE as usize);

    audio_client
        .start_stream()
        .map_err(|e| AppError::Audio(e.to_string()))?;

    // Poll several times per buffer period; loopback delivers nothing during silence,
    // so we never block — we just read whatever is available and sleep.
    let poll = Duration::from_millis(8);

    while !stop.load(Ordering::Relaxed) {
        capture_client
            .read_from_device_to_deque(&mut raw)
            .map_err(|e| AppError::Audio(format!("read ({source:?}): {e}")))?;

        let frames = raw.len() / blockalign;
        if frames > 0 {
            let mut samples = Vec::with_capacity(frames);
            for _ in 0..frames {
                let lo = raw.pop_front().unwrap();
                let hi = raw.pop_front().unwrap();
                samples.push(i16::from_le_bytes([lo, hi]));
            }
            // Non-blocking: drop if the consumer is far behind (favor fresh audio).
            let _ = tx.try_send(samples);
        }

        thread::sleep(poll);
    }

    let _ = audio_client.stop_stream();
    Ok(())
}
