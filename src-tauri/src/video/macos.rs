//! macOS video-capture backend (ScreenCaptureKit, via the `screencapturekit` crate).
//!
//! Records a chosen window straight to an MP4 (H.264 + system audio + microphone)
//! using `SCRecordingOutput` — ScreenCaptureKit encodes and muxes to the file for
//! us, so unlike the Windows backend there is **no** manual frame pump, encoder,
//! or audio mixer here. The 16 kHz Deepgram audio path is untouched.
//!
//! Runtime requirements (the feature is gated to recent macOS in the UI/build):
//! - macOS 14+ for `SCRecordingOutput` (direct-to-file), 15+ for microphone.
//! - **Screen Recording** permission (System Settings → Privacy & Security), and
//!   `NSScreenCaptureUsageDescription` / `NSMicrophoneUsageDescription` in
//!   `Info.plist` (see `src-tauri/Info.plist`). The first capture triggers the prompt.
//!
//! NOTE: this was written against the documented `screencapturekit` v7 API but
//! could not be compiled on the (Windows) dev machine — points that may need a
//! small adjustment once compiled on macOS are marked `// VERIFY ON MAC`.

use std::path::PathBuf;
use std::sync::mpsc;
use std::thread::{self, JoinHandle};

use screencapturekit::prelude::*;
use screencapturekit::recording_output::{
    SCRecordingOutputCodec, SCRecordingOutputConfiguration, SCRecordingOutputFileType,
};

use super::{VideoStartConfig, WindowInfo};
use crate::error::{AppError, AppResult};

/// Audio-track format (matches the Windows path); ScreenCaptureKit muxes it.
const VIDEO_SAMPLE_RATE: u32 = 48_000;
const VIDEO_CHANNELS: u32 = 2;

/// List capturable windows via `SCShareableContent`.
pub fn list_windows() -> AppResult<Vec<WindowInfo>> {
    let content = SCShareableContent::get()
        .map_err(|e| AppError::Video(format!("shareable content: {e:?}")))?;

    let mut out = Vec::new();
    for window in content.windows() {
        // VERIFY ON MAC: SCWindow accessors — `title() -> Option<String>`,
        // `owning_application() -> Option<SCRunningApplication>` with
        // `application_name() -> String`, `window_id() -> u32`.
        let title = window.title().unwrap_or_default();
        if title.trim().is_empty() {
            continue;
        }
        let app = window
            .owning_application()
            .map(|a| a.application_name())
            .unwrap_or_default();
        out.push(WindowInfo {
            id: window.window_id().to_string(),
            title,
            app,
        });
    }
    Ok(out)
}

/// A running window recording. The `SCStream` lives entirely on its own thread
/// (ScreenCaptureKit objects aren't `Send`), so this handle only carries a stop
/// channel + join handle + the output path — all `Send`, as the session task needs.
pub struct VideoRecorder {
    stop_tx: mpsc::Sender<()>,
    join: Option<JoinHandle<()>>,
    out_path: PathBuf,
}

impl VideoRecorder {
    /// Stop recording and finalize the MP4. Returns the saved file path.
    pub fn stop(mut self) -> AppResult<PathBuf> {
        let _ = self.stop_tx.send(());
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
        Ok(self.out_path)
    }
}

/// Start recording `cfg.window_id` to `cfg.out_path` (video + system audio, plus
/// mic unless `system_only`). The capture is created and driven on a dedicated
/// thread; this returns once the stream has started (or with the setup error).
pub fn start_window_recording(cfg: VideoStartConfig) -> AppResult<VideoRecorder> {
    let out_path = cfg.out_path.clone();
    let (ready_tx, ready_rx) = mpsc::channel::<AppResult<()>>();
    let (stop_tx, stop_rx) = mpsc::channel::<()>();

    let join = thread::Builder::new()
        .name("vid-cap-macos".to_string())
        .spawn(move || {
            // Set up the stream + recording output, keeping every ScreenCaptureKit
            // object on this thread. On success the objects are held alive until the
            // stop signal arrives; on failure the error is reported back.
            match setup_stream(&cfg) {
                Ok((stream, recording)) => {
                    let _ = ready_tx.send(Ok(()));
                    // Park until asked to stop (or the sender is dropped).
                    let _ = stop_rx.recv();
                    // VERIFY ON MAC: stop order — remove the recording output then
                    // stop the capture so the file is finalized cleanly.
                    let _ = stream.remove_recording_output(&recording);
                    let _ = stream.stop_capture();
                    // `stream` + `recording` drop here, on this thread.
                }
                Err(e) => {
                    let _ = ready_tx.send(Err(e));
                }
            }
        })
        .map_err(|e| AppError::Video(format!("spawn macOS capture thread: {e}")))?;

    match ready_rx.recv() {
        Ok(Ok(())) => Ok(VideoRecorder {
            stop_tx,
            join: Some(join),
            out_path,
        }),
        Ok(Err(e)) => {
            let _ = join.join();
            Err(e)
        }
        Err(_) => {
            let _ = join.join();
            Err(AppError::Video(
                "macOS capture thread exited during setup".into(),
            ))
        }
    }
}

/// Build + start the ScreenCaptureKit stream for one window. Runs on the capture
/// thread. Returns the started stream + its recording output.
fn setup_stream(
    cfg: &VideoStartConfig,
) -> AppResult<(
    SCStream,
    screencapturekit::recording_output::SCRecordingOutput,
)> {
    use screencapturekit::recording_output::SCRecordingOutput;

    let target_id: u32 = cfg
        .window_id
        .parse()
        .map_err(|_| AppError::Video(format!("invalid window id: {}", cfg.window_id)))?;

    let content = SCShareableContent::get()
        .map_err(|e| AppError::Video(format!("shareable content: {e:?}")))?;
    let window = content
        .windows()
        .into_iter()
        .find(|w| w.window_id() == target_id)
        .ok_or_else(|| AppError::Video("the selected window is no longer available".into()))?;

    // VERIFY ON MAC: single-window content filter. v7 builder is expected to be
    // `SCContentFilter::builder().window(&window).build()`; if not, it may be
    // `.desktop_independent_window(&window)` (mirrors initWithDesktopIndependentWindow:).
    let filter = SCContentFilter::builder().window(&window).build();

    // VERIFY ON MAC: window pixel size for the encoder. `window.frame()` returns a
    // CGRect-like value; fall back to 1280x720 if it reads as zero.
    let frame = window.frame();
    let mut width = frame.size.width as u32;
    let mut height = frame.size.height as u32;
    if width < 2 || height < 2 {
        width = 1280;
        height = 720;
    }
    // Even dimensions for H.264 4:2:0.
    width &= !1;
    height &= !1;

    let mut config = SCStreamConfiguration::new()
        .with_width(width)
        .with_height(height)
        .with_captures_audio(true) // system audio (macOS 13+)
        .with_sample_rate(VIDEO_SAMPLE_RATE)
        .with_channel_count(VIDEO_CHANNELS);
    if !cfg.system_only {
        // Microphone mixing (macOS 15+). In system-only mode we skip it, mirroring
        // the Windows behavior, so a video/music recording isn't mixed with the mic.
        config = config.with_captures_microphone(true);
    }

    let rec_config = SCRecordingOutputConfiguration::new()
        .with_output_url(&cfg.out_path)
        .with_video_codec(SCRecordingOutputCodec::H264)
        .with_output_file_type(SCRecordingOutputFileType::MP4);
    let recording = SCRecordingOutput::new(&rec_config)
        .ok_or_else(|| AppError::Video("failed to create SCRecordingOutput".into()))?;

    let mut stream = SCStream::new(&filter, &config);
    stream
        .add_recording_output(&recording)
        .map_err(|e| AppError::Video(format!("add recording output: {e:?}")))?;
    stream
        .start_capture()
        .map_err(|e| AppError::Video(format!("start capture: {e:?}")))?;

    Ok((stream, recording))
}
