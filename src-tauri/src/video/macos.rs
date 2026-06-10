//! macOS video-capture backend (ScreenCaptureKit, via the `screencapturekit` crate).
//!
//! Records a chosen window straight to an MP4 (H.264 + system audio + microphone)
//! using `SCRecordingOutput` — ScreenCaptureKit encodes and muxes to the file for
//! us, so unlike the Windows backend there is **no** manual frame pump, encoder,
//! or audio mixer here. The 16 kHz Deepgram audio path is untouched.
//!
//! Runtime requirements:
//! - macOS **15+** for `SCRecordingOutput` (direct-to-file) and microphone
//!   capture; on older systems `SCRecordingOutput::new` returns `None` and we
//!   surface a clear error (audio transcription still works).
//! - **Screen Recording** permission (System Settings → Privacy & Security), and
//!   `NSScreenCaptureUsageDescription` / `NSMicrophoneUsageDescription` in
//!   `Info.plist` (see `src-tauri/Info.plist`). The first capture triggers the prompt.
//!
//! API verified against the `screencapturekit` 7.0.1 sources (builders, signatures,
//! stop order) — see that crate's `recording_output.rs` module example.

use std::path::PathBuf;
use std::sync::mpsc;
use std::thread::{self, JoinHandle};

use screencapturekit::prelude::*;
use screencapturekit::recording_output::{
    SCRecordingOutput, SCRecordingOutputCodec, SCRecordingOutputConfiguration,
    SCRecordingOutputFileType,
};

use super::{VideoStartConfig, WindowInfo};
use crate::error::{AppError, AppResult};

/// Audio-track format (matches the Windows path); ScreenCaptureKit muxes it.
/// `i32`: `with_sample_rate`/`with_channel_count` take `impl Into<i32>`.
const VIDEO_SAMPLE_RATE: i32 = 48_000;
const VIDEO_CHANNELS: i32 = 2;

/// List capturable windows via `SCShareableContent`. Skips untitled windows and
/// off-screen ones so the picker matches what the user can see.
pub fn list_windows() -> AppResult<Vec<WindowInfo>> {
    let content = SCShareableContent::get()
        .map_err(|e| AppError::Video(format!("shareable content: {e}")))?;

    let mut out = Vec::new();
    for window in content.windows() {
        if !window.is_on_screen() {
            continue;
        }
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

/// A running window recording. The `SCStream` lives entirely on its own thread,
/// so this handle only carries a stop channel + join handle + the output path —
/// all `Send`, as the session task needs.
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
            // Set up the stream + recording output, keeping the ScreenCaptureKit
            // objects on this thread for their whole lifetime. On success they are
            // held alive until the stop signal arrives; on failure the error is
            // reported back to the caller.
            match setup_stream(&cfg) {
                Ok((stream, recording)) => {
                    let _ = ready_tx.send(Ok(()));
                    // Park until asked to stop (or the sender is dropped).
                    let _ = stop_rx.recv();
                    // Stop order per the crate's recording example: stop the
                    // capture (flushes + finalizes the file), then detach the
                    // recording output.
                    if let Err(e) = stream.stop_capture() {
                        eprintln!("[video] stop_capture: {e}");
                    }
                    if let Err(e) = stream.remove_recording_output(&recording) {
                        eprintln!("[video] remove_recording_output: {e}");
                    }
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
fn setup_stream(cfg: &VideoStartConfig) -> AppResult<(SCStream, SCRecordingOutput)> {
    let target_id: u32 = cfg
        .window_id
        .parse()
        .map_err(|_| AppError::Video(format!("invalid window id: {}", cfg.window_id)))?;

    let content = SCShareableContent::get()
        .map_err(|e| AppError::Video(format!("shareable content: {e}")))?;
    let window = content
        .windows()
        .into_iter()
        .find(|w| w.window_id() == target_id)
        .ok_or_else(|| AppError::Video("the selected window is no longer available".into()))?;

    // Encode at the window's current size (even-aligned for H.264 4:2:0), with a
    // sane fallback if the frame reads as zero.
    let frame = window.frame();
    let mut width = frame.size.width as u32;
    let mut height = frame.size.height as u32;
    if width < 2 || height < 2 {
        width = 1280;
        height = 720;
    }
    width &= !1;
    height &= !1;

    let filter = SCContentFilter::create().with_window(&window).build();

    let mut config = SCStreamConfiguration::new()
        .with_width(width)
        .with_height(height)
        .with_captures_audio(true) // system audio (macOS 13+)
        .with_sample_rate(VIDEO_SAMPLE_RATE)
        .with_channel_count(VIDEO_CHANNELS);
    if !cfg.system_only {
        // Microphone mixing (macOS 15+). Skipped in system-only mode, mirroring
        // the Windows behavior, so a video/music recording isn't mixed with the mic.
        config = config.with_captures_microphone(true);
    }

    let rec_config = SCRecordingOutputConfiguration::new()
        .with_output_url(&cfg.out_path)
        .with_video_codec(SCRecordingOutputCodec::H264)
        .with_output_file_type(SCRecordingOutputFileType::MP4);
    let recording = SCRecordingOutput::new(&rec_config)
        .ok_or_else(|| AppError::Video("video recording requires macOS 15 or newer".into()))?;

    let stream = SCStream::new(&filter, &config);
    stream
        .add_recording_output(&recording)
        .map_err(|e| AppError::Video(format!("add recording output: {e}")))?;
    stream
        .start_capture()
        .map_err(|e| AppError::Video(format!("start capture: {e}")))?;
    eprintln!(
        "[video] macOS recording started ({width}x{height}) -> {}",
        cfg.out_path.display()
    );

    Ok((stream, recording))
}
