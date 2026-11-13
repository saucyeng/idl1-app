//! Registers the Kotlin `DevicePlugin` (SPEC §14b.1) and hands its handle to
//! `idl1-bridge`, whose `AndroidBle`/WiFi link call it. The plugin exposes
//! no webview commands: only Rust talks to it.

/// The Tauri plugin that loads `com.saucyeng.idl1.device.DevicePlugin`.
pub fn device_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("idl1-device")
        .setup(|_app, api| {
            let handle = api.register_android_plugin("com.saucyeng.idl1.device", "DevicePlugin")?;
            idl1_bridge::mobile::install(handle);
            Ok(())
        })
        .build()
}
