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

use base64::Engine as _;
use crossbeam_channel::{bounded, Receiver, Sender};
use wasapi::{DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GdiFlush, SelectObject,
    BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowRect, GetWindowThreadProcessId, IsHungAppWindow, IsIconic,
};
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
/// drop untitled ones and our own windows (recording the picker itself makes no
/// sense), attach a JPEG thumbnail per window so the picker can show them
/// visually, and sort by app then title so windows group naturally.
pub fn list_windows() -> AppResult<Vec<WindowInfo>> {
    enumerate_windows(true)
}

/// Same enumeration without the (expensive) per-window thumbnails — cheap
/// enough to poll, e.g. by the meeting auto-detection.
pub fn list_windows_meta() -> AppResult<Vec<WindowInfo>> {
    enumerate_windows(false)
}

fn enumerate_windows(with_thumbnails: bool) -> AppResult<Vec<WindowInfo>> {
    let windows =
        Window::enumerate().map_err(|e| AppError::Video(format!("enumerate windows: {e}")))?;
    let own_pid = std::process::id();

    let mut out = Vec::new();
    for w in windows {
        let Ok(title) = w.title() else { continue };
        if title.trim().is_empty() {
            continue;
        }
        let hwnd = HWND(w.as_raw_hwnd());
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
        if pid == own_pid {
            continue;
        }
        let app = w.process_name().unwrap_or_default();
        out.push(WindowInfo {
            id: (w.as_raw_hwnd() as isize).to_string(),
            title,
            app,
            thumbnail: if with_thumbnails {
                capture_thumbnail(hwnd)
            } else {
                None
            },
        });
    }
    out.sort_by(|a, b| {
        let app = a.app.to_lowercase().cmp(&b.app.to_lowercase());
        app.then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
    });
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

// ---------------------------------------------------------------------------
// Window thumbnails (for the Start-screen picker)
// ---------------------------------------------------------------------------

/// `PrintWindow` flag asking DWM for the full composed content — required for
/// GPU-rendered windows (Chrome, Electron, UWP apps), which come out black
/// without it. Defined since Windows 8.1 but not surfaced by the `windows`
/// crate's metadata, so declared locally.
/// <https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-printwindow>
const PW_RENDERFULLCONTENT: PRINT_WINDOW_FLAGS = PRINT_WINDOW_FLAGS(2);

/// Thumbnail bounding box (px) for the picker grid, and the JPEG quality —
/// together they keep each entry roughly 10–25 KB over IPC.
const THUMB_MAX_W: u32 = 320;
const THUMB_MAX_H: u32 = 200;
const THUMB_JPEG_QUALITY: u8 = 70;

/// Snapshot one window into a small JPEG data URL via `PrintWindow` into a
/// 32-bpp DIB — the standard window-picker technique (it sees occluded windows,
/// unlike a screen BitBlt). Returns `None` for anything that can't produce a
/// useful image: minimized (stale surface), hung (PrintWindow would block on the
/// window's message loop), zero-sized, or rendered all-black (DRM/protected).
fn capture_thumbnail(hwnd: HWND) -> Option<String> {
    unsafe {
        if IsIconic(hwnd).as_bool() || IsHungAppWindow(hwnd).as_bool() {
            return None;
        }
        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).ok()?;
        let w = rect.right.saturating_sub(rect.left).max(0) as u32;
        let h = rect.bottom.saturating_sub(rect.top).max(0) as u32;
        if w < 16 || h < 16 {
            return None;
        }

        let mem_dc = CreateCompatibleDC(None);
        if mem_dc.is_invalid() {
            return None;
        }
        // Top-down (negative height) BGRA DIB so rows read out in natural order.
        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w as i32,
                biHeight: -(h as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
        let Ok(dib) = CreateDIBSection(None, &bmi, DIB_RGB_COLORS, &mut bits, None, 0) else {
            let _ = DeleteDC(mem_dc);
            return None;
        };
        let prev = SelectObject(mem_dc, HGDIOBJ::from(dib));

        let printed = PrintWindow(hwnd, mem_dc, PW_RENDERFULLCONTENT).as_bool();
        let _ = GdiFlush();

        // Copy the pixels out before tearing the GDI objects down.
        let pixels = printed.then(|| {
            std::slice::from_raw_parts(bits as *const u8, (w as usize) * (h as usize) * 4).to_vec()
        });

        SelectObject(mem_dc, prev);
        let _ = DeleteObject(HGDIOBJ::from(dib));
        let _ = DeleteDC(mem_dc);

        let pixels = pixels?;
        if is_blank_bgra(&pixels) {
            return None;
        }
        encode_thumbnail_jpeg(&pixels, w, h)
    }
}

/// BGRA pixels → aspect-fit RGB thumbnail → JPEG → `data:image/jpeg;base64,…`.
fn encode_thumbnail_jpeg(bgra: &[u8], w: u32, h: u32) -> Option<String> {
    let mut rgb = Vec::with_capacity((w as usize) * (h as usize) * 3);
    for px in bgra.as_chunks::<4>().0 {
        rgb.extend_from_slice(&[px[2], px[1], px[0]]);
    }
    let full = image::RgbImage::from_raw(w, h, rgb)?;
    let (tw, th) = fit_thumb_size(w, h, THUMB_MAX_W, THUMB_MAX_H);
    let thumb = image::imageops::thumbnail(&full, tw, th);

    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(
        std::io::Cursor::new(&mut jpeg),
        THUMB_JPEG_QUALITY,
    )
    .encode_image(&thumb)
    .ok()?;
    Some(format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&jpeg)
    ))
}

/// Aspect-fit `(w, h)` into `(max_w, max_h)` without ever upscaling, clamping
/// each side to at least 1px so degenerate window sizes can't yield a zero
/// dimension (which the JPEG encoder rejects).
fn fit_thumb_size(w: u32, h: u32, max_w: u32, max_h: u32) -> (u32, u32) {
    let scale = f64::min(
        1.0,
        f64::min(
            f64::from(max_w) / f64::from(w.max(1)),
            f64::from(max_h) / f64::from(h.max(1)),
        ),
    );
    let out_w = (f64::from(w) * scale).round() as u32;
    let out_h = (f64::from(h) * scale).round() as u32;
    (out_w.max(1), out_h.max(1))
}

/// `true` when a BGRA buffer carries no visible content — every color channel
/// at or below a small threshold. `PrintWindow` yields all-black for windows it
/// cannot render (DRM-protected, some GPU surfaces); those thumbnails are worse
/// than a placeholder, so the caller drops them.
fn is_blank_bgra(pixels: &[u8]) -> bool {
    const NEAR_BLACK: u8 = 8;
    pixels
        .as_chunks::<4>()
        .0
        .iter()
        .all(|px| px[0] <= NEAR_BLACK && px[1] <= NEAR_BLACK && px[2] <= NEAR_BLACK)
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

#[cfg(test)]
mod tests {
    use super::{fit_thumb_size, is_blank_bgra};

    #[test]
    fn fit_thumb_size_downscales_landscape_to_the_box() {
        assert_eq!(fit_thumb_size(1920, 1080, 320, 180), (320, 180));
    }

    #[test]
    fn fit_thumb_size_fits_portrait_by_height() {
        // 1080x1920 limited by height: 1080 * (180/1920) = 101.25 -> 101.
        assert_eq!(fit_thumb_size(1080, 1920, 320, 180), (101, 180));
    }

    #[test]
    fn fit_thumb_size_never_upscales_small_windows() {
        assert_eq!(fit_thumb_size(200, 100, 320, 180), (200, 100));
    }

    #[test]
    fn fit_thumb_size_clamps_degenerate_sizes_to_at_least_one_pixel() {
        let (w, h) = fit_thumb_size(10_000, 1, 320, 180);
        assert_eq!((w, h), (320, 1));
        assert!(w >= 1 && h >= 1);
    }

    #[test]
    fn is_blank_bgra_detects_black_and_near_black_frames() {
        // All-zero (fully black) and uniform near-black noise are both "blank".
        assert!(is_blank_bgra(&[0u8; 4 * 16]));
        assert!(is_blank_bgra(&[5u8; 4 * 16]));
        assert!(is_blank_bgra(&[]));
    }

    #[test]
    fn is_blank_bgra_keeps_frames_with_real_content() {
        // One bright green pixel (BGRA) among black ones.
        let mut px = vec![0u8; 4 * 16];
        px[4 * 7 + 1] = 200; // G of pixel 7
        assert!(!is_blank_bgra(&px));
    }
}
