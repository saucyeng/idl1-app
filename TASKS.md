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
  firmware OTA (wave 3), the Android WiFi bind-follows-mode controller
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

## Wave 3

- [ ] L9 mobile plugins · L12 in-app agent (optional)
