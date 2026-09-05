# Changelog

All notable changes to idl1 are recorded here. Format: Semantic Versioning.

## [Unreleased]

### Added

- **Data tab: maintenance actions; L7a lane complete pending write commands.** `Data/maintenance.ts` is a pure, single-slot reducer (`"idle" | "running" | "done" | "failed"`, one action at a time — a second `START` while one is `"running"` is refused, not queued, since these are one-shot operator actions rather than `importQueue.ts`'s batch) plus `startMaintenanceAction`, the injected-async-function driver the toolbar's click handlers call (operating brief §4's IPC-driving-effect rule: the decision logic — one action at a time, route every rejection to `FAILED` — lives in this pure module, never in the handler itself). `Rebuild catalog` is real, calling `rebuild_catalog` (C3 §3.2) and showing `summarizeRebuildReport`'s summary line, e.g. "Indexed 42 sessions, 3 workbooks, 1 track in 1.2 s" — an all-zero report reads as "the store is empty", never the misleading "Indexed 0 sessions, 0 workbooks, 0 tracks". `Delete session`, `Forget session` and `Review quarantine` call new `Data/ipcStubs.ts` stubs (`deleteSession`, `listQuarantine`, `resolveQuarantine` — IPC needs 3 and 4) behind a confirmation dialog each, built now even though the action underneath is a stub, so the UX does not have to change again when the command lands; a stub's `NotImplementedError` reads as "isn't wired up yet" naming the command, never a crash. **`forgetSession` has no separate stub**: idl0's non-blob-deleting variant is `runForgetSession`, which calls the same `deleteSession` stub with `deleteBlob: false` — simpler than a fourth stub function for what differs only in one argument (this task's own judgment call). **Lane complete pending write commands**: `TASKS.md`'s L7a line is ticked, naming IPC needs 1-4 (built against stubs) and need 5 (dropped outright, not stubbed) plus the plan's whole Parity gaps table's dispositions — not a claim of full parity.
- **Data tab: session metadata editor over `save_session_metadata` stub.** `Data/metadataDraft.ts` (renamed from the plan's `metadataForm.ts` — that name collides with `Data/MetadataForm.tsx` on a case-insensitive filesystem) holds the pure nine-field draft model: `initialDraft` pre-fills `venue_name` via `trackRow.ts`'s `resolveDisplayVenue` (Task 6, reused not redefined) so saving persists the venue the card already shows; `normalizeDraft` trims every field (`""` is C1 §6's only "not set", never null); `isDirty` compares a normalised draft against the session's own current fields; `venueOptions` derives a deduped, sorted Venue-autocomplete list from `list_tracks`; `toSavePayload` builds exactly the nine fields plus `session_id`. `Data/MetadataForm.tsx` renders the form and a read-only tracks-visited summary (coalesced from `SessionDetail.track_visits`); saving always fails honestly — "Saving session metadata isn't wired up yet — your changes aren't saved" — because `save_session_metadata` (IPC need 1, `runs/2026-09-05/lanes/l7/IPC-NEEDS.md`) has no command behind it in wave 2; `Data/ipcStubs.ts` gains the `saveSessionMetadata` stub, rejecting with `NotImplementedError` like `saveTrack`/`deleteTrack`, never a fabricated `IpcError` kind. `Data/DetailPane.tsx` gains a `detail: SessionDetail` prop (the raw `get_session` result `toDetailView`'s projection drops) and its own `list_tracks` fetch, mirroring `TrackResults.tsx`'s existing fetch-on-mount pattern, feeding the form's venue pre-fill/autocomplete; `index.tsx`'s call site passes the raw `detail` through. `docs/IDL0_SPEC.md` §24.10 rewritten (spec-during) for the nine C1 §6 fields, the venue pre-fill rule, the stub save path, and the whole-block-replace note for when the real command lands.
- **Data tab: tracks view over `list_tracks`/`get_track`.** `Data/TrackResults.tsx` is a flat, sortable table over `list_tracks` (`compareTracks`, Task 2); `Data/TrackDetailPane.tsx` opens one track via `get_track` on explicit row click, settle-bound (C3 §4). `TrackDetail`'s `lap_timing`/`neutral_zones`/`sector_gates`/`reference_polyline` render as counts only — C3 §6 item 10 leaves their element/union shapes unfixed, so parsing further would be a guess. `index.tsx` gains a Sessions/Tracks view toggle (`DataFilters.view`/`SET_VIEW`, already wired by Task 3); the filter rail and active-filter chips apply to the Sessions view only. `Data/trackRow.ts`'s `resolveDisplayVenue` ports idl0's `SessionRow.displayVenueName` rule (`data_results_provider.dart`) — a session's own `venue_name`, else the first non-empty `venue_name` among its track visits in visit order, skipping a visit whose `track_id` no longer resolves rather than stopping there (idl0's §12.3 skip-on-resolve rule) — not yet wired to a call site (no wave-2 caller has both a `SessionSummary` and its `TrackVisitSummary[]` at once). `Data/ipcStubs.ts` (new, this lane's `NotImplementedError` convention, matching `Device/ipcStubs.ts`) gains `saveTrack`/`deleteTrack` stubs for `save_track`/`delete_track` (IPC-NEEDS need 2) — the track editor itself is deferred to wave 3 (Parity gaps table); a stub never fabricates an `IpcError` kind (C3 §2's vocabulary is additive-only).
- **Data tab: import queue over `import_file`/`list_importers`.** `Data/importQueue.ts`'s pure reducer (`ENQUEUE`/`START`/`PROGRESS`/`FAILED`/`SUCCEEDED`/`DISMISS`) drives files through C3 §3.3's `import_file` **one at a time, serialised** (R13: this machine is memory-bound); `overallPercent` averages each item's fraction equally across the queue, `null` while any running item's `Progress.total` is unknown rather than a fake number. `Data/ImportPanel.tsx` wires this to the real `importFile`/`listImporters` wrappers — neither is stubbed, a rejection before L5 Task 9 lands is shown honestly through `describeIpcError`. **File-picker gap (needs a lead ruling, resolved as R55):** no file-picker mechanism exists anywhere in this codebase (`@tauri-apps/plugin-dialog` is not a dependency and would need a new `app/src-tauri` capability, outside this lane); the lead ruled (R55) a `Data/FilePicker.ts` `pickImportFile` seam whose wave-2 implementation is a pasted absolute path, swapped for a real native dialog by a later shell task with no call-site change. `docs/IDL0_SPEC.md` §24.14's Import bullet rewritten to match; idl0's Dart runs-provider import flow is gone. **Fixup (review-task5):** the driving effect originally depended on `state.items` and dispatched into it, so its own cleanup cancelled every in-flight import before `import_file`'s real IPC round-trip could resolve, and a `DISMISS` of an earlier item could misroute a running item's updates once the array shifted under its captured index. `ImportItem` now carries a stable `id` (a monotonic counter in `ImportQueueState`) and every action addresses an item by `id`, never array position; the driving logic moved out of the effect into `Data/importDriver.ts`'s pure `nextItemToStart`/`isDrained` plus `runImport` (an injectable-`importFile` runner), and the effect no longer installs a cancellation flag tied to its own dispatches — it only ever refuses to start a second item while one is `"running"`.
- **Data tab: session detail pane over `get_session`/`list_laps`.** `toDetailView` merges one `get_session` result (`SessionDetail`) with `list_laps`'s catalog-cached `LapSummary[]`, joining by `lap_number`: a lap present in only one source is flagged (`presence: "both" | "session-only" | "catalog-only"`), never dropped. `reference_lap_number: null` resolves to the fastest non-ignored lap (C1 §6); `bestLapMs` returns null, never `Infinity`, when every lap is ignored. Sector/neutral-zone data renders as a count only (R53 Data Q5; C3 §6 item 11 leaves the element shape unfixed); `nominal_rate_hz` is labelled metadata-only in the channel table (C1 §3.5). Selecting a session row dispatches `SET_SELECTED_SESSION` into `AppState.selection` (R53 Data Q3) and fetches `getSession`/`listLaps` in parallel on selection settle, never on hover; `SET_LAP_CONTEXT` is untouched (deferred to L6). **Lap counts and the lap table may legitimately read "—"/empty for most sessions** — no wave-1 import path indexes `laps`/`lap_summary` yet, so a `list_laps` `not_found` rejection renders as an empty table, not an error (R53 Data Q4; this is not a bug in this task).
- **Data tab: filter model, facets and filter rail.** `DataFilters`/`filtersReducer` (Date, Bike, Rider, Tag, Venue, Lap time, Source facets, AND across categories / OR within a facet, `""` = "(none)") plus `matchesFilters`/`facetCounts` and the `FilterRail`/`ActiveChips` UI, ported from idl0's `data_filters_provider.dart`/`filter_rail.dart`. Lap-time filters key off `duration_ms` (no per-lap time on a `SessionSummary` yet). Has-gates, has-GPS and Track facets are dropped outright for wave 2, not stubbed (R53 Data Q2, R54) — none is derivable from a `SessionSummary`, and a Track facet fed only by `list_tracks` (no session→track linkage exists without lap indexing) would structurally never match a row, which R54 rules is a trap rather than honest disclosure. Track facet returns when `SessionSummary` carries track linkage — wave-3 catalog amendment, same item as has-GPS/has-gates. See `docs/IDL0_SPEC.md` §24.4.
- **Data tab: formatting and sort model.** Lap/duration/byte/date formatters and the per-view sort field sets with their default directions, ported from idl0's data_filters_provider. Fixup: the Sessions-view sort no longer offers "Best lap" — a `SessionSummary` has no best-lap field at all, so the option was a silent, direction-blind no-op (review-task2 Minor); `compareSessions`'s `bestLap` arm is kept so sorting resumes once the catalog carries the field.
- **TS coverage reporting added (2026-09-05).** `@vitest/coverage-v8` pinned to vitest's
  version in `app/package.json`; `app/vitest.config.ts` gains a `coverage` block (v8
  provider, `src/**/*.ts`, text reporter, no thresholds set) so `vitest run --coverage`
  reports the per-module numbers CLAUDE.md §4 asks reviewers to check.
- **L5 complete (2026-09-04).** idl-rs-tauri wired to every landed wave-1 lane's C3 command
  group (catalog, workbook, cursor, raster, tile) plus device (L4); <data> resolution,
  workbook watcher, app/src/ipc/ module layer, routing and state skeleton. Tile fetched
  end-to-end from a real .idl0 — parse → store → `fetch_tile` → decoded bytes verified in a
  headless test (header v2, 20224 bytes, real sample values); the NotebookPage canvas render
  visually confirmed in the dev app on 2026-09-05 (IMU2_AccelX envelope from the real
  session). M0 smoke path retired. Import commands (C3 §3.3) ship with L2, not this lane.
- **Raster commands (C3 §3.6) over L3's core::raster.** fetch_raster (binary) and fetch_raster_meta (axis domains + colour scale, resolution-independent per ruling R38); typed SpectrogramParams/Histogram2dParams replace the provisional Record<string, number> (C3 open question 6.4 closed).
- **Cursor command (C3 §3.7) over L3's core::cursor.** cursor_readout — nearest recorded sample, null outside a channel's recorded span (ruling R31); an unknown channel rejects the whole call with invalid_argument. Settle-bound only, never a hot path (C3 §4).
- **Workbook commands (C3 §3.4) over L3's v3 parser/evaluator.** open_workbook, eval_workbook (per-cell CellOutput, host channels as HostChannelRef markers only — the byte path is deferred to wave 2 with L6), save_workbook (C4 §4 expected-hash ordering + optimistic based_on_hash), watch_workbook (Task 3's watcher + a cell-body diff). No unsubscribe in wave 1.
- **Repository created (2026-09-02).** From the idl1 rewrite design
  (`docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`). Docs carried
  over from idl0-app: SPEC, design rationale, signal pipeline, datasheet,
  tools. The idl-rs engine is the same submodule idl0-app used, continued on
  `main` after tag `idl0-final`.
- **M0 complete (2026-09-02; desktop check confirmed 2026-09-03).** Tauri v2 scaffold, `idl-rs-tauri` with the binary IPC
  smoke path, `idl-transport` stub, and contracts C1–C4 signed. Wave 1 may start.
- **L4 `idl-transport` desktop device client complete pending the manual real-device check (2026-09-03).**
  BLE (`btleplug`) scan/connect/status/control/config-push, WiFi (`reqwest`) file listing,
  resumable download, config-push fallback — all behind `BleTransport`/`WifiTransport` traits
  L9's mobile plugins implement later. SPEC gains §14a (trait shapes, chunk/timeout defaults).
- **L1 core `store/` landed (wave 1, 2026-09-03).** Mandatory per-sample-time `Session`/`Channel`
  model (C1 §2); burst-seam correction (C1 §3.3) with a real-session ODR cross-check (pass —
  corrected 812.348 Hz vs. GPS-independent estimate 814.017 Hz, relative error 0.21 %, well
  within the 5 % tolerance); `data.parquet` Arrow/Parquet read/write with the C1 §7 round-trip
  suite; `derived/<hash>.parquet` writer + hash recipe (C1 §5); CAS blob store + atomic-write
  primitive (C4 §3–4); SQLite catalog + rebuild (C4 §5 — overwrite swap, `laps.track_id` by
  visit containment, `duration_ms` from the time span); `verify` checks #1–5, #8, #10 (#6/#7/#9
  deferred); `session.json` (C1 §6, replaces `.idl0w`); `.idl0t` writer; bike-profile
  (`<data>/profiles/`, C4 §2 amendment) and app-settings (`settings.json` keys, C4 §1 amendment)
  persistence; gate synthesis, session-wide lap renumbering, lap-distance normalisation
  (unit-corrected vs idl0 — the Dart fed ×1e7 coordinates into degree math), session filenames;
  core import pipeline (idempotent re-import, version-triggered regeneration, same-UUID/
  different-bytes collision refused); CLI `idl-rs import`/`sessions`/`verify`/`prune`.
- **Workbook v3 (`.idl1wb`) lands in idl-rs core (L3, 2026-09-04).** Markdown/front-matter
  parsing and cell-id assignment (C2 §1–§2); the math-cell definition grammar with a flat,
  document-wide constants table and a deps-first resolver whose per-definition results are
  never swallowed (C2 §2.4, §3.1–§3.2); `if()` folds its time axis across all three operands,
  not just the condition (R33); table-cell bodies wired onto the existing
  `table::model::TableModel` (C2 §4); Rust-side host-variable data for JS cells —
  `channel()`, `laps`, `session`, `constants` — and `${…}` inline-expression extraction
  (C2 §5), with cross-session `channel()` lookup exclusive (never falling back to the primary
  session) and lap-out-of-range errors naming the session's recorded lap count (R34) — the
  caller-side id/lookup pairing check for cross-session lookup is documented as owed to the
  wave-2 caller, not enforced here (R35); one evaluation result per cell (C3 §3.4); tile
  bytes at layout **version 2** with per-column stats and a per-column recorded `t_us`
  region, plus `MAX_TIER` as C3 §3.5's "engine's configured range" (C3 §3.5); spectrogram and
  2-D-histogram RGBA rasters with a `raster_meta` axis/colour-scale side-channel, colour
  bounds scanned over the full pre-rebin matrix so they are resolution-independent (C3 §3.6,
  R38); cursor readout, `null` outside a channel's recorded span (C3 §3.7, R31);
  pre-existing `gps_channel_values` amended to match — `null` past a channel's recorded
  span rather than a frozen last value (R39). Resolves the C1 §8 item 5 `t` naming collision
  (µs storage axis vs. seconds host-variable field). SPEC §17a rewritten for v3. Workbook
  migration from v2 (`migrate-workbook`, C2 §6) is deliberately **not** implemented — dropped
  from wave 1 by ruling R30; C2 §6 stays written and unimplemented.
- **idl-rs-tauri: typed IpcError (C3 §2).** Cross-cutting and transport-sourced kinds seeded; each lane adds its own prefixed kinds when its command lands.
- **<data> resolution and settings.json bootstrap (C4 §1).** Resolved once at startup, directory tree created idempotently; overridable via app_config_dir()/settings.json.**
- **Workbook file-watcher plumbing (C4 §4).** notify on <data>/workbooks, ~100ms debounce, expected-hash-set self-write suppression. Not yet wired to watch_workbook — gated on L3 (Task 11).
- **app/src/ipc/tiles.ts, rasters.ts: real C3 §3.5/§3.6 binary decoders.** Pure, tested against C3's own worked examples; fetchTile/fetchRaster reject until Task 14/12 land the Rust commands.
- **app/src/ipc/: full C3 §1 module scaffolding.** engine, catalog, import, workbook, cursor, device, sync — typed per C3 §3, invoke()-wrapped; commands not yet backed reject until their owning lane's Group B task lands.
- **React routing skeleton + app-level state (no new dependency).** Four-tab shell (Notebook/Device/Data/Settings) over a Context+useReducer AppState; placeholder pages for L6/L7.
- **docs/IDL0_SPEC.md §11 rewritten for the Tauri/Rust-core/TS architecture (spec-during).** First draft by L5; L10 does the cross-lane consistency pass.
- **Catalog commands (C3 §3.2).** list_sessions, get_session, list_laps, rebuild_catalog, list_workbooks, list_tracks, get_track, over a new core read layer (idl_rs::store::catalog_read) — L1 landed the writer only.
- **Device commands (C3 §3.8) wired to L4's idl-transport.** ble_scan, ble_connect, list_device_files, download_file (streams Progress), push_config. Each command connects/acts/disconnects per call (no managed BLE session yet). `push_config` validates `config_json` is well-formed JSON only — full schema validation via `idl_rs::config::parse_config` is blocked on core defining a `VersionedConfig` type for SPEC §8's device-config schema, not yet landed.
- **Data tab: session list over C3 §3.2 list_sessions.** DataPage becomes routes/pages/Data/; pure SessionRow view-model and typed IpcError mapper, both tested.

### Verified

- Binary IPC path (Rust 2/2, vitest 3/3, cargo build, tsc clean) on Windows desktop, 2026-09-02 — automated; visual check via `npm run tauri dev` confirmed by Isaac 2026-09-03 (Engine 0.1.0, smoke tile 0–7 rendered).
- `idl-transport` unit/integration tests (`cargo test -p idl-transport`, 29/29 passed) and
  `cargo build -p idl-transport --release` on Windows desktop, 2026-09-03 — automated. Real-device
  BLE scan/connect/WiFi-mode entry, WiFi file list + resumable download, and BLE config push +
  read-back verify against a physical IDL0 device pending (Isaac).
