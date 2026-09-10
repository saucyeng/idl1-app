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
            // Two failure shapes, deliberately handled differently (C4 §1
            // "Missing root", ruling R196).
            //
            // `DataDirMissing` — the user's own override folder is gone (an
            // unplugged drive, a renamed directory). The library must not
            // open: no fallback to the platform default, which would show an
            // empty library and invite the user to re-import on top of it.
            // But the *window* must open, because the recovery ("Retry" /
            // "Choose folder") is UI. So the launch continues with the
            // library subsystems deliberately not started, and the frontend's
            // launch gate — which routes on `get_data_dir` rejecting with
            // `io` + `detail.reason == "missing_root"` — blocks every other
            // screen until the folder is back or a new one is chosen.
            //
            // Anything else is a genuine filesystem failure under the
            // platform default, with nothing to recover to: still a panic.
            let resolved = idl_rs_tauri::paths::resolve_data_dir(&app_data_dir, &app_config_dir);
            let missing_root = matches!(resolved, Err(idl_rs_tauri::paths::ResolveError::DataDirMissing { .. }));
            let data_dir = match resolved {
                Ok(dir) => dir,
                Err(idl_rs_tauri::paths::ResolveError::DataDirMissing { ref path, .. }) => {
                    eprintln!("data folder unavailable: {}", path.display());
                    // Managed so `get_data_dir` is callable at all — it is
                    // the very command the gate asks. It re-resolves and
                    // rejects with `missing_root` until the folder returns.
                    path.join("data")
                }
                Err(e) => panic!("resolving <data>: {e:?}"),
            };
            app.manage(idl_rs_tauri::state::DataDir(data_dir.clone()));
            app.manage(idl_rs_tauri::state::Hashes(std::sync::Arc::new(idl_rs_tauri::watcher::ExpectedHashSet::new())));
            app.manage(idl_rs_tauri::state::Watchers(std::sync::Mutex::new(std::collections::HashMap::new())));
            app.manage(idl_rs_tauri::state::Connections(std::sync::Mutex::new(std::collections::HashMap::new())));
            // The firmware/OTA state machine's current state (C3 §3.8, R198).
            // Managed unconditionally: it holds no data-root-dependent state,
            // and updating firmware is exactly the kind of thing a user may
            // want to do while the library is unavailable.
            app.manage(idl_rs_tauri::state::Ota::default());

            // `<data>/inbox` (C4 §2, ruling R191): scanned once now, watched
            // while the app runs. Desktop only — the module does not exist
            // on mobile, where `inbox_status` answers
            // `unsupported_platform`. A failure to create or watch the
            // folder is not fatal: every other import path still works, so
            // this one is logged by leaving the state unmanaged rather than
            // panicking the launch.
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            if !missing_root {
                match idl_rs_tauri::inbox::InboxState::start(&data_dir) {
                    Ok(inbox) => {
                        app.manage(inbox);
                    }
                    Err(e) => eprintln!("inbox unavailable: {e}"),
                }
            }

            // `peers.json`/`identity.json` live outside `<data>` (PLAN §8
            // Q7, ruling R105) so neither ever syncs. A failure here is the
            // same launch-time condition as `resolve_data_dir`'s above — in
            // particular a corrupt `identity.json` must never be papered
            // over with a freshly minted id, which would orphan every
            // existing pairing (ruling R105).
            //
            // Not started at all when the data root is missing: sync would
            // write a library into a folder the user never chose.
            if !missing_root {
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
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(idl_rs_tauri::handler())
        .run(tauri::generate_context!())
        .expect("error while running idl1");
}
