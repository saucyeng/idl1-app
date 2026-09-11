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
            // Decoded per-channel samples, LRU by bytes against a budget of
            // min(2 GiB, 25 % of physical RAM) read once here (ruling R203.2).
            // Every command that serves samples reads through it, so a
            // channel is decoded at most once while it stays resident.
            app.manage(idl_rs_tauri::session_cache::SessionCache::new());
            // Ruling R221 item 1: every decode past ~200 ms reports itself as
            // the C3 §3.2 `decode_progress` event. Installed here, after the
            // cache is managed, because this is the only place an
            // `AppHandle` and the cache exist together; what the event is and
            // when it fires both live in `session_cache`.
            idl_rs_tauri::session_cache::install_progress_sink(&app.handle().clone());
            // The firmware/OTA state machine's current state (C3 §3.8, R198).
            // Managed unconditionally: it holds no data-root-dependent state,
            // and updating firmware is exactly the kind of thing a user may
            // want to do while the library is unavailable.
            app.manage(idl_rs_tauri::state::Ota::default());
            // The library-wide lap/track index job's live state (rulings
            // R207/R208.1). The job itself is started by the frontend
            // (`start_index_job`) on launch and by `rebuild_catalog`; this
            // only holds its progress so a chip mounting mid-run can read it.
            app.manage(idl_rs_tauri::state::IndexJob::default());
            app.manage(idl_rs_tauri::state::RebuildJob::default());

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
            // Updater (ruling R231): registered only when the app was built
            // with a real signing pubkey and is not the dev identifier. The
            // schema has no `plugins.updater.active` switch (checked against
            // the plugin's `Config` deserializer, which has no such field),
            // so both guards live here instead: `tauri.dev.conf.json` sets
            // `identifier` to `com.saucyeng.idl1.dev`, and the placeholder
            // pubkey means no keypair has been generated yet. Either one
            // disables registration; the frontend checker (`updateState.ts`)
            // treats a missing plugin as "never available" rather than an
            // error, so nothing crashes when it isn't registered.
            let is_dev_identifier = app.config().identifier.ends_with(".dev");
            let updater_pubkey = app
                .config()
                .plugins
                .0
                .get("updater")
                .and_then(|v| v.get("pubkey"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let pubkey_is_placeholder = updater_pubkey == "REPLACE_WITH_PUBKEY" || updater_pubkey.is_empty();
            if is_dev_identifier || pubkey_is_placeholder {
                eprintln!(
                    "updater: checks disabled ({})",
                    if is_dev_identifier { "dev build" } else { "pubkey is a placeholder" }
                );
            } else {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            }

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(idl_rs_tauri::handler())
        .run(tauri::generate_context!())
        .expect("error while running idl1");
}
