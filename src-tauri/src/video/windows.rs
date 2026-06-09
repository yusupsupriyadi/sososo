//! Windows video-capture backend.
//!
//! Records a chosen window to an MP4 (H.264 video + AAC audio) via the
//! `windows-capture` crate (Windows.Graphics.Capture + a Media Foundation
//! encoder). The audio track is your microphone mixed with the system/loopback
//! audio, captured here at **48 kHz / stereo** with WASAPI — deliberately
//! separate from the 16 kHz / mono stream that feeds Deepgram, so transcription
//! quality is untouched. Both audio sources run on their own polling threads
//! (mirroring `audio/capture/windows.rs`) and are drained, summed by
//! [`VideoAudioMixer`], and fed to the encoder once per captured video frame.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crossbeam_channel::{bounded, Receiver, Sender};
use wasapi::{DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat};
use windows_capture::capture::{CaptureControl, Context, GraphicsCaptureApiHandler};
use windows_capture::encoder::{
    AudioSettingsBuilder, ContainerSettingsBuilder, VideoEncoder, VideoSettingsBuilder,
    VideoSettingsSubType,
};
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::InternalCaptureControl;
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
    MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
};
use windows_capture::window::Window;

use super::mixer::VideoAudioMixer;
use super::{VideoStartConfig, WindowInfo};
use crate::error::{AppError, AppResult};

/// The video recording's audio-track format (the encoder's AAC defaults too).
const VIDEO_SAMPLE_RATE: u32 = 48_000;
const VIDEO_CHANNELS: u16 = 2;
/// Max drift (interleaved samples) tolerated between the mic and system streams
/// before the starved side is silence-padded — ~100 ms at 48 kHz stereo.
const AUDIO_MIX_MAX_SKEW: usize = 9_600;
/// Capture frame-rate cap (fps). 30 is plenty for screen/meeting recording and
/// gives the encoder + the (single-buffer) capture frame pool far more headroom
/// per frame — reducing the surface-reuse race that shows up as flicker/tearing
/// and choppy playback when capture outruns the encoder.
const TARGET_FPS: u32 = 30;

/// Handler error type. `Box<dyn Error + Send + Sync>` keeps the trait happy and
/// absorbs the encoder/WinRT errors via `?`.
type HandlerError = Box<dyn std::error::Error + Send + Sync>;

// ---------------------------------------------------------------------------
// Window enumeration (for the Start-screen picker)
// ---------------------------------------------------------------------------

/// List capturable top-level windows. `Window::enumerate` already filters to
/// visible, non-tool, non-child windows owned by other processes; we additionally
/// drop untitled ones so the picker stays meaningful.
pub fn list_windows() -> AppResult<Vec<WindowInfo>> {
    let windows =
        Window::enumerate().map_err(|e| AppError::Video(format!("enumerate windows: {e}")))?;

    let mut out = Vec::new();
    for w in windows {
        let Ok(title) = w.title() else { continue };
        if title.trim().is_empty() {
            continue;
        }
        let app = w.process_name().unwrap_or_default();
        out.push(WindowInfo {
            id: (w.as_raw_hwnd() as isize).to_string(),
            title,
            app,
        });
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// 48 kHz / stereo WASAPI audio capture (mic + system) for the video track
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug)]
enum AudioSource {
    /// System output we loopback-capture (a render device).
    Loopback,
    /// Microphone / default input (a capture device).
    Mic,
}

/// A running 48 kHz/stereo capture thread feeding `Vec<i16>` chunks over a
/// crossbeam channel. Stops (and joins) on `stop()` or when dropped.
struct AudioCap {
    stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
}

impl AudioCap {
    fn stop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(j) = self.join.take() {
            let _ = j.join();
        }
    }
}

impl Drop for AudioCap {
    fn drop(&mut self) {
        self.stop();
    }
}

fn find_device_by_id(
    enumerator: &DeviceEnumerator,
    direction: &Direction,
    id: &str,
) -> AppResult<wasapi::Device> {
    let collection = enumerator
        .get_device_collection(direction)
        .map_err(|e| AppError::Video(e.to_string()))?;
    for dev in &collection {
        let Ok(dev) = dev else { continue };
        if dev.get_id().map(|d| d == id).unwrap_or(false) {
            return Ok(dev);
        }
    }
    Err(AppError::Video(format!("device id not found: {id}")))
}

fn start_audio_capture(
    source: AudioSource,
    device_id: Option<String>,
) -> AppResult<(Receiver<Vec<i16>>, AudioCap)> {
    // Generous bound: we want to keep audio (gaps would shift A/V), and the
    // handler drains this every video frame (~16 ms), so it rarely fills.
    let (tx, rx) = bounded::<Vec<i16>>(128);
    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();
    let name = match source {
        AudioSource::Mic => "vid-cap-mic",
        AudioSource::Loopback => "vid-cap-sys",
    };

    let join = thread::Builder::new()
        .name(name.to_string())
        .spawn(move || {
            if let Err(e) = audio_capture_loop(source, device_id, tx, stop_thread) {
                eprintln!("[video] {name} audio capture stopped: {e}");
            }
        })
        .map_err(|e| AppError::Video(format!("spawn audio thread: {e}")))?;

    Ok((
        rx,
        AudioCap {
            stop,
            join: Some(join),
        },
    ))
}

/// WASAPI polling capture at 48 kHz / stereo / 16-bit, mirroring the proven
/// `audio/capture/windows.rs` loop (different format, same shape). `autoconvert`
/// makes WASAPI hand us exactly that format regardless of the device's native one.
fn audio_capture_loop(
    source: AudioSource,
    device_id: Option<String>,
    tx: Sender<Vec<i16>>,
    stop: Arc<AtomicBool>,
) -> AppResult<()> {
    wasapi::initialize_mta()
        .ok()
        .map_err(|e| AppError::Video(format!("COM init: {e}")))?;

    let enumerator = DeviceEnumerator::new().map_err(|e| AppError::Video(e.to_string()))?;

    let device_dir = match source {
        AudioSource::Loopback => Direction::Render,
        AudioSource::Mic => Direction::Capture,
    };
    let device = match device_id.as_deref() {
        Some(id) => find_device_by_id(&enumerator, &device_dir, id)?,
        None => enumerator
            .get_default_device(&device_dir)
            .map_err(|e| AppError::Video(format!("no default {device_dir} device: {e}")))?,
    };

    let mut audio_client = device
        .get_iaudioclient()
        .map_err(|e| AppError::Video(e.to_string()))?;

    let desired = WaveFormat::new(
        16,
        16,
        &SampleType::Int,
        VIDEO_SAMPLE_RATE as usize,
        VIDEO_CHANNELS as usize,
        None,
    );

    let (default_period, _min_period) = audio_client
        .get_device_period()
        .map_err(|e| AppError::Video(e.to_string()))?;

    // Polling mode is required for loopback (incompatible with event callbacks);
    // the mic polls too for a single code path. Device dir selects loopback vs mic.
    let mode = StreamMode::PollingShared {
        autoconvert: true,
        buffer_duration_hns: default_period,
    };
    audio_client
        .initialize_client(&desired, &Direction::Capture, &mode)
        .map_err(|e| AppError::Video(format!("initialize_client ({source:?}): {e}")))?;

    let capture_client = audio_client
        .get_audiocaptureclient()
        .map_err(|e| AppError::Video(e.to_string()))?;

    let mut raw: VecDeque<u8> = VecDeque::with_capacity(4 * VIDEO_SAMPLE_RATE as usize);

    audio_client
        .start_stream()
        .map_err(|e| AppError::Video(e.to_string()))?;

    let poll = Duration::from_millis(8);

    while !stop.load(Ordering::Relaxed) {
        capture_client
            .read_from_device_to_deque(&mut raw)
            .map_err(|e| AppError::Video(format!("read ({source:?}): {e}")))?;

        // Two bytes per i16 sample (interleaved stereo — channel layout is
        // preserved end to end since we never split frames).
        let total_samples = raw.len() / 2;
        if total_samples > 0 {
            let mut samples = Vec::with_capacity(total_samples);
            for _ in 0..total_samples {
                let lo = raw.pop_front().unwrap();
                let hi = raw.pop_front().unwrap();
                samples.push(i16::from_le_bytes([lo, hi]));
            }
            // Non-blocking; if the handler lags briefly we drop the oldest chunk.
            let _ = tx.try_send(samples);
        }

        thread::sleep(poll);
    }

    let _ = audio_client.stop_stream();
    Ok(())
}

// ---------------------------------------------------------------------------
// Graphics-capture handler (video frames + muxed audio → encoder)
// ---------------------------------------------------------------------------

/// Flags handed to the capture handler when the session starts.
struct CaptureFlags {
    out_path: PathBuf,
    mic_rx: Receiver<Vec<i16>>,
    sys_rx: Receiver<Vec<i16>>,
}

/// The `windows-capture` handler. Owns the encoder (built lazily from the first
/// frame's real size so it matches exactly), the two audio receivers, and the mixer.
struct Capture {
    encoder: Option<VideoEncoder>,
    out_path: PathBuf,
    mic_rx: Receiver<Vec<i16>>,
    sys_rx: Receiver<Vec<i16>>,
    mixer: VideoAudioMixer,
    /// Frames sent so far + capture start, for a periodic "alive / fps" log line.
    frames: u64,
    start: Instant,
}

impl Capture {
    /// The real per-frame work, split out so [`on_frame_arrived`] can run it under
    /// `catch_unwind`: a panic must never unwind into the WinRT/COM frame callback
    /// (that aborts the whole app) — we log it and stop the capture instead.
    fn process_frame(&mut self, frame: &mut Frame) -> Result<(), HandlerError> {
        // Build the encoder on the first frame using the frame's true dimensions
        // (rounded to even for H.264 4:2:0) to avoid size mismatches/padding.
        if self.encoder.is_none() {
            let width = frame.width() & !1;
            let height = frame.height() & !1;
            eprintln!(
                "[video] first frame {width}x{height}; building encoder -> {}",
                self.out_path.display()
            );
            let encoder = VideoEncoder::new(
                VideoSettingsBuilder::new(width, height)
                    .frame_rate(TARGET_FPS)
                    .sub_type(VideoSettingsSubType::H264),
                AudioSettingsBuilder::new()
                    .sample_rate(VIDEO_SAMPLE_RATE)
                    .channel_count(VIDEO_CHANNELS as u32)
                    .bit_per_sample(16),
                ContainerSettingsBuilder::new(),
                &self.out_path,
            )?;
            self.encoder = Some(encoder);
            // Discard audio captured during startup (before this first video
            // frame) so the audio track starts aligned with video frame 0 instead
            // of leading it (which would show up as an A/V delay from the start).
            while self.mic_rx.try_recv().is_ok() {}
            while self.sys_rx.try_recv().is_ok() {}
            self.mixer = VideoAudioMixer::new(AUDIO_MIX_MAX_SKEW);
        }

        // Drain + mix this frame's worth of audio first (keeps borrows disjoint).
        while let Ok(chunk) = self.mic_rx.try_recv() {
            self.mixer.push_mic(&chunk);
        }
        while let Ok(chunk) = self.sys_rx.try_recv() {
            self.mixer.push_system(&chunk);
        }
        let audio = self.mixer.drain_mixed_bytes();

        let encoder = self.encoder.as_mut().expect("encoder built above");
        if let Err(e) = encoder.send_frame(frame) {
            eprintln!("[video] send_frame failed: {e}");
            return Err(e.into());
        }
        if !audio.is_empty() {
            // Timestamp arg is ignored by the encoder (monotonic audio clock).
            if let Err(e) = encoder.send_audio_buffer(&audio, 0) {
                eprintln!("[video] send_audio_buffer failed: {e}");
                return Err(e.into());
            }
        }

        self.frames += 1;
        if self.frames.is_multiple_of(300) {
            let secs = self.start.elapsed().as_secs_f32().max(0.001);
            eprintln!(
                "[video] {} frames in {secs:.1}s (~{:.0} fps)",
                self.frames,
                self.frames as f32 / secs
            );
        }
        Ok(())
    }
}

impl GraphicsCaptureApiHandler for Capture {
    type Flags = CaptureFlags;
    type Error = HandlerError;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let flags = ctx.flags;
        Ok(Self {
            encoder: None,
            out_path: flags.out_path,
            mic_rx: flags.mic_rx,
            sys_rx: flags.sys_rx,
            mixer: VideoAudioMixer::new(AUDIO_MIX_MAX_SKEW),
            frames: 0,
            start: Instant::now(),
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        _capture_control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        // Never let a panic unwind into the COM frame callback (that aborts the
        // whole process). Catch it, log the reason, and stop the capture cleanly.
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| self.process_frame(frame))) {
            Ok(result) => result,
            Err(panic) => {
                let msg = panic
                    .downcast_ref::<&str>()
                    .map(|s| (*s).to_string())
                    .or_else(|| panic.downcast_ref::<String>().cloned())
                    .unwrap_or_else(|| "unknown panic".to_string());
                eprintln!("[video] capture handler panicked: {msg}");
                Err(format!("video capture panicked: {msg}").into())
            }
        }
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        // The captured window was closed — finalize now so the MP4 is valid even
        // if this happens before the session teardown stops us. Idempotent: a
        // later stop()/drop finds `None` and does nothing.
        if let Some(encoder) = self.encoder.take() {
            encoder.finish()?;
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Public recorder handle
// ---------------------------------------------------------------------------

/// A running window recording. Finalized via [`VideoRecorder::stop`], which stops
/// the capture thread (finalizing the MP4 as the encoder drops) and then stops
/// the audio feeders.
pub struct VideoRecorder {
    control: Option<CaptureControl<Capture, HandlerError>>,
    // Field order matters for Drop: `control` is taken+stopped first in `stop()`;
    // these stop via their own `Drop` when the recorder is dropped. `_mic` is
    // `None` in system-only mode (no mic captured for the video track).
    _mic: Option<AudioCap>,
    _sys: AudioCap,
    out_path: PathBuf,
}

impl VideoRecorder {
    /// Stop recording and finalize the MP4. Returns the saved file path.
    pub fn stop(mut self) -> AppResult<PathBuf> {
        eprintln!("[video] stopping recording -> {}", self.out_path.display());
        if let Some(control) = self.control.take() {
            // `stop()` posts WM_QUIT and joins the capture thread; as the
            // returned-by-value `CaptureControl` drops, the last handler `Arc`
            // drops, dropping the encoder, whose `Drop` flushes + finalizes the
            // file. So when this returns Ok, the MP4 is complete.
            control
                .stop()
                .map_err(|e| AppError::Video(format!("stop capture: {e}")))?;
        }
        eprintln!("[video] recording finalized -> {}", self.out_path.display());
        // The mic/system `AudioCap`s stop + join via their `Drop` as `self` ends.
        Ok(self.out_path)
    }
}

/// Start recording `cfg.window_id` (a raw HWND, as a decimal string) to
/// `cfg.out_path`, muxing mic + system audio. `cfg.out_path`'s parent directory
/// must already exist.
pub fn start_window_recording(cfg: VideoStartConfig) -> AppResult<VideoRecorder> {
    let hwnd_val: isize = cfg
        .window_id
        .parse()
        .map_err(|_| AppError::Video(format!("invalid window id: {}", cfg.window_id)))?;
    let window = Window::from_raw_hwnd(hwnd_val as *mut std::ffi::c_void);
    if !window.is_valid() {
        return Err(AppError::Video(
            "the selected window is no longer available".into(),
        ));
    }

    eprintln!(
        "[video] starting window recording (system_only={}) -> {}",
        cfg.system_only,
        cfg.out_path.display()
    );

    // System audio is always captured. The mic is mixed in only when NOT in
    // system-only mode: recording a video/music shouldn't capture your mic — it
    // would double up with the system audio (and clip). When skipped, the mixer
    // pads the mic side with silence, yielding a clean system-only track.
    let (mic_rx, mic) = if cfg.system_only {
        let (mic_tx, mic_rx) = bounded::<Vec<i16>>(1);
        drop(mic_tx); // disconnected receiver — the handler never gets mic audio
        (mic_rx, None)
    } else {
        let (rx, cap) = start_audio_capture(AudioSource::Mic, cfg.mic_device)?;
        (rx, Some(cap))
    };
    let (sys_rx, sys) = start_audio_capture(AudioSource::Loopback, cfg.system_device)?;

    let flags = CaptureFlags {
        out_path: cfg.out_path.clone(),
        mic_rx,
        sys_rx,
    };
    let settings = Settings::new(
        window,
        CursorCaptureSettings::Default,
        DrawBorderSettings::Default,
        SecondaryWindowSettings::Default,
        // Cap delivery to ~TARGET_FPS so capture doesn't outrun the encoder.
        MinimumUpdateIntervalSettings::Custom(Duration::from_millis(1000 / u64::from(TARGET_FPS))),
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        flags,
    );

    let control = Capture::start_free_threaded(settings)
        .map_err(|e| AppError::Video(format!("start capture: {e}")))?;

    Ok(VideoRecorder {
        control: Some(control),
        _mic: mic,
        _sys: sys,
        out_path: cfg.out_path,
    })
}
