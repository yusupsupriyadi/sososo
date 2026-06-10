//! Video recording of a chosen application window (Windows only for now).
//!
//! Mirrors the shape of the [`crate::audio`] module: a cfg-gated `platform`
//! backend behind a small public API used by the session lifecycle and the
//! `list_windows` / `set_video_options` commands. On Windows the backend uses the
//! `windows-capture` crate (Windows.Graphics.Capture + a Media Foundation
//! H.264/AAC encoder) and captures its own 48 kHz/stereo audio (mic + system),
//! independent of the 16 kHz Deepgram path. Other platforms compile but report
//! the feature unsupported, and the UI hides the controls there.

use std::path::PathBuf;

use serde::Serialize;

use crate::error::AppResult;

#[cfg(target_os = "windows")]
mod mixer;

#[cfg(target_os = "windows")]
#[path = "windows.rs"]
mod platform;
#[cfg(target_os = "macos")]
#[path = "macos.rs"]
mod platform;
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
#[path = "unsupported.rs"]
mod platform;

pub use platform::VideoRecorder;

/// A capturable top-level window, for the Start-screen picker.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    /// Opaque, stable-within-a-session id: the raw HWND as a decimal string.
    pub id: String,
    /// The window's title-bar text.
    pub title: String,
    /// The owning process/executable name (e.g. "Zoom.exe", "chrome.exe").
    pub app: String,
}

/// Everything the backend needs to record one window with a muxed mic+system
/// audio track. Only the Windows backend reads every field — macOS lets
/// ScreenCaptureKit pick the default audio devices, and the non-Windows stub
/// reads none — so the dead-code lint is allowed off Windows.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub struct VideoStartConfig {
    /// Target window id (raw HWND, decimal string) from [`list_windows`].
    pub window_id: String,
    /// Microphone (input) device id, or `None` for the system default.
    pub mic_device: Option<String>,
    /// System-audio (render/loopback) device id, or `None` for the system default.
    pub system_device: Option<String>,
    /// When `true`, record system audio only (no mic) into the video track —
    /// mirrors the session's audio-source mode so a video/music recording doesn't
    /// double up your mic with the system audio.
    pub system_only: bool,
    /// Destination `.mp4` path (its parent directory must already exist).
    pub out_path: PathBuf,
}

/// List the windows that can be picked as a recording source.
pub fn list_windows() -> AppResult<Vec<WindowInfo>> {
    platform::list_windows()
}

/// Start recording `cfg.window_id` to `cfg.out_path` (video + mixed mic/system
/// audio). Finalize via [`VideoRecorder::stop`].
pub fn start_window_recording(cfg: VideoStartConfig) -> AppResult<VideoRecorder> {
    platform::start_window_recording(cfg)
}
