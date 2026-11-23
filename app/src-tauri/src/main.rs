// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Started as an import worker (`--idl1-import-worker`, C3 §3.3): import
    // and exit, before any window. Running out of memory then ends this
    // child, not the app the person is using.
    if let Some(code) = idl1_bridge::commands::import::maybe_run_import_worker() {
        std::process::exit(code);
    }
    app_lib::run()
}
