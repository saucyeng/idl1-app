//! Tauri app crate. Thin by design: registers the engine's commands and, in
//! later lanes, the mobile plugins. Nothing else lives here.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(idl_rs_tauri::handler())
        .run(tauri::generate_context!())
        .expect("error while running idl1");
}
