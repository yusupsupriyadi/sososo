//! Non-Windows stub. Video recording currently targets Windows only; these keep
//! the crate compiling on macOS/Linux. The frontend hides the video controls
//! there, and the commands return a clear "unsupported" error if reached anyway.

use std::path::PathBuf;

use super::{VideoStartConfig, WindowInfo};
use crate::error::{AppError, AppResult};

/// Stub recorder — never actually constructed on non-Windows, since
/// [`start_window_recording`] always errors before one could exist.
pub struct VideoRecorder;

impl VideoRecorder {
    /// Unreachable on non-Windows; present only so the session code type-checks.
    pub fn stop(self) -> AppResult<PathBuf> {
        Err(AppError::Video(
            "video recording is only supported on Windows".into(),
        ))
    }
}

/// No capturable windows off Windows.
pub fn list_windows() -> AppResult<Vec<WindowInfo>> {
    Ok(Vec::new())
}

/// Video recording is unsupported off Windows.
pub fn start_window_recording(_cfg: VideoStartConfig) -> AppResult<VideoRecorder> {
    Err(AppError::Video(
        "video recording is only supported on Windows".into(),
    ))
}
