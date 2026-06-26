// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Yusup Supriyadi
mod ai;
pub mod audio;
mod commands;
mod db;
pub mod error;
mod events;
mod hotkey;
mod keys;
mod meeting;
mod session;
mod state;
mod tray;
// `pub` (like `audio`) so the `thumb_probe` example can drive `list_windows`.
pub mod video;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // In-app auto-update: the frontend drives check/download/install via the
        // updater JS plugin; `process` provides `relaunch()` after install.
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // OS toasts (meeting auto-detection); sent Rust-side via `notify`.
        .plugin(tauri_plugin_notification::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_devices,
            commands::set_devices,
            commands::set_transcription_options,
            commands::list_windows,
            commands::set_video_options,
            commands::start_session,
            commands::stop_session,
            commands::set_api_key,
            commands::has_api_key,
            commands::set_paused,
            commands::list_sessions,
            commands::get_session,
            commands::search_sessions,
            commands::delete_session,
            commands::rename_session,
            commands::rename_speaker,
            commands::get_summary_language,
            commands::set_summary_language,
            commands::get_ai_provider,
            commands::set_ai_provider,
            commands::get_ai_model,
            commands::set_ai_model,
            commands::get_llama_config,
            commands::set_llama_config,
            commands::get_openai_compatible_config,
            commands::set_openai_compatible_config,
            commands::summarize_session,
            commands::translate_segment,
            commands::get_chat_messages,
            commands::chat_session,
            commands::clear_chat,
            commands::set_close_to_tray,
            commands::set_global_shortcut_enabled,
            commands::get_active_shortcut,
            commands::detect_meeting,
            commands::notify,
        ])
        // Close-to-tray: intercept the window close and hide instead, so the app
        // (and any running recording) stays alive in the system tray. Quitting
        // for real happens from the tray menu — or here, when the pref is off.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let close_to_tray = *window
                    .app_handle()
                    .state::<state::AppState>()
                    .close_to_tray
                    .lock()
                    .unwrap();
                if close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            // Open (creating if needed) the SQLite history database in the app
            // data dir, then hand it to Tauri as managed state (Milestone D).
            //
            // Single-window app: the main window (declared in tauri.conf.json) hosts
            // both the library/settings UI and, while a session is active, the live
            // transcription view. There is no separate overlay window.
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db = db::Db::open(&data_dir.join("sososo.db"))?;
            app.manage(db);

            // System tray: open/quit + the way back in while closed-to-tray.
            tray::setup(app)?;

            // Global start/stop-recording hotkey (Ctrl+Alt+R / Ctrl+Cmd+R).
            hotkey::setup(app)?;

            // Transparent glass: the window is `transparent: true` with no native
            // acrylic/vibrancy, so the desktop behind shows through sharply. The tint
            // comes from the semi-transparent CSS panel backgrounds; the Appearance
            // "Background transparency" pref controls that fill alpha.

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
