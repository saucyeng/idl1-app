# idl1 Build Tasks

Read `CLAUDE.md` and the design doc before starting any task. Lanes and waves
are defined in `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md` §10.

## M0 — foundations (`docs/superpowers/plans/2026-09-02-idl1-m0.md`)

- [x] Task 1 ecosystem report
- [x] Task 2 idl-rs pin/tag/delete + idl-transport stub
- [x] Task 3 repository created
- [x] Task 4 Tauri scaffold
- [x] Task 5 idl-rs-tauri + binary IPC smoke
- [x] Task 6 contract C1 session schema
- [x] Task 7 contract C2 workbook v3
- [x] Task 8 contract C3 IPC surface
- [x] Task 9 contract C4 data directory
- [x] Task 10 M0 exit — complete; desktop visual check confirmed 2026-09-03

## Wave 1 (after M0)

- [x] L1 core `store/`
- [ ] L2 importers
- [x] L3 core workbook v3 — complete; v2 workbook migration (C2 §6) dropped per R30; tier
  cache (design §4 L3 row) and Stage 2 chart conversion (L6) deferred
- [x] L4 `idl-transport` desktop — complete pending Isaac's real-device BLE/WiFi check
- [ ] L5 Tauri scaffold hardening — Tasks 1-8, 10-14 landed; Task 9 (import commands) deferred with L2; Step 6's on-screen render confirmed in the dev app 2026-09-05 (IMU2_AccelX, real session).
- [ ] L10 docs (runs alongside)

## Wave 2

- [ ] L6 notebook UI · L7 device/data/settings UI · L9 mobile scaffold · L11 LAN sync
  - [x] L7c settings tab — all 6 tasks landed for wave 2. Outstanding:
    `get_settings`/`set_settings` (IPC need 6) and
    `get_data_dir`/`set_data_dir` (IPC need 7a/7b) are still stubbed
    pending the Rust write-amendment lane; prefs live in `localStorage`
    meanwhile and the one-time migration into `settings.json` (R53 Q1's
    stated risk) is not yet scheduled. Parity gaps: Google Drive dropped
    permanently (replaced by Sync, not deferred); Firmware/OTA deferred to
    wave 3 (operating brief §3); "Full reference"/"Report issue" links
    dropped (idl0 `example.com` placeholders); Licenses omitted (no
    license-page generator wired into idl1's build); chart controls
    reference carried but provisional pending L6's actual bindings.

## Wave 3

- [ ] L9 mobile plugins · L12 in-app agent (optional)
