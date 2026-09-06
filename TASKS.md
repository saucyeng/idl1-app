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
- [x] L2 importers — GPX/FIT/CSV via a shared Importer trait, golden-tested
      against hand-built fixtures; core registry (R51 Q2); import_file/
      list_importers Tauri wiring (L5 Task 9) has landed (`c3464f4`);
      FIT/GPX GPS_SpeedKmh/GPS_Heading direct-path population deferred
      pending Isaac's real archive (ledger R23 Q4), tracked as "L2
      follow-on S/H (post-archive)"
- [x] L3 core workbook v3 — complete; v2 workbook migration (C2 §6) dropped per R30; tier
  cache (design §4 L3 row) and Stage 2 chart conversion (L6) deferred
- [x] L4 `idl-transport` desktop — complete pending Isaac's real-device BLE/WiFi check
- [x] L5 Tauri scaffold hardening — Tasks 1-14 landed (Task 9, the import commands, landed with L2 on 2026-09-05, idl-rs `c3464f4`); Step 6's on-screen render confirmed in the dev app 2026-09-05 (IMU2_AccelX, real session).
- [ ] L10 docs (runs alongside)

## Wave 2

- [ ] L6 notebook UI — Tasks 1-16 landed on `wave2-l6-notebook`. Design §10's
  two done-criteria: (1) `plotForm` round-trips its subset — Task 3's
  exhaustive generator-based test passes as part of Task 16's whole-suite
  gate; (2) pan/zoom/hover on a real session at 60 fps desktop — not
  observable from this task's position (no cargo, no Tauri build in a UI
  worktree); left for the lead's merge-gate eyeball pass in the running dev
  app (R50 precedent). N1 (`read_workbook`) is still a stub
  (`Notebook/ipcStubs/readWorkbook.ts`); N3 (host-channel byte path) has no
  call site yet; N4 (`eval_workbook`'s `lap_context`) is read from
  `AppState.selection` but not yet threaded through, pending the Rust
  write-amendment lane (`runs/2026-09-05/lanes/l6/CONTRACT-AMENDMENTS.md`).
- [x] L7a Data tab — Tasks 1-8 landed on `wave2-l7a-data`. Write-command IPC
  needs 1-4 (`save_session_metadata`, `save_track`/`delete_track`,
  `delete_session`, `list_quarantine`/`resolve_quarantine`) are built
  against `NotImplementedError` stubs, no Rust command behind any of them
  yet; need 5 (`rescan_track_visits`) is dropped outright for wave 2, not
  stubbed. Parity gaps, unabridged (plan's own table): track create/edit/
  delete, lap-timing editor, sector list, neutral-zone list and the track
  sidebar deferred to wave 3 (blocked on both the write command and C3 §6
  item 10's unfixed `TrackDetail` nested shapes); the track import conflict
  dialog deferred with it; rescan-disk/repair-filenames replaced outright
  by `rebuild_catalog`; Google Drive sign-in/status/auto-sync dropped
  permanently (idl1 uses LAN sync instead, L7c/L11); has-gates/has-GPS
  facets dropped for wave 2 (neither derivable from a `SessionSummary`);
  the session GPS map preview deferred to wave 3 (needs bundled map tiles);
  FIT export controls deferred (C3 has no export command, design §10: "L8
  (export) does not exist in v1"); the compare-with picker and lap ignore/
  restore/session-selection-to-Analyze deferred to L6 (the selection model
  lives in the lead-owned `AppState.selection`); the device file sync
  screen moved to L7b; the venue detail card dropped for wave 2 (a venue is
  a string field, not an entity, in idl1); narrow-layout bottom sheets and
  the mobile filter bar kept as responsive CSS, not a separate
  implementation (mobile is L9's lane). Lap counts and lap tables
  legitimately read "—"/empty for most sessions at wave 2 (R53 Q4) — no
  wave-1 import path indexes `laps`/`lap_summary` yet; not a bug in this
  lane.
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
- [x] L8w Rust write-amendment lane — all 14 tasks (incl. lead-added Task
  12b) landed on `wave2-l8w-write-amendment`, 20 commands registered;
  lane gate green (`cargo test -p idl-rs-tauri` 188 passed, `cargo test
  -p idl-rs -p idl-rs-cli -- --test-threads=4` idl-rs 944 passed/1
  ignored, idl-rs-cli 51 passed). Scope limits, stated not silently
  absorbed: `preview_channel_registry` covers SPEC §5.2's fixed channel
  ids only, no generic analog/digital channel-id guess (R63 2);
  `device_rejected` (Task 7) and `pull_config`'s `config` kind (R71,
  R71 correction) are both defined but practically unreachable on the
  desktop `btleplug` backend, which never surfaces the SPEC §7.2 ack
  byte; `list_math_builtins` ships without a `unit_rule` field, dropped
  by ruling R64.2 pending a future unit-propagation-rules amendment;
  `eval_workbook`'s `lap_context.overlay_laps` supports same-session
  overlay only in wave 2 (R64.1), and `MathOverlay` cannot yet be
  constructed from a multi-lap `overlay_laps` list at all until the
  lap-indexing amendment settles that shape (R73) — unreachable today
  since wave-1 import never populates `laps[]`. C3 §6's wave-2 deferred
  list (`list_quarantine`/`resolve_quarantine`, `save_track`/
  `delete_track`, `rescan_track_visits`, `fetch_histogram`,
  `fetch_scatter_points`) is unchanged — none of this lane's tasks
  implement any of them, confirmed by grep.
- [ ] L9 mobile scaffold
- [ ] L11 LAN sync

## Wave 3

- [ ] L9 mobile plugins · L12 in-app agent (optional)
