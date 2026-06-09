//! Live-session lifecycle commands: start, pause/resume, stop, options.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tokio_util::sync::CancellationToken;

use crate::error::{AppError, AppResult};
use crate::state::{ActiveSession, AppState};
use crate::video::VideoStartConfig;
use crate::{db::Db, keys, session};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartResult {
    pub session_id: i64,
    pub started_at: String,
}

#[tauri::command]
pub fn start_session(
    app: AppHandle,
    state: State<'_, AppState>,
    db: State<'_, Db>,
    title: Option<String>,
) -> AppResult<StartResult> {
    if state.session.lock().unwrap().is_some() {
        return Err(AppError::Session("a session is already running".into()));
    }
    let key = keys::get_api_key("deepgram")?
        .ok_or_else(|| AppError::Config("Deepgram API key is not set (open Settings)".into()))?;

    let input = state.input_device.lock().unwrap().clone();
    let output = state.output_device.lock().unwrap().clone();
    let language = state.language.lock().unwrap().clone();
    let system_only = *state.system_only.lock().unwrap();
    let video_enabled = *state.video_enabled.lock().unwrap();
    let video_window = state.video_window.lock().unwrap().clone();

    // Create the persisted session row up front so its id can be returned
    // synchronously; a blank title falls back to a date/time label.
    let started_at = chrono::Utc::now().to_rfc3339();
    let title = title
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| {
            format!(
                "Recording {}",
                chrono::Local::now().format("%d-%m-%Y %H:%M")
            )
        });
    let id = db.create_session(&title, &language, system_only, &started_at)?;

    // Prepare the video recording (output path + dir) up front; it's actually
    // started inside the session task. Best-effort — never blocks the session.
    let video_cfg = build_video_cfg(
        &app,
        id,
        video_enabled,
        video_window,
        &input,
        &output,
        system_only,
    );

    let cancel = CancellationToken::new();
    let paused = Arc::new(AtomicBool::new(false));
    session::spawn_session(
        app,
        id,
        key,
        input,
        output,
        language,
        system_only,
        cancel.clone(),
        paused.clone(),
        video_cfg,
    );
    *state.session.lock().unwrap() = Some(ActiveSession { id, cancel, paused });

    Ok(StartResult {
        session_id: id,
        started_at,
    })
}

/// Build the video-recording config when recording is enabled and a window is
/// chosen, creating the destination `recordings/` directory. Returns `None`
/// (logging any path error) when video is off or the path can't be prepared —
/// video is best-effort and must never block starting a session.
fn build_video_cfg(
    app: &AppHandle,
    session_id: i64,
    enabled: bool,
    window: Option<String>,
    mic_device: &Option<String>,
    system_device: &Option<String>,
    system_only: bool,
) -> Option<VideoStartConfig> {
    if !enabled {
        return None;
    }
    let window_id = window?;
    let dir = match app.path().app_data_dir() {
        Ok(d) => d.join("recordings"),
        Err(e) => {
            eprintln!("[session] video app_data_dir: {e}");
            return None;
        }
    };
    if let Err(e) = std::fs::create_dir_all(&dir) {
        eprintln!("[session] create recordings dir: {e}");
        return None;
    }
    Some(VideoStartConfig {
        window_id,
        mic_device: mic_device.clone(),
        system_device: system_device.clone(),
        system_only,
        out_path: dir.join(format!("{session_id}.mp4")),
    })
}

/// Pause or resume the active session. While paused the audio bridge forwards no
/// audio to Deepgram (the WS stays open via keep-alive), so transcription halts
/// until resumed. No-op error if there is no active session.
#[tauri::command]
pub fn set_paused(state: State<'_, AppState>, paused: bool) -> AppResult<()> {
    match state.session.lock().unwrap().as_ref() {
        Some(s) => {
            s.paused.store(paused, Ordering::Relaxed);
            Ok(())
        }
        None => Err(AppError::Session("no active session".into())),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StopResult {
    pub session_id: i64,
    pub ended_at: String,
}

#[tauri::command]
pub fn stop_session(state: State<'_, AppState>) -> AppResult<StopResult> {
    let active = state.session.lock().unwrap().take();
    match active {
        Some(a) => {
            a.cancel.cancel();
            Ok(StopResult {
                session_id: a.id,
                ended_at: chrono::Utc::now().to_rfc3339(),
            })
        }
        None => Err(AppError::Session("no active session".into())),
    }
}

/// Set the transcription language ("multi"=auto, "en", "id", …) and whether to
/// capture system audio only (true) or system + mic (false).
#[tauri::command]
pub fn set_transcription_options(
    state: State<'_, AppState>,
    language: Option<String>,
    system_only: Option<bool>,
) -> AppResult<()> {
    if let Some(l) = language {
        *state.language.lock().unwrap() = l;
    }
    if let Some(s) = system_only {
        *state.system_only.lock().unwrap() = s;
    }
    Ok(())
}
