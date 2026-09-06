# Changelog

All notable changes to idl1 are recorded here. Format: Semantic Versioning.

## [Unreleased]

### Added

- **js cells bind to ChartCell; cell outputs render inside the sandbox iframe, not injected into the host DOM (L6 Task 13b, R66, R69).** A `js` cell whose code `plotForm.parse`s against a real session channel (`model/jsCellBinding.ts`'s `bindingFor`) mounts `ChartCell`'s real settle-driven viewport/tile-fetch pipeline; custom code, or code naming a channel the session doesn't have, mounts the new `JsCellFrame` plain-mount path instead (the latter with a visible note naming the unresolvable channel). `cellResult.html` and the host's `dangerouslySetInnerHTML` are gone: the sandbox renders every cell's output inside its own per-cell DOM container and reports `cellRendered { cellId, heightPx }`; `ChartCell`/`JsCellFrame` become host-side gesture/orchestration frames that reserve that height, capture pointer/wheel input, and keep the sandbox's rendered container positioned to match via a `layout` message (a plumbing addition beyond R69's two named messages, `host/protocol.ts`). A gesture frame's CSS transform is sent host→sandbox as `transform { cellId, translateXPx, scaleX }` (`postMessage`, never IPC); on settle, the host resends the channel's real data as before. A distinct `spanError { spanId, message }` message replaces `cellError`'s prior reuse for inline `${…}` span failures (R66 item 2). Multi-channel cells bind every distinct channel but render only the first through `ChartCell` for now (`// TODO(idl0)`, lead pre-ruling #3); lap scope (`MarkProps.lap`) is read and stored on each bound channel but not yet applied to narrow the fetched tile window (lead pre-ruling #2). The session's recorded span for a cell's initial viewport comes from `SessionSummary.duration_ms` (`model/sessionSpanDriver.ts`), falling back to the first channel's coarsest-tile recorded span when `duration_ms` is null (lead pre-ruling #1) — never `sample_count / nominal_rate_hz`. Also closes `review-task13.md`'s Minor: `openEvalDriver.test.ts` gains a case driving `isStale()` true specifically between `evalWorkbook`'s resolution and its `evalResult` dispatch.
- **Workbook save with optimistic concurrency, conflict banner, live reload (L6 Task 14).** `conflict`-kind rejections offer reload-or-overwrite, not a generic error (R44); frontend self-write check is defence in depth alongside the Rust ExpectedHashSet (C4 §4). `WorkbookEvent` still lacks the `hash` field lead ruling R67 assigns it (L8w Task 4b, not yet landed) -- `saveFlow.ts`'s `isSelfWrite` is coded against the amended shape behind a typed seam (`WorkbookEventWithHash`, `hash?: string`) that treats a missing hash as "unknown ⇒ reload" until Task 4b lands. Follow-up (`review-task14.md` Minors): `ConflictBanner`'s "Reload from disk" now confirms the discard of unsaved local edits before firing; `saveFlow.ts`'s `reason as IpcError` cast is replaced by a small pure `toIpcErrorOrUnknown` guard that synthesizes `{ kind: "unknown", message }` for a non-`IpcError` rejection instead of risking an `undefined` message.
- **Prose `${…}` span scanning marked as an interim seam (R70).** `ProseSpan.tsx`'s regex-based `extractInlineSpans` gains a doc comment stating it is a duplicate of core's tested `workbook/v3/js_cell.rs::find_inline_exprs` and will be dropped once L8w Task 4c lands `CellOutput.prose_spans: { id, expr }[]` -- no behavior change, documentation only.
- **Workbook open/eval/render (L6 Task 13).** Math, table, js and prose cells render from `eval_workbook`; a per-cell failure never blanks the notebook. Inline `${…}` prose spans now round-trip through the sandbox (best-effort re-evaluation, pending free-identifier analysis). `read_workbook` (N1) and math→JS host-channel binding (N3) stubbed as `NotImplementedError`, visibly labeled, pending the Rust write-amendment lane.
- **Properties pane's axis-label suggestion from a channel's own recorded unit, not a quantity table (ruling R65).** `PropertiesFormChannelOption` gains `unit?: string` (C1 §4.1's per-channel unit, `ChannelSummary.unit`); picking the first mark's channel seeds `y.label` with `"<label> (<unit>)"` via the new pure `suggestAxisLabel` (`model/propertiesForm.ts`) whenever a unit is present and the plot has no `y.label` yet — an editable seed, never a locked value. `unitsPreference` has no effect in wave 2 (no quantity→unit table exists in TypeScript); its doc comment now says so.
- **Cursor readout notify uses the live, in-gesture viewport, not the stale pre-drag one (L6 Task 9/10 review-fix, review-fixes-9-10.md Important).** `ChartCell.tsx`'s `handlePointerMove` now passes `liveViewport` (the same value `transformFor` renders the picture from during a drag/zoom) to `cursorDriverRef.current.notify`, instead of the settled `viewport` prop, which only updates after the tile-fetch settle. Previously this was masked only by `CURSOR_SETTLE_MS` and `SETTLE_DELAY_MS` both happening to be 150ms, not by design; a new `cursorReadoutDriver.test.ts` case pins pixel→time mapping against whichever viewport `notify` is actually given. Also: `model/rasterLayer.ts` gains a small, unit-tested `devicePxSize` extracted from `RasterUnderlay.tsx`'s inline device-px canvas sizing formula, and `rasterFetchKeyEquals`'s tests gained not-equal cases for `width`/`height`/`devicePixelRatio`.
- **Properties pane over plotForm (L6 Task 12).** Self-contained prop surface (no context/store/IPC/router) so wave 3's React Flow node can host the same component; greys to "custom code" and offers "Reset to form" when `parse` returns null (design §6, D13).
- **RasterUnderlay's fetch effect fixed to never self-cancel; device-px canvas sizing (L6 Task 11 follow-up, review-task9.md Critical/Important).** `fetchRaster`/`fetchRasterMeta` no longer sit in the fetch effect's re-run condition — held in refs (`ChartCell.tsx`'s `onSettleRef` pattern), so an unrelated re-render's fresh closure identity can never tear down and duplicate an in-flight fetch. The decision "did a fetch-relevant prop actually change" is now the pure, unit-tested `rasterFetchKeyEquals` (`model/rasterLayer.ts`); a resolved fetch's staleness is checked by a monotonic epoch via `isStaleSettleResult` (Task 8's pattern) instead of a `cancelled`-on-cleanup flag. The underlay canvas's backing store is now sized in device px (`width \* devicePixelRatio`), with the CSS box kept at CSS-px size and a matching `ctx.setTransform` before drawing — the devicePixelRatio-aware fetch is no longer silently downscaled onto a CSS-px-resolution buffer.
- **Cursor readout gets its own pointer-stop settle; errors surface instead of being swallowed (L6 Task 11 follow-up, review-task10.md, ruling R62).** `model/cursorReadoutDriver.ts`'s `makeCursorReadoutDriver` is a new pure, unit-tested settle-and-fetch driver with two trigger paths sharing one sequence counter: `notify` (a pointer-stop settle, `CURSOR_SETTLE_MS = 150`, independent of the viewport settle — a plain hover-and-stop with no pan/zoom now produces a readout, per design §6) and `dispatchNow` (called from `ChartCell`'s existing viewport settle, no extra debounce). `ChartCell.tsx`'s `handlePointerLeave` now clears the readout panel immediately (`driver.leave()`) instead of only gating the next fetch — a stale reading no longer persists after the pointer leaves. A rejected `cursorReadout` (an `invalid_argument` unknown channel, C3 §3.7, or any other rejection) now sets a visible "readout unavailable: `<kind>`" error state (`model/cursor.ts`'s `describeCursorReadoutError`) instead of silently keeping the panel's last rows; `CursorReadoutProps` takes the new `ReadoutPanelState` union (`rows`/`error`/`null`) in place of a bare row array. `formatReadout`'s label-fallback branch also gained its previously-missing test.
- **`leave()` also cancels the pending pointer-stop debounce timer (L6 Task 11 follow-up, lead ruling).** `cursorReadoutDriver`'s `leave()` previously only bumped the sequence counter; a `notify` scheduled just before a pointer-leave could still fire afterward and repopulate the panel with a fresh (non-stale) reading. `leave()` now cancels that pending timer outright — via the same `SettleTimer` `notify`'s own debounce uses — in addition to bumping the sequence for any fetch already dispatched and genuinely in flight.
- **CodeMirror Code pane; C2 §8-4 math tokenizer (L6 Task 11).** Markdown/JS/math language modes by cell kind; the 69-function catalog transcribed from C2 §3.3 for highlighting and completion.
- **Cross-channel cursor readout on settle (L6 Task 10).** `cursor_readout` called once per settle (P2, C3 §4); a channel outside its recorded span reads null, never a frozen value (R31).
- **`transformFor` zoom-anchor bug and settle stale-response guard fixed (L6 Task 8, review-task8.md Critical/Important follow-up).** `transformFor` divided its translate term by the *rendered* viewport's µs-per-pixel instead of the *current* one, visibly mispositioning the live picture for any zoom not anchored at the chart's own left edge; fixed, with a derivation in the doc comment and right-edge/mid-anchor tests. `makeSettle` now exposes a monotonic `latestSeq()`, and `isStaleSettleResult` lets `ChartCell`'s settle callback drop an older settle's tile fetch if a newer settle has already fired, so a slow fetch for a superseded gesture can no longer snap the picture backward.
- **L2 importers (wave 1, 2026-09-05).** `GpxImporter` (port of
  `gpx_parser.dart`), `FitImporter` (`fitparser` 0.9 — L2-R9), `CsvImporter`
  (trivial, D4) behind a shared `Importer` trait producing C1 §2's
  `Session`/`Channel` model, with a `core::import::importers()` registry
  (R51 Q2) enumerating all three for C3 §3.3's `list_importers`. GPS
  coordinates are physical decimal degrees for every source (ruling R27,
  superseding an earlier `deg_e7` draft). `store::import::import_file`
  (L2-R13) generalises `import_idl0`'s pipeline to the three new formats;
  `synthesize_base_channels` gained a fallback (ledger R23 Q2) so every
  event-driven FIT/GPX/CSV session still gets a `Time` channel, derived
  from its longest channel's real recorded time rather than a fabricated
  rate. `docs/IDL0_SPEC.md` §15a. Golden tests against hand-built FIT/GPX/CSV
  fixtures — no real device archive used yet; FIT/GPX `GPS_SpeedKmh`/
  `GPS_Heading` direct-path population is a deferred follow-on pending
  Isaac's real archive (ledger R23 Q4), tracked as "L2 follow-on S/H
  (post-archive)".
- **Wave 2 shell task 3 — `import_file` resolves with `ImportOutcome` (2026-09-05, R60).**
  `ipc/import.ts`'s `importFile` now resolves `ImportOutcome { session:
  SessionSummary; warnings: string[] }` instead of a bare `SessionSummary`
  (C3 §3.3 as amended by R60: a catalog row must not carry per-import state,
  and dropping recovered-data warnings violates CLAUDE.md §5). The Data
  tab's import queue (`importQueue.ts`, `importDriver.ts`) carries the
  warnings through to each item's terminal state and `ImportPanel.tsx`
  renders them under a succeeded item, honestly labelled ("imported with N
  warning(s)"), never hidden.
- **L7c how-to copy accuracy fixes (2026-09-05, Task 6 review fix).**
  `Settings/howtos/FirstSetup.tsx`, `WifiDownload.tsx` and `GpsLapGate.tsx`
  no longer describe unbuilt or wrong-transport affordances as working:
  config push is now correctly described as Bluetooth Low Energy (SPEC
  §7.2), not WiFi; IMU calibration and remote recording start/stop are
  stated as not yet available (both need a BLE command the Rust side
  doesn't expose yet, per L7b's wave-2 plan); the download flow now points
  at the Device tab's file list (not the Data tab) and states that
  importing a download into the session library is a separate manual step;
  the "enable WiFi" toggle is dropped since `listDeviceFiles` already
  drives the device into WiFi mode itself; the GPS Lap Gate article states
  up front that gate placement, lap detection and the lap table are not
  built in wave 2 (R53 Data Q4) and describes the design rather than a
  shipped flow. `about.ts`'s `SCHEMA_VERSION` doc comment now states
  plainly that it is an invented display string to keep in sync by hand,
  matching `APP_VERSION`'s treatment (review-task6.md Minor).
- **L7c Settings tab, Task 6 — lane complete for wave 2 (2026-09-05).**
  Chart controls reference (`Settings/controls.ts`, `ControlsSection.tsx`)
  carries idl0's mouse-wheel/mouse/keyboard shortcut table verbatim, with a
  visible "provisional — bindings land with the Notebook lane" label in the
  section itself (R53 Q2) since L6 owns the actual bindings and is building
  concurrently. Four how-to articles (`Settings/howtos/*.tsx`) carried from
  idl0's Markdown assets as bundled TSX (no CDN, ever — CLAUDE.md §3),
  rewritten for idl1's tab names and, for Math Channels, idl1's math-cell
  notebook model (C2 §2) replacing idl0's separate "Maths" tab; idl0's
  `example.com` "Full reference"/"Report issue" links are not carried
  across. About section (`Settings/about.ts`'s `aboutRows`,
  `AboutSection.tsx`) shows app version/schema/build (hardcoded, as idl0
  did) and a real engine version read from `AppState.engineVersion` — the
  same `engine_version` call the app shell already makes once, never a
  second IPC round trip — reading "…" while that fetch is in flight and
  never "unknown". Licenses is omitted (no license-page generator wired
  into idl1's build). `docs/IDL0_SPEC.md` §27 gains §27.10-§27.13 (chart
  controls, how-tos, about, and a section inventory replacing §27.4 for the
  idl1 line). This is L7c's last task; `TASKS.md` records what's still
  outstanding.
- **L7c Settings tab, Task 5 (2026-09-05).** Sync section
  (`Settings/SyncSection.tsx`) over the real, landed
  `sync_status`/`sync_now`/`pair_peer` commands (C3 §3.9, `app/src/ipc/sync.ts`)
  — never stubbed. Polls `sync_status` on a 5 s timer while mounted, lists
  paired peers with online flags, validates a 6-digit pairing code locally
  (`pairCode.ts`'s `normalizePairCode`/`validatePairCode`) before calling
  `pair_peer`, and runs `sync_now` manually per peer with progress shown by
  phase (`syncState.ts`'s reducer keeps a poll from clobbering an in-flight
  transfer). `describeSyncResult` reads a non-zero conflict count as
  something to resolve, not a failure (design §7's per-cell merge).
  L11 has not landed, so every call rejects today; that's rendered through
  `errors.ts`'s `describeIpcError` or a "not running yet" fallback, never a
  raw error. `docs/IDL0_SPEC.md` §27 gains §27.9 (replacing the Drive Sync
  row in §27.4's table) and §28 (Google Drive Sync) carries a superseded
  banner pointing at §27.9 and design §7.
- **L7c Settings tab, Task 4 (2026-09-05).** Data-directory section
  (`Settings/DataSection.tsx`) over the `get_data_dir`/`set_data_dir` stubs
  (IPC need 7a/7b): shows the resolved `<data>` path, an override field
  validated by `dataDir.ts`'s `validateDataDir` (non-empty, absolute-looking,
  no trailing whitespace), and an explicit confirmation step —
  `describeOverrideChange`'s sentence, per C4 §1 — before any change is
  submitted; a change is never a field that saves on blur. States that a
  change takes effect on restart (R53 Q4), since `<data>` is resolved once
  at startup and cached for the process lifetime. `docs/IDL0_SPEC.md` §27
  gains new §27.8 (spec-during, no idl0 counterpart).
- **L7c `PrefsBackend`/`PrefsStore` go async (2026-09-05, lead ruling,
  review-task2 note 1).** `PrefsBackend.read()`/`write()` and
  `PrefsStore.get()`/`set()` are now `Promise`-returning, matching the
  eventual `invoke`-based `get_settings`/`set_settings` command;
  `localStorageBackend()`/`memoryBackend()` wrap their still-synchronous
  internals in resolved/rejected promises. Behaviour unchanged: a rejecting
  `write()` still reports `{ ok: false, error }` while the in-memory value
  updates first, so the user's typing is never discarded. `ProfileSection.tsx`
  and `UnitsSection.tsx` (Task 3) now seed their initial value from
  `store.get()` in an effect instead of synchronously at render.
- **L7c Settings tab, Task 3 (2026-09-05).** Profile and Units sections,
  built over Task 2's `PrefsStore`. `ProfileSection.tsx`'s rider-name field
  writes through `store.set` debounced at 500 ms (idl0's own behaviour) so
  typing does not thrash storage; its copy states the name is pre-filled
  into new sessions. `UnitsSection.tsx`'s imperial/metric toggle writes
  immediately and renders `units.ts`'s `unitSummary` — all seven of idl0's
  unit-math fields (speed, distance, pressure, temperature, force, power,
  spring rate), including the two idl0's own UI never rendered even though
  its `app_settings.dart` doc comment named them; its copy states the
  toggle does not retroactively convert existing channel values. No spec
  change — Task 2 already rewrote §27's persisted set.
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
- **L7c Settings tab, Task 2 (2026-09-05).** Typed `Prefs` model
  (`EnginePrefs` + `UiPrefs`, `Settings/prefs.ts`) and its pluggable-backend
  store (`Settings/prefsStore.ts`): `EnginePrefs` matches
  `idl_rs::store::settings::AppSettings` field for field so a future
  `set_settings` call needs no translation layer; `parsePrefs`/`serializePrefs`
  are lenient (defaults for missing/invalid fields, unknown keys preserved,
  never throw); `createPrefsStore` persists through `localStorageBackend()`
  (every access wrapped in try/catch, R53 Q1) with `memoryBackend()` for
  tests, and reports a failed write through `set()`'s result rather than
  swallowing it or losing the in-memory value. `docs/IDL0_SPEC.md` §27.1
  rewritten to describe the idl1 prefs model, its `localStorage` interim,
  and the `get_settings`/`set_settings` gap it will close.
- **L7c Settings tab, Task 1 (2026-09-05).** `SettingsPage.tsx` moved to a
  `Settings/` directory owned by this lane; section list plus detail-pane
  shell over idl1's seven Settings sections (profile, units, data
  directory, sync, chart controls, how-tos, about) — idl0's Google Drive
  section is dropped and Firmware/OTA is deferred to wave 3, so neither
  appears. `ipcStubs.ts` stubs IPC needs 6 and 7 (`get_settings`,
  `set_settings`, `get_data_dir`, `set_data_dir`), each rejecting with a
  local `NotImplementedError`, never a fabricated `IpcError` kind.
- **Device tab, Task 1 (2026-09-05, L7b).** `DevicePage.tsx` moved to
  `app/src/routes/pages/Device/` (a directory this lane owns), over a pure
  `connectionReducer` driven by the landed `ble_scan`/`ble_connect` (C3
  §3.8). `ConnectionInfo.connected` is treated as "the last connect attempt
  succeeded," never a live link — `rust/tauri/src/commands/device.rs`
  connects and disconnects inside each command, so nothing stays connected
  between calls (R53 Device Q4). `ipcStubs.ts` stands in for the five
  not-yet-landed Device/App commands (`device_status`, `device_control`,
  `pull_config`, `list_profiles`/`save_profile`/`delete_profile`,
  `connect_device`/`disconnect_device`) with a local `NotImplementedError`,
  never an `IpcError` kind.
- **Device tab, Task 2 (2026-09-05, L7b).** `Device/config/{model,defaults}.ts`
  — a typed TypeScript mirror of SPEC §8's `idl0_config.json`, field for
  field. `parseConfig` is lenient: a malformed field falls back to its
  default and is recorded as a `Repair` rather than throwing; a value that
  is the right type but off a SPEC-stated valid set (`imu.sample_rate_hz`'s
  ODR table) is kept exactly as read and reported as a `Repair` instead of
  being silently snapped, unlike idl0's `ImuSettingsDialog`. Unknown
  top-level keys and the two read-only fields (`device_id`,
  `config_version`) survive a parse → serialise round trip unchanged.
  `serializeConfig` omits an absent `heart_rate_monitor` block rather than
  writing back `enabled: false` (SPEC §8's stated equivalence, kept
  minimal). SPEC §8 gains an app-side config-model note, restating that
  `analog.sample_rate_hz`'s valid set is still undefined and the app
  accepts any positive integer there (R53 Device Q2). Does not build the
  validator — that is Task 3.
- **Device tab, Task 3 (2026-09-05, L7b).** `Device/config/validate.ts` —
  `validateConfig`/`isPushable`, the single gate `pushConfig` sits behind
  (a config is never pushed unvalidated). Checks every SPEC §8 valid-value
  set (IMU ODR by power mode, accel/gyro range, GPS rate range and
  integrality, dynamic model, digital channel kind) plus cross-cutting
  rules the schema doesn't state as a table but SPEC §8's prose implies:
  duplicate/empty analog channel keys, zero analog scale, negative digital
  debounce, a disabled wheel slot skipped entirely, an HRM address format
  checked only while enabled, and a pin-collision check that walks
  `analog.channels` and `digital.channels` together so an analog/digital
  cross-kind collision on one physical pin is caught, not just same-kind
  duplicates. Only `error`-severity issues block `isPushable`; `warning`
  flags a config that is valid but likely a mistake (an enabled IMU with
  every channel off, a reserved `level`/`pwm` digital kind). SPEC §8 gains
  a validation table (one row per rule, path/severity/condition/citation)
  as a machine-checkable counterpart to its prose tables.
- **Device tab, Task 4 (2026-09-05, L7b) — R53 Q1 narrowed scope.**
  `Device/config/sourcesPreview.ts` — `previewSources`, one row per source
  (IMU0/1/2, GPS, wheel front/rear, each analog/digital channel, HRM)
  carrying enable state, sample rate, and units **only**. This is
  deliberately narrower than the plan's original Task 4: it does not derive
  `scale`, `channel_id`, or `data_type` in TypeScript, since that arithmetic
  (`scale = range / 32768`) is the wire contract's own formula (SPEC §3),
  owned by `core::parse`. The full per-channel registry preview is deferred
  to `preview_channel_registry(config_json) -> RegistryRow[]` (IPC need 12),
  computed engine-side in the Rust write-amendment lane.
- **Device tab, IMU mode-flag warning follow-up (2026-09-05, L7b).**
  `validateConfig` now warns (never blocks `isPushable`) when
  `imu.low_power_mode` and `imu.high_performance_mode` are both set: SPEC §8
  frames the two as one physical toggle but does not state which one the
  firmware honours when both are true, so the validator surfaces the
  ambiguity rather than guessing a precedence rule. Tracked for Isaac in
  `runs/2026-09-03/decisions.md`'s 2026-09-05 "IMU `low_power_mode` vs
  `high_performance_mode`" note — the SPEC §8 gap this warning exists for
  is still open.
- **Device tab, Task 5 (2026-09-05, L7b).** `Device/sources.ts` —
  `listSources`, the channels table's `SourceView[]` — one row per
  configurable source in a stable order (hardware-pinned sources first),
  each with an expandable per-channel breakdown (`ChannelsTable.tsx`).
  Enable state and sample rate are joined from Task 4's `previewSources` by
  `sourceKey`, never re-derived. Scale/offset show only for an
  `analog.channels[]` entry's own config-typed values — never a
  registry-derived number (R53 Device Q1) — matching Task 4's narrowed
  scope; no `channel_id`/data-type column. `docs/IDL0_SPEC.md` §23.3
  rewritten to describe the columns as built.
- **Device tab, Task 6 (2026-09-05, L7b).** `Device/config/edit.ts` — pure,
  immutable edit operations over `DeviceConfig` (`setImuRate`, `setImuSlot`,
  `setImuAxis`, `setGps`, `setWheelSlot`, `setHrm`, `clearHrm`); none mutates
  its input, checked by deep-equality against a pre-call clone. `ImuForm`,
  `GpsForm` and `WheelForm` edit their slice of the config through those
  operations and show `validateConfig`'s issues for their own paths inline —
  never snapping a value, only reporting it. Every control (ODR list,
  accel/gyro ranges, GPS rate/model/NMEA set) is constrained to Task 3's
  named valid-value sets, so an invalid value can only arrive from a file or
  device, not from pointing at a control. `ChannelsTable.tsx`'s gear control
  now opens the IMU/GPS/Wheel forms; Analog/Digital/HRM stay disabled
  pending Task 7. The four analog/digital channel edit operations
  (`upsertAnalogChannel`, `removeAnalogChannel`, `upsertDigitalChannel`,
  `removeDigitalChannel`) are left entirely to Task 7 — nothing in this
  task's forms calls them, so no signature was guessed here.
  `docs/IDL0_SPEC.md` gains §23.3.1–§23.3.3 describing the three forms.
- **Device tab, Task 5 review follow-up (2026-09-05, L7b).** `sources.ts`'s
  breakdown rows now name the SPEC §5.4 registry channel a user will see
  again in the Data tab and notebook (`WheelFront`/`WheelRear`, `HR_BPM`,
  and the GPS row's six `GPS_Latitude`/`GPS_Longitude`/`GPS_Altitude`/
  `GPS_SpeedKmh`/`GPS_Heading`/`GPS_EpochMs` children) instead of the
  invented `"pulse"`/`"heart_rate"`/`"fix"` strings. `index.tsx` shows a
  visible banner above the config card while `pull_config` is not wired,
  so `defaultConfig("")`'s placeholder values are never mistaken for a
  connected device's real settings. `docs/IDL0_SPEC.md` §23.3 updated with
  both.
- **Device tab, Task 6 review fix (2026-09-05, L7b).** `ImuForm`'s four
  mode-flag/top-level-range controls (`low_power_mode`,
  `high_performance_mode`, `accel_range_g`, `gyro_range_dps`) now commit
  through two new pure `edit.ts` operations, `setImuModeFlags` and
  `setImuRanges`, instead of an inline object-literal spread in the JSX
  handler — closing the review's Important finding and making
  `docs/IDL0_SPEC.md` §23.3.1's "every field commits through `edit.ts`"
  claim true. `ChannelsTable.tsx`'s wrapping `<table>` re-indented one level
  under the sibling `<OpenForm>` fragment (Minor, cosmetic).
- **Ruling R58 (2026-09-05): unassigned pins are representable, no pin
  range is invented (`runs/2026-09-03/decisions.md`).** `AnalogChannel.adc_pin`
  and `DigitalChannel.gpio_pin` are now `number | null`; `null` means
  unassigned. `parseConfig` reads a missing pin key as `null` with no
  `Repair` (a legal draft state); a present non-integer is a `Repair`,
  treated as unassigned rather than a guessed pin number.
  `serializeConfig` omits the key entirely when `null` — the schema has no
  null-pin shape. `validateConfig` reports an unassigned pin as a
  push-blocking error (`isPushable` false); the pin-collision check ignores
  `null` claims entirely (two unassigned channels never "collide"). No pin
  range exists anywhere in `DeviceConfig` or SPEC §8/§3.7, so the app never
  invents one.
- **Device tab, Task 7 (2026-09-05, L7b).** `Device/forms/{AnalogForm,
  DigitalForm,HrmForm,AddChannelPicker}.tsx` and `Device/config/newChannel.ts`
  complete the Device tab's source forms. Analog and Digital each edit one
  channel through new `edit.ts` operations `upsertAnalogChannel`/
  `removeAnalogChannel`/`upsertDigitalChannel`/`removeDigitalChannel` (both
  "add" and "in-place edit" are the same upsert, keyed on the channel's own
  `key`). The ADC/GPIO pin control in both forms is a plain
  non-negative-integer input starting empty when unassigned — never a
  `<select>` — per ruling R58: SPEC §8 states no valid pin range, so the
  app never auto-selects one. HRM's "Search nearby" runs the landed
  `bleScan` (C3 §3.8) and lists every discovered BLE device (no
  service-UUID filter exists in `DeviceDiscovered`, so heart-rate straps
  cannot be singled out — Parity gap, `runs/2026-09-05/lanes/l7/IPC-NEEDS.md`);
  selecting one prefills `device_address`/`device_name` and enables the
  monitor; manual address entry and Forget (`clearHrm`) round out the form.
  `newChannel.ts`'s `newAnalogChannel`/`newDigitalMarker` generate a unique
  `key` (`analog_N`/`marker_N`, never idl0's colliding `"__new__"`) and
  seed SPEC §8's example-shape defaults with an unassigned pin;
  `addChannelOptions` drives `AddChannelPicker`'s four choices (Wheel
  front/rear toggle an existing slot rather than creating an entry; Analog
  channel and Marker button create a new draft). `level`/`pwm` digital
  kinds are never offered (SPEC §8: reserved, not shipped in Spec 1's
  picker). `ChannelsTable.tsx`'s gear control now opens every source's form,
  including analog/digital rows keyed by that row's own channel `key`; a
  "+ Add channel…" button opens the picker. `docs/IDL0_SPEC.md` gains
  §23.3.4–§23.3.6 and a rewritten §23.4 describing the real picker (in
  place of idl0's `kChannelSourceFactories` description), plus a one-line
  "pin input is unconstrained until SPEC §8 states a valid pin range" note
  in both §23.3.4 and §23.3.5 for Isaac.
- **Device tab, Task 8 (2026-09-05, L7b).** `Device/profiles.ts`'s pure
  `profilesReducer` (select/create/rename/duplicate/delete) is an
  **in-memory-for-the-session** profile library — `list_profiles`/
  `save_profile`/`delete_profile` (IPC need 11) are stubs, so `ProfileBar.tsx`
  states plainly, unconditionally, that nothing here survives an app
  restart; `DUPLICATE` deep-copies the source config (`structuredClone`) so
  editing a copy never touches the original. `Device/push.ts`'s
  `preparePush(config)` is the one gate a config passes before
  `PushConfigBar.tsx` calls the real, landed `pushConfig` (C3 §3.8):
  `validateConfig`/`isPushable` first, `serializeConfig` only if pushable —
  never the reverse, the lane's load-bearing invariant. A small pure
  `pushReducer` (idle → pushing → succeeded/failed) keeps one push in
  flight at a time. `pull_config` (IPC need 10) is still a stub, so
  `describePushResult` reports all four idl0 outcomes but every real wave-2
  push lands on "applied, not verified" — no reconnect-and-verify leg
  exists yet. Idle-mode gating (SPEC §10.4) is stated in copy, not
  enforced — `device_status` (IPC need 8) is a stub too, so a device that
  refuses a push in the wrong mode surfaces through `Device/errors.ts`'s
  `describeIpcError` (`kind: "config"`/`"ble"`) rather than being blocked
  in advance. `docs/IDL0_SPEC.md` §23.2 and §23.6 are rewritten for wave 2
  in place of idl0's file-backed-library and `BleService` descriptions.
- **Device tab, Task 7 review-fix (2026-09-05, L7b).** Ruling R58's second
  sentence — "a non-negative-integer input" — is now enforced, not just
  stated: `config/validate.ts`'s `checkAnalogChannels`/`checkDigitalChannels`
  reject a negative or non-integer assigned `adc_pin`/`gpio_pin` with a new
  `"pin must be a non-negative integer"` error (`isPushable` false);
  `AnalogForm`/`DigitalForm`'s `parsePinInput` mirrors the same check
  locally, so typing a negative pin is treated as unassigned rather than
  committed —
  parse leniency (a loaded file's non-integer pin) is unchanged, still a
  `Repair`. `ChannelsTable.tsx`'s carried indentation nit (flagged in Task 6
  and Task 7's reviews, "fix on next touch") is fixed this time.
- **Device tab, errors.ts review-fix (2026-09-05, L7b).** `Device/errors.ts`'s
  `describeIpcError` now appends the device's own rejection reason to a
  `kind: "config"` error's text (C3 §2: that kind's `message` *is* the
  device's stated reason, not Rust-side debug text, so it is safe and
  useful to show) — `"The device rejected the config it was sent: <reason>"`.
  An empty `message` still falls back to the fixed generic sentence, never a
  bare trailing colon.
- **Device tab, Task 9 — device files and the status hero; L7b lane complete
  pending write commands (2026-09-05, L7b).** `Device/files.ts`'s pure
  `downloadReducer` and `toFileViews` drive the real, landed
  `listDeviceFiles`/`downloadFile` (C3 §3.8) from `Device/DeviceFiles.tsx`:
  a file's `isNew` flag is computed against the catalog's known session ids
  (`listSessions`, `app/src/ipc/catalog.ts`, C3 §3.2, fetched by `index.tsx`
  on every successful connect — never a cross-lane import from the Data
  tab), and downloads run **strictly one at a time**
  (`isDownloadActive(queue)` gates the row buttons), never as a
  self-triggering effect. A completed download lands a blob under
  `<data>/blobs/sha256/`; per R53 Device Q3, there is no handoff to the
  Data tab's import in wave 2 — the row tells the rider to import it from
  there. `Device/HeroCard.tsx` renders the status hero honestly: the last
  `ble_connect` result and firmware version are real, and every field
  `device_status`/`device_control` (IPC needs 8, 9) would report — mode,
  recording, SD, GPS, IMU, HR, battery — reads as **"unavailable"**, never
  a fabricated zero. `docs/IDL0_SPEC.md` §23.10 and §24.17 gain wave-2
  notes describing exactly this.

  **L7b (Device tab) is now complete for wave 2**, all 9 tasks landed.
  Outstanding, all tracked in `runs/2026-09-05/lanes/l7/IPC-NEEDS.md`: live
  device status (need 8) and recording/mode control (need 9) have no C3
  command, so they render as "unavailable" rather than being built;
  `pull_config` (need 10) is a stub, so a push cannot be round-trip
  verified; profile persistence (need 11) is in-memory for the session
  only; the channel-registry preview was narrowed to enable/rate/units per
  R53 Q1 (option c for wave 2, with need 12 filed for option b later); a
  managed BLE connection (need 13) does not exist, so `connected` reads as
  "the last attempt succeeded," never a live link. IMU calibration and
  OTA/firmware update are deferred to wave 3 outright (no IPC need filed).
  The full parity-gaps table (plan Task 9 section, `docs/superpowers/plans/
  2026-09-05-idl1-wave2-l7b-device-tab.md`) also drops the Android WiFi
  bind-follows-mode controller, the RX/TX link-activity blink, and
  reserved digital `level`/`pwm` channel kinds and per-channel analog rate
  overrides (parsed and preserved, not exposed in the UI) — none of these
  block wave 2.
- **plotForm.parse and the round trip (L6 Task 3).** Bidirectional over the C2 §5.3 subset; every custom-code rule in the contract has its own test. Design §10's "plotForm round-trips its subset" holds.
- **plotForm.generate (L6 Task 2).** Emits the C2 §5.3 Plot subset byte-identically for all four of the contract's worked examples.
- **Notebook tab: page becomes a directory (L6 Task 1).** routes/pages/NotebookPage.tsx → routes/pages/Notebook/index.tsx with a re-export shim; no behaviour change.
- **Rust raster underlay (L6 Task 9).** Spectrogram and 2-D histogram rasters drawn beneath Plot axes via `fetch_raster`/`fetch_raster_meta`, settle-bound only (P1/P3/P4); colour scale never recomputed in JS (R38, P8).
- **Sandbox rebuild ordering fixed: channels replay after `init`, before `setCells` (L6 Task 8, review-task5c.md Critical follow-up).** `SandboxHost.rebuild()` was calling `onChannelsInvalidated()` before `init` was even queued, so once wired its channel `setHostVar` messages would arrive at a sandbox whose `SandboxRuntime` was still `null` and be silently dropped by `sandbox/main.ts`'s no-op handler — the race-safety `OutboundQueue` provides does not by itself guarantee processing order. `rebuildReplay.ts`'s `replayAfterRebuild` is split into `replayInitAndHostVars`/`replaySetCells` so `rebuild()` can call `onChannelsInvalidated()` between them: `init` → JSON host vars → channels → `setCells`.
- **Pan/zoom viewport transforms, settle-bound tile fetch (L6 Task 8).** Gesture frames update a CSS/canvas transform only (P3/P4); the debounced settle callback is the sole caller of `ensureTiles`/`fetchTile` at the re-chosen tier.
- **channel() buffer type fixed to Float64Array (review-task7.md follow-up).** `channelData.ts`'s `ChannelData.v` was `Float32Array`, silently mismatched against `sandbox/main.ts`'s already-landed `materializeHostVar`, which unconditionally reinterprets a received buffer as `Float64Array` — every plotted value would have been garbled once wired. `v` is now `Float64Array` (matching `t` and C1's native `f64` channels); `host/protocol.ts`'s `channelPayload` doc comment now states both buffers' element type explicitly, and `protocol.test.ts` gained a round-trip test proving values survive the exact `new Float64Array(buffer)` reinterpretation `materializeHostVar` performs.
- **Rebuild race and host-var replay fixed (review-task5b.md follow-up).** `SandboxHost.rebuild()` no longer replays `init`/`setCells` synchronously against a not-yet-loaded iframe — the sandbox now sends `ready` unconditionally on load (not gated on `init`), and a pure `OutboundQueue` (generation-tagged, so a stale `ready` can never flush into a newer iframe) holds every outbound message until it arrives. `laps`/`session`/`constants` and any other JSON-kind host variable are now cached and replayed after `init`; channel host variables (whose transferred `ArrayBuffer`s are detached and can't be replayed verbatim) are instead re-derived from the still-in-memory `TileCache` via a new pure driver, `model/channelRebind.ts`'s `rebindChannelsAfterRebuild`, invoked through `SandboxHostCallbacks.onChannelsInvalidated`.
- **Tiles → Plot data, hover from the column region (L6 Task 7).** `tileToChannelData` materialises the sandbox's `channel()` records (an array of `{t, v}`, per the settled C2 §5.1 shape) from transferred buffers; `hoverAt` reads a tile's own column stats — no `cursor_readout`, no IPC on the hover path.
- **Tile tier/cache model (L6 Task 6).** Pure tier selection, point budget (2×pixelWidth desktop), and a byte-tracked (session,channel,tier,index,columnCount) tile LRU with request coalescing. Follow-up (review-task6.md fixes): default byte cap corrected to mirror idl0's documented `ChartTileCache.defaultMaxBytes` (30 MB, `chart_tile_cache.dart:24-25`) instead of an undocumented 64 MiB guess; in-flight fetch coalescing moved from a module-level map into a per-`TileCache`-instance field so two independent caches can no longer resolve into each other's fetch.
- **Sandboxed iframe host (L6 Task 5).** postMessage cell API (host- and sandbox-side message unions, validated on receipt), a watchdog (1000 ms ping / 3000 ms stall), and the sandbox's own Runtime+Plot+d3+Inputs+htl bundle entry, served via `vite.config.ts`'s `notebookSandbox` build entry (R56). `allow-same-origin` never granted. Follow-up (review-task5.md fixes): host variables (`laps`/`session`/`constants`/`channel`) now bind through a pure, unit-tested `bindHostVariables` as reactive `module.variable()`s instead of `module.builtin()`s that silently handed cells a getter function instead of their data; a watchdog-triggered rebuild now replays the last `init`/`setCells` payloads (`replayAfterRebuild`) instead of permanently emptying the notebook.
- **Notebook cell scan (L6 Task 4).** Pure TS fence scan over C2 §2.2/§2.4 giving the editors byte ranges per cell; Rust's parser stays authoritative for evaluation. Follow-up: two review-named tests added (unterminated fence at EOF, invalid `id=` value) and two doc-completeness nits closed in the module doc comment, no production-code change.
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

### Changed

- **Doc carry-over fixes (2026-09-03, L10).** `tools/README.md` no longer documents the
  uncarried `idl0_dump.dart`; points at `idl-rs info`/`idl-rs channels` for the overlapping
  functionality. `app/README.md` replaced (was still the Tauri scaffolder's generic template).

### Verified

- Binary IPC path (Rust 2/2, vitest 3/3, cargo build, tsc clean) on Windows desktop, 2026-09-02 — automated; visual check via `npm run tauri dev` confirmed by Isaac 2026-09-03 (Engine 0.1.0, smoke tile 0–7 rendered).
- `idl-transport` unit/integration tests (`cargo test -p idl-transport`, 29/29 passed) and
  `cargo build -p idl-transport --release` on Windows desktop, 2026-09-03 — automated. Real-device
  BLE scan/connect/WiFi-mode entry, WiFi file list + resumable download, and BLE config push +
  read-back verify against a physical IDL0 device pending (Isaac).
