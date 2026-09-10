# Brief: firmware OTA (R197/R198) -- lean owner, transport + tauri + app, spec-during

Read: CLAUDE.md; rulings R197, R198 (`runs/2026-09-03/decisions.md`); `runs/2026-09-10/
OTA-FLUTTER-FLOW.md` (the old flow, with its bugs flagged; copy what was sound); SPEC §6.1
`/ota`, §7.2 `CMD_OTA_CONFIRM`, §7.3 `OTA: PENDING_VERIFY`; C3 §3.8 Device. Existing code:
`rust/transport/src/wifi_transport.rs` (`push_ota`), `ble_control.rs` (`OtaConfirm`),
`ble_status.rs` (pending-verify parse), `rust/tauri/src/commands/device.rs`,
`app/src/routes/pages/Settings/FirmwareSection.tsx` (placeholder today), `app/src/ipc/device.ts`.
Worktrees: Rust `idl-rs-worktrees/ota`, app `../idl1-app-worktrees/ota`.

## Rulings (R198; do not ask)
- **Firmware source:** (a) a manual `.bin` picked from disk, always available; (b) a release
  catalog from GitHub Releases of a repo named in Settings (`firmware_repo: "owner/name"`,
  empty by default = catalog disabled; the Flutter app only ever had a placeholder repo).
  Catalog assets: `idl1-firmware-<semver>.bin` and `idl1-firmware-<semver>.bin.sha256`;
  a download whose sha256 mismatches is refused before any push. Channel `stable` = latest
  non-prerelease, `beta` = latest including prereleases. Catalog fetch is the only network
  call the app makes to the internet; it runs only on "Check now" or on opening the section
  with the catalog enabled, never on a timer.
- **State machine lives in `idl-rs-tauri`** (Rust owns reconnect logic, the app draws it):
  `idle -> pushing(pct) -> rebooting -> reconnecting(attempt n of N) -> pending_verify ->
  confirmed | rolled_back | failed(error)`. Reconnect: BLE scan+connect retry every 3 s for
  60 s; then `failed`. Auto-confirm is armed **only for catalog pushes whose sha256 verified**
  and fires once on the first status read showing `PENDING_VERIFY` after reconnect; a manual
  `.bin` push always waits for the user's Confirm / Roll back (roll back = do nothing and
  tell the user to power-cycle the device; the bootloader reverts). Copied from Flutter; its
  workaround-flagged behaviours are dropped, not ported.
- **Preconditions:** BLE connected; device not recording; device version parses as semver
  (else "unknown version", push still allowed manually); the device enters WiFi mode via
  the existing config/command path as the old app did.
- **Progress:** `push_ota` gains chunked upload progress (bytes) over the existing `Progress`
  channel shape; HTTP 400 (short upload) vs 500 (device-side validation) vs other are
  distinct typed errors with the device's body text in `detail`.

## Tasks (one commit each)
1. transport: `push_ota` streams the body with a progress callback; typed 400/500/other
   errors. Tests with the raw one-shot TCP peer already used in sync tests.
2. tauri (spec-during: write the C3 §3.8 text in the same commit, byte-exact DTOs):
   `push_firmware(source: {kind:"file", path} | {kind:"catalog", version}, progress) ->
   OtaOutcome`, `confirm_firmware()`, `firmware_catalog(channel) -> FirmwareRelease[]`,
   `ota_state() -> OtaState`, event `ota_state_changed`. The state machine with tests using
   the mock transports already in `device.rs`.
3. app: `ipc/device.ts` mirrors; `FirmwareSection.tsx` over pure `firmwareFlow.ts`
   (state -> what the card shows, verbatim strings from the Flutter extract where they were
   good) and `firmwareCatalog.ts` (version compare, channel filter); Settings gains
   `firmware_repo` and channel in the existing prefs store. Tests for the pure modules only.
4. CHANGELOG line; TASKS.md: Firmware/OTA moved from deferred to landed.

## Gates
Targeted filters, then `cargo test -p idl-transport -- --test-threads=4`, `-p idl-rs-tauri`,
and `-p idl-rs -p idl-rs-cli` once; app tsc + vitest. Merge both repos (main into branch
first), submodule bump, retire in R171 order, never push.
