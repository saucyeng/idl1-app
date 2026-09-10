# L9 mobile scaffold — readiness survey

Read-only survey, 2026-09-10. No builds run, no files modified outside this one.

## 1. Machine readiness (Windows 11)

Present:

| Item | State |
|---|---|
| Android SDK | `C:\Users\isaac\AppData\Local\Android\Sdk` — platforms 31/33/34/35/36, build-tools 34.0.0/35.0.0/36.1.0 |
| Android NDK | `28.2.13676358` |
| Android Studio | `C:\Program Files\Android\Android Studio`, bundled JDK 21.0.8 at `jbr\` |
| Node / npm | v24.15.0 / 11.12.1 |
| Tauri CLI | `@tauri-apps/cli ^2.11.4` in `app/package.json`, binary at `app/node_modules/.bin/tauri`. Use `npm run tauri -- android init`; `cargo tauri` is NOT installed and is not needed |
| cargo-ndk | installed in `~/.cargo/bin` |
| rustup targets | `aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-pc-windows-msvc`, `aarch64-unknown-linux-gnu` |

Missing — Isaac must run these himself:

```
setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"
setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
setx NDK_HOME "%LOCALAPPDATA%\Android\Sdk\ndk\28.2.13676358"
rustup target add i686-linux-android x86_64-linux-android
```

`JAVA_HOME`, `ANDROID_HOME`, `NDK_HOME` and `ANDROID_NDK_ROOT` are all empty right now,
and there is no standalone JDK on the machine. Tauri's Android init refuses to run
without those. The two extra targets cover the emulator ABIs; `tauri android build`
targets all four by default.

**iOS is not buildable on this machine.** Xcode is macOS-only and Tauri's iOS pipeline
shells out to `xcodebuild`/`xcrun`. `aarch64-apple-ios` cannot be linked here. The iOS
half of L9 needs a Mac; nothing in this lane substitutes for one.

Unknown: whether an emulator system image or AVD is configured. `Sdk\system-images\`
exists but I did not enumerate it.

## 2. Code seams

### Real design gaps

- `rust/tauri/src/commands/device.rs:33` imports the concrete `BtleplugBle`. btleplug's
  Android backend needs a JNI class loaded into the app process; not a drop-in. The trait
  seam is already right (`rust/transport/src/ble_transport.rs:47`; every command body is
  generic over `impl BleTransport`), so the scaffold only cfg-gates the concrete
  constructor and returns a typed unsupported-platform error. The real Kotlin plugin is
  wave 3 (design doc line 158).
- `rust/tauri/src/state.rs:188` shells out to `hostname` when `COMPUTERNAME` is unset.
  Android has neither, so `identity.json`'s default name falls back to `DEFAULT_NAME` and
  every phone is named the same until renamed. Not a crash; wants a platform default.
- `rust/transport/src/sync/discovery.rs:114` starts an mDNS `ServiceDaemon`. Android needs
  a held `MulticastLock` for multicast receive to work at all, and that is a Kotlin call.
  Without it discovery silently finds nothing. **Largest hidden gap in the lane.**
- `rust/tauri/src/watcher.rs:13` uses `notify::RecommendedWatcher` (inotify on Android). It
  should work on app-private storage but the use case is desktop-shaped. Verify, not redesign.
- `rust/core/Cargo.toml:19` pins `rusqlite` with `features = ["bundled"]`, so SQLite compiles
  from C through the NDK toolchain. Expect the first cross-compile failure here.
  `arrow`/`parquet` 59.3.0 are pure Rust and should be fine.

### Plugin swaps or config, not gaps

- `app/src-tauri/tauri.conf.json:13` declares a desktop `windows` array. Mobile ignores it;
  add an `android` bundle section rather than removing it.
- `app/src-tauri/capabilities/default.json:2` points at `../gen/schemas/desktop-schema.json`
  and scopes to `"windows": ["main"]`. Needs a `platforms` key including `android`, or a
  second capability file.
- `app/src/routes/pages/Data/FilePicker.ts:1` uses `@tauri-apps/plugin-dialog`'s `open()`.
  The plugin supports Android but returns content-URI-backed paths, so what reaches
  `import_file` must be checked. Likely a real Android bug, cheap to find.
- No native menus anywhere. Only Radix context/dropdown menus in the React tree (DOM).
- `app/src-tauri/Cargo.toml:15` already declares `crate-type = ["staticlib", "cdylib", "rlib"]`
  and `app/src-tauri/src/lib.rs:8` already carries `#[cfg_attr(mobile, tauri::mobile_entry_point)]`.
  The Rust entry point is mobile-correct as written.

## 3. C4 data-dir contract on mobile

C4 §1 defines `<data> = app_data_dir()/data`, with `settings.json` at
`app_config_dir()/settings.json`. The contract already carries Android and iOS rows and
marks both as expectations, not verified facts: Android "not independently verified",
iOS "exact Tauri v2 mapping unconfirmed".

The contract is satisfiable on both, because `<data>` is defined as a *subdirectory*. Even
where Android collapses config and data into one app-private directory, `settings.json`
still sits one level above the §2 tree, so it stays structurally outside anything sync or
verify walks. That was the design intent and it holds.

Two items need on-device checking rather than assumption: that `app_data_dir()` returns a
real filesystem path `std::fs` can use (it should — it maps to `getFilesDir()`), and that
the C4 §2 tree creation at `rust/tauri/src/paths.rs:39` succeeds under Android storage.

The Settings data-dir override does **not** transfer: an arbitrary user-chosen writable
directory is not a concept Android grants without the Storage Access Framework. Recommend
hiding the override on mobile rather than failing at runtime, and amending C4 §1 to say so.

## 4. Task breakdown

"Cargo slot" = compiles Rust, must hold the machine's single cargo process (CLAUDE.md §8).

| # | Task | Files | Gate | Cargo slot |
|---|---|---|---|---|
| 1 | Toolchain and env | none (Isaac's shell) | `npm run tauri -- info` reports SDK + NDK found | no |
| 2 | `tauri android init` | generates `app/src-tauri/gen/android/` | Gradle project exists; committed or ignored per Q2 | no |
| 3 | Cross-compile to `aarch64-linux-android` | `rust/core/Cargo.toml`, `rust/transport/Cargo.toml`, `rust/tauri/src/commands/device.rs` | `cargo build --target aarch64-linux-android -p idl-rs-tauri` | **yes** (long) |
| 4 | Mobile capabilities + config | `app/src-tauri/capabilities/default.json`, `tauri.conf.json` | `tauri android build --debug` produces an APK | **yes** |
| 5 | First launch on device/emulator | none | App opens; `resolve_data_dir` succeeds; C4 §2 tree present, confirmed by `verify_data_dir` | no |
| 6 | Binary IPC on Android WebView | none | One `fetch_tile` round-trip reaching a correct `Float32Array` on-device (design doc line 78 — only ever proven on desktop) | no |
| 7 | Android permissions + MulticastLock | generated `AndroidManifest.xml`, Kotlin shim if Q3 says so | Sync discovery finds the desktop peer from the phone | yes, if a plugin is added |
| 8 | Mobile paper view + responsive shell | `app/src/` | Design doc line 154 criteria | no |

Tasks 1 and 2 are strictly sequential. Task 8 is independent of everything after task 2 and
can run in parallel with 3–7.

## 5. Open questions for Isaac

1. **Is L9 scaffold Android-only for now?** Recommend yes. iOS cannot be started on this
   hardware; pretending otherwise puts a permanently-red gate in the lane.
2. **Commit `gen/android/` or gitignore it?** Recommend commit. The Android project holds
   hand-edited manifest permissions the sync lane needs; regeneration loses them silently.
3. **Does the MulticastLock land in this lane or wave 3?** Recommend this lane. Without it,
   sync on the phone appears to work and finds nothing — the worst failure mode. Roughly
   twenty lines of Kotlin, far smaller than the BLE plugin.
4. **What do BLE commands return on Android before the plugin exists?** Recommend a typed
   `IpcErrorKind` unsupported-on-platform variant, so the Device tab grays itself out
   instead of showing a connection failure that reads as a bug.
5. **Does the Settings data-dir override stay visible on Android?** Recommend hiding it and
   amending C4 §1 to state the override is desktop-only.
6. **Minimum Android API level?** Nothing in the repo states one. Recommend 26 (Tauri v2's
   default) unless Isaac's test phone is older.

Unknowns I could not resolve by reading, both answered by task 5: whether an emulator AVD is
configured, and whether the dialog plugin's Android `open()` returns a path `import_file`
can actually read.
