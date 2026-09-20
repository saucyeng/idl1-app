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
  app (R50 precedent). N1 (`read_workbook`) and N4 (`eval_workbook`'s
  `lap_context`, threaded from `AppState.selection`) landed for real in the
  2026-09-06 UI shell task, once L8w's Rust lane shipped them; N3
  (host-channel byte path, `fetch_host_channel`/`ipc/hostChannel.ts`) is a
  real command with a decoder but still has no UI call site — binding a
  `math`-cell definition to a chart is new feature design (which
  definition, what budget, gesture-settle semantics), not a stub swap.
- [x] L7a Data tab — Tasks 1-8 landed on `wave2-l7a-data`. Write-command IPC
  needs 1 (`save_session_metadata`) and 3 (`delete_session`) are real and
  wired as of the 2026-09-06 UI shell task (`MetadataForm.tsx`/`index.tsx`'s
  delete/forget-session actions); needs 2 (`save_track`/`delete_track`) and
  4 (`list_quarantine`/`resolve_quarantine`) stayed `NotImplementedError`
  stubs at the time this lane landed — C3 then had no command for any of
  the four (deferred to wave 3, operating brief §3). **Needs 2 and 4 are no
  longer deferred**: L8x (ruling R86) landed `save_track`/`delete_track`
  and `list_quarantine`/`resolve_quarantine`/`verify_data_dir` 2026-09-06;
  swapping these stubs for the real commands is a post-lane TS shell task
  (below). Need 5 (`rescan_track_visits`) is dropped outright for wave 2,
  not stubbed. Parity gaps, unabridged (plan's own table): track create/edit/
  delete, lap-timing editor, sector list, neutral-zone list and the track
  sidebar were deferred to wave 3 (blocked on both the write command and C3
  §6 item 10's unfixed `TrackDetail` nested shapes) — **the write command
  and the nested-shape blocker are both closed by L8x** (Tasks 2/4/5
  above); the lap-timing/sector/neutral-zone-list *editor UI* (map gate
  placement) stays wave 3 per ruling R54, unaffected by this landing; the
  track import conflict dialog deferred with it; rescan-disk/repair-filenames replaced outright
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
  implementation (mobile is L9's lane). Lap counts and lap tables were
  originally "—"/empty for most sessions (R53 Q4, no wave-1 import path
  indexed `laps`/`lap_summary` yet) — **closed by L2b** (below): import now
  indexes laps, and this tab's own consumption of typed sectors/
  neutral-zone-visits and a rescan action landed in the post-lane TS shell
  task (2026-09-06, see the L2b entry below).
- [x] L7b Device tab — all 9 tasks landed on `wave2-l7b-device`; **Task 10
  (2026-09-06, R77.4/R78) wires the tab live.** Needs 8 (`device_status`),
  9 (`device_control`), 11 (`list_profiles`/`save_profile`/`delete_profile`)
  and 13 (`connect_device`/`disconnect_device`) are now real C3 commands
  **and wired**: `HeroCard.tsx` shows real status via a 1 Hz `statusPoll.ts`
  driver (visibility-paused, "link lost?" after 3 consecutive failures,
  connection state unchanged either way); `DeviceControls.tsx` sends
  start/stop recording and WiFi on/off through `control.ts`'s availability
  gating, reporting only what the returned status shows (never a resolved
  promise alone — the SPEC §7.2 ack byte gap, R63.1/R71); `ProfileBar.tsx`
  persists profiles over `profilesSync.ts`, last-write-wins, explicit Save
  button with a dirty marker, no autosave; the connect path moved to the
  managed `connect_device`/`disconnect_device` pair. `pull_config` (need
  10) is real and wired (`PushConfigBar.tsx`'s "Pull from device" button),
  but a push still cannot be round-trip verified — comparing the pulled
  config against what was pushed is a separate feature, not built here. The
  channel-registry preview is narrowed to enable state/rate/units per R53
  Q1 option (c) for wave 2, with need 12 (the fuller preview) filed for a
  later (b). Still not built: the device dropdown/picker sheet, RX/TX
  link-activity, the `mm:ss` recording timer, IMU calibration, HRM pairing,
  and auto-connect ("headphones" model) — see `docs/IDL0_SPEC.md` §23.10's
  wave-2 paragraph. Parity gaps dropped or deferred
  per the plan's table (`docs/superpowers/plans/
  2026-09-05-idl1-wave2-l7b-device-tab.md`): IMU calibration and
  firmware OTA (landed 2026-09-10, see the OTA lane entry below), the
  Android WiFi bind-follows-mode controller
  and the RX/TX link-activity blink (dropped), reserved digital
  `level`/`pwm` channel kinds and per-channel analog rate overrides
  (parsed/preserved, not exposed), HRM scan filtering to heart-rate
  straps (partial — no service-UUID filter), and "connect and forget"
  auto-download on connect (dropped, needs cross-tab state).
- [x] L7c settings tab — all 6 tasks landed for wave 2. Outstanding:
  `get_data_dir`/`set_data_dir` (IPC need 7a/7b) are real and wired as of
  the 2026-09-06 UI shell task (`DataSection.tsx`). `get_settings`/
  `set_settings` (IPC need 6) are real C3 commands but still have no UI
  call site — prefs still live in `localStorage` via `prefsStore.ts`
  (Task 2's own design), and migrating that to `settings.json` (R53 Q1's
  stated risk) is a separate task, not scheduled by this one. Parity gaps: Google Drive dropped
  permanently (replaced by Sync, not deferred); Firmware/OTA landed
  2026-09-10 (see the OTA lane entry below), no longer deferred;
  "Full reference"/"Report issue" links
  dropped (idl0 `example.com` placeholders); Licenses omitted (no
  license-page generator wired into idl1's build); chart controls
  reference carried but provisional pending L6's actual bindings.
- [x] Firmware OTA lane (2026-09-10, rulings R197/R198) — all 4 tasks
  landed. `idl-transport` streams `POST /ota` with byte progress and splits
  SPEC §6.1's 400/500/other responses into typed errors carrying the
  device's own body text, and gains `firmware_catalog` (GitHub Releases,
  semver precedence, channel filter, `.bin.sha256` sidecar verify).
  `idl-rs-tauri` owns the state machine — idle → downloading → pushing →
  rebooting → reconnecting → pending-verify → confirmed / rolled back /
  failed — behind `push_firmware`, `confirm_firmware`, `firmware_catalog`,
  `ota_state` and the `ota_state_changed` event (C3 §3.8, written in the
  same commit). Settings > Firmware replaces the deferred placeholder.
  Auto-confirm fires only for a catalog push whose sha256 verified and
  whose device came back on the pushed version; a manual `.bin` always
  waits for the user. Not built: no roll-back command (the bootloader
  reverts an unconfirmed image on the next boot — the app shows the
  power-cycle instruction), no auto-check on a timer or on connect (R198),
  no Device-hero update banner (SPEC §27.7's second surface — Settings
  only), and no real-device proof: every test here runs against stubs and
  a local mock HTTP server.
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
  `eval_workbook`'s `lap_context.overlay_laps` supported same-session
  overlay only at the time this lane landed (R64.1); **the multi-lap
  `overlay_laps` shape is closed by L2b Task 7** (below) — `MathOverlay`
  is now constructible from a list. C3 §6's wave-2 deferred list
  (`list_quarantine`/`resolve_quarantine`, `save_track`/`delete_track`,
  `fetch_histogram`, `fetch_scatter_points`) is unchanged — none of this
  lane's tasks implement any of them, confirmed by grep.
  `rescan_track_visits` is no longer on this deferred list: L2b closed the
  engine gap and shipped it as `rescan_tracks` (C3 §3.2).
- [x] L2b lap indexing — all 8 tasks landed on `l2b-laps`; lane gate green
      (both worktrees). `store::lap_index` (Tasks 1-2, IDL0_SPEC §17.4)
      detects track visits and laps at import time, stamped by
      `track_visits_library_hash`/`lap_detector_version` so a rescan only
      recomputes when the library actually changed; wired into
      `finish_import` and the CLI's `idl-rs rescan` (Task 3); an
      incremental `store::catalog::index_session` runs after import instead
      of a full `rebuild_catalog` (Task 4); `LapDetail.sectors`/
      `.neutral_zone_visits` are typed concretely, closing C3 §6 item 11
      (Task 5); `fetch_fft`'s `lap` argument is real, scoping the FFT to one
      lap's recording-time window (Task 6, plus R85's fix for the few-
      sample guard running on the sliced window); `MathLapContext.overlay`
      is now `Vec<MathOverlay>` for same-session multi-lap overlays (Task
      7, R73); `rescan_tracks(session_id)` lets a rider who adds a track
      after importing backfill laps for older sessions without a re-import
      (Task 8, PLAN Q8, C3 §3.2). **Unblocks in the UI** (post-lane TS
      shell tasks, none scheduled by this lane): L7a's Data tab lap tables
      and `sessions.lap_count` can now read real data instead of "—"
      (`app/src/ipc/catalog.ts`'s `LapDetail.sectors: LapSector[]` /
      `.neutral_zone_visits: LapNeutralZoneVisit[]` replacing `unknown[]` —
      ledger "Tracked (L2b Task 5)", 2026-09-06); L6's notebook
      `lap_context` can stop rejecting every non-null context now that
      `AppState.selection` has real laps to select; `fetch_fft`'s `lap`
      argument is reachable from the FFT cell; L8w's `MathOverlay`
      multi-lap shape (R73) is constructible; a "Rescan tracks" button on
      the Data tab's maintenance panel needs `rescan_tracks`/`RescanReport`
      added to `app/src/ipc/catalog.ts` (exact declaration in the Task 8
      implementer's report). **Post-lane TS shell task landed (2026-09-06):**
      `app/src/ipc/catalog.ts`'s `LapDetail.sectors`/`.neutral_zone_visits`
      are typed and `rescanTracks`/`RescanReport` are wired; the Data tab's
      lap tables render real sector/neutral-zone data (`Data/
      lapDetailFormat.ts`) and a "Rescan tracks" button reindexes one
      session and refreshes the detail pane; the Notebook's FFT cell passes
      the selected main lap to `fetch_fft` as `lap`.
- [x] L8x Data-tab write commands — `runs/2026-09-06/lanes/l8x-data-writes/`,
      ruling R86. Closes the last four C3 §6 deferrals the Data tab still
      stubs: `save_track`/`delete_track` (Tasks 2-5, C3 §3.2) and
      `list_quarantine`/`resolve_quarantine` (Task 7, C3 §3.2) are landed,
      backed by core validation/`delete_track` (Task 3), the typed
      `TrackDetail` read path closing §6 open question 10 (Task 2), and the
      core quarantine module plus `verify`'s repair pass (Task 6, C4 §7).
      `verify_data_dir(repair)` (Task 7, C3 §3.10) is the quarantine
      producer, since nothing else moves a corrupt file into
      `tmp/quarantine/`. Task 1 (docs-only, spec-first) landed the C3
      §3.2/§3.10 and C4 §2/§7 amendment: §6's quarantine and track-write
      deferrals in the "Wave-2 amendment (R59)" block are struck. Task 5b
      (ruling R87, lead-added after preview) closed a separate gap found
      along the way: `rebuild_catalog` never indexed workbooks, so
      `list_workbooks` was empty after every restart — step 6 now walks
      `workbooks/*.idl1wb` and upserts rows, and `create_workbook`/
      `save_workbook` upsert their own row. Task 8 is this doc sweep and
      the lane merge gate. **Unblocks in the UI, landed (2026-09-06,
      post-lane TS shell task):** `app/src/ipc/catalog.ts` gains the typed
      `Gate`/`SectorGate`/`NeutralZone`/`GpsFix`/`LapTiming`/`TrackDraft`/
      `SaveTrackResult`/`DeleteTrackReport` types plus `saveTrack`/
      `deleteTrack`; a new `app/src/ipc/maintenance.ts` gains
      `listQuarantine`/`resolveQuarantine`/`verifyDataDir`;
      `Data/ipcStubs.ts`'s four stubs (and the toolbar's placeholder
      "Review quarantine" button) are deleted; `TrackDetailPane.tsx`
      renders real gate/sector/neutral-zone/reference-polyline text (a new
      pure `Data/trackDetailFormat.ts`, decimal degrees with a `°` unit)
      and gains Name/Venue edit (`saveTrack`, via a new pure
      `Data/trackDraft.ts`) and Delete (`deleteTrack`, confirmed first);
      both surface `stale_session_ids` as a "Rescan N sessions" button over
      the existing `startMaintenanceAction` driver (new
      `runRescanSessions`/`summarizeRescanSessionsReport` in
      `Data/maintenance.ts`). A new `MaintenancePanel.tsx`, behind a
      toolbar toggle, lists quarantine entries with Restore/Discard
      (Discard confirmed) and a Verify action, with a separate explicit
      Repair (`repair: true`) once a Verify report exists. **Parity gap,
      unaffected by this landing:** the track editor itself — creating or
      editing lap-timing/sector/neutral-zone geometry on a map — stays wave
      3 per ruling R54; this task's Name/Venue edit is the only write path
      into an existing track's non-geometry fields.
- [ ] L9 mobile scaffold — Android-only on this machine (R183);
      survey `runs/2026-09-10/L9-SURVEY.md`. Tasks 1-2 wait on Isaac's
      `JAVA_HOME`/`ANDROID_HOME`/`NDK_HOME`. **Task 8 (mobile paper view)
      landed 2026-09-10** (R184/R185/R186): paper is the narrow `"sheet"`
      placement; viewer and editor alternate; `paperTheme` pref; one
      series-on-white palette shared with print. Open: landscape > 600 px
      falls back to the inline layout (by design until a device runs it).
- [ ] L11 LAN sync — Tasks 1-12 landed on `l11-sync` (idl-rs) /
      `l11-sync` (idl1-app); pairing, discovery, the axum server/client,
      the C2 §7 workbook merge, and the five `commands::sync` Tauri
      commands are all in. Lane gate PASS (idl-rs 1139/1 ignored, cli 53,
      tauri 260); merged to `main` and landed 2026-09-07. **Unblocked, this
      shell task (2026-09-07):** `app/src/ipc/sync.ts` brought up to C3
      §3.9's landed shape (`startPairing`/`pairPeer(peerId, code)`/
      `unpairPeer`/`onPeerAppeared`, six-field `SyncResult`); Settings'
      `SyncSection.tsx` gains the paired-peer list, unpair, the pairing
      flow and the "sync finished" toast (decision 21) over new pure
      modules `pairForm.ts`/`syncPoll.ts`. **Still open:**
  - `app/src-tauri`'s `.setup()` hook still does not call
    `SyncState::start`/`app.manage` — ruling R105: this device's own
    `peer_id`/`name` come from a new `identity.json` in
    `app_config_dir()` (uuid v4 minted once, name defaulting to the OS
    hostname). Landing as **L11 Task 13**, dispatched separately; out of
    this shell task's scope.
  - No C3 command or event enumerates *unpaired* peers currently visible on
    the LAN (`sync_status` lists only paired peers; `peer_appeared` fires
    only for an already-paired sighting, per `state.rs`'s discovery loop) —
    so R104's "the UI may prefill `peer_id` when exactly one unpaired peer
    is online" has no data source today. `SyncSection.tsx` instead asks the
    user to type the peer id (never guessed, satisfies R104's letter).
    ~~**L11 Task 14** (filed by the lead) adds `SyncStatus.discovered_peers`
    and widens `peer_appeared` to any sighting~~ -- **closed 2026-09-10.**
    Rust side (R175/R176) and the TS mirror both landed; Settings -> Sync
    shows a "Nearby devices" list whose entries prefill the peer id (never
    auto-pair, R104). Each poll replaces the discovered list wholesale; a
    successful pair removes the peer from it.
  - ~~`unwatch_workbook` missing from C3 (R98)~~ — **closed 2026-09-09.**
    The command exists, C3 §3.4 is corrected (its "unsubscribe is closing
    the channel from the frontend side" was never true: Tauri v2 gives the
    Rust side no channel-close signal), and `Notebook/index.tsx`'s watch
    effect calls `unwatchWorkbook` in cleanup. No more leaked file handle
    per workbook opened.
  - `sync::client::tests::download_item_a_raw_file_tier_response_over_the_
    cap_is_refused_and_nothing_is_written` is a named flake (**R178**,
    2026-09-09): it allocates `MAX_RAW_FILE_BODY_BYTES + 1` = **512 MiB**,
    writes it to disk and serves it over HTTP, so four test threads on this
    machine OOM. Passes alone; fails under `--test-threads=4`. Not a
    regression and not contention with other lanes — reproduced on a quiet
    `main`. The allocation is also unnecessary: the cap is refused on
    `Content-Length` before streaming. Fix queued: advertise an over-cap
    length with a small body, keep the assertion, never shrink the
    production cap, and give the mid-stream branch its own small-cap test.
    **Fixed 2026-09-10:** both over-cap tests use a raw one-shot TCP peer
    that advertises `Content-Length: cap+1` with a 4-byte body; the
    mid-stream branch has its own chunked-body tests through a new
    `download_item_with_cap(..., cap)` seam with a 4 KiB cap. Production
    caps unchanged. Transport gate green in one run (118 passed).
  - `watcher::tests::self_write_with_pre_registered_hash_never_fires_
    callback` is a named timing flake (asserts no callback within 500 ms
    against a 100 ms debounce; fails only on a loaded machine) — not
    broken code. **Closed 2026-09-10:** cause was the test writing with
    `std::fs::write` (Create+Modify; the first event can be hashed before
    the bytes land). Tests now self-write through the production
    `write_atomic` path and assert ordering, not a timeout. Watcher logic
    untouched. Gate 3's named flakes: none.
  - `verify_data_dir`'s symlink/junction finding (R101): a pre-existing
    link inside `data_root` is out of `safe_join`'s stated boundary and not
    yet a `verify_data_dir` finding. Filed as an L8-class follow-on.

## M4c — library (rulings R191, R194)

- [x] M4c library lane — landed 2026-09-10 on `m4c` (both repos). Four gaps
  from `runs/2026-09-10/M4C-SURVEY.md` closed: a user-supplied session start
  (`session.json` `timestamp_utc_ms`/`timestamp_source`, C1 §3.1/§6, with the
  Data tab's "start time unknown — set it" prompt on a catalogued start of
  `0`); importer staleness (`list_stale_sessions`) and rebuild-from-blob
  (`reimport_sessions`, keeping every human-owned field, dropping `derived/`,
  atomic per session) behind "Rebuild N stale sessions" in the maintenance
  panel; a non-recursive folder scan (`scan_folder`, extension → importer id,
  sha256 → `already_imported`, `.idl0` header peek) behind "Import folder…"
  with a preview table that enqueues one `import_file` per row; and
  `<data>/inbox`, a desktop-only drop folder watched while the app runs and
  scanned at launch, importing after two seconds of stable size, deleting the
  imported copy and moving failures to `inbox/failed/` with an `.error.txt`
  (`inbox_status`). The metadata editor and CAS de-duplication needed no work
  — both already existed. Not done here: no bulk-import command (R191 keeps
  progress and errors per file), and no inbox setting (the path is fixed at
  `<data>/inbox`).

## Data root safety (ruling R196)

- [x] dataroot lane — landed 2026-09-10 on `dataroot` (both repos). Four
  changes, all aimed at one failure: an unavailable library folder that used
  to look like an empty library. (1) `resolve_data_dir` now returns a typed
  `DataDirMissing` when the `settings.json` override is absent, is not a
  directory, or cannot be written (C4 §1 "Missing root"), and creates
  nothing anywhere — the launch keeps the window but starts no library
  subsystem, and the frontend gate blocks every tab behind a screen naming
  the folder, with Retry and Choose folder. (2) `move_data_dir` (C3 §3.10,
  amended by R197 to move rather than copy) moves `blobs/`, `sessions/`,
  `workbooks/`, `tracks/` and `profiles/` to a new root one file at a time —
  rename on the same volume, otherwise copy, verify (sha256 against the
  blob's own path-named digest, byte length for the rest), delete the source
  — then rebuilds the catalog at the destination and only then writes the
  override; it refuses a relative, overlapping or unwritable target, prunes
  only directories it emptied, and a copy that does not verify leaves its
  source untouched. Settings > Data drives it with a folder picker,
  confirmation, per-phase progress and a result line. (3) `tauri dev` runs
  under `com.saucyeng.idl1.dev` via a `--config` overlay
  (`npm run tauri:dev`), so a dev build can no longer open the real library.
  (4) A delete-guard `#[test]` scans core/transport/tauri for non-test
  `remove_*` calls and fails unless the set matches the allowlist audited in
  `runs/2026-09-10/DELETE-AUDIT.md`; it immediately found `delete_track`
  missing from that audit. Lane decision worth a reader's attention: C3 §3.10
  refuses a non-empty move target while C4 §1 requires an interrupted move to
  resume on rerun, so a target is accepted when it is absent, empty, or holds
  nothing but a `data/` directory whose entries are all moved-tree names.
  Not done here: R197's CLI half (`idl-rs library fold-in|scan|stale|rebuild`)
  is a separate lane, and Retry/Choose folder both end at "restart idl1"
  rather than resuming in place, because `<data>` is resolved once per
  process.

## Session memory (ruling R203)

- [x] memory lane — landed 2026-09-10 on `memory` (both repos). The
  incident: a multi-hour 395 MB `.idl0` killed the app with `memory
  allocation of 60391864 bytes failed`. Five changes. (1) `data.parquet` is
  read one column at a time — `store::parquet::read_channel` projects the
  channel, `t` and the channel's `<source>_t_recorded_us` and decodes
  nothing else, including for synthesized `Time`/`Distance`, which it
  rebuilds from only the columns that could win the source election.
  `read_session_parquet` survives for import verification, export, rebuild
  and the workbook evaluator. (2) `SessionCache` in `idl-rs-tauri` holds
  `session_id -> channel -> Arc<ChannelSamples>`, LRU by bytes against
  `min(2 GiB, 25 % of physical RAM)`; `fetch_tile`, `cursor_readout` and
  every raster/FFT path read through it, and delete/reimport/import
  invalidate by session. (3) Import maps the log (`memmap2`) instead of
  `std::fs::read`, and `data.parquet` is now written one column at a time
  through parquet's per-column writers — byte-identical to the old
  whole-`RecordBatch` writer, proved by a reference implementation kept in
  the tests, multi-row-group case included. (4) Every session-scaled
  allocation is sized from the footer first and refused as C3 §1's
  `resource_exhausted` (`{ needed_bytes, budget_bytes, hint }`) rather than
  aborting. (5) `combinedChannelDataRef` evicts on cell removal and unbind
  via a pure `model/channelDataRetention.ts`. Lane decisions worth a
  reader's attention: the workbook evaluator's `SessionHandle` still
  decodes whole sessions (guarded by the failsafe) because it also owns the
  estimator, math-store and derived caches a per-channel lookup cannot
  serve; and `load_session` deliberately does **not** read through the
  cache, since assembling a `Session` out of cached channels would leave it
  resident twice. **Where R203.3's letter was not met, and why:** the
  ruling asks for "each channel's Vec dropped as its batch is written, so
  peak is ~1 channel + the map", but `finish_import` moves the parsed
  `Session` into the lap-index handle *after* the parquet write, so
  draining the channels during the write would break lap indexing. What was
  dropped per channel is the Arrow column, not the source `Vec`; measured
  peak on a real 377 MB log fell from 4,939 MB to 3,542 MB private bytes
  (a 28 % cut), and what remains is dominated by the parsed `Session`
  itself — every sample keeps an 8-byte hardware timestamp per channel
  (C1 §3.1), which R203 did not ask to change. Also found by that proof
  and fixed here: `HR_RR` reports timestamps that repeat and step
  backwards, so C1 §3.5 invariant 1 does not hold for every real source;
  the column writer falls back to a search when its merge walk misses.
  Not done here: a lazy `ChannelLookup` for the eval engine's host-channel
  path, which needs that `SessionHandle` redesign; the app-side manual
  proof (peak private bytes of `app.exe` before and after a pan of a
  400 MB session), which needs a person at the dev app; and eviction of a
  *mounted* cell's payload for a channel it has rebound away from — the
  `boundChannels` action carries sandbox host-variable names, not the
  `channelId` those cache keys are built from, so that residue waits for
  the cell to be removed.

## Session memory 2 (ruling R211)

- [x] memory-2 lane — landed 2026-09-11 on `memory-2` (both repos). The
  incident: opening session `817a54...` (~490 MB `data.parquet`, a 22.6 M-
  sample channel) in the notebook with the shakedown workbook killed the app
  with `memory allocation of 181132664 bytes failed` and
  `STATUS_STACK_BUFFER_OVERRUN`, with 17 GB of commit free — several
  host-channel binds each went down the eval path that decoded the *whole*
  session, each passed the R203 failsafe on its own, and their sum did not
  fit. Four changes.

  (1) **R211.1, the eval path.** `SessionHandle::lazy` builds a handle over
  a session's channel index and decodes a channel only when something names
  it, through a new `session::handle::ChannelSource`.
  `store::parquet::open_session_lazy` is that handle over a `data.parquet`
  (source: `read_channel`); `idl-rs-tauri`'s `load_lazy_session_handle`
  is the same handle with the app's `SessionCache` as the source, and
  `eval_workbook`, `eval_workbook_v2` and both `fetch_host_channel`
  commands use it. `full_session_span_us` reads the `t` axis's footer
  statistics instead of decoding the session, and `catalog_read::get_session`
  reads per-channel sample counts from row-group statistics. `load_session`
  and `load_session_handle` are deleted.

  (2) **R211.2, one budget.** The R203 budget is now a byte-counting
  semaphore inside `SessionCache`: a decode reserves its estimated bytes
  before allocating and releases them on drop; one that does not fit waits
  (30 s) rather than failing, and only a request larger than the whole
  budget on its own is refused. A `SessionCache` clone is the same budget,
  which is what lets a lazy handle hold one for its lifetime.

  (3) **R211.3, import.** `finish_import` and `reimport_session` drop the
  parsed `Session` before lap indexing and index from a lazy handle over
  the `data.parquet` just written; `reindex_laps` does the same, and
  `build_gps_track` resolves its three channels by name so only those are
  decoded.

  (4) **R211.4, allocation.** `RawColumn::try_materialize`/
  `try_materialize_range` go through `Vec::try_reserve_exact`; the
  infallible wrappers return an empty `Vec` instead of panicking, and
  `ChannelLookup::lookup` uses the fallible form so a refused allocation
  reads as an absent channel rather than a present-but-empty one. A channel
  read that cannot allocate is `ParquetStoreErrorKind::ResourceExhausted`,
  mapped to C3 §1's `resource_exhausted`.

  Guard: the delete guard's scanner now carries a second allowlist naming
  every non-test whole-session decode R211.1 permits (import verification,
  export, rebuild). **That list is empty** — no such call site exists in
  today's tree, which is the ruling's "exactly three callers" measured
  rather than assumed; `read_session_parquet` stays `pub` for those three.

  **Where R211.3's measured target was not met, and why.** The ruling asks
  for the import peak of a ~395 MB log to fall below 2 GB private. Measured
  with the release CLI on the library's 377 MB blob (copied to a temp data
  dir), peak private bytes are **3,731 MB before this lane and 3,727 MB
  after** — the change is real but it does not move the peak, because the
  peak is not where the ruling assumed. Import's peak is set during the
  `data.parquet` write, not during lap indexing: the parsed `Session` alone
  is ~2 GB (measured on the skip path, which parses and indexes but does not
  write), and the writer adds the union `t` axis, one full-length Arrow
  column, **every row group's column writers held open at once** (the whole
  encoded file), and the output `Vec<u8>` (the whole file again). Dropping
  the `Session` before indexing removes a second, lower peak later in the
  run. Getting under 2 GB needs the writer to go row-group-major and stream
  to the temp file rather than to a `Vec<u8>` — an R203.3 follow-up, not
  something R211.3's change can reach.

  Not done here: that writer rework; the app-side manual proof (opening
  `817a54...` in the dev app with the shakedown workbook), which needs a
  person at the dev app. Lane decisions: a lazy handle's `channels()`
  reports the file's row count as each channel's `length` (an upper bound —
  the exact count is its non-null rows, which costs a decode) and its
  `metadata().duration_ms` folds only what has been decoded; `channel_data()`
  is documented eager-only and returns an empty slice on a lazy handle; the
  budget semaphore counts decodes **in flight** and leaves residency to the
  LRU under the same figure, because charging both to one counter makes a
  large channel's decode evict the entire cache to start.

- [x] **rebuild-fast lane (R219) — 2026-09-11.** C4 §5 step 1 is incremental:
  `rebuild_catalog` opens the previous `catalog.sqlite` read-only and carries
  every blob whose `(sha256, size_bytes, mtime_ms)` still matches its row,
  hashing only new or moved paths; `RebuildReport` gained
  `blobs_carried`/`blobs_hashed`. The scan gained a progress hook
  (`rebuild_catalog_with_progress`, phases `blobs`/`tracks`/`sessions`/
  `laps`/`workbooks`), and `idl-rs-tauri` wraps it as a background job —
  `start_rebuild_job`/`rebuild_status` and the `rebuild_progress` event
  (C3 §3.2, spec-during), `state::RebuildJob`, a rebuild line in the status
  chip. No route awaits a rebuild any more: the notebook's empty-state
  trigger (R81), Create, Rescan and the Data maintenance panel start the job
  and render from whatever the catalog already has. `rebuild_catalog` the
  command stays as the synchronous form for the CLI and the tests, with no
  UI caller. The CLI prints both blob counts.

  **Proof** (release CLI, the 10 largest sessions copied out of
  `idl1-library` into a temp data dir, 3.0 GB of blobs): first rebuild with
  no catalog 20.8 s; second with nothing changed `blobs_carried: 10,
  blobs_hashed: 0` in 2.1 s; after touching one blob's mtime,
  `blobs_carried: 9, blobs_hashed: 1`. The 2.1 s that remain are steps 3–5
  (reading each `data.parquet`'s file metadata and `t` span), not hashing —
  untouched by this lane and the next thing to look at if first open is
  still slow at 159 sessions.

  Gates: core 1387, cli 64, tauri 405, app 213 files / 2168 tests,
  `cargo check -p idl-rs-cli --tests`, `cargo check -p app`.

- [x] **indexing lane (R207/R208.1) — 2026-09-11.** `store::index_job`: a
  resumable, cancellable, per-session-committing lap/track index over a pool
  of `physical cores − 1` workers, each reserving its decode against the
  R211 budget (`DecodeBudget`; the app implements it over `SessionCache`,
  the CLI over the new `ByteBudget`). `start_index_job`/`index_status`/
  `cancel_index_job` and the `index_progress` event (C3 §3.2); the status
  chip shows "Indexing 12 / 159 · <session>" then "Index complete".
  `list_laps` indexes its own session first, so nothing library-wide sits
  between the user and a workbook. `rebuild_catalog` starts the job.
  `idl-rs library index`, and `fold-in`/`rebuild` run it at the end.
  C4 §5 gained the per-session-transaction paragraph. Gates: core 1381,
  cli 64, tauri 397, app 209 files / 2093, `cargo check -p app`.

  **Finding that outlives the lane: lap indexing was not what took ten
  minutes.** Isaac's library has **zero tracks** (`<data>/tracks/` is
  empty), so every session's lap index is an honest no-op and all 159
  correctly hold 0 laps and 0 visits — the "0 `lap_summary` rows" in R207
  was right, not a symptom. The first-open cost is `rebuild_catalog`
  itself, which the notebook triggers automatically on an empty workbook
  list (R81 Q1(a)) and then awaits: measured at **10.3 s for 10 sessions /
  3.0 GB of blobs with a warm cache**, because C4 §5 step 1 re-verifies
  (re-hashes) every blob on every rebuild, and because the rebuild stages a
  whole new database and swaps it at the end, so nothing lands until it
  finishes. Scaled to 159 sessions on a cold disk that is the incident.
  Not fixed here: making step 1 trust `blobs.size_bytes`/`mtime_ms` instead
  of re-hashing is a C4 §5 contract change, and not starting a full rebuild
  from the notebook is R81 Q1(a)'s. Both want a lead ruling.

  Manual proof (release CLI, 10 sessions copied out of `idl1-library`,
  one of them 495 MB, temp data dir, `--force`): 1 worker 2.1 s / 77 MB
  peak private; the pool (5 workers on 6 physical cores) 1.7 s / 189 MB
  warm, and 10.8 s → 2.5 s cold. Peak stays two orders of magnitude under
  the 2 GiB budget because only the three GPS columns are decoded. The
  resume path was proved on real data: a second run reported "10 already
  current" in milliseconds.

  Lane decisions: the memory gate is a core trait (`DecodeBudget` +
  `BudgetGuard`) rather than moving R211's semaphore out of `idl-rs-tauri`,
  because the budget's *policy* (25 % of RAM) needs `sysinfo` and core is
  pure; the two `index_progress` phases are `"tracks"` (detect + write
  `session.json`) and `"laps"` (write the catalog rows), which is what one
  session's work genuinely divides into; an indexing worker's reservation is
  clamped to 4/5 of the budget so it waits rather than ever failing; a
  `rayon` pool that will not build degrades to serial rather than failing
  the run.

## Chart port, tier A (ruling R215)

- [x] Four idl0 chart types back, plus the time-series options the port
  dropped. The graph card's picker is keyed by **chart type** rather than by
  Plot mark: C2 §5.3's five time marks, plus one row per whole-cell chart
  kind (FFT, histogram, scatter) and one per preset over the time cell (lap
  variance). Each has a `plotForm` grammar production, a Properties section,
  a sandbox host variable, and a per-window fetch effect keyed by
  `(cellId, windowKey)` so *n* selected laps overlay in one chart.

  Two new engine commands: `fetch_histogram` (C3 §3.6, JSON — a few hundred
  numbers do not earn a binary decoder; `values` normalised in Rust so no
  number the picture depends on is computed in JavaScript) and
  `fetch_scatter` (C3 §3.5, `IDLS` v1 binary at `f64`, because an
  equal-aspect friction circle reads as visibly non-circular at `f32`).
  Both resolve their window before reading a sample, R85/R123's order, and
  read one column at a time through the R211 session cache.

  Lane decisions worth knowing: **lap-relative time is the mark's own `x`
  binding** (`"t"` vs `"tr"`), not a second plot-level field that could
  disagree with it; `tr` is derived in `combineChannelWindows` from each
  window's **first sample**, not its span boundary, because that is the
  alignment that answers "how do these two laps differ"; the **lap variance
  trace is a preset over the time cell**, not a chart kind, since
  `lap_delta_time(...)` already evaluates as a definition and the overlay is
  the window selection (no new command, no new production); the **zero line
  is a real `Plot.ruleY([0])`** at the head of `marks`, not a plot option;
  the two **signed y scales are Plot `pow` scales** (exponent 0.5 and 2),
  since d3's power scale is symmetric about zero where `sqrt` folds one side
  away.

  Not in this lane, and stated so it is not assumed done: **distance on X
  ships present and disabled** with its R136 reason and has no grammar
  spelling at all; idl0's scatter **density mode** and
  **colour-by-third-channel** exist in `core/src/scatter.rs` but have no
  slot in C3 §3.5 or C2 §5.3; spectrogram-as-chart, `gpsMap`, `lapTable` and
  `lapProgression` are tier B; and reports still draw **time charts only**,
  with a named absence line per non-time chart kind.

## First real workbook — gaps (`docs/superpowers/specs/2026-09-19-idl1-first-real-workbook-gaps-DRAFT.md`)

The 2026-09-19 motocross day, authored end to end as a workbook, is the first
real-data run. The spec lists every place the engine, CLI or app could not do
what the analysis needed; this lane took the three that produce wrong numbers
or a hard stop.

- [x] P0-1 IMU `t` is the recorded stamp, not a uniform grid (C1 §3.1, §3.5;
      `.idl0` importer version `0.2.0`, so the library must be rebuilt).
- [x] P0-3 `where(cond, a, b)` at mixed rates is the typed different-rates
      error, not an out-of-bounds index.
- [x] P2-1 `session import <file.idl0>` agrees with its own `--dry-run`.
- [ ] P0-2 estimator builtins without a calibration — **blocked on a ruling**:
      nothing binds a `CalibrationRecord` to a session today (`session
      calibrate` computes and prints one; `estimate::run` never reads one), so
      there is no unambiguous "this session has no calibration" state to
      report. CLAUDE.md §1 — asked, not guessed.
- [ ] P1-5 one failing definition blanks its math cell for `js` cells — the
      engine half is already per-definition; the binding-side cause is written
      up in the lane's PR.
- [ ] P1-1 `resample`, P1-2 `"t:lap"` reductions, P1-3 table definitions,
      P1-4 definitions in histogram/spectrum/scatter/map fetches (a C3
      change), P1-6 cross-session rows, P1-7 export — all need rulings first.
- [ ] P3 promotions (`track propose`, distance-domain lap tables, line offset,
      `airborne()`, import-time gravity alignment, transmissibility,
      yaw-moment, `fit --merge`).

## Wave 3

- [ ] L9 mobile plugins · L12 in-app agent (optional)
