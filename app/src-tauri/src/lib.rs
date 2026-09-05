//! Tauri app crate. Thin by design: registers the engine's commands, resolves
//! `<data>` once at startup (C4 §1), and — in later lanes — the mobile
//! plugins. Nothing else lives here.

use tauri::Manager;

/// Builds the Tauri app with the engine's commands and runs it.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let app_config_dir = app.path().app_config_dir()?;
            // Resolution failure here is a launch-time condition, not a
            // command-boundary one — C3's typed-error contract governs
            // command results, not `.setup()`. Panicking before any window
            // exists is the current behaviour; showing a native error
            // dialog instead is tracked as an open question (this plan,
            // "Open questions").
            let data_dir = idl_rs_tauri::paths::resolve_data_dir(&app_data_dir, &app_config_dir)
                .unwrap_or_else(|e| panic!("resolving <data>: {e:?}"));
            app.manage(idl_rs_tauri::state::DataDir(data_dir));
            app.manage(idl_rs_tauri::state::Hashes(std::sync::Arc::new(idl_rs_tauri::watcher::ExpectedHashSet::new())));
            app.manage(idl_rs_tauri::state::Watchers(std::sync::Mutex::new(std::collections::HashMap::new())));
            Ok(())
        })
        .invoke_handler(idl_rs_tauri::handler())
        .run(tauri::generate_context!())
        .expect("error while running idl1");
}
