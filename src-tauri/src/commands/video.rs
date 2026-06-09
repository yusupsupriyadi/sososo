//! Video-recording commands: enumerate capturable windows + persist the user's
//! "record video" choice (Windows-only; no-ops/empties elsewhere).

use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::video::{self, WindowInfo};

/// List capturable windows for the Start-screen video picker. Enumerated on a
/// dedicated thread to keep the COM apartment clean (mirrors `list_devices`).
#[tauri::command]
pub fn list_windows() -> AppResult<Vec<WindowInfo>> {
    std::thread::spawn(video::list_windows)
        .join()
        .map_err(|_| AppError::Video("window enumeration thread panicked".into()))?
}

/// Persist whether to record video and which window to capture. `enabled`/
/// `window_id` are each optional (only the provided ones change); an empty
/// `window_id` clears the selection.
#[tauri::command]
pub fn set_video_options(
    state: State<'_, AppState>,
    enabled: Option<bool>,
    window_id: Option<String>,
) -> AppResult<()> {
    if let Some(enabled) = enabled {
        *state.video_enabled.lock().unwrap() = enabled;
    }
    if let Some(window_id) = window_id {
        *state.video_window.lock().unwrap() = if window_id.is_empty() {
            None
        } else {
            Some(window_id)
        };
    }
    Ok(())
}
