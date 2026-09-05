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

- [ ] L6 notebook UI · L9 mobile scaffold · L11 LAN sync
- [ ] L7 device/data/settings UI
  - [ ] L7a Data tab
  - [x] L7b Device tab — all 9 tasks landed on `wave2-l7b-device`. Outstanding
    (`runs/2026-09-05/lanes/l7/IPC-NEEDS.md`): live device status (need 8)
    and recording/mode control (need 9) have no C3 command, shown as
    "unavailable" rather than built; `pull_config` (need 10) is a stub, so
    a push cannot be round-trip verified; profile persistence (need 11) is
    in-memory for the session only; the channel-registry preview is
    narrowed to enable state/rate/units per R53 Q1 option (c) for wave 2,
    with need 12 (the fuller preview) filed for a later (b); a managed BLE
    connection (need 13) does not exist, so `connected` reads as "the last
    attempt succeeded," never a live link. Parity gaps dropped or deferred
    per the plan's table (`docs/superpowers/plans/
    2026-09-05-idl1-wave2-l7b-device-tab.md`): IMU calibration and
    firmware OTA (wave 3), the Android WiFi bind-follows-mode controller
    and the RX/TX link-activity blink (dropped), reserved digital
    `level`/`pwm` channel kinds and per-channel analog rate overrides
    (parsed/preserved, not exposed), HRM scan filtering to heart-rate
    straps (partial — no service-UUID filter), and "connect and forget"
    auto-download on connect (dropped, needs cross-tab state).
  - [ ] L7c Settings tab

## Wave 3

- [ ] L9 mobile plugins · L12 in-app agent (optional)
