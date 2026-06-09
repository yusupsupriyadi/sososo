// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Yusup Supriyadi
mod ai;
pub mod audio;
mod commands;
mod db;
pub mod error;
mod events;
mod keys;
mod session;
mod state;
mod video;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // In-app auto-update: the frontend drives check/download/install via the
        // updater JS plugin; `process` provides `relaunch()` after install.
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            commands::summarize_session,
            commands::translate_segment,
            commands::get_chat_messages,
            commands::chat_session,
            commands::clear_chat,
        ])
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

            // Transparent glass: the window is `transparent: true` with no native
            // acrylic/vibrancy, so the desktop behind shows through sharply. The tint
            // comes from the semi-transparent CSS panel backgrounds; the Appearance
            // "Background transparency" pref controls that fill alpha.

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
