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
            app.manage(idl_rs_tauri::state::DataDir(data_dir.clone()));
            app.manage(idl_rs_tauri::state::Hashes(std::sync::Arc::new(idl_rs_tauri::watcher::ExpectedHashSet::new())));
            app.manage(idl_rs_tauri::state::Watchers(std::sync::Mutex::new(std::collections::HashMap::new())));
            app.manage(idl_rs_tauri::state::Connections(std::sync::Mutex::new(std::collections::HashMap::new())));

            // `<data>/inbox` (C4 §2, ruling R191): scanned once now, watched
            // while the app runs. Desktop only — the module does not exist
            // on mobile, where `inbox_status` answers
            // `unsupported_platform`. A failure to create or watch the
            // folder is not fatal: every other import path still works, so
            // this one is logged by leaving the state unmanaged rather than
            // panicking the launch.
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            match idl_rs_tauri::inbox::InboxState::start(&data_dir) {
                Ok(inbox) => app.manage(inbox),
                Err(e) => eprintln!("inbox unavailable: {e}"),
            }

            // `peers.json`/`identity.json` live outside `<data>` (PLAN §8
            // Q7, ruling R105) so neither ever syncs. A failure here is the
            // same launch-time condition as `resolve_data_dir`'s above — in
            // particular a corrupt `identity.json` must never be papered
            // over with a freshly minted id, which would orphan every
            // existing pairing (ruling R105).
            let peers_path = app_config_dir.join("peers.json");
            let identity_path = app_config_dir.join("identity.json");
            let sync_state = tauri::async_runtime::block_on(idl_rs_tauri::state::SyncState::start(
                app.handle().clone(),
                data_dir,
                peers_path,
                identity_path,
            ))
            .unwrap_or_else(|e| panic!("starting sync: {e:?}"));
            app.manage(sync_state);
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(idl_rs_tauri::handler())
        .run(tauri::generate_context!())
        .expect("error while running idl1");
}
