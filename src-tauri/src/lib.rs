mod ai;
pub mod audio;
mod commands;
mod db;
pub mod error;
mod events;
mod keys;
mod session;
mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_devices,
            commands::set_devices,
            commands::set_transcription_options,
            commands::start_session,
            commands::stop_session,
            commands::set_api_key,
            commands::has_api_key,
            commands::set_paused,
            commands::list_sessions,
            commands::get_session,
            commands::delete_session,
            commands::rename_session,
            commands::summarize_session,
            commands::translate_segment,
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

            // Transparent glass (no blur): the window is `transparent: true` with no
            // native acrylic/vibrancy, so the desktop behind shows through sharply.
            // The tint comes purely from the semi-transparent CSS panel backgrounds.

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
