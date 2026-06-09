use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use tokio_util::sync::CancellationToken;

/// A session currently being recorded + transcribed.
pub struct ActiveSession {
    pub id: i64,
    pub cancel: CancellationToken,
    /// When `true`, the audio bridge stops forwarding audio to Deepgram (the WS
    /// stays open via keep-alive); transcription resumes when set back to `false`.
    pub paused: Arc<AtomicBool>,
}

/// Shared application state managed by Tauri.
pub struct AppState {
    /// `Some` while a session is recording.
    pub session: Mutex<Option<ActiveSession>>,
    /// User-selected device ids (None = system default). Set from Settings.
    pub input_device: Mutex<Option<String>>,
    pub output_device: Mutex<Option<String>>,
    /// Deepgram language code: "multi" (auto), "en", "id", ... Default "multi".
    pub language: Mutex<String>,
    /// When true, capture only system audio (no microphone) — cleaner for
    /// transcribing videos/music; false = system + mic (meetings).
    pub system_only: Mutex<bool>,
    /// When true, also record the selected window's video (Windows-only) for the
    /// session. Set from the Start screen's "Record video" toggle.
    pub video_enabled: Mutex<bool>,
    /// The window to record (raw HWND as a decimal string), or `None` if none is
    /// selected. Mirrors `video::WindowInfo::id`.
    pub video_window: Mutex<Option<String>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            session: Mutex::new(None),
            input_device: Mutex::new(None),
            output_device: Mutex::new(None),
            language: Mutex::new("multi".to_string()),
            system_only: Mutex::new(false),
            video_enabled: Mutex::new(false),
            video_window: Mutex::new(None),
        }
    }
}
