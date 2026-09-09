# Changelog

All notable changes to idl1 are recorded here. Format: Semantic Versioning.

## [Unreleased]

### Changed

- **Notebook: the FFT properties pane's Scaling picker offers all three of
  the maths language's names (2026-09-09, ruling R167/R168).** `plotForm/
  types.ts` splits the old two-name `FFT_SCALINGS` in two: `FFT_SCALINGS`
  (all four accepted spellings — `density`/`spectrum`/`raw_magnitude`, plus
  the retired `magnitude` a pre-R167 workbook may still carry) for
  `parse.ts`'s grammar reader, and `FFT_SCALING_OPTIONS` (the three
  offered) for the picker. `PropertiesForm.tsx`'s Scaling `<select>` now
  offers "Density (PSD)" / "Spectrum" / "Magnitude"
  (`model/propertiesForm.ts`'s new `fftScalingSelectOptions`, which appends
  a fourth `"magnitude"` option, for that render only, when the cell is
  currently on the retired spelling — an unmatched `<select>` value would
  otherwise silently render as, and rewrite on the next edit into, Density).
  `defaultFftPlotProps` now seeds `scaling: "raw_magnitude"` (was
  `"magnitude"`), and `suggestSpectrumAxisLabel` gains a `"spectrum"` branch
  (`` `Power (${unit}²)` ``, C2 §3.3.1's `spectral_rule`), written as an
  exhaustive switch. C2 §5.3's parameter table corrected to the three
  current names and the `"spectrum"` y-label default.

### Removed

- **Device tab: the Calibration placeholder panel (2026-09-08,
  `runs/2026-09-07/ui/UI-DIRECTION-2.md` decision 67, ruling R116).** Not
  ported — R116: a single static-hold routine is mathematically
  underdetermined (it cannot separate bias from orientation, and gravity
  cannot observe yaw), so each IMU would land on a different arbitrary
  heading. A calibration routine is designed from scratch later; a
  placeholder control implying a working feature is worse than none.

### Fixed

- **One session display-name formatter, in `state/selection.ts` (2026-09-09,
  ruling R169).** `Data/sessionRow.ts`'s `venueLabel` and
  `shell/topBarSelection.ts`'s `sessionLabel` moved to `state/selection.ts`,
  beside `describeWindow`; the Notebook report's `model/report/document.ts`
  now calls `sessionLabel` instead of its own `sessionDisplayName`. The
  three had disagreed on the empty-venue text (`(none)` vs `Session`) and
  whether the date was shown — a report window's label now carries the
  date and reads `(none)` for an unrecorded venue, matching the top-bar
  chip it was printed from.

- **Notebook: the cursor value card's `""`-means-both unit ambiguity
  (2026-09-09, R154 item 6).** `model/cursorCard.ts`'s `CursorCardRow.unit`
  and `cursorCardRows` now take the three-state `UnitLabel` (`ipc/workbook.ts`)
  instead of a bare `unit: string`, so a raw channel with no recorded C1
  unit never renders identically to one that is genuinely dimensionless.
  `ChartCell.tsx` converts `ChannelSummary.unit` via the new
  `model/unitLabel.ts`'s `rawUnitToLabel`.

- **Notebook: the unit model reaches the sandbox host variables and
  `CellDefResult` (2026-09-09, R154/R162/R164/R165).** `ipc/workbook.ts`
  gains the three-state `UnitLabel`/`UnitNote` types and `CellDefResult.
  unit`/`unit_notes`, mirroring the landed Rust shape. A `"channel"` host
  variable now carries `unit` end to end — `jsCellBinding.ts`'s
  `JsCellBindingChannel.unit` (a session channel's `ChannelSummary.unit`
  via `rawUnitToLabel`, or a `"definition"` channel's `CellDefResult.unit`
  via `Notebook/index.tsx`'s new `definitionUnitByName` map) through
  `channelBindDriver.ts`'s dispatched `channelData`/`BoundChannel`,
  `channelRebind.ts`'s `BoundChannel` (carried across a sandbox rebuild,
  never re-derived — `fetch_host_channel`'s IDLH bytes have no unit,
  R165), `host/protocol.ts`'s `HostVarPayload`, to `sandbox/main.ts`'s
  `materializeHostVar`, which projects it onto the bound record array as
  non-enumerable `.unit` (display string) and `.unitState` (the
  three-state discriminator) properties — so a prose `${…}` can reach it
  (C2 §5.1/§5.2), without ever auto-appending it to a value (R154 item 5).

- **Notebook: the graph node card's unit row, and the source palette's unit
  column (2026-09-09, decision 45, R154/R160/R164).** `NodeCard.tsx` gains a
  unit row under the name/status row — a `"channel"` node's own
  `ChannelSummary.unit`, or a `"definition"` node's `CellDefResult.unit`
  (`GraphCanvas.tsx`'s new `unitFor`, mirroring `valueFor`'s lookup).
  `sourcePalette.ts`'s `PaletteChannelRow`/`PaletteDefinitionRow` gain the
  unit column R160 deliberately left out while the field didn't exist;
  `SourcePaletteRail.tsx` renders it beside the rate badge. All three
  render the three states distinctly (this task's own rule): `known` shows
  the unit itself, `dimensionless` shows no badge at all (not a blank that
  reads as missing), `unknown` shows an explicit `?` with the reason as its
  tooltip.

- **Notebook: the CAD-style top toolbar (2026-09-09, ruling R161).** One
  toolbar row spans the tab above the columns, so the preview beneath it
  runs full height. Its leading group is column visibility -- three
  independent toggles (`model/notebookColumns.ts`'s `NotebookColumnId`:
  `graph`/`properties`/`cells`), replacing the old binary Graph/Cells view
  toggle (`graphViewOpen`) — both can now show at once in the wide/`"panes"`
  layout, each its own resizable panel (mirroring `ColumnFrame.tsx`'s "no
  panel, no divider when hidden" rule, R107). Everything else merges in:
  the workbook selector and Save, playback transport, and — behind a
  `<details>` "More…" overflow disclosure, since the row never wraps — the
  gesture-preset and X-axis selects. Banners (sandbox/catalog/markdown/eval
  status, conflict, version, migration) move under the toolbar, above the
  columns, so they never shrink one column; the master timeline strip stays
  its own full-width row (not one of R161's named toolbar controls).
  Visibility persists per machine (`idl1.notebook.columns.v1`, a sibling key
  to `shell/columnPrefs.ts`'s own storage — a different concept, the outer
  shell's four docked columns vs. these three Notebook-local panes — never
  synced, never in a workbook). A restructure, not a feature: every control
  keeps its prior condition/props, only its position changed.

### Added

- **Notebook: the report document model (2026-09-09, decisions 85/89,
  ruling R166, `runs/2026-09-09/report-plan.md` task R1).** New pure
  `Notebook/model/report/document.ts`: `buildReportDocument(cells,
  proseBlocks, evals, windows, sessions, appVersion, generatedAtMs)` turns
  a settled `evalWorkbookV2` result into a flat, typed `ReportDocument`
  block list (cover, one session block per distinct selected session, a
  selection block listing every window, the primary window's prose/
  defTable/table sections in document order, and an appendix). Every
  `math`-cell definition's row now carries its unit (three-state, R154)
  and sample rate — the gap `MathCell.tsx` still has on screen; every
  `js`-kind (chart) cell becomes a named absence block, never a silent
  gap (R148/R150/R153). Scoped to the primary window only, matching the
  screen's own `primaryWindow` limit (R131 Q1) — lifting this to every
  selected window plus a scalar comparison table is task R4.

- **Notebook: "Export report" produces a real printable PDF end-to-end
  (2026-09-09, decisions 85/89, ruling R166, task R2).** New
  `components/ReportView.tsx` renders a `ReportDocument` as a
  purpose-built document (never the notebook column, which cannot be
  printed — every chart container is `position: fixed` in a different
  document); new `styles/report-print.css` (`@page`, `break-inside`/
  `break-before` rules, reuses the app's own `@font-face`s, no new fonts
  declared). `Notebook/index.tsx` gains an "Export report" action beside
  Save: builds the primary window's `ReportDocument`
  (`listSessions`/`getVersion`, one-shot settle-bound fetches) into
  `#report-print-root`, then `window.print()` — the v1 path the plan's
  §2.2 accepted over a vendored PDF writer (task R7). One session, no
  charts yet — every chart cell already renders as a named absence
  (task R1).

- **Notebook: `MathCell` shows a definition's unit and sample rate
  (2026-09-09, ruling R166 item "a live gap found while surveying",
  task R3).** New `model/unitText.ts`'s `formatUnit`/`formatRate` — the
  three-state `UnitLabel` (R154) to display text, and `sample_rate_hz`'s
  "`null` means not applicable, never unknown" rule (R152) — extracted
  from task R1's own inline copy so `MathCell.tsx`'s `DefRow` and the
  report's `defTable` render the identical text for the same definition.
  Both fields were already on the wire (`CellDefResult.unit`/
  `.sample_rate_hz`) but `MathCell.tsx` rendered neither.

- **Notebook: the report covers every selected window, not just the
  primary one (2026-09-09, plan §4, task R4).** `buildReportDocument` now
  iterates every `WindowEval`, one `windowSection` (or, for a window
  whose own evaluation failed, a new named `windowFailure` block, ruling
  R121 — never dropped, never merged into a neighbour) per selected
  window in selection order, plus a new `comparison` block once more than
  one window is selected: one row per scalar definition
  (`sample_rate_hz === null`, or `value.has_t === false`), one column per
  window, matched by definition name. `Notebook/index.tsx`'s "Export
  report" action now reads every selected window's own `WindowEvalState`
  entry (`state.windows`, keyed by `windowKey`) instead of the primary
  window alone. `ReportView.tsx` renders both new block kinds.

- **Device tab: the recording-only live status pane (2026-09-09, decisions
  66/87, ruling R113, unblocked by the Rust lane's C3 amendment/R157 item
  2).** New `Device/liveStatus.ts` (pure, vitest-covered): while recording,
  `HeroCard` now shows **per-IMU OK, GPS satellite count, and duration —
  nothing more** ("keep it lightweight on the ESP32"), replacing the
  SD/GPS/IMU/HR/battery/WiFi/firmware strip shown at other times. Duration
  prefers the device-reported `DeviceStatus.logging_elapsed_s`
  (`recordingDuration`) and falls back to the existing client-observed
  clock, rendered dimmed, exactly when firmware hasn't sent the line yet.
  `gps_sats: 0` ("searching") renders as `"0"`, never collapsed into the
  same "unavailable" text as a genuinely absent `GPSSats` line — SPEC
  §7.3's absent-vs-zero rule, tested explicitly since every one of these
  fields is legitimately absent on firmware today. `ipc/device.ts`'s
  `DeviceStatus`/`DeviceDiscovered` gained the mirror fields
  (`imu0`/`imu1`/`imu2`, `gps_sats`, `gps_fix_quality`, `gps_hdop_x100`,
  `logging_elapsed_s`, `battery_raw`, `sd_free_mib`, `service_uuids`) that
  `commands/device.rs` already carries but the TS side hadn't picked up.

- **Device tab: HRM search filters to the heart-rate service by default
  (2026-09-09, decision 68, ruling R157 item 3) — supersedes the "not
  implemented" note on the 2026-09-08 push-config entry below.** New
  `Device/forms/hrmFilter.ts` (pure, vitest-covered): `HrmForm`'s "Search
  nearby" list now defaults to devices advertising the standard heart-rate
  service (`0000180d-…`), with a "Show all devices" toggle. A device that
  advertised **no** service UUIDs at all is kept even while filtered — an
  empty `DeviceDiscovered.service_uuids` means the scan record didn't carry
  a service list, not that the device has none, and hiding it risked
  making a real strap invisible; only a device that positively advertised
  a *different* non-empty set is excluded. When the filter hides every
  discovered device, the form says so by count ("N devices found, none
  look like heart-rate straps") rather than reading as "nothing nearby"
  (R153).

- **Notebook: the maths graph's source palette (2026-09-09, ruling R160).**
  A collapsible rail on the graph canvas, closed by default, listing the
  three droppable source kinds — raw channels of the current selection
  (grouped by prefix, unioned across selected windows, greyed when absent
  from some resolved session per decision 44, never hidden), workbook
  constants (front matter `constants:` and every math cell's own `const`
  lines), and already-declared definitions. Search-first, per-group
  collapsible (decision 42). Dragging a row onto the canvas mints a node
  through `graphEdits.ts`'s `addNodeFromChannel` (channels/definitions,
  bracket-referenced) or the new sibling `addNodeFromConstant` (a constant
  is bare per C2 §3.1 — bracketing it would look up a channel instead);
  both share one `appendDefLine` insertion path. `sourcePalette.ts` and
  `graphPaletteDrop.ts` are pure and vitest-covered; the rail component and
  the drop target live in `GraphCanvas.tsx`/`SourcePaletteRail.tsx`. This
  is decision 45a's "drag from the channel list" gesture and closes the gap
  R147 flagged: `addNodeFromChannel` was fully tested but unreachable.
  `CellDefResult.sample_rate_hz` hasn't landed yet (R147/R152), so a
  definition row's rate is omitted rather than shown blank.

- **Notebook: `functionCatalog.ts` brought current with the scipy-alignment
  lane's 72-entry engine catalog (2026-09-09,
  `runs/2026-09-08/scipy-alignment-plan.md`, ledger R151/R157).** Renamed
  rows (`lap_delta_time`/`lap_delta_dist`, `angle_between`, `percentile`,
  `clip`, `where`, `cumulative_trapezoid`), the `fft` → `periodogram`/`welch`
  split with scipy's `density`/`spectrum` scalings plus the deliberately
  un-scipy `raw_magnitude`, `cumtrapz` as a permanent second spelling, and
  `gradient` alongside `differentiate` — cross-checked directly against
  `rust/core/src/math/catalog.rs`'s own `math_builtin_catalog()`.
  `CodePane`'s completion signatures update automatically (they read
  `functionCatalog.ts`'s `signature` strings directly).

- **Notebook: retired math-builtin names are surfaced to the user
  (2026-09-09, ledger R151 items 9/10).** `read_workbook`'s
  `pending_migrations` renders as a passive strip on open ("this workbook
  uses N retired names; saving will update them") — nothing is rewritten by
  opening a file. `save_workbook`'s `migrations` renders as a dismissable
  report of what the save just rewrote, reusing the notebook's existing
  banner slot (`ConflictBanner`/`VersionBanner`) rather than a second
  mechanism: new `components/MigrationBanner.tsx`, pure decision logic in
  `model/migrationNotice.ts`, `workbookState.ts`'s `pendingMigrations`/
  `appliedMigrations`, and `saveFlow.ts`'s `"saved"` state carrying
  `migrations` through.

- **Device tab: push config reads the device's mode first, refuses before
  sending (2026-09-08, `runs/2026-09-07/ui/UI-DIRECTION-2.md` decision
  69).** New `push.ts` `checkPushMode(status)`: idle mode (SPEC §23.6)
  means both `logging` and `wifi_on` read back confirmed `false` — either
  being unreported (`null`) is "don't know yet," never assumed idle.
  `PushConfigBar` gates **Push config** on it and shows the specific reason
  (recording / WiFi mode / mode unknown) in place of letting the device's
  own after-the-fact rejection be the first the rider hears of it. Decision
  68 (HRM search filtered to the heart-rate service by default) is **not
  implemented**: `bleScan`'s `DeviceDiscovered` carries no service-UUID
  data at all (`ipc/device.ts`) — there is nothing to filter on
  client-side without a new IPC field, a contract/Rust change out of scope
  for this TS-only lane; `HrmForm.tsx`'s own doc comment already names
  this as a parity gap.

- **Device tab: auto-connect to the last-used device on launch (2026-09-08,
  `runs/2026-09-07/ui/UI-DIRECTION-2.md` decision 64).** New
  `Device/lastDevice.ts`: a `localStorage`-backed seam (no `AppSettings`
  field exists yet for this device preference; a Rust change is out of
  scope for this TS-only lane) remembering the last connected device id
  across restarts, plus the pure `shouldAutoConnect` decision the mount
  effect calls. Never dispatches `CONNECT_START`, so the hero CTA and
  device picker stay interactive throughout, and a failed attempt (device
  off, out of range) is silently ignored rather than shown as a "failed"
  banner — a routine "not on yet" case at launch isn't the kind of failure
  a deliberate manual connect reports.

- **Device tab: a real N-device picker, one-tap active switch (2026-09-08,
  `runs/2026-09-07/ui/UI-DIRECTION-2.md` decisions 64, 86).** `connection.ts`'s
  `ConnectionState` now holds `connections: ConnectionInfo[]` and
  `activeDeviceId` instead of a single `connected` slot — `connect_device`/
  `disconnect_device`/`device_status`/`device_control` already key on
  `device_id`, so the Rust side needed no change. `HeroCard`'s new
  `DevicePicker` dropdown lists every already-connected device as a one-tap
  radio switch above a "Discovered" section of devices seen this scan with
  their own Connect action. The status poll and hero/Files/Config sections
  follow whichever device is active; switching is a pure state change, no
  IPC. Closes the exact gap the pre-wave-3 hero card's own doc comment
  named ("the device dropdown/picker sheet... this renders the discovered
  list inline instead").

- **Notebook errors and staleness (2026-09-08, `runs/2026-09-07/ui/UI-DIRECTION-2.md`
  §D decisions 58-63).** Five changes making the app say what it knows
  instead of an unexplained empty chart frame: (1) a chart's note/error slot
  gets a **Fix** button that opens the failed reference's own declaring math
  cell (`model/fixTarget.ts`), not merely the chart's own cell; (2) a cell
  whose result predates the document's latest edit stays on screen **greyed
  with a spinner overlay** (`CellFrame`'s new `stale` prop) rather than
  blanking — tracked by a new `WorkbookState.evalRequestGeneration` /
  `WindowEvalState.generation` pair (`model/workbookState.ts`'s
  `isWindowStale`); (3) the cursor value card never shows a row for a window
  that has since been unchecked, even during the gap before the retained
  channel-data cache catches up (`model/cursorCard.ts`'s new
  `selectedWindowKeys` parameter), and the FFT overlay's combined spectrum
  is now re-pushed to the sandbox immediately when a window is pruned from
  it, not only on the next unrelated re-fetch; (4) a dismissable banner
  names any selected session whose recorded `engine_version` is behind the
  live engine's (`model/engineVersionBanner.ts`) — the importer-version half
  is **not implemented**: no C3 command exposes an importer's current
  version to compare against (`ImporterInfo` carries no version field), a
  contract gap recorded rather than guessed; (5) a failed inline `${…}`
  span renders an `--accent` `⚠ name` marker with the error on hover
  (`model/proseSpanError.ts`), never the stale value it last resolved to.

### Fixed

- **IMU channel masks are all-or-nothing again, and SPEC §8's worked example
  is corrected, not the validator (2026-09-08, ruling R155).**
  `validate.ts`'s `checkImuSlot` now errors when an enabled IMU has some but
  not all six axis channels on (all-off stays the pre-existing "logs
  nothing" warning); a disabled slot is unaffected. SPEC §8's own worked
  example enabled IMUs with only 3-5 of 6 channels — that example is now
  corrected to all-six-on, with a new paragraph recording that a partial
  mask stays wire-legal and importer-readable forever, it is just no longer
  something this app writes. `validate.test.ts`/`model.test.ts`'s
  `SPEC_WORKED_EXAMPLE` fixtures follow the corrected example.
- **`imu.low_power_mode`/`imu.high_performance_mode` both set is now a
  validation error, not a warning (2026-09-08).** Firmware confirms the two
  are XOR (`runs/2026-09-08/firmware/STATUS-7.3-DELTA.md`, "Resolved with
  Isaac") — supersedes the earlier "SPEC §8 doesn't say which flag wins"
  warning now that firmware has said there is nothing to win. Neither flag
  set is left unchecked (reads as ordinary high-performance mode). The
  six-channels-all-or-nothing half of the same brief item (direction-2
  decision 70) is **not** done: SPEC §8's own worked example
  (`validate.test.ts`'s `SPEC_WORKED_EXAMPLE`, transcribed verbatim from the
  device spec) itself enables an IMU with only 3-5 of its six channels on,
  so a hard validation error there would fail the spec's own example config
  — a real conflict between the wire spec and the newer app-side UI policy
  that needs the lead's call, not a guess.
- **`SandboxHost`'s re-render coalescing is a trailing debounce, not a bare
  `queueMicrotask` (2026-09-08, overnight brief "coalesce the re-render").**
  A `queueMicrotask` only merges calls made within the same microtask; a
  page load's channel/spectrum publishes each resolve their own IPC round
  trip independently and land in separate tasks, so it produced roughly one
  re-render (and warning) per channel instead of one for the whole load.
  New `host/rerenderCoalescer.ts` wraps `model/settle.ts`'s `makeSettle`
  (`SandboxHost` itself is not unit-tested, CLAUDE.md §4) — same shape
  gesture settle already uses. A late-bound host var still triggers its own
  re-render (tested): coalescing is not removed, only made to actually
  coalesce a spread-out burst.
- **Four swallowing catches in the Notebook's bind drivers now warn instead
  of silently absorbing a fetch failure (2026-09-08, ruling R153 audit).**
  `channelBindDriver.ts`'s per-definition and per-window fetch catches,
  `channelRebind.ts`'s rebuild re-fetch catch, and `sessionSpanDriver.ts`'s
  two catches all converted a specific rejection into a `null`/dropped
  result identical to a legitimate empty state, with no trace anywhere.
  `sessionSpanDriver.ts`'s two remain deliberately broad (a real session
  fetch failure is intentionally indistinguishable from "no window
  selected" today) — narrowing those needs a new dispatch variant and UI
  treatment, out of this task's scope; flagged in the ledger instead.
- **A `js` cell's note names which channel or definition failed to resolve,
  and distinguishes an unknown name from a declared definition whose own
  math cell errored (2026-09-08, ruling R150).** `jsCellNote`'s
  `isFormGenerated` gate is now `hasChannelReference` (a hand-written cell
  referencing a channel gets the same notes a form-generated one does, per
  R148 part 2 below); new `graphModel.ts`'s `declaredDefinitionNames` scans
  every `def_line` regardless of evaluation success, so an unresolved name
  that is a definition whose `def_line` itself errored (dropped from
  `CellDefResult` entirely — "a bare identifier instead of `[Name]`" was the
  first shakedown-workbook example) now says "failed to evaluate — check
  its math cell for an error" instead of the misleading generic "not part
  of this session".
- **A `js` cell binds by extracting its `channel(...)`/`spectrum(...)` calls,
  not by requiring the whole cell to match `plotForm.parse`'s closed
  `Plot.plot({...})` grammar (2026-09-08, ruling R148 part 2).** A `height:`
  key, an `opacity:` on a mark, a `stroke: "var(--chart-2)"`, or any
  statement before the call previously made `bindingFor` return `null` —
  the host never fetched or published that channel, so a hand-written cell
  rendered its axes and nothing else, with no explanation. New
  `model/jsCellCalls.ts` locates each `channel(...)`/`spectrum(...)` call
  site with a string/comment-aware character scan (`mathExpr.ts`'s
  precedent), then re-tokenizes each call's own span with `parse.ts`'s
  existing tokenizer/readers — no second JS parser. `parse` still drives the
  Properties form unchanged.
- **`graphLayout.ts`'s `findGraphBlockLines` locates a top-level `graph:` key
  by prefix match (`/^graph:/`), not exact-line equality (2026-09-08,
  w32-maths review fix).** A hand-edited flow-style or trailing-content
  variant (`graph: {nodes: {...}}`, `graph:  `, `graph: # note`) was
  invisible to the old exact match: read still degraded correctly to
  `EMPTY_GRAPH_LAYOUT`, but write appended a second canonical `graph:` block
  after the untouched line instead of replacing it — two top-level `graph`
  keys, permanently, in the one module that writes a user's workbook.
  Contradicted C2 §3.7.1's "malformed ⇒ replaced wholesale".
- **`graphStatus.ts`'s `"pending"` fallback no longer outlives its window
  (2026-09-08, w32-maths review follow-up).** A completed window
  (`windows` holds an entry) whose output has no `defs` entry for a node —
  a structural problem `CellDefResult`'s own doc comment says "keeps it out
  of `defs` entirely" — now reads `"error"`, not `"pending"`: the previous
  behaviour would spin forever for a definition the evaluator declines to
  ever emit a result for, the same class of defect as a silently wrong
  value, arriving through a spinner instead of a number.
- **`renameDefinition` now rewrites form-generated `js`-cell channel
  references too, and reports what it couldn't (ruling R145, 2026-09-08,
  w32-maths follow-up).** A rename previously only rewrote `[Name]`
  references in `math` cells, silently leaving a chart's `channel(...)`
  call stale. Now: a `plotForm`-parseable `js` cell (`plotForm/parse.ts`
  recognises it) is regenerated with the new channel name — safe because
  the code is generated, not hand-written; custom `js` code and prose
  `${…}` spans are **never** textually rewritten (a find-and-replace over
  arbitrary JS can corrupt working code), but any such cell still naming
  the old identifier is now collected and returned rather than silently
  left stale. `renameDefinition`'s return type changes from `string` to
  `{ markdown, unresolved: { cellId, kind }[] }` — its only caller so far
  is this lane's own tests, updated in the same commit.
- **`ChartCell.tsx`'s hover-cursor offset and cursor-card rows mis-scoped for
  a `"lap"`/`"range"` primary window (2026-09-08, w32-time, merge review,
  R138 pattern a fourth time).** `primaryWindowSpan` was locally derived as
  `{startUs: 0, endUs: sessionSpanUs}` — correct only for a `"session"`-kind
  primary window; the moment a user clicked a lap (the app's main gesture)
  and it became primary, every `cursorBus` offset published/resolved by this
  cell (hover line, click-pin, the value card's rows) was computed against
  the wrong origin. Fixed by threading `Notebook/index.tsx`'s own
  `windowSpanFor` result in as a new `primaryWindowSpan` prop instead — the
  same single "resolved" predicate `bindWindowsFor` and the playback loop
  (Task 10) already share, rather than a second, independently-derived
  approximation beside them. `index.tsx` stabilizes it through a `useMemo`
  keyed on `startUs`/`endUs` (`windowSpanFor` returns a fresh object literal
  every render) so it is safe inside `ChartCell`'s own `useCallback`/
  `useEffect` dependency arrays without resubscribing every render; every
  call site now guards `primaryWindowSpan === null` (span not yet resolved)
  rather than dereferencing it. `viewportWindows.test.ts` gained a
  regression test with a lap starting at 120s of a 900s session, asserting
  the correct resolved instant against the old wrong one directly — a
  session-kind-only test would have passed under either assumption.
- **`Notebook/model/viewportWindows.ts`: `AbsoluteSpan.endUs = Infinity`
  sentinel removed (2026-09-08, w32-time Task 3, ruling R134/plan §3.4,
  spec-during).** `resolveWindowSpan`'s `"session"` arm no longer returns
  `[0, Infinity)` when a window's recorded duration isn't known yet; it
  takes that window's own recorded span (`recordedSpanUs`) and returns
  `null` — the window is excluded — when it's unresolved, never a sentinel
  a downstream `(t - start) / (end - start)` would silently read as `0` for
  every `t`. `Notebook/index.tsx`'s `sessionSpanDriver` loop, previously
  discarding every non-primary window's resolved span, now keeps one per
  window (`sessionSpanUsByWindow`) and feeds it through; the channel-bind
  effect gained its own readiness dependency (`sessionSpansReadiness`,
  mirroring `sessionDetailsReadiness`) so a window's span resolving after
  its `SessionDetail` still re-runs the fetch (R133's "two staleness gates
  in series").
- **`Notebook/index.tsx`'s channel-bind identity gate: a non-primary
  `"session"` window's data could go permanently un-refetched (2026-09-08,
  w32-time, ruling R138, Critical from review of Tasks 1-3).** The gate's
  `resolvedWindowKeys` used its own second, independently-spelled readiness
  check (`sessionDetailsByWindow.has(key)`), which read `true` the instant
  such a window's `SessionDetail` resolved even though `bindWindowsFor`
  (the actual consumer) still excluded it pending its recorded span
  (`sessionSpanUsByWindow`, Task 3). That falsely recorded the window's
  identity as already bound; once its span *did* arrive, the identity
  already matched and the window's data was never fetched again for the
  cell's lifetime — silent and permanent. Fixed per R138's general rule
  ("resolved" gets one definition; a gate must use the same code path as
  the consumer's inclusion test): the shared predicate
  (`Notebook/model/viewportWindows.ts`'s new `windowSpanFor`) now backs both
  `bindWindowsFor` and the new `resolvedWindowKeysFor`, which the identity
  gate calls instead of the old `.has()` filter. `toWireWindow` moved
  alongside them (from `Notebook/index.tsx`, which imports `@/components/*`
  and so can't be unit-tested) so all three are — a regression test in
  `channelBindDriver.test.ts` drives the exact defect sequence (detail
  resolves before span, span arrives later) through `resolvedWindowKeysFor`
  + `updateChannelBindIdentity` and asserts the gate itself.
- **`Notebook/index.tsx`'s `cursorBusRef`: lazy-initialized, not allocated
  every render (2026-09-08, w32-time, folded in from review of Tasks
  1-3).** `useRef(createCursorBus())` called `createCursorBus()` — and threw
  away its result and subscriber-array allocation — on every render; now
  `useRef<CursorBus | null>(null)` with a one-time `if (… === null)` init,
  the standard React lazy-ref pattern.

### Added

- **The node card's chart button is now a pictogram chart-type picker
  instead of a fixed `lineY` mark (2026-09-08, decision 83 — Isaac: "my
  chart type selector was really pretty, I want those small chart type
  images to carry over").** `graph/chartTypeCatalog.ts` (pure, tested)
  offers exactly `plotForm/types.ts`'s five `MARK_NAMES` values — the
  marks this notebook can actually render, not idl0's full chart-kind list
  (time series/FFT/spectrogram/histogram/GPS map/…), most of which this
  card's single-node chart button was never going to draw. **No pictogram
  asset exists anywhere in this repo** (idl0's own picker used bundled
  Material Design glyphs, not an image file) — `graph/chartTypeIcons.tsx`
  draws all five as inline SVG instead, offline-first, no new dependency.
  `graph/ChartTypePicker.tsx` renders the row; `NodeCard.tsx`'s `onChart`
  now carries the chosen mark through to `GraphCanvas.tsx`'s
  `insertChartCell` call.
- **The maths graph's `MiniMap`/`Controls` are themed from `tokens.css`
  instead of xyflow's stock light-mode defaults (2026-09-08, decision
  42).** `graph/graphCanvasTheme.css`, imported after
  `@xyflow/react/dist/style.css`, sets xyflow's own documented `--xy-*`
  theming variables (minimap background/mask/node fills, control button
  fill/hover/border/icon colour) to `var(--token)` references only — never
  a hex literal (`tokenSheet.test.ts` enforces this repo-wide) — and drops
  the controls' box-shadow (UI-DIRECTION: depth is a surface step +
  hairline, never `box-shadow`).
- **The maths graph's canvas search pans to a hit instead of only
  highlighting it (2026-09-08, decision 42).** `GraphCanvas.tsx` now wraps
  itself in a `ReactFlowProvider` (needed for `useReactFlow`'s viewport
  control from the toolbar, which sits outside `<ReactFlow>`'s own
  subtree) and centres the first matched node with `setCenter` whenever
  the search query changes matches — a match hidden inside a collapsed
  cell centres on that cell's own closed-subsheet node instead, since the
  matched card itself is not on the canvas. With ~50 definitions expected,
  a search that only highlights without navigating was barely better than
  none.
- **The maths graph draws a KiCad-subsheet frame around a subgraph instead
  of just deleting its internal cards on collapse (2026-09-08, decision
  43).** `model/graphSubgraphFrame.ts` (pure, tested) computes an expanded
  cell's boundary box from its member nodes' canvas positions and, for a
  collapsed cell, a synthetic node's centroid position plus its named
  input/output ports (resolved from `GraphModel`, not raw ids).
  `graph/SubgraphFrameNode.tsx` draws the dashed boundary box behind an
  expanded cell's cards; `graph/SubgraphCollapsedNode.tsx` draws the closed
  subsheet — one node, the cell's label, and a `Handle` per named port on
  its left/right edge. `GraphCanvas.tsx` now hides a collapsed cell's
  output cards too (not just the internal ones `visibleNodeIds` already
  hid) and rewires any edge that touched one onto the synthetic node's
  matching port handle, so collapsing never drops a cell's cards off the
  canvas with nothing left to show it was ever there.
- **Three of decision 45a's five gestures wired to the maths graph canvas
  (2026-09-08, w32-maths, ruling R147 follow-on — the five `graphEdits.ts`
  mutations landed with Tasks 3-9 but were reachable from no UI gesture
  until now).** Double-click a card's name to rename (calls
  `graphEdits.ts`'s `renameDefinition`; when it reports an unresolved
  reference — R145's custom-`js`/prose case — a dismissible notice names
  the affected cell(s), so a rename never presents itself as complete when
  it isn't). Click a call's literal argument to edit it in place (`edit
  LiteralArg`). Drag an edge's endpoint onto a different node to rewire
  that one input (`rewireInput`, via xyflow's native edge-reconnection
  gesture, `onReconnect` — not a fresh `onConnect`, since every edge here
  already names a `[Name]` reference the document owns; "connect" only
  ever means "replace which reference an existing edge names"). Every
  commit round-trips through the same `onCommit` prop drag-to-reposition
  and the chart button already used. **Two gestures and the details pane
  remain unwired, flagged not attempted:** drag-a-channel-from-the-list
  has no channel-list UI to drag *from* at all yet (a prerequisite gap,
  not a wiring gap — the survey's own gap list item 10); a card click
  still opens the owning *cell's* code editor (`EditorPanes`), not a
  focused per-node details pane (decision 45a's own first half) — building
  a real one needs new UI, not a rewire of an existing prop.
- **`app/src/routes/pages/Notebook/model/graphSubgraph.ts`: subgraph
  collapse/expand and canvas search (2026-09-08, w32-maths Task 12, spec
  exists — C2 §3.7.3, decisions 42/43/77, no spec change needed).**
  `subgraphsFor` computes each math cell's input/output/internal node ids
  directly from `GraphModel.edges`' cell membership; `visibleNodeIds` hides
  a collapsed cell's internal-only nodes (decision 39, read at cell scope)
  while its inputs/outputs (referenced elsewhere) stay visible;
  `searchNodeIds` matches a query against each node's display name
  (`# label:`, falling back to the identifier), case-insensitively, `[]`
  for a blank query. Wired into `GraphCanvas.tsx`: a search box highlights
  matching cards (a `--hivis` border, no hex literal); one collapse/expand
  toggle per subgraph in a toolbar row. `MiniMap`/`Controls` were already
  present from Task 8. Desktop-only (decision 77): `Notebook/index.tsx`'s
  existing narrow-width signal (`editorPlacement.ts`'s `placement ===
  "sheet"`) now also hides the Graph toggle and forces the cell list, so
  the Properties pane's narrow `BrandSheet` behaviour is unaffected.
  **Two flagged gaps:** `subgraphsFor`'s "output" definition only covers
  dependency edges between math cells — a definition charted only by a
  `js` cell or interpolated only in prose (§3.7.3's other two "output"
  cases) is classified internal and hides on collapse, since `graphModel.ts`
  doesn't track either kind of external reference (Task 5's own scope).
  Collapse/expand is a toolbar list, not a visual frame drawn around a
  cell's cards on the canvas itself — xyflow's parent/child node grouping
  (positioning, resizing, a group node type) was out of this task's budget.
- **`Notebook/graph/graphToChart.ts`: node → chart (2026-09-08, w32-maths
  Task 11, spec exists — C2 §3.6.6, decision 83, no spec change needed).**
  `insertChartCell` appends a `plotForm/generate.ts`-generated `js` cell
  charting a node by name (no `id=` attribute — C2 §2.2 leaves that to
  Rust's next parse); `chartEligibilityFor` gates a card's chart button on
  a chartable rank-≤1 shape or the one `spectrogram(...)` raster exception
  (§3.6.6). Wired: `NodeCard.tsx` shows a "Chart" button when eligible;
  `GraphCanvas.tsx` calls `insertChartCell` and `onCommit`s the result.
  **Two real gaps, flagged not resolved (see the lane's report):** the
  chart button fires with a fixed `"lineY"` mark — decision 83's
  chart-type-selector/idl0-pictograms step is not built, so this is one
  gesture, not two; and the output-port drag-into-notebook-column gesture
  has no drag-and-drop UI at all (only the same pure `insertChartCell` it
  would call). `chartEligibilityFor` also cannot yet detect "rank ≥ 2 and
  not `spectrogram`" at all — §3.6 is spec-only in `core` — so decision
  58's actual "reduce it first" slot is unreachable; every not-yet-known
  shape reads `"unknown"` and shows no chart button, never a guess.
- **The maths graph wired into `Notebook/index.tsx` (2026-09-08, w32-maths
  Task 10, spec exists — C2 §3.7, no spec change needed).** A "Graph"/
  "Cells" toggle switches the main content area between the existing cell
  list and a new `GraphCanvas`, both views of the same open workbook
  (decision 40) — never a second document. A card click calls the new
  `GraphCanvas` `onSelectCell` prop, which opens the node's owning cell in
  `EditorPanes` through the existing `selectedCellId` mechanism (no new
  editor path). `onCommit` dispatches `workbookState.ts`'s new
  `editFrontMatter` action: updates `markdown`/`cells` and sets the new
  `frontMatterDirty` flag (which `WorkbookBar`'s `dirty` prop now also
  watches) **without** touching `dirtyCellIds` — a moved node must not
  re-arm the debounced re-eval effect, since nothing in the `graph` key
  feeds a value (§3.7.1's advisory guarantee). `dirtyCellIds` empty must
  keep meaning "no re-eval pending", not "nothing to save", which is why
  this is a second flag rather than folded into the first. New pure
  `model/graphView.ts` derives `GraphCanvas`'s `sessionDetails` (keyed by
  session id, from the page's per-window `SessionDetail` map) and
  `outputs` (the primary window's `CellOutput[]`, `[]` if unresolved or
  the window's whole call failed) — kept out of the 2000-line component so
  the derivation itself is unit-tested.
- **`app/src/routes/pages/Notebook/model/graphEdits.ts`: every graph
  mutation as pure text-in/text-out over `replaceCellBody` (2026-09-08,
  w32-maths Task 9, spec exists — C2 §3.7.3, no spec change needed).**
  `renameDefinition` (the def_line identifier + every `[OldName]` reference
  across every math cell, plus the `graph.nodes` position entry, in one
  pass — §3.7.3's one deliberate exception to "no pane writes both"),
  `rewireInput` (one definition's own reference only), `editLiteralArg`
  (re-serialises a single outer call canonically), `addNodeFromChannel`,
  `deleteNode` (never prunes a stored position — §3.7.1's orphan rule).
  Every def_line/comment classification reuses `tokenizeMath`, never a
  second parser (R140). **Scope originally flagged, since ruled — see
  "Fixed" above (R145):** `renameDefinition` now also rewrites
  `plotForm`-generated `js`-cell channel references and reports every
  reference it could not update.
- **`Notebook/graph/`: the maths graph canvas (2026-09-08, w32-maths Task 8,
  spec exists — C2 §3.7, no spec change needed).** `GraphCanvas.tsx` (React
  Flow, `@xyflow/react`, CSS imported from `node_modules` — no CDN) renders
  one `NodeCard.tsx` per `GraphModel` node, positioned by the document's
  stored `graph` key or `graphAutoLayout.ts`'s fallback, coloured by
  `graphStatus.ts`. Dragging is entirely local (`useNodesState`); only
  `onNodeDragStop` calls the new `dragCommit.ts`'s `commitDrag` (rounds to
  the nearest integer before writing — §3.7.1's `position_entry` is
  integer-only, and a raw float would malform the whole key on the next
  read) and hands the caller the new markdown — no IPC on the interaction
  path. `portShape.ts`'s `shapeOf` resolves only the two shapes
  `HostChannelRef`'s `{length, has_t}` can honestly distinguish (`[]`,
  `[t]`); everything else — no evaluation yet, or a shape `core` hasn't
  implemented — is `"unknown"`, never guessed (C2 §3.7.4, R135 Open Q1). A
  `"channel"` node never commits a drag (no stored-position home, §3.7.1).
  **Gap, not fixed here:** `CellDefResult` carries no unit (survey §1.2's
  own finding) — `NodeCard` has nothing to show for it and omits that row
  rather than fabricate one.
- **`app/src/routes/pages/Notebook/model/graphStatus.ts`: per-node status
  glyph from `WorkbookState.windows` (2026-09-08, w32-maths Task 7, spec
  exists — C2 §3.7, decisions 44/R121/R131/R132, ruling R141, no spec
  change needed).** `computeNodeStatuses` worst-wins across the current
  selection (`error` > `grey` > `pending` > `ok`), names the split
  ("2 of 3 windows", R132) when selected windows disagree, and excludes a
  whole-window failure (`WindowEvalState.kind === "error"`) from every
  node's aggregation — `bannerWindows` names those separately for a
  canvas-level banner instead of fifty identical ×s. Decision 44's grey-vs-
  red split reuses `jsCellBinding.ts`'s `findChannel` (newly exported, R141
  Q1) rather than a second "does this name resolve" predicate; a channel
  reachable from no selected session is a red × (typo), one present on some
  selected session but not another greys — and every node reachable
  forward from it greys too for the windows lacking it, even where core's
  own evaluation legitimately reports `UnknownChannel` for that window.
  Selection (`SelectedWindow[]`) supplies the per-window denominator `windows`
  can't (R141 Q2 — an absent `windows` entry already means "pending"; this
  module never gives absence a second meaning by synthesizing an entry).
- **`app/src/routes/pages/Notebook/model/graphAutoLayout.ts`: deterministic
  layered auto-layout for the maths graph (2026-09-08, w32-maths Task 6,
  C2 §3.7.1's "view's own fallback algorithm", no spec change needed).**
  `computeAutoLayoutPositions` places every node at a column equal to its
  longest dependency chain, row order following `GraphModel.nodes`'s
  document order; a `"definition"` node's stored `graph.nodes` position
  (§3.7.1 — `"channel"` nodes have no stored-position home at all) always
  wins. A dependency cycle (invalid per core, but not this rendering
  fallback's to reject) terminates rather than recursing forever.
- **`app/src/routes/pages/Notebook/model/graphModel.ts`: builds the maths
  graph's `{nodes, edges, groups}` from markdown + `CellOutput[]`
  (2026-09-08, w32-maths Task 5, spec exists — C2 §3.7.3, no spec change
  needed).** One node per `def_line` (decision 40: the file is the source
  of truth), one `"channel"` node per name referenced but not defined
  anywhere in the document, one edge per `mathExpr.ts` reference, one group
  per math cell in document order carrying its §3.7.3 `# label:` display
  name. A definition's label prefers a completed evaluation's
  `CellDefResult.label`, falling back to this module's own `# label:` scan
  when no window has evaluated it yet — a node exists and is wired before
  its first evaluation, never only after. `def_line` splitting is built
  entirely on `mathMode.ts`'s `tokenizeMath`, mirroring `cells.ts`'s
  non-authoritative fence-scan precedent (R52 Q3(a)) one grammar layer up.
- **`app/src/routes/pages/Notebook/model/mathExpr.ts`: a narrow C2 §3.2 scan
  of one expression's references and outer call (2026-09-08, w32-maths Task
  4, spec exists — C2 §3.2/§3.7.4, no spec change needed).** `scanMathExpr`
  builds `refs` entirely on `mathMode.ts`'s `tokenizeMath` (no second
  tokenizer of the grammar) and recognises an outer call only when the whole
  expression is exactly one C2 §3.3 catalog-function call; anything else —
  an operator expression, a call wrapped in more, a call to a name outside
  the catalog (including the not-yet-catalogued §3.6 reduction functions:
  `argmax`/`at`/`nearest`/`slice`/`axes`/`broadcast`/`align`) — is an opaque
  expression, `call: null`, still wired by its `refs`.
- **`app/src/routes/pages/Notebook/model/graphLayout.ts`: pure read/write of
  the C2 §3.7.1 `graph` front-matter key (2026-09-08, w32-maths Task 3, spec
  exists — C2 §3.7, no spec change needed).** `readGraphLayout`/
  `writeGraphLayout` operate on `scanCells`'s `frontMatterRange` byte range
  only — no cell body, no other front-matter key. Reading is strict to
  §3.7.1's EBNF; anything else under `graph:` reads as `EMPTY_GRAPH_LAYOUT`
  (malformed ⇒ absent, per contract) and writing then replaces that block
  wholesale rather than merging into it.

- **`Notebook/model/xMode.ts`: decision 54's worksheet-level X mode, shipped
  with distance present and disabled (2026-09-08, w32-time Task 13, ruling
  R136, spec-during).** `XMode = "time" | "distance"`; `X_MODE_OPTIONS`
  always lists both, `"distance"` carrying a stated `disabledReason` (R136:
  a naive cumulative-distance axis would silently misalign laps with
  different lines through the same corner — the real fix is a per-venue
  reference-path alignment, filed as its own core lane) — never omitted,
  never silently falling back without saying why (plan §5 Q5). `resolveXMode`
  is the one place that "is this mode actually runnable" predicate lives,
  used both by `notebookPrefs.ts`'s reader (a stored `"distance"`, or a
  document from before this field existed, both read as `"time"`) and by
  `Notebook/index.tsx`'s own `setXMode` (so passing an unselectable mode
  through code, not just through the UI, can't take effect either).
  `NotebookPrefs` gains `x_mode: XMode`, persisted in the existing
  `idl1.notebook.ui.v1` document beside `input_map_preset_id`. `index.tsx`
  renders a plain `<select>` (matching Task 5's own input-map picker), the
  disabled option's `title` showing the reason as a tooltip. Selecting
  "Time" is presently a no-op — nothing yet reads `xMode` to change what a
  chart shows, since there is no distance axis to switch to; the setting
  exists so a future core distance-axis lane has a place to read from
  without another prefs-shape change.
- **`Notebook/interaction/PlaybackTransport.tsx`: speed select + mode toggle
  + the followed window's name (2026-09-08, w32-time Task 12, decision 57,
  ruling R134 item 6, spec-during).** UI only — every decision it makes
  reuses Task 10/11's own tested pure functions, nothing new to unit-test.
  A `Select` (shadcn/radix, matching the rest of the app's chrome) lists
  `playback.ts`'s `PLAYBACK_SPEEDS`, calling `setSpeed` through
  `Notebook/index.tsx`'s existing `setPlayback`; a `Pin`/`PinOff` icon
  button toggles `playbackMode` between `"cursor-fixed"` and
  `"scroll-at-edge"` (Task 11), with `aria-pressed`/`aria-label`/`title` all
  naming the *current* mode and what clicking does, not just an icon.
  `followingWindowLabel` reuses `model/jsCellNote.ts`'s `primaryWindowNote`
  through the same `cellListWindowNote` value the cell list already computes
  (R132's own precedent) — `null`, no label, with zero or one window
  selected; the primary window's own descriptor label otherwise, so the
  transport and the cell list agree word-for-word on which window a reader
  is looking at (R134 item 6: "playback follows the primary window ...
  the transport names which window it is following").
- **`Notebook/interaction/playbackMode.ts`: decision 57's two playback modes
  (2026-09-08, w32-time Task 11, decision 57, spec-during).**
  `advanceForMode(viewport, cursorTUs, deltaUs, mode)` replaces the
  unconditional `advanceViewportByTime` call `ChartCell.tsx`'s shared-cursor
  effect used to make: `"cursor-fixed"` is that same call, unchanged (the
  cursor stays put, the chart pans under it); `"scroll-at-edge"` — the
  default — holds the viewport still while the cursor crosses it and pages
  forward by exactly one viewport-width once the cursor reaches the right
  edge, looping (not jumping once) so a long frame gap that skips more than
  one page still lands on the page actually containing the cursor.
  `ChartCell.tsx` gains a `playbackMode` prop threaded from a new
  `Notebook/index.tsx` state slot (default `"scroll-at-edge"`, decision 57
  names it first); the shared-cursor effect's dependency array gained
  `playbackMode` alongside the existing data-only `[cursorTUs, playing,
  sessionSpanUs]` (operating brief §4) — no function prop, no cancelling
  cleanup. The mode's own select control is Task 12.
- **`Notebook/interaction/playback.ts`: selectable speed set + play stops at
  the primary window's own end, not the whole session (2026-09-08, w32-time
  Task 10, decision 57, ruling R134 item 6, spec-during).**
  `PLAYBACK_SPEEDS` names the offered rates (`0.25×`…`4×`) and `setSpeed`
  changes `PlaybackState.speed` without touching `tUs`/`playing` (wiring a
  select onto it is Task 12). `playableSpanUs(window: AbsoluteSpan | null)`
  converts `model/viewportWindows.ts`'s resolved `AbsoluteSpan` to `tick`'s
  bigint `spanUs` bound, `null` — never a fabricated `[0, 0]` — while the
  span hasn't resolved; `tick` itself needed no change, since it already
  took an arbitrary bound (only its caller assumed `[0, sessionSpanUs]`).
  `Notebook/index.tsx`'s RAF loop now reads the **primary selected window's**
  own resolved span (`windowSpanFor`, the same single "resolved" predicate
  R138 unified the channel-bind gate on) via a ref, so a lap window's
  playback stops at the lap's own end rather than running to the end of the
  recording; a window that starts partway through the session (a lap other
  than the first) plays from *its own* start, not `0`. `handleTogglePlay`
  now seeds `tUs` from the playing window's own start when no manual cursor
  is set, so resuming play on a freshly selected lap can't stall immediately
  at the start bound because the clock was still at a previous window's
  wherever-it-was. R134 item 6: playback follows the *primary* window when
  several are selected; naming that window in the transport is Task 12.
- **`Notebook/model/cursorCard.ts` + `Notebook/components/CursorCard.tsx`:
  cursor value card, one row per overlaid window (2026-09-08, w32-time
  Task 7, decision 55, ruling **R139**, spec-during).** First shipped wired
  to the primary window only (`ChartCell.tsx` tracks decoded tiles for only
  the primary window at the host level, R69(d)'s own TODO) with an R132
  label naming the gap; ruled against (R139) because a comparison workflow
  is the whole point of the card, and a single-window card would read as
  "done" in this changelog while the gap gets rediscovered as a bug rather
  than remembered as a TODO. **Fixed per R139's own answer: retain the
  combined payload, not per-window tiles.** `channelBindDriver.ts` already
  builds one combined `{t, v, w, windows}` typed-array payload per (cell,
  channel) — every selected window's own decimated samples, concatenated,
  `w[i]` naming which window (R127/R129) — immediately before handing it to
  the sandbox via `setChannelHostVar` and dropping it. It now also
  dispatches a **retained** copy (`CombinedChannelPayload`, `spans` aligned
  1:1 with `windows` from the same filtered pass, no second `SessionDetail`
  resolution — R138's lesson), cloning the buffers actually handed to
  `setChannelHostVar`'s transfer list first (`postMessage` detaches whatever
  buffer instance it moves — the retained copy must be a different one).
  `Notebook/index.tsx` keeps one payload per `${cellId}::${channelId}` in a
  ref (`combinedChannelDataRef`), passed to `ChartCell` as a new
  `combinedChannelData` prop. `cursorCardRows` (was `cursorCardRow`) filters
  that payload by `w` at the cursor's window-relative offset: a window
  whose offset has run past its own resolved end is **omitted entirely**
  (decision 55's "renders absence" — not a row holding a stale value,
  ruling R131 Q2), while a row within a window's span but with no nearby
  sample renders `value: null` (R31's "no data", distinct from the omitted
  case). No new fetch and no IPC on hover (P2) — the arrays are already in
  host memory at hover time.
- **`Notebook/model/timelineStrip.ts`: pure master-timeline-strip model
  (2026-09-08, w32-time Task 8, ruling R134 item 1, spec-during).**
  `stripLanesFor` builds one `StripLane` per selected window (never one
  merged lane) from `Notebook/index.tsx`'s existing
  `sessionDetailsByWindow`/`sessionSpanUsByWindow` maps, skipping any window
  whose own session span hasn't resolved (the module's own no-sentinel
  rule, matching Task 3). Each lane's background/edit surface is that
  window's own *session's* full recorded duration (decision 52), with its
  own currently-resolved span (session/lap/range, via `windowSpanFor` —
  R138's "one definition of resolved") drawn as the highlighted,
  handle-bearing region inside it. `pxForTimeUs`/`timeUsForPx` convert
  between lane-relative µs and strip px; `hitTestHandle` finds which
  boundary handle (if any) a pointerdown lands on; `dragCandidate` computes
  the candidate `range` a drag would produce, clamped to the lane's own
  session and floored at a 1 ms `MIN_RANGE_US` (R119/R120: a drag can never
  mint an inverted or sub-µs range, even one legal in pixels at a zoomed-out
  scale); `bracketForLane` re-bases the worksheet's shared viewport
  (`sharedViewport.ts`) onto each lane via the same `mapViewportToWindow`
  `channelBindDriver.ts` already uses for fetches, so the strip's bracket
  and the data actually fetched can never disagree.
- **`Notebook/model/timelineStrip.ts`'s `timelineCommit`; `Notebook/components/TimelineStrip.tsx`
  (2026-09-08, w32-time Task 9, ruling R115/R134 item 3, spec-during).**
  `timelineCommit(windows, laneIndex, candidate)` replaces one selected
  window's `span` with the dragged `range` — the same object a lap click
  mints (R115) — regardless of what kind of span it replaces; converting a
  `"lap"` window's span to `"range"` changes its visible label for free
  (`state/selection.ts`'s `describeWindow` already switches on `span.kind`,
  so no separate "trimmed" flag is needed — R134 item 3's "the label must
  change visibly"). `TimelineStrip.tsx` renders `stripLanesFor`'s lanes at
  the top of the worksheet, drags a handle locally frame-by-frame (no
  dispatch, no refetch) and calls `timelineCommit` — dispatched via
  `SET_WINDOWS` — once, on pointer-up only (§3.1: a boundary drag re-runs
  `eval_workbook_v2` per window and re-fetches every bound channel, so it
  must not run per frame).
- **`Notebook/model/viewportWindows.ts`'s `cursorTimeInWindow` + `cursorBus.ts`/`ChartCell.tsx`
  wiring: the worksheet cursor is window-relative (2026-09-08, w32-time Task
  6, ruling R131 Q2, spec-during).** `cursorTimeInWindow(offsetUs, window):
  number | null` resolves an elapsed-µs offset from a window's own start to
  an absolute instant *within that window*, `null` once the offset runs
  past a shorter window's own end (decision 55's "renders absence" —
  mirrors `mapViewportToWindow`'s own clamp, for a single instant rather
  than a span). `cursorBus.ts`'s `tUs` is redocumented as that offset from
  the *primary* window's own start, not session-relative µs as before this
  task — carrying an offset, not an absolute instant, is what lets the same
  cursor value later be re-applied against any other selected window's own
  start (task 7's value card). `ChartCell.tsx` converts at the boundary:
  `handlePointerMove`/`handlePointerLeave` subtract the primary window's own
  `startUs` before publishing to the bus, `handlePointerUp`'s click path
  does the same before `cursorBus.pin` (leaving `onSetCursor`'s existing
  absolute-µs contract to `Notebook/index.tsx`'s `manualCursorTUs`
  untouched), and the hover-line subscriber adds it back via
  `cursorTimeInWindow` before `pixelXForTUs`. The primary window's own span
  is taken as `{startUs: 0, endUs: sessionSpanUs}` — a documented judgment
  call: `ChartCell` only ever mounts the primary window's bound channel
  today (R69(d)'s own TODO) and that window's gesture viewport is already
  session-absolute µs from `0` (`jsCellBinding.ts`'s `initialSpan`), so this
  is exactly the primary window's own span whenever it is `"session"`-kind
  (today's default) and byte-identical to before this task; a primary
  window of `"lap"`/`"range"` kind needs its own resolved span threaded in
  as a future prop, out of this task's file list (`Notebook/index.tsx`
  untouched).
- **`Notebook/model/sharedViewport.ts` + `index.tsx` wiring: one worksheet-shared
  X range (2026-09-08, w32-time Task 4, decision 52, spec-during).**
  `SharedViewport {startUs, endUs}` is a `Viewport` with the pixel width
  removed; `viewportForCell(shared, pixelWidth)` re-attaches a given chart's
  own width, `commitSharedViewport(viewport)` drops it. `Notebook/index.tsx`
  holds `sharedViewport: SharedViewport | null` (`null` — never a sentinel —
  until the first gesture settles anywhere); every mounted `ChartCell`'s
  `viewport` prop reads through `viewportForCell` once it is set, falling
  back to that cell's own `binding.initialSpan` before the first settle
  (bindings can legitimately open to different spans). `onViewportSettled`
  now (1) commits the shared range from whichever chart's gesture just
  settled, and (2) loops every *other* time-bound `js` cell and re-runs
  `runChannelSettle` for it at that same range and each chart's own
  `DEFAULT_CHART_WIDTH_PX` (every chart renders at that one constant width
  today) — "every chart re-fetches," not only the one that gestured, so no
  chart is left showing tiles for a viewport its own prop has already moved
  past. Deliberately calls `runChannelSettle`, never `runChannelBind`, for
  the other cells — the latter would silently snap them back to their own
  `initialSpan` instead of the range the user just navigated to. `tiles`
  stay per cell in the existing `chartWindows` map; only the time range is
  shared.
- **`Notebook/interaction/gestureVerbs.ts` + `ChartCell.tsx` wiring: the
  R137 input map is live (2026-09-08, w32-time Task 5, spec-during).**
  `ChartCell`'s drag/wheel handlers now read `inputMap.ts`'s presets
  through `dragActionFor`/`wheelActionFor` (via `classifyPointerDown`/
  `classifyWheelEvent`) instead of a hard-coded shift-drag-pans branch —
  decision 56's plain-drag-zooms-to-region default now actually ships, and
  which drag/wheel-family gesture pans, zooms or does nothing is entirely
  the active preset's call. A single `dragStateRef` (replacing the old
  separate `draggingRef`/`rectDragRef`) records the `GestureAction` decided
  once at pointerdown and replays it for the rest of that gesture, so a
  mid-drag preset switch never changes an already-started gesture; a
  release under `CLICK_MAX_MOVEMENT_PX` still pins/unpins the cursor
  regardless of which action the drag was bound to. `horizontalWheelActionFor`
  documents and resolves the one real ambiguity: a trackpad's two-finger
  horizontal scroll and a physical second wheel notch (the MX Master's)
  report the identical DOM `wheel` event, so a `deltaX`-dominant wheel event
  tries `horizontalWheel` then falls back to `twoFingerPan` rather than the
  handler ever branching on which preset is active. `Notebook/index.tsx`
  holds the selected preset as React state (`inputMapPreset`, default
  `BASIC_MOUSE_PRESET` — a documented judgment call, no default is named in
  R137 or decision 56), initialized from and persisted through
  `notebookPrefs.ts`'s new `input_map_preset_id` field, and exposes a plain
  `<select>` next to the playback transport — switching it re-renders every
  mounted `ChartCell` with the new preset object, so the very next gesture
  reads it with no reload (R137: "takes effect immediately"). No sentinel:
  `input_map_preset_id: null` means "no choice persisted yet", read the
  same way `findInputMapPreset` already treats an unknown/dropped preset id
  — the caller's own `?? BASIC_MOUSE_PRESET` fallback, never a value baked
  into the prefs document.
- **`Notebook/interaction/inputMap.ts`: pure gesture input-map presets
  (2026-09-08, w32-time, ruling R137, spec-during).** A table from pointer/
  wheel event kind (`drag`/`shiftDrag`/`wheel`/`horizontalWheel`/`pinch`/
  `twoFingerPan`) to action (`pan-x`/`zoom-x`/`zoom-region`/`none`), three
  shipped presets (`TRACKPAD_PRESET`, `TWO_WHEEL_MOUSE_PRESET`,
  `BASIC_MOUSE_PRESET`) and `findInputMapPreset`/`actionFor`. Decision 56's
  drag-to-zoom-region default holds in every preset (asserted in the test).
  R134 item 2's "shift-drag pans" is withdrawn by R137 and now lives only
  in `BASIC_MOUSE_PRESET`'s own binding. Wired to `ChartCell`'s gesture
  handler by Task 5, above. Renderer-only preference — belongs in user
  prefs, never a workbook, never synced.
- **`Notebook/interaction/cursorFollowPolicy.ts` and `ChartCell.tsx` wiring:
  the pointer-following cursor (2026-09-08, w32-time Task 2, spec-during).**
  Direction-2 decision 51's first half — the cursor follows the pointer
  across every chart, a click pins it, a click on the pinned instant unpins.
  `cursorFollowPolicy(eventKind, pinned, pinnedTUs, pixelX, viewport)` is
  the pure verb decision (`publish`/`pin`/`unpin`/`nothing`), reusing
  `model/cursor.ts`'s `cursorRequestFor` for the pixel→time mapping.
  `ChartCell`'s pointer handlers call it and publish to the shared
  `cursorBus` (Task 1) — hover never touches React state; each cell's new
  hover-line element subscribes and repositions itself imperatively. Click
  still mirrors `pin`/`unpin` into `Notebook/index.tsx`'s existing
  `manualCursorTUs` React state (settle-grade, per `cursorBus.ts`'s own
  doc comment), so playback/readout/context-menu are unaffected.
- **`Notebook/interaction/cursorBus.ts`: pure worksheet cursor pub/sub
  (2026-09-08, w32-time Task 1, spec-during — spec section lands with the
  lane, no spec change in this commit).** `CursorState {tUs: number | null,
  pinned: boolean}`, `publish`/`pin`/`unpin`/`subscribe`; no React, no DOM,
  no timers, so cross-chart cursor propagation (direction-2 decision 51)
  never re-renders `Notebook/index.tsx` at pointer rate — mirrors R69.2's
  imperative `transform` push. `tUs` is `number` (µs), not `bigint`, per
  ruling R134/plan §2.2's documented boundary.
- **`app/src/state/selection.ts`: pure selection module for C1 §6.1
  time-window selection (2026-09-08, s1-ts Task 7, spec exists — C1 §6.1,
  no spec change needed).** `SelectionWindow`/`Span` (session-relative
  `t0Us`/`t1Us`, per C1 §6.1 and ruling R117 item 1), `windowKey` (identity
  by `sessionId` + `span`, never `colour`, so a repeated `sessionId` with a
  different lap/range is never collapsed — R117 item 2), `nextWindows`
  (`"replace"`/`"add"`/`"toggle"` modifiers), `assignColour` (cycles the
  eight `--chart-1…8` tokens, never a hex literal — R117 item 6; wraps past
  eight windows), and `describeWindow` (top-bar chip label). No React, no
  IPC — dependency-free, following `shell/columnVisibility.ts`'s pattern so
  vitest's `node` environment can resolve it. `AppState.tsx` wiring is
  Task 8, not this commit.
- **`state/AppState.tsx`'s selection slice and `ipc/workbook.ts`/`ipc/rasters.ts`'s
  `_v2` selection commands (2026-09-08, s1-ts Tasks 8–9, C1 §6.1/C3
  §3.4/§3.6, no spec change needed — the spec already landed with Task 1).**
  `Selection` is now `SelectionWindow[]` (`initialSelection = []`); the old
  `{ sessionId, lapContext }` shape is deleted outright (ruling R111 — one
  representation). `SET_SELECTED_SESSION`/`SET_LAP_CONTEXT` are replaced by
  `SET_WINDOWS`/`TOGGLE_WINDOW`/`SET_WINDOW_COLOUR`, each delegating to
  `selection.ts`'s pure functions — the reducer holds no selection logic of
  its own. `selection.ts`'s `describeWindow` now takes a `sessionName`
  argument instead of formatting the raw `sessionId` — a hex session id
  must never reach the UI; the caller resolves the name from the catalog.
  `ipc/workbook.ts` gains the wire `Window`/`Span` types, `evalWorkbookV2`
  (returns one `WindowEval` — `{ ok: CellOutput[] } | { error: IpcError }`
  — per window, per ruling R121's per-window error attribution) and
  `fetchHostChannelV2`; `ipc/rasters.ts` gains `fetchFftV2`. The `LapContext`
  wire type and the `evalWorkbook`/`fetchHostChannel`/`fetchFft` wrappers
  are deleted (the Rust commands stay registered but unused, per C3 §5's
  one-revision deprecation). **Breaks `tsc` in `routes/pages/Data/index.tsx`,
  `shell/TopBar.tsx` and `routes/pages/Notebook/**` until Tasks 10–13 land**
  — those files still read the deleted `Selection` shape and call the
  deleted wrappers; out of this task's scope by dispatch.
- **`Notebook/model/openEvalDriver.ts` and `sessionSpanDriver.ts` moved onto
  `windows`/a single `Window` (2026-09-08, s1-ts Task 10, C1 §6.1, ruling
  R117/R121, no spec change needed).** `runOpenAndEval`/`runEval` take
  `windows: Window[]` and call `evalWorkbookV2`; per ruling R121 a per-window
  failure must not blank the other windows, so each `windows` entry now
  dispatches its own `evalWindowResult`/`evalWindowError` (a new
  `OpenEvalWindowAction`, carrying the originating `Window`) instead of one
  flat `evalResult`/`evalError` — the old pair (`workbookState.ts`'s
  `WorkbookAction`) had no per-window slot and is left untouched for the
  workbook-wide `handleOpened`/`markdownReady`/`markdownError` actions,
  which are unaffected by windows. `windows: []` still dispatches
  `evalWorkbookV2`'s one "nothing selected" result, paired with `window:
  null`. `sessionSpanDriver.ts`'s `runSessionSpan` takes a single `Window |
  null` (was `sessionId: string | null`) — per-window: a caller with
  several selected windows calls it once per window, its own
  `isStale`/dispatch pair.
- **`fftRequest.ts`/`jsCellBinding.ts`/`jsCellNote.ts` intentionally left
  unmigrated this task (2026-09-08, s1-ts Task 10) — reported, not
  guessed.** The sandbox host-variable model (`SandboxHost.setChannelHostVar`/
  `setSpectrumHostVar`, one whole-notebook `SandboxHost`/iframe) keys every
  bound series by a bare `channelId` or `spectrumKey(channelId, fftParams)`
  — neither qualified by session or window. Two selected windows over the
  same channel (R117 item 2: the *normal* case, e.g. lap-to-lap comparison)
  would silently collide on the same host-variable name, with the
  last-dispatched window's data overwriting the other's — a wrong-numbers
  bug (section D), not a missing feature. Resolving it needs either a
  windowKey-qualified host-variable naming scheme or a `SandboxHost` per
  window, both C3/sandbox-protocol-shaped decisions reserved for the lead.
  `fftRequest.ts` was left with its old `lap: number | null` (not `window:
  Window`) because its only caller in this lane, `jsCellBinding.ts`'s
  `bindingForFft`, is itself blocked on the same question — retyping it now
  would only inject a fresh compile break into that unedited file with no
  caller in scope to benefit from it.
- **`fftRequest.ts`/`jsCellBinding.ts`/`jsCellNote.ts` migrated onto windows
  (2026-09-08, s1-ts Task 10 follow-on, C1 §6.1/C2 §5.1/§5.3, ruling
  R127 — spec-during, C2 §5.1/§5.3 amended in this commit).** Resolves the
  collision flagged above. `fftRequest.ts`'s `FftRequest.lap: number | null`
  is now `window: SelectedWindow | null` (matches `fetch_fft_v2`'s actual
  `window: Window` argument); `fftRequestEquals` compares it by content
  (`session_id` + `span`), not identity. `jsCellBinding.ts`'s `bindingFor`
  takes `window`/`windowIndex` in place of `mainLap` — the FFT arm folds
  `windowIndex` into `spectrumKey(channelId, fft, windowIndex)`
  (`plotForm/spectrumKey.ts` gains that parameter, default `0`, and at `0`
  is byte-identical to before, ruling R127 item 3) so *n* selected windows
  over the same channel/`fft_params` publish *n* distinct spectra instead
  of colliding on one host-variable name (item 5); the time arm is
  unaffected (channel names stay bare per item 1) and is still called once
  per session, not once per window. `jsCellNote.ts`'s `sessionId: string |
  null` input is now `windowCount: number` (`0` ⇒ the existing "No session
  is selected" note).
- **`host/protocol.ts`'s `"channel"` host-variable payload gains a window
  dimension; `SandboxHost.setChannelHostVar` and `sandbox/main.ts`'s
  `materializeHostVar` updated to match (2026-09-08, s1-ts Task 10
  follow-on, C1 §6.1, ruling R127 — spec-during, C2 §5.1 amended in this
  commit).** The other half of the collision above: a channel host variable
  is keyed by the definition alone (never window-qualified, item 1), so
  multiple selected windows over one channel must combine into *one*
  `setChannelHostVar` call, not one per window. The payload becomes
  `{ length, t, v, w }` plus a `windows: WindowDescriptor[]` (`{sessionId,
  span, colour, label}`) array, `w[i]` naming which `windows` entry
  produced sample `i` (item 2) — built by the new pure
  `combineChannelWindows`, which concatenates each window's own `{t, v}` in
  order and inserts exactly one `NaN` break row (`t = v = w = NaN`) between
  each adjacent pair (item 4): Observable Plot breaks a line mark at `NaN`,
  so a cell written before multi-window existed, which destructures only
  `{t, v}` and never reads `w`, degrades to *n* separate line segments in
  one colour instead of one line falsely vaulting from one window's last
  sample to the next window's first. A single window (the ordinary,
  pre-existing case) produces no break row and an all-zero `w` — byte-
  identical to before (item 3), proven by `protocol.test.ts`. `sandbox/
  main.ts`'s `materializeHostVar` now returns `{t, v, w}[]` records with a
  non-enumerable `windows` property carrying the descriptor array (reachable
  as `channel(name).windows`, e.g. for a chart's per-window `colour`) —
  additive; a cell reading only `{t, v}` is unaffected. `"spectrum"`
  payloads were, at the time of that commit, deliberately **not** given the
  same columns (item 5) — see the entry directly below, which supersedes
  that call.
- **`spectrumKey`'s `windowIndex` withdrawn; `"spectrum"` host-variable
  payloads gain the same `w`/`windows` shape as `"channel"` instead
  (2026-09-08, s1-ts follow-on, C1 §6.1/C2 §5.3, ruling **R129** amending
  R127 item 5 — spec-during, C2 §5.3 amended in this commit).** The FFT
  addressing gap flagged in the previous commit ("nothing lets a sandboxed
  cell's own code request a specific `windowIndex`'s spectrum") is closed
  by removing the need to address anything: `spectrumKey(channelId,
  fftParams)` drops its `windowIndex` parameter entirely and never varies
  by window again, and `host/protocol.ts`'s `"spectrum"` `HostVarPayload`
  gains `w`/`windows` exactly like `"channel"`'s (ruling R127 item 2/4) —
  `combineSpectrumWindows` combines *n* selected windows' own `{f, m}` into
  one `{length, f, m, w}` array with the same NaN-break rule, sharing its
  implementation with `combineChannelWindows` via one internal generic
  combiner (`combinePairedWindows`). `SandboxHost.setSpectrumHostVar` and
  `sandbox/main.ts`'s `spectrumLookup`/`materializeHostVar` updated to
  match — a spectrum record is now `{f, m, w}` with the same non-enumerable
  `windows` property a channel record carries. A single selected window
  remains byte-identical (both to the pre-multi-window shape and to the
  withdrawn `windowIndex` scheme's own byte-identical `0` case). No C2
  §5.3 grammar change, and none is needed: a cell writes `spectrum("x",
  {...})` and groups by `w`, exactly as it already does for `channel("x")`.
- **`fftDriver.ts`'s interim shim no longer silently widens a `range`
  window to the whole session (2026-09-08, s1-ts follow-on, ruling R129
  finding 2, no spec change needed).** `legacyLapFromWindow` (renamed from
  `lapFromWindow`) now returns a typed `{ error: IpcError }` for a
  `"range"`-spanned `request.window`, dispatched as `fftError` before
  `deps.fetchFft` is ever called, instead of falling through to `lap:
  null` — which meant "whole channel" to the old `fetch_fft` and so
  silently computed the FFT over the entire session for a dragged-range
  selection, indistinguishable on screen from the real thing. `"lap"` and
  `"session"` spans are unaffected (both were, and remain, correct). This
  interim shim still narrows scope until Task 11 migrates the driver to
  `fetchFftV2`; it must never widen it.
- **`Notebook/index.tsx` wired onto the `windows` drivers; FFT charts get
  full multi-window overlay, time-channel charts get an honest single-window
  interim (2026-09-08, s1-ts Task 11a, ruling R131, no spec change needed
  — C1 §6.1/C3 §3.4/§3.6 already cover this).** `AppState.selection` (a
  `SelectionWindow[]`) replaces the deleted `{ sessionId, lapContext }`
  pair everywhere in this page; every IPC-driving effect keys on
  `state/selection.ts`'s new `windowsKey` string, never array identity
  (operating brief §4). `workbookState.ts`'s reducer gained the
  `windows: Map<windowKey, WindowEvalState>` shape R131 specified — the
  `evalWindowResult`/`evalWindowError` actions `openEvalDriver.ts` (Task
  10) already dispatched had no case here and were silently dropped before
  this commit (R131's own finding); a `pruneWindows` action drops a
  deselected window's stale entry (decision 61). `fftDriver.ts` migrated
  to `fetchFftV2`/`Window`, `legacyLapFromWindow` deleted — a `runFft` call
  is now per (cell, window), and `Notebook/index.tsx` fetches every
  selected window's spectrum independently, combines them via
  `host/protocol.ts`'s `combineSpectrumWindows`, and pushes one host
  variable per cell (ruling R129): a window whose fetch fails is simply
  omitted from the combined payload, its message surfacing in that cell's
  note — the other windows' series still render (R121). Time-chart
  channel binding (`channelBindDriver.ts`, still single-window) stays
  exactly byte-identical for one selected window (`w` all zeros, R127 item
  3); selecting more than one window shows a typed cell error on every
  time-bound `js` cell instead of silently rendering `windows[0]`'s data as
  the whole selection — true multi-window overlay for this chart kind is
  Task 11b. `jsCellNote.ts`'s `windowCount` and `sessionSpanDriver.ts`'s
  once-per-window contract (both landed in Task 10) are wired in for real
  here for the first time.
- **`channelBindDriver.ts` (time-chart channel binding) gets full
  multi-window overlay, closing the Task 11a interim (2026-09-08, s1-ts
  Task 11b, ruling R131 Q2, no spec change needed — C1 §6.1 already covers
  this).** New pure module `model/viewportWindows.ts`: `mapViewportToWindow`
  re-bases the current gesture viewport onto one selected window's own
  start, `[window.startUs + a, min(window.startUs + b, window.endUs))`
  (`a`/`b` the offset from the *primary* window's own start) — a window
  shorter than the viewport is clamped at its own end and simply has no
  data past it (absence, never a value held flat to the edge); a mapped
  span with no overlap at all returns `null` and the caller fetches
  nothing for that window. `resolveWindowSpan` resolves a selected
  window's `Span` to that absolute bound against its `SessionDetail`
  (`"range"` verbatim, `"lap"` via `laps[].start_time_secs`/
  `end_time_secs`, `"session"` as `[0, Infinity)` — no per-window recorded
  duration is resolved today outside the primary window, so a `"session"`
  window's own end is never clamped; noted as an interim simplification,
  narrower than what R131 asked for, never wider). `channelBindDriver.ts`
  now takes `windows: BindWindow[]` (`windows[0]` the primary) in place of
  a bare `sessionId`: a `"session"` channel is fetched once per selected
  window at its own mapped span and combined via `host/protocol.ts`'s
  `combineChannelWindows` into one `channelData` action carrying `w`/
  `windows` directly (the caller's interim all-zero-`w` shim is gone); a
  per-window fetch failure (a rejected `fetchTile` or an evicted tile)
  drops only that window's contribution, every other selected window
  still renders (R121) — the channel itself is dropped only if every
  window fails. `BoundChannel`/`ChartCell`'s mounted-channel state
  (`channelRebind.ts`, untouched this task) still describes only the
  primary window's own fetch, matching its existing single-window shape.
  A single selected window is unchanged end to end: `mapViewportToWindow`
  is the identity re-basing and `combineChannelWindows` is byte-identical
  for one series (R127 item 3) — proved by re-running the full
  pre-existing `channelBindDriver.test.ts` suite unmodified except for the
  new `windows` argument. `Notebook/index.tsx`'s two `channelBindDriver`
  call sites (initial bind, gesture settle) now build `BindWindow[]` via a
  new `bindWindowsFor` helper reading the already-resolved
  `sessionDetailsByWindow`; the Task 11a interim multi-window cell error
  (`MULTI_WINDOW_CHART_NOTE`) is deleted.
- **Data tab: session rows are multi-select, laps are selectable for the
  first time, and a per-window colour picker (2026-09-08, s1-ts Task 12,
  ruling R111/R115/R117 item 6/decision 84, no spec change needed).**
  `sessionRow.ts` gains `modifierFromClick` (shift → `"add"`, ctrl/cmd →
  `"toggle"`, plain → `"replace"`) and `sessionRowClicked`, both delegating
  to `state/selection.ts`'s `nextWindows`/`assignColour`; the old
  single-session `nextSelectedSession` is deleted outright. New
  `lapSelection.ts`'s `lapRowClicked` mints a `{ kind: "lap" }` window —
  `DetailPane`'s `LapTable` rows are now clickable, the first UI path ever
  to dispatch a lap selection (R117 item 7's context: `main_lap_window`'s
  indexing defect, fixed in Task 3, had never been exercised because of
  this). New `ColourPicker.tsx`: eight swatch buttons over the `--chart-1…8`
  tokens only (never a hex), shared by `DetailPane`'s header (a selected
  session window) and `LapTable`'s rows (a selected lap window), each
  dispatching `SET_WINDOW_COLOUR` by the window's index in
  `AppState.selection`. `Data/index.tsx` now tracks a `focusedSessionId`
  local state (which row's detail pane is open) separately from
  `AppState.selection` (which windows drive the charts) — a row click
  always focuses that row and (modifier-dependent) updates its window; a
  new effect compares the fetched session list against `selection` on every
  `loadSessions` and drops any window whose session is gone via
  `sessionRow.ts`'s new `dropDeletedSessionWindows`, surfacing a
  dismissable one-time banner (R117 item 5) rather than silently emptying
  a chart. `tsc` is clean for this file; `shell/TopBar.tsx` is the one
  remaining break, closed by Task 13.
- **Top bar: one dismissable chip per selected window, collapsing past four
  (2026-09-08, s1-ts Task 13, ruling R111/R115/R117 item 6, no spec change
  needed — this closes the last `tsc` break the s1-ts lane opened).** New
  `shell/topBarSelection.ts`: `selectionChips` projects `AppState.selection`
  into labelled, coloured, index-keyed chips via `state/selection.ts`'s
  `describeWindow` (never the raw session id — the caller resolves a name);
  `shouldCollapseChips`/`collapsedChipLabel` switch to a single "n windows"
  chip past `CHIP_COLLAPSE_THRESHOLD = 4` (chosen for the bar's fixed 11 px
  height and no room to grow past four dismiss-button-bearing chips — noted
  in the module's own doc comment); `removeWindowAt` drops exactly the
  clicked chip's window by array position, never by `windowKey` match (two
  windows can share one, R117 item 2, and a dismiss must not take both).
  `TopBar.tsx` replaces the old single hardcoded `Session ${sessionId}`
  chip (a raw session id in the UI, the thing R117 item 6 forbids) with
  this, and gains its own `list_sessions` fetch to resolve session names,
  refetching on `windowsKey(selection)` changes (a stable data key, never a
  function-prop dependency — operating brief §4's tightening) so a session
  created after mount still gets a real label once selected. `AppShell.tsx`
  passes a new `onWindowsChange` prop (`SET_WINDOWS`) through for the
  dismiss buttons. `tsc --noEmit` is now clean across the whole tree.

### Fixed

- **S1 pre-merge fix batch: non-primary windows could permanently miss their
  data; non-chart cells now name the window they show (2026-09-08, rulings
  R132/R133, no spec change needed).** `Notebook/index.tsx`'s channel-bind
  and FFT effects' dependency arrays carried only `sessionDetail` (the
  **primary** window's entry) and `windowsKeyValue`, but
  `sessionSpanDriver.runSessionSpan` resolves each selected window's
  `SessionDetail` independently and asynchronously with no ordering
  guarantee — so a non-primary window's detail arriving after the
  primary's re-ran neither effect, and that window silently never got its
  channel data or spectrum. Fixed with `state/selection.ts`'s new
  `sessionDetailsReadinessKey` (a stable string over which selected windows
  currently have a resolved `SessionDetail`, order-of-resolution-independent
  by construction), added to both effects' dependency arrays — **and**,
  per R133, the channel-bind effect's *inner* `boundIdentityRef` gate,
  which the dependency-array fix alone did not reach: that gate compared
  one identity per **cell**, computed from the primary window's binding
  only, so a sibling window resolving never changed it and an
  already-bound cell's channel data for that window was still never
  fetched (the FFT effect's gate was already per-window and needed no
  further fix). `model/channelBindDriver.ts`'s new `updateChannelBindIdentity`
  makes the channel-bind gate per (cell, window) too, mirroring the FFT
  shape. Also, ruling R132: `MathCell`/`TableCell`/`ProseBlock` now take an
  optional `windowNote` prop (`model/jsCellNote.ts`'s new
  `primaryWindowNote`) — with more than one window selected, a non-chart
  cell reading the primary window's value now names it; with zero or one
  window selected, no marker (byte-identical to today). Minor:
  `host/NotebookSession.ts`'s stale doc comment claiming the channel-bind
  effects still gate on `windows.length <= 1` (Task 11b removed that gate)
  is corrected to say what actually stays single-window is `BoundChannel`'s
  own rebuild-replay registration.

- **The sandbox stall watchdog now has a caller (2026-09-07, sandbox-watchdog
  task, no spec change needed).** `host/watchdog.ts`'s ping/pong liveness
  watchdog existed but was never ticked from anywhere, so a runaway cell
  could hang the tab forever with no detection or rebuild. `Notebook/index.tsx`'s
  existing sandbox-mount effect now drives `SandboxHost.tick()` from a
  `setInterval` at the watchdog's own ping cadence
  (`watchdog.ts`'s `PING_INTERVAL_MS`, newly exported); the timer is scoped
  to that effect so its lifetime matches the host's exactly — it starts
  only once a host exists (already gated on `primeState.running`, i.e. the
  Notebook route being visible, R95/R99) and is cleared in the same
  cleanup, before `host.dispose()`. It does not restart across an internal
  `SandboxHost.rebuild()`, since one `Watchdog` instance already outlives
  every rebuild.

### Changed

- **Math values are n-dimensional (2026-09-07, ruling R110, spec-first —
  C2 §3.6 added).** A math value now carries a *shape*: an ordered list of
  named axes (`time`, `freq`, `lap`, `window`, `component`, `index`), so a
  series is `[t]`, a per-lap value `[lap]`, a spectrogram `[t,f]` and an
  iEKF state vector `[t,c9]` — and every one of them can feed further
  maths (UI-DIRECTION-2 decision 45c). Elementwise ops require equal
  shapes (a scalar with anything is the only implicit rank change; there is
  no NumPy-style broadcasting), reductions take an axis as a string literal
  (`mean(spec, "f")`, `mean(x, "t:lap")`), and `argmax(spec, "f")` returns
  the *coordinate* — the peak-frequency line. `spectrogram` becomes
  `Implemented` and returns `[t,f]`; `fft`'s output carries a real
  frequency axis. Shapes are inferred; an optional `# shape: [t,f]`
  annotation checks but never coerces. Charts bind by axis kind and the
  `[t,f]` case reuses C3's existing `fetch_raster` path rather than adding
  a second rasteriser. **Workbook `version` stays `3`**: the extension is a
  strict superset, no migration pass runs, and an older build still opens,
  evaluates its siblings and round-trips such a file (C2 §3.6.8).
  Spec-only — no code in this commit.

- Code pane wraps long lines, so a cell's source stays readable in the
  narrow properties column instead of running off behind a scrollbar.

- **The studio's properties column hosts the real cell editor, not a
  placeholder (2026-09-07, properties-editor task, no spec change needed).**
  R108/R109: the wide-layout studio's properties column previously showed
  `ColumnPlaceholder`'s "reserved for a later lane" text while the real
  `EditorPanes` (Properties/Code tabs) rendered inside the Notebook page's
  own resizable pane. A new shell-level slot (`shell/editorSlot.ts`,
  published by the new `shell/EditorSlotColumn.tsx`) carries the column's
  DOM node to `Notebook/index.tsx`, which portals the same `EditorPanes`
  element into it via `createPortal` and renders no second instance.
  Whether the editor is portal-hosted is decided by slot-node presence
  alone (`model/editorHost.ts`'s `resolveEditorHost`, unit-tested), never by
  the page's own measured width, which inside the studio is only the output
  column's width and can read as medium/narrow while the properties column
  is right there. Medium and narrow placements (inline under the cell,
  Properties `Sheet`) are unchanged when no slot node is published. When no
  cell is selected the column shows a `ColumnPlaceholder` empty-state
  sentence instead of an editor.

- **Notebook studio drops the library column (2026-09-07, notebook-columns
  task, no spec change needed).** R107: Isaac saw the wide-layout studio
  live and judged the library/filter column redundant with the Data tab.
  `RouteHost` no longer passes a `library` child into `ColumnFrame`; the
  remaining wide-layout columns are maths graph | properties | notebook
  output. `ColumnFrame`'s `library` prop is now optional and a new
  `columnVisibility.ts` (`visibleColumnIds`) renders only the columns given
  content — no empty panel, no stray divider handle. `columnPrefs.ts` keeps
  the `library` column id unchanged so a stored `library` width or
  collapsed flag from before this change still loads (clamped, just
  unrendered), and so a future filtering widget can take the slot back.
  `runs/2026-09-06/ui/UI-DIRECTION.md` decision 11's reference layout is
  amended with a note citing R107.

### Fixed

- **Column-divider drag died after one tick (2026-09-07, column-drag task, no
  spec change needed).** `ColumnFrame`'s `onColumnResize` ran `setPrefs(...)`
  (a React state update) on every drag tick, feeding the just-committed,
  rounded width straight back into the live-dragging `ResizablePanel` as its
  `defaultSize` prop; the panel library treated that as authoritative and
  re-applied it, fighting its own in-flight drag state so every tick after
  the first produced no further movement — confirmed by headless-Chrome CDP
  pointer-drag against the dev server: the original code grew the panel by
  one tick's delta then flatlined for the rest of the gesture despite
  continued captured pointermove events, while the fix tracked every tick
  up to the panel's `maxSize`. Fixed by keeping the live drag entirely
  inside `react-resizable-panels`: `ResizablePanel.onResize` now only
  writes the latest per-column pixel size into a ref (no state update, no
  `localStorage` write), and `ResizablePanelGroup.onLayoutChanged` commits
  once, only when `meta.isUserInteraction` is true (pointer released or a
  resize key pressed) — matching the IPC-effects process rule's "decide
  what to persist in a pure module" shape. The settle decision itself
  (fold settled sizes into `ColumnPrefs`, recompute `collapsed` at the
  4 px threshold) lives in a new pure, unit-tested
  `app/src/shell/columnResize.ts`.

- **The blackout's real cause: the sandbox iframe's opaque document
  background painted over the whole shell (2026-09-07, black-paint task, no
  spec change needed).** Root cause found and fixed: `Notebook/index.tsx`'s
  sandbox container is `position: fixed; inset: 0` (needed so
  `getBoundingClientRect()` rects line up with `SandboxHost`'s
  `layoutMessage` coordinates), which spans the *whole browser viewport*,
  including the space TopBar/BottomBar occupy — and Notebook is always
  mounted (R93 mount-and-hide), so its iframe loads at every launch. A
  `position: fixed` element paints above its document's ordinary,
  non-positioned static-flow siblings regardless of z-index or DOM nesting
  depth (CSS2.1 Appendix E) — confirmed by reproducing the exact mechanism
  in a minimal headless-browser screenshot: an opaque, viewport-covering
  `position: fixed` layer fully hid unrelated static sibling text. The
  sandbox document's own copy of `tokens.css` sets `:root { background:
  var(--bg) }`, painting that entire fixed, viewport-spanning canvas
  near-black — blacking out the nav bar and every tab's content together,
  with no thrown error, no removed DOM node and no navigation, which is
  exactly why the dev-only root-observer tripwire (watching only `#root`'s
  children/size) never fired. Fixed with a new
  `Notebook/sandbox/sandboxCanvas.css`, imported after `tokens.css` in
  `sandbox/main.ts`, that resets `:root`/`body` background to `transparent`
  for the sandbox document only — every chart cell already paints its own
  opaque `--bg` fill (`theme/plotTheme.ts`'s `style.background`), so no
  chart's appearance changes; everywhere else in that canvas the host's own
  identical `--bg` (or its real chrome) now shows through instead of being
  painted over.

### Added

- **Root-level error boundary; the async-error banner survives an app-root
  unmount (2026-09-07, shell-unmount task, no spec change needed).** Isaac
  reported the whole shell — nav bar included — disappearing a few seconds
  after every launch, not just the Notebook column. `shell/RouteErrorBoundary`
  only ever wrapped the space inside `RouteHost`'s per-route `.map`; nothing
  wrapped `AppShell`, `TopBar`, `BottomBar`, `RouteHost`'s own body/effects,
  `CommandPalette`, or the `Toaster`, so a throw at that level took the
  entire root down with no fallback. `main.tsx` now wraps `<App />` in a new
  `shell/RootErrorBoundary`, a full-window fallback naming the error with a
  Reload button. Separately, the async-error banner (`window` `"error"`/
  `"unhandledrejection"` listeners, landed 2026-09-07 as `98ceb20`) moved out
  of `AppShell` into `shell/GlobalErrorBanner.tsx`, mounted by `main.tsx` as
  its **own separate React root** (a sibling DOM node of `#root`, not a
  child or a portal target inside it) — a banner rendered by `AppShell`
  would have died with the exact tree the reported bug kills, and a portal
  would not have helped either (portalled content is still part of the
  source root's fiber tree). No thrower was found in the Notebook's
  mount-time path (`SandboxHost`, `bootTimer`, `watchdog`, the effects in
  `Notebook/index.tsx`) beyond what the 2026-09-07 R106/notebook-black work
  already covered; `TopBar`/`BottomBar`/`shell/layout.ts`/
  `shell/routeVisibility.tsx` were read and ruled out (no effects, no risk).
  This task's fix addresses the structural gap the lead flagged regardless
  of whether the still-unconfirmed root cause is found later.

- **`TopBar`/`BottomBar` now mount-and-hide instead of mount/unmount
  (2026-09-07, shell-unmount task, no spec change needed).** New evidence
  (no console exception at all when the shell blanks) ruled out a throw and
  pointed at `Notebook/interaction/PlaybackTransport.tsx`'s portal into
  `TopBar`'s `#playback-transport-slot`. Traced and confirmed: `TopBar` was
  the one place in the shell still conditionally mounted/unmounted
  (`{placement === "top" && <TopBar/>}`) rather than mount-and-hide (R93,
  everywhere else in the shell); because `usePlaybackSlot`'s `resize`
  listener is registered by a deeper component and so fires *before*
  `AppShell`'s own width listener on the same event (React commits child
  effects before parent effects), a breakpoint-crossing resize destroys the
  slot `<div>` on a later, un-listened render — `usePlaybackSlot` is left
  holding a stale, already-detached DOM node with nothing to tell it to
  recheck. `AppShell.tsx` now renders both bars unconditionally, hidden via
  the `hidden` attribute (matching `RouteHost.tsx`'s existing pattern);
  neither bar has an effect of its own, so this costs nothing. This
  explains the playback-transport widget silently going dark on a
  breakpoint crossing with no exception; it was **not** reproduced live and
  does not, on its own, obviously explain Isaac's full report of the nav
  bar and every tab's content disappearing together (that would need
  `RouteHost`'s own content area to blank too, which this fix does not
  touch) — flagged as fixed-on-sight because it is real and matches the
  reported symptom class, not claimed as the confirmed sole cause.

- **Dev-only `#root` blackout tripwire (2026-09-07, root-observer task, no
  spec change needed).** Two static readings and a headless-Chrome repro
  attempt (`runs/2026-09-03/decisions.md`, "Shell hardening LANDED" entry)
  failed to find what empties the shell, so `main.tsx` now arms three
  listeners behind `import.meta.env.DEV` (stripped from `dist/` by Vite's
  dead-code elimination — confirmed by grepping the built bundle for the
  tripwire's tag string, no match): a `MutationObserver` on `#root` and
  `document.body` that fires when the watched element's children drop to
  zero and logs `new Error("root emptied").stack`, the removed nodes'
  `nodeName`s, `#root`'s child count, `document.body.className`,
  `location.href` and elapsed time since load; a `beforeunload`/`pagehide`
  listener logging the same shape so a silent navigation is distinguishable
  from a DOM wipe; and a 2 s interval (dev-only, cleared on
  `beforeunload`) that logs once if `#root` collapses to zero height while
  `document.visibilityState === "visible"`. A startup line confirms the
  tripwire is armed. Decision logic (what counts as "emptied"/"collapsed",
  what a report contains) lives in the pure, unit-tested
  `shell/rootObserverTripwire.ts`; `main.tsx` only wires the listeners.

- **Sync UI shell task: `app/src/ipc/sync.ts` and Settings' `SyncSection.tsx`
  brought up to C3 §3.9 as L11 landed it (2026-09-07, no spec change
  needed).** `sync.ts` gains `startPairing`, `pairPeer(peerId, code)`
  (signature amended by ruling R104 — was `code` alone), `unpairPeer`, the
  `peer_appeared` app event (`onPeerAppeared`, via `@tauri-apps/api/event`),
  and widens `PeerStatus`/`SyncResult` to their landed six/five-field shapes
  (ruling R88, R102) — every field name checked byte-for-byte against
  `rust/tauri/src/commands/sync.rs`'s DTOs. `SyncSection.tsx` gains a
  paired-peer list with per-peer unpair and "Sync now" (decision logic in
  new pure modules `pairForm.ts`/`syncPoll.ts`, tested), a pairing flow
  (`start_pairing`'s own-device code, shown with a live "expires in m:ss"
  countdown and marked dead with a "Get a new code" re-mint once
  `expires_at_ms` (C3 §3.9, the 120 s TTL in `transport/src/sync/
  pairing.rs`) passes — judged by `pairForm.ts`'s `pairingCodeState` against
  an injected clock, ticked by a `SyncSection.tsx` timer gated on the same
  R95 route-visibility signal as the two IPC drivers, so it does not tick
  while Settings is hidden; plus a form that pairs against a
  named peer id — see `pairForm.ts`'s doc comment: R104 forbids guessing
  the peer, and C3 §3.9 today has no command/event enumerating *unpaired*
  peers on the LAN for a "discovered-peer list" to read from, so the peer
  id is a field the user types rather than a row picked from a list — a
  clickable discovered-peer list waits on **L11 Task 14**
  (`SyncStatus.discovered_peers` + `peer_appeared` for any sighting, not
  only an already-paired one), filed by the lead and not built toward
  here), and the "sync finished" toast (UI-DIRECTION decision 21). The
  `sync_status` poll and the `peer_appeared` subscription are both pure
  drivers (`startSyncStatusPoll`/`startPeerAppearedWatch` in `syncPoll.ts`,
  mirroring `Device/statusPoll.ts`'s shape) gated on R95's route-visibility
  context — neither runs while the Settings route is hidden.
  `app/src-tauri/src/lib.rs`'s `SyncState::start()` wiring is **out of
  scope for this task** (ruling R105): this device's own `peer_id`/`name`
  come from a new `identity.json` in `app_config_dir()` (uuid v4 minted
  once, name defaulting to the OS hostname), landing separately as
  **L11 Task 13**.
- **L11 Task 13: this device's sync identity, and `SyncState::start` wired
  into `app/src-tauri`'s `.setup()` (2026-09-07, spec-during — C3 §3.9
  amended, lead ruling R105 item 1).** `identity.json` (`app_config_dir()`,
  beside `peers.json`, outside `<data>` per R88 so it never syncs) holds
  `{ peer_id, name }`: `peer_id` is a `uuid` v4 minted once on first read
  and never regenerated (a corrupt or unreadable file is a typed `sync`
  error, never a silently minted replacement, which would orphan every
  existing pairing); `name` defaults to the OS hostname when readable, else
  `"idl1"`. New command `set_sync_device_name(name)` (C3 §3.9) lets the
  Settings sync section rename this device, rejecting a blank/whitespace-
  only name before anything is written. `app/src-tauri/src/lib.rs`'s
  `.setup()` now calls `SyncState::start(app.handle().clone(), data_dir,
  peers_path, identity_path)` beside its other `app.manage(...)` calls —
  the open item the sync UI shell task left (previous bullet) is closed.
  idl-rs `rust/transport/src/sync/identity.rs`; `rust/tauri/src/state.rs`'s
  `SyncState::name` is now a `Mutex<String>` (was a plain `String`) so a
  rename takes effect on the live state without a restart.
- **UI-1: design tokens, bundled Plex fonts, Tailwind v4 + shadcn wiring
  (2026-09-06, no spec change needed — R92/R93 adopt the direction file).**
  `app/src/styles/tokens.css` carries the 13 idl0 palette tokens, the 8-hue
  chart series, the type/spacing/radii scale and the shadcn variable mapping,
  all as CSS custom properties (the only file allowed a hex literal, enforced
  by `app/src/styles/tokenSheet.test.ts`); `fonts.css` declares six local
  `@font-face` blocks for IBM Plex Mono/Sans 400/500/600 (latin + latin-ext,
  built with `pyftsubset` from the `@ibm/plex-mono`/`@ibm/plex-sans` npm
  packages and committed as woff2 under `app/src/assets/fonts/`, source
  recorded in `app/src/assets/fonts/FONTS.md`; no CDN). `@tailwindcss/vite`
  is wired into `app/vite.config.ts`; `components.json` + `app/src/lib/utils.ts`
  set up shadcn's `new-york` style with the Radix component library and the
  `@/*` import alias. Docs vendored offline first: `docs/vendor/tailwind-v4/`
  and `docs/vendor/shadcn/` (19 component pages + install/theming refs), each
  with a `SOURCES.md`. No component is restyled; `App.css` is deleted and its
  one used rule (`.idl1-root`) is re-expressed on tokens in `index.css`.
  Flagged for a ruling: shadcn's own `--accent` CSS variable name collides
  with the brand palette's `--accent` (alert/error red) — resolved in
  `tokens.css` by aliasing shadcn's concept to `--shadcn-accent` rather than
  overwriting the brand token; see the comment there.
- **UI-2: shadcn primitives and brand widgets on the design tokens
  (2026-09-06, no spec change needed — UI-DIRECTION "Component approach").**
  Twelve components generated with `npx shadcn@4.21.0 add …` under
  `app/src/components/ui/` (`toggle-group` pulled in `toggle` as a
  dependency, so thirteen files landed) and restyled onto `tokens.css`: no
  hex/rgb/hsl/hsla literal outside `tokens.css`, no `box-shadow`, the
  `--focus` outline (1 px, 2 px offset) on every focusable, `--radius-card`
  (0 + hairline) on `select`/`tooltip` popovers, and the `tw-animate-css`
  utility classes stripped (UI-1 didn't add that package). `button` carries
  idl0's five-emphasis `ButtonEmphasis` via a new `emphasisClasses(emphasis,
  filled)` pure module (`app/src/components/brand/emphasis.ts`) instead of
  shadcn's default/destructive/secondary/ghost/link variants; `badge` is
  restyled into `BrandChip` (mono pill, optional trailing `×`);
  `toggle-group` is `BrandSegmented` (hairline border, `--control`
  resting/`--control-active` selected, a `tight` density variant); `table`
  is dense with a reserved 3 px inset selection-bar `border-left`
  (transparent unselected, `--good` selected, so selection never shifts
  layout — same technique reused by the hand-rolled `DenseRow`). Hand-rolled
  under `app/src/components/brand/`: `SectionHead`, `SpecRow` (leader dots
  via a `repeating-radial-gradient`, brief Open question 2), `StatusDot`,
  `PulsingDot` (the second of idl0's two permitted animations, decision 18,
  a `@keyframes pulse-dot` in `index.css`), `NoteBlock`, `DenseRow` +
  `TableHeader`, and (fell out cheaply) `StatusIcon`, `ToolGroup`/`IconBtn`.
  New pure modules with tests: `emphasis.ts` (`emphasisClasses`) and
  `labels.ts` (`abbreviateLabel`/`unabbreviated`, the uppercase-label
  never-wrap rule). Generator added `radix-ui` (pinned exact, `1.6.7`) and a
  new `cn` npm package; the latter isn't a Radix package or the icon
  library the brief allows in `package.json`, so its generated `import {
  cn } from "cn"` was pointed back at the project's own `@/lib/utils`
  `cn` and the dependency was dropped. `lucide-react` (landed in UI-1,
  R93/R94) is now consumed for the first time (`Checkbox`/`Select`'s
  Radix-required icons, `Badge`'s `×`, `StatusIcon`/`IconBtn`); UI-1's Minor
  about `components.json`'s `iconLibrary: "lucide"` field needs no code
  change now that it's genuinely in use. Parity gaps (no sensible web
  primitive, or deferred): `ColorGridPicker`, `StatusDropdownTrigger`,
  `GroupedChannelList`, `ModeAwareCheckbox`, `ChartContextMenu`/`ChartAction`
  (UI-11), `BrandSheet`/`CollapsibleSection` (UI-3 owns `sheet`).
- **UI-3: overlay primitives and the core-workflow toast set (2026-09-06, no
  spec change needed — UI-DIRECTION decisions 21/23).** Six components
  generated with `npx shadcn@4.21.0 add dialog sheet dropdown-menu
  context-menu popover sonner` under `app/src/components/ui/`, committed
  unmodified, then restyled in the same pass onto `tokens.css`: `--surface-2`
  fill + 1 px `--rule` border + `--radius-card` (0) on every floating
  content (`dialog`, `sheet`, `dropdown-menu`, `context-menu`, `popover`),
  no `box-shadow`, a flat `bg-black/50` scrim (no blur) behind dialog/sheet,
  `--focus` outline on every trigger/close control, and every
  `tw-animate-css`-only utility class (`animate-in`/`fade-in`/`zoom-in`/
  `slide-in-from-*` and their `-out` pairs) stripped — same class-removal
  method as UI-2, that package still isn't installed. Generic shadcn
  semantic classes (`bg-popover`, `text-popover-foreground`, `bg-background`,
  `text-muted-foreground`, `bg-accent`/`text-accent-foreground`,
  `bg-border`) were swapped for the direct token classes UI-2 already
  established (`bg-surface-2`, `text-fg`, `text-fg-dim`, `bg-control-active`,
  `bg-rule`) rather than left to resolve through the shadcn bridge, so every
  file greps the same way; `text-destructive`/`bg-destructive` were kept
  as-is since `tokens.css` already aliases `--destructive` to the brand
  `--accent` red (R94) — no bare `-accent` class outside `brand-accent`
  anywhere in the diff. `dialog.tsx`'s `DialogFooter` close button dropped
  the nonexistent `variant="outline"` prop (our restyled `Button` has no
  `variant`, only `emphasis`/`filled`) for the equivalent default
  (`filled={false}`). Same stray-`cn`-package pattern as UI-2: the generator
  again emitted `import { cn } from "cn"`, rewired to `@/lib/utils`, the
  package removed. `sonner` also pulled in `next-themes`; idl1 is dark-only
  (`tokens.css`'s fixed `color-scheme: dark`, no light-mode block), so
  `ui/sonner.tsx` hardcodes `theme="dark"` instead and the dependency was
  dropped rather than tracking a theme that doesn't exist. `sonner` needs
  its CSS imported explicitly (`sonner/dist/styles.css`, in `ui/sonner.tsx`)
  and its vendored stylesheet hardcodes a box-shadow and a sans-serif font
  stack no prop reaches; both are overridden in `index.css` against the
  `[data-sonner-toast]`/`[data-sonner-toaster]` selectors (mono, tabular,
  no shadow, a `--focus` outline on keyboard focus) rather than editing the
  vendored file. `sonner` pinned exact (`2.0.8`, matching `radix-ui`'s
  no-caret convention).
  Pure modules with tests: `overlays/sheetSide.ts` (`sheetSideFor`, the
  bottom-under-600px/right-at-and-above breakpoint BrandSheet and the
  toaster both read) and `toasts/events.ts` (`toastFor`, the closed
  four-event `CoreToastEvent` union — transfer complete, config pushed,
  sync finished, import failed — with an exhaustive switch and a `never`
  check so a fifth event is a compile error, not a silent `default`).
  `brand/BrandSheet.tsx`: a thin wrapper over `ui/sheet.tsx` (title row +
  built-in `×` + a rule under the header + a scrollable body + an optional
  ruled-off pinned footer), docking bottom/right via `sheetSideFor` behind
  its own resize listener — the primitive itself is untouched.
  `components/Toaster.tsx` renders `ui/sonner.tsx`'s `Toaster`, positioned
  bottom-centre on narrow / bottom-right on wide (same breakpoint, its own
  resize listener) — **not mounted anywhere in this task**; UI-4 mounts it
  in the shell, and the four `toastFor` call sites land in UI-5 (config
  pushed, transfer complete), UI-6 (import failed) and UI-7 (sync finished).
  Parity gaps deferred on purpose (brief Open questions): `ColorGridPicker`
  and cascading (`Sub*`) menus stay with UI-11's chart action set, which
  builds on the `context-menu` primitive generated here; Radix tooltips
  need hover, so touch-first surfaces (Device, notebook output) get a
  visible label instead of relying on a tooltip (UI-5), no JS touch shim.
- **UI-4: app shell — bars, mount-and-hide, resizable columns, command
  palette (2026-09-07, spec-during — see the note below).** `app/src/App.tsx`
  now mounts `shell/AppShell.tsx`, which shows `TopBar` (medium/wide) or
  `BottomBar` (narrow, `shell/layout.ts`'s `resolveLayout`/`navPlacement` at
  the 600/1200 px breakpoints) around `RouteHost` — every one of the four
  routes (`routes/types.ts`'s `ROUTES`, reordered Device · Data · Notebook ·
  Settings, decision 10) is always mounted and the inactive ones are hidden
  with the `hidden` attribute plus a `.shell-route-panel[hidden]` CSS rule
  (R93), replacing the previous unmount-on-switch. The wide layout's Notebook
  route additionally docks inside `shell/ColumnFrame.tsx` (library/maths/
  properties placeholders + the real Notebook page in the output column,
  `react-resizable-panels` under shadcn's `resizable`), widths and collapse
  persisted via `shell/columnPrefs.ts` (`idl1.shell.columns.v1`, also holding
  the remembered launch route). `shell/launchLayout.ts`'s `initialRoute`
  resolves the real launch route (Device below 1200 px, Notebook/studio at
  and above, the remembered route once one exists) in `AppState.tsx`'s
  provider; `initialAppState.route` keeps a fixed test constant. `Ctrl/⌘-K`
  opens `shell/CommandPalette.tsx` (shadcn's `command`/`cmdk`) populated by
  `shell/commands.ts`'s `tabSwitchCommands` (four commands, nothing else;
  typed so a later lane appends its own array rather than editing this one).
  UI-3's `<Toaster />` is mounted here for the first time. New pinned exact
  deps: `cmdk` `1.1.1`, `react-resizable-panels` `4.12.4` (generator's stray
  `cn` package pattern recurred and was dropped, same as UI-2/UI-3).
  **Device poll fix (R78 amendment):** mount-and-hide broke "polls on
  mount + a visibility pause" — a hidden but mounted Device tab would keep
  BLE polling at 1 Hz forever. `shell/routeVisibility.tsx`'s
  `composeVisibility(windowVisible, routeActive)` plus a module-scope active-
  route/visibility store now feed `Device/index.tsx`'s `STATUS_POLL_DEPS`
  (`isVisible`/`onVisibilityChange`); `statusPoll.ts`'s pause/resume driver is
  unchanged — only what "visible" means to it. **New rule superseding R78's
  wording:** Device polls while mounted, the window is visible, and Device is
  the active route.
- **UI-6: Data tab restyle — faceted browser layout (2026-09-06, no spec
  change needed — presentation over landed L7a/L8x behaviour).**
  `app/src/routes/pages/Data/**` is restyled onto the UI-2/UI-3 brand
  primitives and tokens: `FilterRail`'s facet groups are `Collapsible`s with
  `(N)` counts over `Checkbox`/`Input`; `ActiveChips` renders `Badge` pills;
  the sessions results panel is a pinned `DenseRow`/`TableHeader` list over
  collapsible date·venue groups (a new local grouping over `SessionRow
  .groupKey`, unchanged), each row's gutter `Checkbox` driving the existing
  single-session selection with a permanently reserved 3 px `--good` inset
  bar; the selected row's laps render as recessed sub-rows sourced from the
  same already-fetched detail (no second per-row `listLaps` call). `DetailPane`/
  `TrackDetailPane`/`MetadataForm` move onto `SectionHead`/`SpecRow`/`Input`/
  the `ui/table` primitives. New pure module `layout.ts`'s `dataLayout(widthPx)`
  (tested) maps the shell's `resolveLayout` 600/1200 px boundaries onto
  docked (280/320 px) / panel / `Sheet` modes for the rail and detail pane,
  read by `index.tsx`'s own resize hook; narrow renders a "Filters (n)" bar
  opening the rail as a bottom `BrandSheet` and the detail pane as a
  full-height one. `ImportPanel` adds a native OS file-drop target (Tauri's
  window-level `onDragDropEvent`, C3 has no wire shape here) enqueuing
  through the existing `importQueueReducer`/`runImport` path — no second
  queue — plus the lane's one toast call site (`toastFor({kind:
  "importFailed", …})` in the queue-driving effect's dispatch wrapper).
  **Parity gaps:** lap-mode selection (checking a lap sub-row to pick it for
  chart-overlay, idl0's XOR session/lap checkbox half) stays out of scope,
  deferred to L6 per the page's own pre-existing comment (`AppState
  .SET_LAP_CONTEXT` is never dispatched here); the track-editor map UI stays
  wave 3 (R54); has-GPS/has-gates/Track facets stay wave 3 (R53 Data Q2/R54).
- **R96: Data tab session-row click-to-deselect is a deliberate idl0-parity
  fix (2026-09-06).** UI-6's `selectSession` clicking the already-selected
  row now clears `AppState.selection` instead of re-selecting it, restoring
  idl0's `SelectionNotifier.toggleSession`; kept because L6 reads
  `AppState.selection` (R53 Data Q3) and a user otherwise has no way to
  clear a selection. Decision lives in a new pure `sessionRow.ts
  .nextSelectedSession` (tested), wired from `index.tsx`.
- **UI-5: Device tab restyle, touch-first (2026-09-06, no spec change
  needed — presentation over landed L7b work).** `Device/**` ported onto
  UI-2/UI-3's primitives at 44 px (`--hit-target`) minimum hit targets, no
  IPC/effect/behaviour change. New pure module `Device/hero.ts`
  (`heroView`/`heroStateFrom`) drives `HeroCard`'s three-state CTA — Connect
  (`--info`) with an inline device-discovery list, Start recording
  (`--good`), Stop (`--hivis`, `PulsingDot` plus a live `mm:ss` timer
  reusing `Data/format.ts`'s `formatDurationMs`; the elapsed time is local
  display state only, ticked by a `setInterval` that never calls IPC) — plus
  a colour-owned SD/GPS/IMU/HR/battery/firmware/WiFi `StatusIcon` strip and
  the SPEC §23.9 mode line; `DeviceControls` now offers only the WiFi
  toggle, since start/stop moved onto the hero CTA. `ChannelsTable`'s rows
  move onto `Table`/`TableRow`/`TableCell`; the gear control opens its
  source's form in a `Sheet` (`sheetSideFor`: bottom on narrow, right on
  wide) rather than inline — `forms/*` are unchanged inside it, staying
  pointer-first (decision 15). `ProfileBar`/`PushConfigBar`/`DeviceFiles`
  restyled onto `Select`/`Input`/`Button`/`Badge`/`NoteBlock`; the profile
  bar, channels table and push/pull bar are visually the "Config" card the
  direction names (kept as three existing components under one
  `SectionHead`, not a new `ConfigCard.tsx`). A collapsed `Collapsible`
  placeholder covers Calibration (SPEC §7.6/§20 has no `idl-rs-tauri`
  command yet — nothing to trigger). Two toast call sites wired from
  UI-3's closed `CoreToastEvent` union: `PushConfigBar.tsx`'s push success
  (`configPushed`) and `DeviceFiles.tsx`'s per-file download success
  (`transferComplete`, `fileCount: 1` — the download queue is strictly
  one-at-a-time, SPEC §24.17). Device tab refinements idl0 had that this
  restyle deliberately deferred (decision 35) are listed in this task's
  report, for `TASKS.md`.
- **UI-7: Settings restyle, plus theme and notebook output-register prefs
  (2026-09-06, spec-during — two new `ui` preference keys).** `Settings/**`
  restyled onto `SectionHead`/`SpecRow`/`ToggleGroup`/`Collapsible`/`Button`/
  `Select`/`NoteBlock`; `settings.css` is deleted and its selected-row tint
  re-expressed as `bg-control-active` (`tokenSheet.test.ts`'s
  `KNOWN_EXCEPTIONS` entry removed with it). The section list grows from
  seven to nine: `firmware` returns as an honest empty affordance (a
  collapsed "arrives in a later version" sentence, no command or stub) and
  `theme` is new; `data` (data-directory override) is kept, since nothing in
  this brief or R53 Settings Q4 retires it. New pure module
  `Settings/theme.ts`: `ThemeChoice` (`"dark" | "system"`) and
  `OutputRegister` (`"paper" | "studio"`), `themeAttribute` (system stamps
  nothing while the OS prefers light, since no light tokens exist —
  decision 5 — and stamps `"dark"` otherwise), and `resolveRegister`
  (defaults to paper below 1200 px / studio at or above it, only when the
  user has made no choice — R92/R93 decision 37). Both land in `prefs.ts`'s
  `UiPrefs` (`theme`, default `"dark"`; `output_register`, default `null` =
  no choice made), read/written through the existing `PrefsStore`/
  `PrefsBackend` — UI-10 reads the same key rather than a third storage
  location, per the brief's Open question 1 recommendation. One toast call
  site added: `SyncSection.tsx`'s `sync_now` success path raises
  `toastFor({kind:"syncFinished", changed})` via `sonner`, `changed` being
  `blobs_transferred + workbooks_merged` (no single field on `SyncResult`
  names it). Four pre-existing tests updated for the two additive `UiPrefs`
  fields (`prefsMigration.test.ts`, `settingsBackend.test.ts`) and
  `sections.test.ts`'s section-count/firmware assertions, all mechanical
  consequences of the fields/sections this task adds, not behaviour changes.
- **UI-8: Plot theme, series cycle and Turbo on the brand tokens (2026-09-06,
  no spec change needed — decisions 25–27).** New `Notebook/theme/`: `turbo.ts`
  (idl0's degree-5 Turbo polynomial ported to TS, `turbo`/`turboCss`, clamped
  and NaN/Infinity-safe); `series.ts` (`seriesColor`/`seriesPalette` resolve
  the 8-hue cycle through an injected `CssVarReader`, wrapping `% 8`; throws a
  typed `MissingChartTokenError` rather than falling back to a guessed hex on
  an empty token, since any hardcoded fallback would itself be a colour
  literal outside `tokens.css`; `documentVars()` is the one impure
  `getComputedStyle` adapter, usable against either document); `plotTheme.ts`
  (the merged Plot options object: `--bg` background, `--fg-dim` mono
  tabular-11px text, `--rule` grid, `marginLeft` fixed for six tabular
  digits, no frame — see its doc comment for two documented gaps: Plot's
  public API has no top-level knob to colour the axis tick vector separately
  from tick-label text, so both inherit `style.color`; and Plot's text/axis
  marks expose no `textTransform`/`letterSpacing` option at all, on any call
  shape, so `UI-DIRECTION.md`'s "uppercase tracked axis titles" is not
  implemented — not a scope choice, a real Plot API limitation); `slotStates.ts`
  (`emptySlotMessage`/`errorSlotMessage`, a chart-slot-specific empty/error
  vocabulary distinct from `model/jsCellNote.ts`'s existing whole-cell note).
  Applied in `sandbox/main.ts`: a `themedPlot()` wrapper is bound as the
  sandbox's `Plot` global in place of the raw library, since a cell's own
  `Plot.plot({...})` source text is never rewritten (C2 §5, "the workbook is
  a file") — every cell's call merges the theme automatically, `style`
  merged key-by-key so a cell's own override wins per property. The sandbox
  document imports `../../../../styles/tokens.css` directly (CSS custom
  properties do not cross the iframe boundary) — confirmed by inspecting a
  real `vite build`: `notebookSandbox-*.css` defines all eight `--chart-N`
  tokens plus `--bg`/`--rule`/`--font-mono`, and `notebookSandbox-*.js`
  contains the theme's `getPropertyValue`/`marginLeft`/`tabular-nums` calls.
  **Parity gap:** no host-side `Plot.plot` call site exists in this tree to
  merge the theme into — `ChartCell.tsx`/`RasterUnderlay.tsx` render via raw
  canvas (`drawRaster`) and the sandbox's own DOM, never importing
  `@observablehq/plot` themselves (confirmed by grep); the brief's own file
  list named them as host-side call sites, which this task's survey did not
  find. `theme/slotStates.ts` is delivered as a standalone tested module,
  not yet wired into any render site (no existing chart-cell empty/error UI
  to attach it to in this pass).
- **UI-9: CodeMirror brand theme for md/js/math (2026-09-06, no spec change
  needed — decision 32).** New `Notebook/editor/cmTheme.ts`: `SYNTAX_ROLE_VARS`
  maps ten `SyntaxRole`s (`keyword`/`function`/`string`/`number`/`channelRef`/
  `cellRef`/`operator`/`labelComment` onto the 8-hue chart series cycle,
  `identifier`/`comment` onto the neutral `--fg`/`--fg-faint` ladder rather
  than joining the cycle — an all-rainbow editor reads noisier than idl0's
  chrome, and decision 32 says colour *comes from* the series, not that
  every token must carry one); `brandHighlightStyle` builds a `HighlightStyle`
  from it, covering both the general `@lezer/highlight` tags markdown/
  JavaScript emit and the math `StreamLanguage`'s own `special(...)`/
  `docComment` tags (`CodePane.tsx`'s `MATH_TOKEN_TAGS`), ordered so the more
  specific math tags win over the general ones they nest under;
  `brandEditorTheme` supplies chrome (background, gutter + hairline, active
  line/gutter, selection, cursor, a dormant matching-bracket style, and the
  `--focus` ring via `outline` — never `box-shadow`) plus mono type at
  `--text-body-small` with tabular figures. Resolves every colour through
  UI-8's `CssVarReader`/`documentVars()` (no second resolver), throwing a
  `MissingThemeTokenError` on an empty token rather than a hex fallback, the
  same shape as `theme/series.ts`'s `MissingChartTokenError`.
  `CodePane.tsx` swaps `defaultHighlightStyle` for `brandHighlightStyle` and
  adds `brandEditorTheme`; nothing else in that file (debounce, completion
  source, math tokenizer, keymap) changes. **Parity gap:** bracket matching
  itself is not wired up (`CodePane.tsx` never imports `bracketMatching()`);
  the theme styles `.cm-matchingBracket` in anticipation, but it is inert
  until a later task adds the extension.
- **UI-10: Notebook cell frame, output registers and editor placement
  (2026-09-06, spec-during — the output register is new user-visible
  behaviour, decision 31/R92/R93).** `components/CellFrame.tsx` gained an
  uppercase kicker (`KIND · NN`, `ScannedCell` has no name field), a
  `StatusDot` for each cell's run state (pending/ok/error, derived from
  `state.outputs`/`cellErrors`/`fftErrors`), a per-cell code-reveal toggle
  (decision 30, new `model/codeVisibility.ts`, UI state only — never
  persisted, never written into the workbook), the reserved `--good`
  selection inset bar on a `--surface-2` fill, and an in-place error
  `NoteBlock`. Three new pure modules with tests: `model/outputRegister.ts`
  (`defaultRegister`/`registerMetrics`, thinning `Settings/theme.ts`'s
  existing `OutputRegister`/`resolveRegister` down to the "nothing stored"
  case rather than re-implementing the width breakpoint), `model/
  editorPlacement.ts` (`editorPlacement`/`outputIsReadOnly`, sharing
  `shell/layout.ts`'s `resolveLayout` breakpoints so the two can never
  drift), `model/codeVisibility.ts`. `EditorPanes.tsx` now mounts a `js`
  cell's Properties/Code panes as `Tabs` (decision 29) instead of side by
  side; every other kind is unwrapped `CodePane`. `WorkbookBar.tsx`
  restyled onto shadcn primitives as the worksheet bar (workbook `Select`,
  a worksheet `Tabs` placeholder — this lane's `.idl1wb` model has no
  multi-worksheet concept yet, so one fixed tab stands in and `+` is
  disabled — and the paper/studio register `ToggleGroup`), every existing
  behaviour (rescan, create, dirty guard, rebuild report) unchanged.
  `index.tsx`'s layout is now width-aware: `Resizable` editor/output panes
  on wide (inside the shell's already-reserved notebook output column, not
  a second outer split — the split's own widths are not yet persisted,
  flagged below), an inline editor under the selected cell on medium, and
  read-only paper with the Properties form in a `BrandSheet` on narrow.
  The output register is read from a second `Settings/prefsStore.ts`
  `PrefsStore` instance (`createPrefsStore(localStorageBackend())`,
  wrapping the same `idl1.settings.prefs.v1` document Settings' own
  instance uses — UI-7's Open Question 1 recommendation) and falls back to
  `defaultRegister(width)` when `output_register` is unset.
  **R95 items 2/3 (sandbox/watcher/debounced-eval pausing):** new
  `model/sandboxLifecycle.ts` (`sandboxShouldRun`/`initialSandboxPrimeState`/
  `nextSandboxPrimeState`) decides, from `shell/routeVisibility.tsx`'s
  `useRouteVisible`, whether the notebook's background work should be
  running and whether a hidden→visible transition needs a re-prime. The
  `SandboxHost` mount effect, the `watchWorkbook` subscription effect and
  the debounced-eval effect each gained `primeState.running` as a
  dependency, so React's own effect cleanup/re-run cycle tears the sandbox
  down (and drops/re-subscribes the watcher, clears a pending eval timer)
  while hidden and rebuilds it on return — no `pause()`/`resume()` pair was
  added to `host/SandboxHost.ts` (untouched). The three effects that
  populate a fresh `SandboxHost` (`setCells`/inline spans, channel bind,
  FFT bind) additionally depend on `primeState.primeEpoch`, reused as the
  re-prime trigger rather than a new replay path, matching R69's replay
  order; `boundIdentityRef` is cleared exactly once per re-prime so every
  cell's channel binding looks "new" again to those effects.
  **Flagged for a ruling:** the inner wide-layout editor/output split
  is an unpersisted 65/35 `ResizablePanelGroup` rather than living in
  `shell/columnPrefs.ts` under its own ids as this task's own brief
  recommended — `ColumnId` is a closed union in shell-owned code this
  lane's "do not touch the shell" rule forbids editing, so the two
  instructions conflicted; a Notebook-local prefs module was avoided too
  (the brief's "not a second storage key"), leaving persistence undone
  rather than guessing which rule wins. Also flagged: `watch_workbook`'s
  C3 contract has no unsubscribe command, so pausing it while hidden reuses
  this file's pre-existing "workbook changed" pattern (the callback becomes
  inert; a fresh subscription starts on the next open) rather than closing
  the prior Tauri-side handle, which was already true of every workbook
  switch before this task.
  **Parity gaps:** multiple worksheets (idl0 had no such concept either —
  new chrome with no backend, not a regression); a persisted wide-layout
  split width (see the ruling flag above); narrow-layout editing for
  `math`/`table` cells (only `js` cells get the narrow Properties `Sheet`
  in this pass — no code editor at narrow for the other two kinds).
- **UI-11: shared cursor, chart action menu, keyboard zoom/pan, playback
  transport (2026-09-07, spec-during — playback and keyboard bindings are
  new user-visible behaviour, decisions 18/27; R99).** New
  `routes/pages/Notebook/interaction/`: `chartActions.ts` (the ported,
  narrowed `ChartAction` enum and `actionsFor`/`actionLabel`), `keymap.ts`
  (`actionForKey`, arrow keys for zoom/pan since the given key-event shape
  carries no `altKey` — diverges from `Settings/controls.ts`'s idl0-ported
  table, see that module's doc comment), `playback.ts` (`tick`/`togglePlay`/
  `formatPlaybackTime`, the live-speed clock — pure, an injected
  `elapsedMs`, no timer of its own), `cursorFollow.ts`
  (`pixelXForTUs`/`advanceViewportByTime`), `rectZoom.ts` (`zoomToRect`,
  composing `model/viewport.ts`'s own `zoomAt`/`panBy`), `peak.ts`
  (`findPeakTUs` for "cursor to peak"), `ChartContextMenu.tsx` (UI-3's
  `context-menu` over the action set) and `PlaybackTransport.tsx` (portals
  into `shell/TopBar.tsx`'s reserved slot by `id`, not new props on
  `TopBar`/`App.tsx`/`AppState.tsx` — R99 keeps those untouched).
  **R99 (this task's own ruling):** the shared worksheet cursor is new
  state in `Notebook/index.tsx` (`manualCursorTUs` + `playback:
  PlaybackState`), not a new field on any single `ChartCell` — every
  mounted `ChartCell` receives the same `cursorTUs`/`playing` props and
  keeps its **own** `cursorReadoutDriver` instance (R62's 150 ms
  pointer-stop settle stays per chart; only the cursor *time* is shared).
  During playback a `ChartCell` pans its own live viewport through the
  *existing* settle debounce (`advanceViewportByTime` → `settleRef.notify`)
  and calls its readout driver's `notify` (not `dispatchNow`) at the new
  position every frame — the debounce keeps being reset by a continuously
  advancing cursor, so neither the tile-fetch settle nor the
  `cursorReadout` IPC call fires more than once per pause/stop. **No new
  throttle was needed**; this task did not have to invent one. Drag-rectangle
  zoom is Shift+drag (not idl0's right-click+drag) since right-click is now
  `ChartContextMenu`'s own trigger. A plain left-click with negligible
  movement sets the shared cursor (idl0's "Place cursor: Left-click"), the
  menu's own "Set cursor here"/"Clear cursor" mirror it, and "cursor to
  peak" scans the cell's own already-decoded tiles (no fetch). `CursorReadout.tsx`
  restyled to token chips (`--surface-2` fill, `--rule` hairline, mono
  tabular) per the chart style rules. **Parity gaps:** figure export
  (decision 28, out of scope); a cascading submenu (not needed — the
  landed action set is flat); Y-axis zoom and idl0's multi-cursor swap (no
  landed Y-axis or second cursor to act on).
- **UI-11 review fixes (2026-09-07).** `PlaybackTransport` portals into
  `shell/TopBar.tsx`'s slot, which sits outside the Notebook route's own
  `hidden` subtree — under mount-and-hide (R93) that `hidden` attribute
  never reached the portal, so the play/pause control and running-time
  readout leaked onto the shared top bar on every tab once a session had a
  cursor time. Fixed by gating the component's own render (not just
  `disabled`) on `shell/routeVisibility.tsx`'s `useRouteVisible("notebook")`,
  through a new pure `interaction/playback.ts#shouldRenderPlaybackTransport`
  decision (route-visible AND a cursor time), tested directly.
  `Settings/controls.ts`'s "keyboard" group no longer carries idl0's
  provisional table — it is now generated from `interaction/chartActions.ts`'s
  `actionLabel` (the same landed bindings `interaction/keymap.ts` implements),
  so it cannot silently re-diverge; `ControlsSection.tsx`'s banner now scopes
  "provisional" to the still-idl0 "mouse wheel"/"mouse" groups only.
- **L11 Task 1: sync contract amendments (2026-09-06, docs only, spec-first,
  ruling R88).** C3 §3.9 gains `start_pairing()`, `unpair_peer(peer_id)`, a
  `peer_appeared` event, `PeerStatus.protocol_version`/`.paired_at_ms`, and
  an explicit `sync_now` `phase` union; §2's `sync`/`not_found` kind rows
  updated to match. C4 §6 gains `profiles` in the manifest document and
  entry table, the versioned `/idl1/v1/...` endpoint set (closing §8 item
  4), `workbooks/.sync-base/` as a named never-synced/never-flagged
  exception, and `session.json`'s per-field merge rule (closing §8 item 3).
  New `docs/IDL0_SPEC.md` §28a carries the full sync model (moves/never-
  moves, the conflict table, the plain-HTTP-no-TLS LAN-only posture,
  resumability); §17a.4 now points at it instead of "contract to follow."
  No Rust yet — this is the contract the lane's remaining eleven tasks are
  held to.
- **L11 Task 2: sync manifest core (2026-09-06, idl-rs core,
  `store::sync::manifest`; fixed 2026-09-06 per review ruling R90).** The
  typed C4 §6 manifest (`Manifest`, `BlobEntry`, `DataParquetEntry`,
  `DerivedEntry`, `SessionJsonEntry`, `SessionEntry`, `WorkbookEntry`,
  `TrackEntry`, `ProfileEntry`, `SkippedEntry`) and
  `build_manifest(data_root, now_ms) -> (Manifest, Vec<SkippedEntry>)`, a
  pure `std::fs` walk of `<data>` that fills it, sorted by identity key for
  byte-identical repeat runs. Excludes `catalog.sqlite`/`-wal`/`-shm`,
  `tmp/`, and any dotfile or dot-directory under `workbooks/` (`.sync-base/`
  included). Blobs and derived-channel files are named by the hash their
  CAS path already carries, never re-hashed from bytes (ruling R90); a
  corrupted blob is `verify_data_dir`'s finding, not this walk's. A
  malformed individual file (unparseable `data.parquet` metadata, a
  `session.json` that doesn't parse, a front-matter parse failure, a
  filename/content-id mismatch) is omitted from the manifest and named,
  path and reason, in the returned `SkippedEntry` list — never silently
  dropped (ruling R90). No network, no async, no clock of its own.
- **L11 Task 3: sync diff (2026-09-06, idl-rs core, `store::sync::diff`,
  ruling R89; extended 2026-09-06 per ruling R90).**
  `plan_sync(local, remote, local_skipped) -> SyncPlan` over two
  `Manifest`s and Task 2's local `SkippedEntry` list: a locally skipped
  path gets no pull/merge/push item and instead a
  `SyncNoteReason::LocalFileSkipped { path, reason }` note, so a malformed
  local `session.json` or workbook is never overwritten by a peer's pull
  nor offered as if it were a good copy. `SyncAction` (`Pull`/`Push`/
  `PullForMerge`), `SyncItem`,
  `SyncClass`, `SyncNote`/`SyncNoteReason`. Every conflict rule is C4 §6's:
  blob/derived set difference by hash; `data.parquet` compares the
  `(importer_version, seam_correction_version)` pair — equal pair, differing
  hash keeps local with an `EquivalentDataParquet` note, a differing pair
  transfers the newer side's bytes; `session.json` and workbook differ ⇒
  `PullForMerge`, a workbook rename (same id, same hash) is naturally a
  no-op since `file_name` is outside the hashed bytes; track/profile are
  LWW by `updated_at_ms`. Absence on one side is never a deletion — it is
  always a transfer, for every class. Ruling R89 (this task) closes the
  `data.parquet` "newer" ordering C4 §6 left open: the pair orders
  lexicographically, `importer_version` first as SemVer 2.0.0, then
  `seam_correction_version` as the integer after its leading `v`; either
  value failing to parse under its own rule makes the pair incomparable —
  no transfer, a new `IncomparableDataParquetVersion` note naming both
  sides' pairs. `actions` sort by `(class, key, session_id)` for
  determinism; `plan_sync(a, b)`/`plan_sync(b, a)` are proven to mirror
  `Pull`/`Push`.
- **L11 Task 4: workbook merge — front matter and cell states (2026-09-06,
  idl-rs core, `workbook::merge`).** Pure functions over three parsed
  `.idl1wb` documents, deciding *content* only (ordering, conflict-cell id
  minting and marker-text rendering are Task 5's job). `merge_front_matter`
  implements C2 §7.1's per-key three-way rule for `name`/`units`/each
  `constants` entry (unchanged-on-one-side takes the other, changed-on-both
  keeps local's and warns with the peer's discarded value, same-value-on-
  both is never a conflict); a mismatched `id` is `MergeError`, refusing to
  merge rather than overwriting. `decide_cells` implements C2 §7.2's
  sixteen-cell table: byte-identical content on both sides is never a
  conflict even when both sides are independently `Changed`; a prose-only
  edit still makes its cell `Changed` (prose travels with the cell); the six
  `Added`-crossed grid cells are structurally impossible from a single
  shared `base` document (proven, not just asserted — this module's own
  derivation can never produce them) and are implemented only as C2 §7.2's
  documented defensive fallback; one of the six (`Unchanged`×`Added`) is
  unit-tested directly against the internal decision function, since
  `decide_cells` itself can never reach any of them — the other five are
  implemented-but-untested defensive fallback. Fixed 2026-09-06 per
  `review-task4.md`: four of the nine reachable real (base-has-id) rows
  gained named `decide_cells` tests, `merge_front_matter` now errors on a
  `version` mismatch as well as an `id` mismatch (`MergeError` split into
  `IdMismatch`/`VersionMismatch`), and `CellState`'s variants gained
  per-variant doc comments.
- **L11 Task 5: workbook merge — ordering, conflict cells, base cache
  (2026-09-06, idl-rs core, `workbook::merge::{merge, order}`,
  `store::sync::base_cache`).** `merge(local, peer, base, peer_name)` folds
  Task 4's decisions into an actual `WorkbookDoc`: C2 §7.3's four ordering
  rules (base order kept; a one-side addition anchored immediately after
  its nearest preceding *surviving* base neighbour in that side's own
  order, or at the document start; same-anchor ties put local's insertions
  first); a `Conflict` outcome appends the peer's cell immediately below
  local's under a fresh id minted on C2 §2.2's collision-avoidance path
  (never local's or peer's, never colliding with another conflict copy
  minted in the same merge), with `<!-- conflict from <peer> -->` as
  `prose_before`'s first line; `MarkedDeletion` inserts a `deleted
  upstream`/`deleted locally` marker into the surviving cell's own
  `prose_before` instead of inventing a second cell; a front-matter
  scalar/constant conflict's marker is prepended as the first line of the
  document's leading prose. A document with zero fenced cells on all three
  sides takes §7.3's plain three-way text path instead of the cell table.
  `MergedDoc.doc`'s `const_lines`/`defs`/`constants` are recomputed from the
  merged cell set (mirrors `parse_workbook`'s own per-cell pass) so the
  in-memory result is consistent with what a save-then-reparse round trip
  would produce, even though this module never renders to text or touches
  a file — Task 6 still owns installing the merged document to
  `workbooks/`. `store::sync::base_cache` adds `base_cache_path`/
  `read_base`/`write_base` for `<data>/workbooks/.sync-base/<id>.idl1wb`:
  bytes in, `WorkbookDoc` out, through the same atomic-write primitive and
  the same path-separator/`..` guard `write_track` uses for its id; a cache
  file that won't parse is treated as absent (`Ok(None)`), never a hard
  failure — a corrupt cache must not block a sync. Note for the lane: C4
  §6's amendment text already documents `.sync-base/` as exempt from
  `verify`'s unmatched-path finding (#10), but `store::verify::matches_layout`
  itself has no `.sync-base` arm yet — writing a base-cache file today will
  surface a spurious Info finding until that's patched; flagged for the
  lead, not fixed here (`store/verify.rs` is outside this task's files).
- **L11 review fix (Task 5): `workbook::merge` — test `recompute_derived_fields`
  against a merged conflict's const line.** Closes the review's one Important
  finding: a new test merges two docs whose `const k` line changed via a
  `Conflict` outcome (not just `TakePeer`/`KeepLocal`) and asserts
  `merged.doc.constants`/`const_lines` reflect the *merged* cell set, not
  either side's stale pre-merge value.
- **L11 Task 6: `store::sync::apply` — verified install per class,
  `session.json` per-field merge (2026-09-06, idl-rs core,
  `store::sync::{apply, session_merge}`, `workbook::v3::render_workbook`).**
  `install(data_root, item, bytes, peer_name, now_ms, ctx)` installs one
  received sync item per C4 §6's per-class rule, trusting nothing about
  `bytes` until it verifies: a blob/derived-channel is refused unless its
  own sha256 equals the requested hash; `data.parquet` is refused unless its
  own embedded `(importer_version, seam_correction_version)` matches what
  the manifest claimed, otherwise written through the atomic primitive as
  bytes, never regenerated; `session.json` runs a fresh
  `session_merge::merge_session_json` per-field merge and writes the result;
  a workbook with no local copy yet installs the peer's bytes verbatim
  (nothing to merge against); one with a local copy merges against it and
  the `.sync-base` cache (`workbook::merge::merge`, L11 Task 4/5), renders
  the result via the new `workbook::v3::render_workbook` (the first writer
  `WorkbookDoc` → `.idl1wb` text in this codebase — every prior consumer
  round-trips the author's own markdown unchanged), renames the local file
  when the peer's `file_name` differs (id wins, C4 §6), and overwrites the
  base cache with the merged bytes; Track/Profile re-check LWW by
  `updated_at_ms` at install time rather than trusting the sync plan (a
  strictly-older peer copy is `KeptLocal`), defending against a race between
  the manifest fetch and this file's fetch. `session_merge::merge_session_json`
  (pure, C4 §6/C1 §6): a user-owned field "changed" means "not equal to this
  type's zero value" (C1 §6's own `""`/`None`/`[]` "not set" convention,
  read literally against the brief's "equal to neither side's default"
  wording — resolves every field without needing the brief's no-base
  "differs from the receiver's current value" fallback); a field changed on
  one side only takes that side; changed on both to different values takes
  the side whose file is newer by `updated_at_ms` (a tie keeps local); the
  L2b lap cache (`laps`/`track_visits`/`track_visits_library_hash`/
  `lap_detector_version`, ruling R83) is never merged, always the
  receiver's own copy. **Two deviations from this task's interface sketch,
  flagged for review:** (1) `install` gains a sixth parameter,
  `ctx: &InstallContext`, carrying the peer manifest detail `SyncItem`
  (landed by Task 3) does not itself carry — `data.parquet`'s claimed
  version pair, `session.json`'s peer file mtime, a workbook's peer
  `file_name` — populated by a future caller (Task 10/12) from the same
  manifest it already fetched; extending `SyncItem`/`diff.rs` was judged
  out of this task's file list. (2) `workbook::v3::render_workbook` is a new
  function outside this task's declared files (`apply.rs`/
  `session_merge.rs`/`sync/mod.rs`/`CHANGELOG.md`) — no prior task built the
  `WorkbookDoc` → text direction (ordinary editing never needed it), and
  Task 6 cannot install a merged workbook without it; built as pure
  reassembly of C2 §1/§2.2–§2.4's already-signed grammar from fields
  `parse_workbook` already captures verbatim (`raw_fence_body`,
  `prose_before`/`prose_after`, `trailing_prose`), verified by round-tripping
  the C2 §2.5 worked example back through `parse_workbook`. Filters:
  `cargo test -p idl-rs store::sync::apply` (10 passed, since raised to 16
  by the review fix below), `cargo test -p idl-rs store::sync::session_merge`
  (5 passed), `cargo test -p idl-rs render_workbook` (3 passed, ad hoc —
  outside the brief's named filters, run because `render_workbook` is this
  task's own scope deviation). `cargo check -p idl-rs-cli --tests` clean.
- **L11 review fix (Task 6): `store::sync::apply` — route the workbook and
  `session.json` writes through `write_atomic_with_retry`.** Closes the
  review's one Important finding: `install_workbook`'s two write sites and
  `install_session_json`'s write used a single-attempt `write_atomic`, not
  C4 §4 step 4's mandated retry-with-rederive for exactly this class ("a
  local self-write race and a sync conflict are the same code path"). Both
  now go through `write_atomic_with_retry`; on a conflict, `rederive_
  workbook_write`/`rederive_session_json_write` re-read the current on-disk
  bytes and re-run the same per-cell merge / per-field merge against them as
  the new local side, retrying up to the primitive's bound of 3 attempts
  before a typed `SyncError` surfaces. Also closes both Minors: a failed
  `remove_file` after a workbook rename now surfaces as a typed `SyncError`
  instead of being swallowed, and one malformed-bytes test each was added
  for track and profile install. Filters: `cargo test -p idl-rs
  store::sync::apply` (16 passed, up from 10 — 4 new race/exhaustion tests
  covering both write sites, plus one malformed-bytes test each for track
  and profile install), `cargo check -p idl-rs-cli --tests` clean.
- **L11 Task 7: sync wire DTOs and pairing (2026-09-06, idl-transport,
  `sync::{wire, pairing}`, ruling R88).** New `idl-transport::sync` module:
  `wire.rs` carries `PROTOCOL_VERSION`, `Peer` (the paired-peer record
  serialised to the peer file), `PairingOffer`, and `PairRequest`/
  `PairResponse` (`POST /idl1/v1/pair`'s body/response, C3 §3.9 field
  names). `pairing.rs`'s `PairingState` mints an offer (`offer(now_ms)`)
  and redeems a presented code (`redeem(code, now_ms)`): the code is six
  decimal digits derived from `uuid::Uuid::new_v4()`'s first four bytes
  modulo 1,000,000, zero-padded so a leading zero survives (never an
  integer round-trip); a `120_000` ms TTL (`PAIRING_TTL_MS`); five wrong
  attempts (`MAX_ATTEMPTS`) burns the offer; the code comparison is
  constant-time over the fixed six bytes. `check_protocol_version` refuses
  a `PairRequest` speaking a version this build does not, naming both.
  `load_peers`/`save_peers` read/write the peer file (outside `<data>`,
  PLAN §8 Q7, path passed in by the caller): an absent file loads as `[]`;
  a malformed one is a `Sync` error naming the path; the write is atomic
  (tmp sibling in the same directory -> fsync -> rename -> fsync parent on
  Unix). **Deviation flagged for review:** `save_peers` does not call
  `idl-rs`'s `store::atomic::write_atomic` despite that file being listed
  as this task's reference — that primitive's optimistic-concurrency check
  requires the caller to track the target's last-read content hash across
  calls and treats "file exists, no `based_on_hash` supplied" as a
  conflict, which does not fit a small local last-write-wins peer list
  with no such caller-tracked state; `pairing.rs` implements the same
  tmp-fsync-rename recipe directly instead, keeping `idl-transport` free of
  an `idl-rs` dependency for this task (none of the task's other types need
  one either). `transport/Cargo.toml`'s existing pinned `uuid = "1"` line
  gains the `"v4"` feature (`Uuid::new_v4()` needs it; not a new crate).
  Filter: `cargo test -p idl-transport sync::pairing` (11 passed).
  `cargo check -p idl-rs-tauri` clean.
- **L11 Task 8: `axum` sync server (2026-09-07, idl-transport, `sync::{server, range}`,
  ruling R88) plus its review-task8/R100 path-safety fix.** New
  `sync/server.rs`: an `axum` 0.8.9-pinned HTTP server under `/idl1/v1`
  (`pair`, `manifest`, and the id/hash-addressed `blob`/`derived`/session
  `data.parquet`/`session.json`/`workbook`/`track`/`profile` GET+PUT
  routes), bearer auth via `route_layer` (an unknown path answers `404`,
  a known one with no/wrong token `401` — both intentional, not `layer`'s
  behaviour), and a hand-parsed `Range` header (`sync/range.rs`, no
  `tower-http`, PLAN §8 Q2) giving `206`/`416` byte-range support on every
  GET route. `install`/`InstallContext` (`idl-rs::store::sync::apply`)
  does the actual verified write; this server only routes and reads/writes
  bytes. Landed by the lead after the task agent lost ~14h to a
  `run_in_background` cargo notification that never arrived (see the
  process-rule addendum below) — code unchanged from the agent's own.
  Filters at landing: `sync::server` (14 passed), `sync::` (33 passed),
  `cargo check -p idl-rs-tauri` clean.

  **review-task8 found a Critical** (R100): the server's `is_valid_id`
  rejected `/`, `\`, and `..` but not a Windows drive-relative segment
  (`C:evil`) — a legal, unencoded URL path segment — and `PathBuf::join`
  on a component with a prefix but no root silently discards the entire
  base path, so a paired peer could read (every GET route) or, for a
  brand-new workbook, write (`PUT /workbook/<id>`) outside `data_root`
  entirely. Fixed with one shared validator, `idl-rs::store::sync::ids`
  (new module): `IdClass::Uuid` (workbook/track/profile ids — canonical
  36-character lowercase-hex-and-dashes form) and `IdClass::Session`
  (session ids — lowercase hex, even length, 16-64 characters, covering
  both a device-sourced 32-hex-char id and a non-device blob-hash-prefix
  id per IDL0_SPEC), both allow-list shape checks with no escapable
  character by construction; plus `safe_join`, a second, independent
  layer that lexically normalises `.`/`..` and re-checks the joined
  result is still inside `data_root`, closing the same class of bug even
  for a call site that skipped (or has a bug in) the shape check —
  `data_root.join(...)` call sites are now `safe_join(...)` everywhere an
  id reaches a path, in both `idl-transport::sync::server` and
  `idl-rs::store::sync::apply`'s five id-addressed install functions.
  Escapes answer `404`, never `403` (nothing about what exists outside
  `data_root` leaks). Also folded into this fix: `read_body`'s
  `to_bytes(body, usize::MAX)` (an explicit *unlimited* cap, contradicting
  its own doc comment) is now a real cap answering `413` above it —
  `MAX_DOCUMENT_BODY_BYTES` (16 MiB) for the small JSON/markdown-ish
  classes (`session.json`/workbook/track/profile), `MAX_RAW_FILE_BODY_BYTES`
  (512 MiB) for the raw/large classes (`blob`/`derived`/`data.parquet`,
  sized against IDL0_SPEC's ~200 MB device SD free-space threshold); and
  `range.rs`'s `Range` numeric overflow (e.g. `bytes=0-99999999999999999999`)
  now classifies `Unsatisfiable` (`416`) rather than `Malformed` (`400`),
  matching every other "past the resource's real length" case.
  Filters: `cargo test -p idl-transport sync::` and `cargo test -p idl-rs
  store::sync::` (see this task's own commit for exact counts),
  `cargo check -p idl-rs-tauri` clean.
- **L11 Task 9: mDNS peer discovery (2026-09-07, idl-transport,
  `sync::discovery`, ruling R88).** New `sync/discovery.rs`: `SERVICE_TYPE`
  (`_idl1._tcp.local.`), `DiscoveredPeer`, and the pure TXT-record pair
  `build_txt(peer_id, name)`/`parse_txt(txt, addr)` — the only decidable
  logic (a missing `pid`/`v` or an unparseable `v` is `None`, never a hard
  failure; a `v` differing from `PROTOCOL_VERSION` still parses, carrying
  the peer's real version, per PLAN §3). `advertise(peer_id, name, port)`
  starts an `mdns-sd::ServiceDaemon`, registers a `_idl1._tcp` service
  from `build_txt`, and returns an `Advertisement` that unregisters on
  drop. `browse()` starts its own daemon and feeds a `tokio::mpsc::Receiver
  <DiscoveredPeer>` from a task spawned on the caller's own runtime — this
  crate still never creates one, matching `ble_transport::scan`'s pattern.
  `transport/Cargo.toml` gains `mdns-sd = "0.21.1"` (PLAN §8 Q2's pin;
  resolved to 0.21.2, a patch release, under the same caret-pin style as
  `axum`/`tokio` elsewhere in this file). Filter: `cargo test -p
  idl-transport sync::discovery` (6 passed, 1 ignored). The `#[ignore]`d
  loopback round-trip (`advertise` then `browse` on the real network) was
  also run manually (`-- --ignored`) and passed. `cargo check -p
  idl-rs-tauri` clean.
- **L11 Task 9 review fix: prompt browse teardown + IPv6 scope id
  (2026-09-07, idl-transport, `sync::discovery`, review-task9).** `browse`'s
  spawned task raced `events.recv_async()` against `tx.closed()` in a
  `tokio::select!` (new internal `drain_events`), so dropping the
  `DiscoveredPeer` receiver on a quiet LAN ends the task and drops its
  `ServiceDaemon` immediately, not only on the next mDNS event (Important).
  `scoped_addr_to_socket_addr` builds the resolved peer's `SocketAddr` from
  `mdns_sd::ScopedIp` directly instead of via `to_ip_addr()`, preserving an
  IPv6 link-local address's zone/scope id so a multi-interface host does
  not connect on the wrong NIC (Minor). New dev-only `flume = "0.12.0"`
  (already resolved transitively via `mdns-sd`; `mdns_sd::Receiver<T>` is
  `flume::Receiver<T>` with no public constructor) lets
  `drain_events_receiver_dropped_no_event_arrives_task_ends` prove the
  teardown without a real `ServiceDaemon`, matching PLAN §7's "no test
  needs multicast." Filter: `cargo test -p idl-transport sync::discovery`
  (7 passed, 1 ignored).
- **L11 Task 10: the LAN sync client (2026-09-07, idl-transport,
  `sync::client`, ruling R88).** New `sync/client.rs`:
  `sync_with_peer(data_root, peer, addr, now_ms, on_progress)` — the
  pull/push driver. Refuses before any request if `peer.protocol_version`
  differs from `PROTOCOL_VERSION`; otherwise fetches the peer's manifest,
  builds the local one via core's `build_manifest`, and runs core's
  `plan_sync`'s actions phase by phase (`"manifest"`, `"blobs"`,
  `"sessions"`, `"workbooks"`, `"tracks"`, `"profiles"`, Task 1's widened
  `phase` union), reporting `SyncProgress { done, total, phase }` after
  each item. Every `Pull`/`PullForMerge` streams into a deterministic
  `tmp/<sha256 of the item's own identity>.part` file — the same logical
  item always names the same partial, so an interrupted pull's leftover
  `.part` is found and resumed (`Range: bytes=<len>-`, checked against the
  peer's own `Content-Range` start) rather than restarted; the assembled
  bytes are handed to core's `install` (which verifies and merges — this
  file never parses a workbook or `session.json` itself, and never
  duplicates `install`'s own hash check) and the `.part` is removed only
  after `install` succeeds. `Push` is a bare `PUT` of the local bytes,
  read through `safe_join`/`blob_path`, the same path-safety layer
  `server.rs` uses. A single item's failure (a stale 404, a wrong token
  reaching only that request, a network blip) is logged and counted, never
  aborting the run — `SyncRunResult { blobs_transferred, workbooks_merged,
  conflicts, sessions_updated, tracks_updated, profiles_updated }` (C3
  §3.9's `SyncResult` plus the counts the command layer needs) simply comes
  up short. `mod.rs` re-exports `sync_with_peer`/`SyncProgress`/
  `SyncRunResult`. Filter: `cargo test -p idl-transport sync::client` (10
  passed). `cargo check -p idl-rs-tauri` clean.
- **L11 Task 11: the loopback two-peer proof (2026-09-07, idl-transport,
  `sync::loopback_tests`, ruling R88).** New `sync/loopback_tests.rs`: two
  full `<data>` roots, two real `SyncServer`s, paired over a genuine
  `POST /pair` handshake (no mDNS — addresses come from `local_addr()`) and
  driven through `sync_with_peer` both ways. Ten scenarios, each seeded
  through core's own writers (`write_blob`/`write_session_parquet`/
  `write_session_json`/`write_track`, and `write_atomic`/
  `base_cache::write_base` for a workbook and its merge base — there is no
  single dedicated workbook writer), asserting on the resulting files, not
  just the run's counts: a session imported on A only lands on B with its
  blob verified; a workbook created on A only lands on B (at
  `<workbook_id>.idl1wb` — a brand-new peer has no file name to source, per
  `handle_workbook_put`'s own documented fallback); the design doc's own
  acceptance sentence — two-sided edits to *different* cells merge with
  zero conflicts — and its flip side, the same cell edited on both sides
  yielding exactly one conflict cell per side with the C2 §7 marker, both
  files still parsing; a second sync run moves nothing; a track's
  last-write-wins in one direction and leaves the other untouched;
  `session.json` fields edited on each side both survive a two-way sync; a
  server killed mid-transfer (a genuine partial ranged `GET` against the
  live server, written into the client's own deterministic `.part` path)
  resumes cleanly against a restarted server on the same port; every route
  401s an unpaired caller and nothing on disk changes; and a mixed first
  sync leaves neither root's `tmp/` nor `catalog.sqlite` touched. Two real
  findings surfaced and were designed around rather than papered over:
  `handle_workbook_put`'s documented file-name fallback (not a bug, just a
  test-fixture correction), and `parse_workbook`/`render_workbook` are not
  a fixed point of each other — re-parsing already-rendered markdown and
  rendering it again shifts an *untouched* cell's surrounding blank-line
  spacing, which C2 §7.3's "prose travels with its cell" rule then
  correctly, but spuriously, reports as a second `Changed` cell; the
  affected fixtures build sibling edits by cloning the parsed
  `WorkbookDoc` and rendering once (matching how a real UI holds a
  workbook open rather than re-parsing its own rendered output),
  sidestepping the drift rather than hiding it — worth a look as a
  possible `workbook::v3` rendering non-idempotence if a real device pair
  ever hits it after several edit/save cycles. Filter: `cargo test -p
  idl-transport sync::loopback` (10 passed, ~0.2s wall clock). `cargo
  check -p idl-rs-tauri` clean.
- **L11 Task 10 review fix (2026-09-07, idl-transport, `sync::client`,
  lead ruling R102).** Three Importants: (1) client-side per-class body
  caps mirroring `server.rs`'s `MAX_DOCUMENT_BODY_BYTES`/
  `MAX_RAW_FILE_BODY_BYTES` in reverse — `fetch_manifest` and
  `download_item` both refuse a `Content-Length` over the class's cap
  before writing anything, and re-check the running total every chunk in
  case the peer omits or lies about `Content-Length`; an over-cap transfer
  is a typed error and the `.part` it was writing to is deleted. (2)
  `pull_and_install` now discards the `.part` on any failure once
  `download_item` has returned complete bytes — a manifest missing the
  expected entry or `install`'s own hash/parse/version rejection — not
  only on success; `download_item` itself now also discards a `.part` it
  already knows is unrecoverable: a `416` (the peer's content no longer
  covers the resumed range) or a `206` whose `Content-Range` start doesn't
  match what was asked. Two new tests cover the adversarial cases the
  review named: a resumed `.part` whose existing prefix turns out wrong
  (hash-mismatches at `install`) and a `.part` longer than the peer's
  now-shorter content (`416`) — both assert the `.part` is gone and a
  second run recovers cleanly. (3) C3 §3.9's `SyncResult` amended to carry
  all six fields `SyncRunResult` already returns (see the spec's own
  revision note, same date/ruling). Minor: `tmp_part_path`'s peer-sourced
  `session_id`/`key` are now shape-validated (`item_shape_is_valid`, via
  `core::store::sync::ids::is_valid_id`) before ever being hashed into the
  `.part` name, closing the colon-join collision the review flagged.
  Filters: `cargo test -p idl-transport sync::client` (17 passed),
  `cargo test -p idl-transport sync::` (73 passed, 1 ignored). `cargo
  check -p idl-rs-tauri` clean.
- **L11 Task 11b: `render_workbook`/`parse_workbook` fixed-point fix
  (2026-09-07, idl-rs core, `workbook::v3`, ruling R103).** Task 11's
  loopback proof found `render_workbook(parse_workbook(s)) != s`: re-
  parsing and re-rendering an untouched cell shifted its surrounding
  blank-line spacing, which C2 §7.3's byte-identical `Unchanged`/`Changed`
  cell classification then misread as a spurious edit. Root cause:
  `scan_cells`'s pulldown-cmark code-block byte range ends right at a
  fence's closing `` ``` ``, *before* that line's own line-ending newline
  — that newline is already the first byte of the following
  `prose_before`/`prose_after`/`trailing_prose` span — but
  `render_workbook` also hard-coded a `"\n"` after the closing marker,
  doubling that byte into a spurious blank line around every fence, every
  render. Fix: `render_workbook` no longer appends that newline; the
  captured prose span supplies it (or supplies nothing, for a document
  with no trailing newline at all). Front matter is excluded from the
  strict invariant, on purpose: `render_front_matter`'s existing contract
  is "round-trips through `parse_front_matter`, not exact bytes" (its own
  doc comment), which is safe here because C2 §7.1 merges front matter
  per structured top-level key, never as raw YAML text, so a reformatted-
  but-equivalent front-matter block cannot manufacture R103's bug. New
  `render_workbook_is_a_fixed_point_*` suite in `workbook::v3::mod::tests`
  pins the body-exact invariant unconditionally and the whole-document
  invariant when front matter is already canonical, over: the C2 §2.5
  worked example, a prose-only document, adjacent fences with no blank
  line between, a fence followed by prose with two blank lines, trailing
  whitespace, a document with no trailing newline, and front matter with
  every optional field populated. `sync::loopback_tests`'s `edit_cell`
  helper (Task 11's clone-and-render-once workaround) is now provably
  unnecessary but was left as-is per this task's scope — a follow-up can
  simplify it to a plain re-parse-and-edit. Filters: `cargo test -p idl-rs
  workbook::v3` (114 passed), `cargo check -p idl-rs-cli --tests` (clean).
- **L11 lane complete — Task 12: the five sync commands, lifecycle state,
  and the auto-trigger (idl-rs-tauri `commands::sync`; idl-transport
  `sync::client`; two idl-rs core fixes; rulings R104 and its addendum).**
  `sync_status`, `sync_now`, `pair_peer`, `start_pairing`, `unpair_peer`,
  plus the `peer_appeared` event, thin over `idl-transport`'s `sync`
  module — no HTTP client, no merge/diff logic in `idl-rs-tauri`.
  `SyncState` (managed, held for the app's lifetime) owns the running
  server, the loaded peer list, the pairing state, and the background
  mDNS-browse task; `SyncState::start` is the constructor `app/src-tauri`'s
  `.setup()` hook calls (one line, mirroring `paths::resolve_data_dir`) —
  wiring that call and its `app.manage(...)` is that crate's job, not this
  one's (out of this task's file list). `pair_peer` takes `(peer_id, code)`
  (ruling R104, amending C3 §3.9's earlier `code`-alone signature): the
  caller names the specific discovered peer showing the code, never a
  guess or a fan-out to every unpaired peer on the LAN. `sync_now` re-
  indexes exactly the sessions a run touched
  (`idl_rs::store::catalog::index_session` per id, mirroring
  `rescan_tracks_via` — never a whole `rebuild_catalog`) via
  `idl_transport::sync::client::SyncRunResult`'s new `sessions_touched:
  Vec<String>` field (R104 addendum; `sessions_updated`'s count is derived
  from its length so the two can never disagree; the id list is a
  Rust-side detail, never forwarded to the UI — C3 §3.9's wire shape is
  unchanged). `idl_transport::sync::client::pair_with_peer(addr,
  &PairRequest) -> Result<PairResponse, TransportError>` is the new
  client-side `POST /pair` call (mirrors `fetch_manifest`'s shape, builds
  its own short-lived `reqwest::Client` like `sync_with_peer` does, so no
  crate outside `idl-transport` needs a `reqwest` dependency of its own).
  `should_auto_sync` (peer, last-sync time, now, the running set) is the
  pure decision PLAN §8 Q9/ruling R88 describes: never for an unpaired or
  protocol-incompatible peer, never while that peer already has a sync
  running, at most once per 60 s; the background browse task is its only
  caller, never a command handler. DTOs
  (`SyncStatusDto`/`SyncResultDto`/`PairingOfferDto`/`PeerStatusDto`)
  field-for-field against C3 §3.9 as Task 1/R104 amended it —
  `app/src/ipc/sync.ts` is stale against that amendment (missing
  `protocol_version`/`paired_at_ms` on `PeerStatus`, three fields short on
  `SyncResult`, and `startPairing`/`unpairPeer`(peer_id, code)/
  `peer_appeared` entirely absent), a TS shell task, not this one.
  Folded into the same commit: `install_session_json`'s race-retry
  fallback now reports `KeptLocal` (not the previous hardcoded
  `Installed`) when a concurrent write leaves `session.json` unparseable
  mid-retry, matching `install_workbook`'s existing `Cell`-based pattern
  (L11 Task 6 fix re-review Minor); `safe_join`'s doc comment states its
  lexical-not-canonicalised boundary and the in-`data_root`-symlink case
  it does not defend against, filing that case to `verify_data_dir` as an
  L8-class follow-on (ruling R101, amending R100's "canonicalised"
  wording). C4 §6 gains R89's `data.parquet` version-pair ordering
  paragraph and R91's `session.json` per-field tie rule; C3 §3.9 gains
  `pair_peer`'s amended signature (R104). `unwatch_workbook` (R98) is
  **not** this lane's gap — UI-10/Notebook's, tracked there. Filters:
  `cargo test -p idl-rs-tauri commands::sync` (15 passed), `cargo test -p
  idl-transport sync::client` (20 passed), `cargo check -p idl-rs-tauri`
  clean. Lane gate: `cargo test -p idl-rs -p idl-rs-cli --
  test-threads=4` — idl-rs 1139 passed / 1 ignored, idl-rs-cli 53 passed,
  0 failed.
- **L8x lane complete: Data-tab write commands (2026-09-06, idl-rs core +
  idl-rs-tauri, ruling R86).** Five new commands close the last C3 §6
  deferrals the Data tab still stubbed: `save_track`, `delete_track`,
  `list_quarantine`, `resolve_quarantine`, `verify_data_dir`. Two contract
  amendments back them: C3 §3.2/§3.10 (the five commands, §6's `TrackDetail`
  open question 10 closed, quarantine/track-write deferrals struck) and C4
  §2/§7 (the quarantine sidecar shape). Per-task detail in the bullets
  below; ruling R87's incidental catalog-workbook-indexing fix is its own
  bullet.
- **L8x's post-lane TS shell task: the Data tab wires the five write
  commands (2026-09-06, no spec change needed — C3 §3.2/§3.10 already
  cover this).** `app/src/ipc/catalog.ts` types the four `TrackDetail`
  fields ruling R86 fixed (`Gate`/`SectorGate`/`NeutralZone`/`GpsFix`/
  `LapTiming`, replacing `unknown`/`unknown[]`) and adds `saveTrack`/
  `deleteTrack`/`TrackDraft`/`SaveTrackResult`/`DeleteTrackReport`; a new
  `app/src/ipc/maintenance.ts` adds `listQuarantine`/`resolveQuarantine`/
  `verifyDataDir`. `Data/ipcStubs.ts`'s four placeholder stubs are deleted
  along with the toolbar's placeholder "Review quarantine" button.
  `TrackDetailPane.tsx` renders every `TrackDetail` field as text (a new
  pure `Data/trackDetailFormat.ts` formats gates as decimal degrees with
  a `°` unit) and gains Name/Venue edit (`saveTrack`, via a new pure
  `Data/trackDraft.ts` that carries the untouched lap-timing/sector/
  neutral-zone/polyline fields through verbatim — **no map-based gate
  placement editor; that stays wave 3, ruling R54**) and Delete
  (`deleteTrack`, confirmed first). Both surface `stale_session_ids` as a
  "Rescan N sessions" button, wired through the existing
  `startMaintenanceAction` driver via a new `Data/maintenance.ts`
  `runRescanSessions`/`summarizeRescanSessionsReport` (parallel per-session
  `rescanTracks` calls, one aggregated summary). A new `MaintenancePanel.tsx`
  (behind a toolbar toggle, so it fetches only once opened) lists
  quarantine entries with Restore/Discard per entry (Discard confirmed
  first) and a Verify action (`repair: false`); a second, separate Repair
  button runs `repair: true` and refreshes the quarantine list. Parity gap,
  unchanged from the L8x lane's own note: the track *editor* (create/edit
  geometry on a map) is still wave 3 — this task only closes the Name/Venue
  and delete/quarantine/verify half of the Data tab's remaining stubs.
- **L8x Task 7: quarantine and verify commands (2026-09-06, idl-rs-tauri,
  ruling R86, no spec change needed beyond Task 1's C3 amendment).**
  `tauri/src/commands/maintenance.rs` (new): `list_quarantine` and
  `resolve_quarantine` (C3 §3.2) are thin over Task 6's
  `store::quarantine`; `resolve_quarantine`'s `action` maps
  `"restore"`/`"discard"` to `ResolveAction` and rejects the stub's former
  `"retry"` as `invalid_argument` rather than aliasing it (ruling R86 Q2).
  `verify_data_dir(repair)` (C3 §3.10, ruling R86 Q8 — the App group, not
  Catalog) times `store::verify::verify`/`verify_and_repair` and mints a
  fresh uuid v4 plus the wall-clock time per repair, matching every other
  deterministic core call's injected-`ids`/`now_ms` seam; `repair: false`
  never touches the repair path, so it is provably read-only.
  `QuarantineError` gets its own `From<_> for IpcError` in `error.rs`
  (`NotFound`→`not_found`, `Occupied`→`invalid_argument`, `Io`→`io`,
  `Encode`→`internal`, R46 precedent) — no new `IpcErrorKind` variant.
  Registered in `handler()`.
- **L8x Task 6: core quarantine module and `verify`'s repair pass
  (2026-09-06, idl-rs core, ruling R86, no spec change needed beyond
  Task 1's C4 amendment).** `core::store::quarantine` (new): `quarantine_file`
  moves a corrupt file to `tmp/quarantine/<entry_id>-<original name>` and
  writes its `<entry_id>.json` sidecar through the landed atomic-write
  primitive *before* the move, so a crash between the two leaves an orphan
  sidecar and an untouched source — recoverable, never a silent loss —
  rather than a bare payload that could lose its `original_path`/`reason`
  forever; `list_quarantine` is payload-driven (a sidecar with no matching
  payload is a half-finished resolve and is skipped); `resolve_quarantine`
  restores (refusing to overwrite an occupied destination) or discards,
  never touching the catalog. `rename` falls back to copy+fsync+remove on
  a cross-device error. `store::verify` gains `verify_and_repair`, the sole
  caller of this repair path (C4 §7, R86 Q1/Q8): it runs the existing
  read-only `verify` unchanged and then quarantines exactly the findings
  whose path shape is #1 (a corrupt blob) or #5 (a corrupt derived
  parquet) — decided structurally from each finding's own path, never by
  matching message text, so #2/#3/#4/#7/#8/#9/#10 are never auto-repaired.
  `entry_id` minting and the clock stay outside core (`ids`/`now_ms` are
  injected), matching every other deterministic core function.
- **L8x Task 5b: the catalog indexes workbooks (2026-09-06, idl-rs core +
  idl-rs-tauri, ruling R87, spec-during — C4 §5 amended).** Fixes the bug
  where `list_workbooks` was always empty after a restart: `rebuild_catalog`
  step 6 was still an L1-era no-op even though L3's `.idl1wb` front-matter
  parsing had long since landed. Step 6 now walks `workbooks/*.idl1wb`,
  parses each file's front matter (`workbook_id`/`name`), and upserts its
  row via a new `core::store::catalog::upsert_workbook`
  (`ON CONFLICT(workbook_id) DO UPDATE`, so an out-of-band file rename keeps
  the same id); a file that fails to parse is skipped and counted in
  `RebuildReport::skipped`, not aborting the scan. `create_workbook`/
  `save_workbook` (`idl-rs-tauri`) also call `upsert_workbook` right after
  their own atomic write, so a new or edited workbook is queryable
  immediately — matching `save_track`'s existing after-write `tracks`
  upsert. Neither `WorkbookHandle` nor `SaveResult` (C3 §3.4) has a warning
  field, so a catalog failure here is logged (`eprintln!`) and swallowed,
  never failing the save. Never creates a `catalog.sqlite` that doesn't
  already exist (C4 §5's incremental-indexing rule).
- **L8x Task 5: `delete_track` command (2026-09-06, idl-rs-tauri, no spec
  change needed).** `delete_track(track_id: string) -> DeleteTrackReport`
  (C3 §3.2, ruling R86): an absent `tracks/<id>.idl0t` is `not_found`,
  checked first, before any catalog work — matching `delete_session_via`.
  Removes the artifact via the landed `track_artifact::write::delete_track`,
  then, only when `catalog.sqlite` already exists, deletes the one `tracks`
  row via a new `core::store::catalog::delete_track` (a single `DELETE`,
  never a `rebuild_catalog`, matching `delete_session`'s own R68
  reasoning). `laps.track_id` is already `REFERENCES tracks(track_id) ON
  DELETE SET NULL`, so lap rows survive unattributed; a catalog failure
  folds into `warnings`. Recomputes `track_library_hash` over the
  post-delete library and returns every session whose
  `track_visits_library_hash` stamp no longer matches as
  `stale_session_ids`, reusing `save_track`'s helper. Deliberately never
  rewrites any `session.json` (asserted byte-identical in a test) — idl0
  left stale `TrackVisit` references behind a delete too
  (`track_provider.dart`'s note, SPEC §12.3); "Rescan tracks" is the
  user-driven repair. Registered in `handler()`. No new `IpcErrorKind`.
- **L8x Task 4: `save_track` command (2026-09-06, idl-rs-tauri, no spec
  change needed).** `save_track(track: TrackDraft) -> SaveTrackResult`
  (C3 §3.2, ruling R86), one command for create and edit: `track_id: None`
  mints a UUID v4 (canonical lowercase-with-dashes) and both timestamps;
  `Some(id)` requires the artifact to already exist (`not_found`
  otherwise), preserves `created_at_ms` verbatim and bumps only
  `updated_at_ms`. `validate_track` runs before any filesystem write
  (`invalid_argument`, `detail: { field }`), then writes through the
  landed `write_track` (no `conflict` kind, R59 Q1(a)). When
  `catalog.sqlite` already exists, upserts the one `tracks` row via a new
  `core::store::catalog::upsert_track` (`INSERT ... ON CONFLICT(track_id)
  DO UPDATE`, deliberately never delete-then-insert — that would fire
  `laps.track_id`'s `ON DELETE SET NULL` on every edit of an already-
  visited track); a catalog failure folds into `warnings`. Recomputes
  `track_library_hash` over the post-write library and returns every
  session whose `track_visits_library_hash` stamp no longer matches as
  `stale_session_ids` — this command never calls `rescan_tracks` itself
  (PLAN §4). `GateWire`/`SectorGateWire`/`NeutralZoneWire`/`GpsFixWire`/
  `LapTimingWire` (Task 2) gain `Deserialize` and a wire→domain `From`
  impl each, doubling as `TrackDraft`'s field types. Registered in
  `handler()`. No new `IpcErrorKind`.
- **L8x Task 3: core track validation + `delete_track` (2026-09-06,
  idl-rs, no spec change needed).** New `core::track_artifact::validate`:
  `validate_track(&Track)` checks a non-empty trimmed `name`; every
  `lap_timing`/`sector_gates`/`neutral_zones` gate is in range, finite, and
  non-degenerate; `reference_polyline` fixes are range-checked too (an
  empty polyline stays legal). First failure wins and names the failing
  field (`TrackValidationError { kind, field, message }`); duplicate
  sector/neutral-zone names are allowed (PLAN Q6), not a uniqueness rule.
  `track_artifact::write` gains `delete_track(data_root, track_id)`
  (`Ok(false)` when already absent) and a shared `track_id` guard —
  rejecting a path separator or a `..` segment before joining — used by
  both `delete_track` and `write_track`. No clock, no UUID, no Tauri.
- **C3/C4 amendment for L8x Data-tab write commands (2026-09-06,
  docs only, spec-first, ruling R86).** `save_track`, `delete_track`,
  `list_quarantine`, `resolve_quarantine` (C3 §3.2) and `verify_data_dir`
  (C3 §3.10) added to the IPC contract; §6 open question 10 closed
  (`TrackDetail`'s `lap_timing`/`neutral_zones`/`sector_gates`/
  `reference_polyline` are typed, no field left `unknown`); the
  quarantine and track-write entries in §6's "Wave-2 amendment (R59)"
  block are struck as landed. C4 gains an additive `tmp/quarantine/
  <uuid>.json` sidecar (§2) and names `verify_data_dir(repair: true)` as
  the sole caller of the hash-mismatch repair path (§7). No new
  `IpcErrorKind`; no code in this task.
- **L2b lap indexing lane complete (2026-09-06).** `store::lap_index`
  (IDL0_SPEC §17.4 rewrite) detects a session's track visits and the laps
  within each against the track library, caching the result in
  `session.json` under a `track_visits_library_hash`/`lap_detector_version`
  stamp pair (C1 §6 amendment) so re-importing an unchanged session costs
  one hash comparison, not a re-detection; a lap-flag field
  (`main_lap_number`/`reference_lap_number`/`starred_lap_number`/
  `ignored_lap_numbers`) that no longer resolves after a renumbering is
  cleared and named, never left dangling (PLAN Q3) — `overlay_lap_key` is
  left alone, since it names a lap in another session. Wired into
  `finish_import` (non-fatal: a lap-index failure never fails the import)
  and the CLI's `idl-rs rescan`; an incremental
  `store::catalog::index_session` runs after import in place of a full
  `rebuild_catalog` (C4 §5 note). `LapDetail.sectors`/
  `.neutral_zone_visits` are typed concretely in C3 §3.2 (closing §6 item
  11); `fetch_fft`'s `lap` argument is real, scoping the FFT to one lap's
  recording-time window via a new `resolve_lap_window` (C3 §3.6 amendment;
  fixed post-review, R85, so the few-sample/duplicate-timestamp guards run
  on the sliced window, not the whole channel); `MathLapContext.overlay` is
  now `Vec<MathOverlay>` for same-session multi-lap overlays (R73, C2 §3.5
  + C3 §3.4, entry below). New `rescan_tracks(session_id)` command (C3
  §3.2, PLAN Q8) re-runs visit/lap detection against the *current* track
  library and re-indexes the catalog when one exists — the read-only half
  of the wave-2 amendment's deferred `rescan_track_visits` (§6), landing
  now because the engine gap it named is closed; at the time this bullet
  was written, track *write* commands (`save_track`/`delete_track`)
  remained deferred to wave 3 — **since landed 2026-09-06, L8x, ruling
  R86**, see that lane's own bullets above. **Unblocks in
  the UI** (post-lane TS shell tasks, not scheduled by this lane): the
  Data tab's lap tables and `sessions.lap_count` can show real data
  instead of R53 Q4's "—" placeholder once `app/src/ipc/catalog.ts` gets
  `LapDetail.sectors: LapSector[]` / `.neutral_zone_visits:
  LapNeutralZoneVisit[]` in place of `unknown[]` (ledger "Tracked (L2b Task
  5)", 2026-09-06); the Notebook's `lap_context` can stop rejecting every
  non-null context now that real laps exist to select; the FFT cell's
  `lap` argument and L8w's multi-lap `MathOverlay` shape both become
  reachable; and a "Rescan tracks" action on the Data tab's maintenance
  panel needs `rescanTracks`/`RescanReport` added to `app/src/ipc/
  catalog.ts` (`interface RescanReport { session_id: string; visits_indexed:
  number; laps_indexed: number; flags_cleared: string[]; warnings: string[];
  elapsed_ms: number }`) and a button wired to it.

- **L2b's UI shell task lands: typed lap tables, Rescan tracks, FFT lap wiring (post-lane TS shell task, 2026-09-06).** `app/src/ipc/catalog.ts`'s `LapDetail.sectors`/`.neutral_zone_visits` are now `LapSector[]`/`LapNeutralZoneVisit[]` (byte-exact to the Rust serde names), replacing `unknown[]`; a new `rescanTracks(sessionId)` wraps `rescan_tracks` and its `RescanReport`. The Data tab's session detail pane renders real sector/neutral-zone data through a new pure `Data/lapDetailFormat.ts` (`formatSectors`/`formatNeutralZoneVisits`) — "—" only when the session-side lap itself is absent (a catalog-only lap), "" (honestly blank) when the lap genuinely has none, never a fabricated placeholder over real data (R53 Data Q4/Q5). The maintenance toolbar gains a "Rescan tracks" button (`Data/maintenance.ts`'s `runRescanTracks`/`summarizeRescanReport`, the same pure-driver pattern as Rebuild catalog) that redraws the session detail pane from canonical truth afterward. In the Notebook, an FFT cell's `bindingFor` (`model/jsCellBinding.ts`) now passes the app's selected main lap (`AppState.selection.lapContext.mainLap`) as `fetch_fft`'s `lap` argument, `null` when no lap is selected; `bindingIdentity` folds `request.lap` in so a main-lap change alone triggers a refetch, and `model/fftRequest.ts`'s `fftRequestFor`/`FftRequest.lap`/`fftRequestEquals` are widened from "always null in wave 2" accordingly. `eval_workbook`'s `lap_context` wiring (already landed) is confirmed flowing end to end now that real laps exist; stale "every lap rejects until lap indexing lands"-style comments in `ipc/rasters.ts`, `ipc/workbook.ts` and `model/openEvalDriver.ts` are corrected to describe the real `invalid_argument`-on-unknown-lap behaviour.

- **`overlay_laps` drives every overlay lap, not just the first (L2b Task 7, R73 closed, spec-during).** `core/src/math/eval.rs`'s `MathLapContext.overlay` becomes `Vec<MathOverlay>` (was `Option<MathOverlay>`) — `variance_time(ch)`/`variance_dist(ch)` now evaluate `ch` against every overlay lap independently and combine the results with a new `mean_across_overlays` (elementwise mean, `NaN`-aware — a per-overlay `NaN` is excluded from the mean rather than poisoning it); `current_lap()`, `sector_number()`, `lap_start_time(n)`, `lap_start_distance(n)` are unaffected, since they read `main_lap`/`main_lap_bounds`, never `overlay`. `tauri/src/session_source.rs`'s `load_lap_context` builds one `MathOverlay` per entry of `lc.overlay_laps`, in order, preserving the existing "`main_lap` first, then `overlay_laps` in order" validation and its `unknown_lap` error naming the first offending lap number; it also fixes the R73-note `Arc` clone — one `Arc<dyn ChannelLookup + Send + Sync>` is built once over `handle` and `Arc::clone`d (a refcount bump) for each overlay entry, instead of a fresh `Arc::new(handle.clone())` per entry. The doc comments on `load_lap_context` and `eval_workbook_via` (and their tests) drop the now-false "`laps[]` is always empty today" claim — lap indexing landed in this same lane (Tasks 1–4). `docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md` §3.3's `variance_time`/`variance_dist` catalog rows and `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` §3.4 amended to describe the fold and drop the "every non-null `lap_context` rejects" wording.

- **`fetch_fft` accepts a real `lap` window (L2b Task 6, C3 §3.6, R76 preserved, spec-during).** `tauri/src/commands/rasters.rs`'s `fetch_fft_via` no longer rejects every non-null `lap` unconditionally — `lap: n` resolves `n`'s recording-time window from `session.json`'s `laps[]` (new `tauri/src/session_source.rs::resolve_lap_window`, sharing its `session.json` read and `unknown_lap` error shape with `load_lap_context`) and takes only `idl_rs::session::handle::SessionHandle::slice_by_time`'s samples in that window, in place of the whole channel; an unknown lap number is `invalid_argument` with `detail: { "lap": n }`, matching every other lap-naming command. `idl_rs::fft::check_none_averaging_segments` (ruling R76) now runs against the lap-sliced sample count, not the whole channel's, so a lap window that segments into more than one window under `averaging: "none"` still fails with the existing `detail: { "segments": n }` error — slicing happens before the check, never after. `sample_rate_hz` continues to derive from the whole channel's recorded `t_us` axis (a channel property, not a window one). The now-dead `reject_non_null_lap` and its doc comment are deleted; `fetch_raster`/`fetch_raster_meta` take no `lap` argument in C3 §3.6, so they are unaffected and out of this task's scope. `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` §3.6 amended to describe the real semantics in place of "`lap` must be `null` in practice until lap indexing lands".

- **`LapDetail.sectors`/`.neutral_zone_visits` typed concretely, closing C3 §6 item 11 (L2b Task 5, R53 Q5, spec-during).** `core/src/store/catalog_read.rs`'s `LapDetail` re-exports the landed `session_json::SectorJson`/`NeutralZoneVisitJson` in place of the `serde_json::Value` placeholders; `lap_json_to_detail` becomes a plain field copy, dropping the `serde_json::to_value` round-trip. `tauri/src/commands/catalog.rs` mirrors this with two new IPC DTOs, `LapSector { name, start_ms, end_ms, start_time_secs, end_time_secs }` and `LapNeutralZoneVisit { name, enter_ms, exit_ms }`, matching this module's existing idiom of never `Serialize`-ing a core type directly. The landed shape wins over C3 §6 item 11's guess at IDL0_SPEC §15.2's illustrative `sector_name`/`sector_time_ms` — the wire JSON is unchanged (proven with a `serde_json::to_value` test built from a literal `json!`, independent of the old code path), only the Rust type is concrete. `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` §3.2's `LapDetail` interface and §6 item 11 (now CLOSED) and `2026-09-03-idl1-c1-session-schema.md` §6's `sectors[]`/`neutral_zone_visits[]` comments are amended to match. `app/src/ipc/catalog.ts`'s `LapDetail.sectors`/`.neutral_zone_visits` need the same two interfaces (lead's shell task — this lane does not touch `app/src/`).

- **Incremental per-session catalog indexing (L2b Task 4, R83/R84, C4 §5 spec-during).** `core/src/store/catalog.rs` gains `index_session(conn, data_root, session_id)`, extracted from `rebuild_catalog`'s per-session body (steps 3–5: `sessions`, `laps`, `lap_summary`) so a single-session update no longer needs a full tree walk; idempotent — existing rows for `session_id` are removed first (`laps`' and `lap_summary`'s own cascading foreign keys clear both from one `DELETE FROM sessions`), then re-inserted inside one transaction. Ruling R84: `index_session` also inserts (verifies + `INSERT OR IGNORE`s) a `blobs` row for the session's own blob if one isn't already there, since an incremental caller may be indexing a session whose blob was written to the CAS after the catalog's last full rebuild — without it, `sessions.blob_sha256 REFERENCES blobs(sha256)` would reject the insert under `PRAGMA foreign_keys = ON`. Errors `NotFound`-kind when `session_id` has no `session.json`/`data.parquet` yet, unlike `rebuild_catalog`'s tree walk, which treats that as transient and silently skips it. `core/src/store/import.rs`'s `finish_import` calls `index_session` after the lap-index step whenever `<data_root>/catalog.sqlite` already exists — never creating one itself — so an imported session's laps are queryable immediately rather than waiting for the next rebuild; failure is non-fatal (`ImportReport.catalog_index_warning`), and the module doc comment's now-false "does not touch the catalog" claim is corrected. `docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md` §5 documents the new path; `rebuild_catalog` remains the sole authority for `tracks`/`workbooks`/the schema and the recovery path if the two ever disagree.

- **Lap indexing wired into every import path; `idl-rs rescan` (L2b Task 3, R83, spec-during).** `core/src/store/import.rs`'s `finish_import` now calls `store::lap_index::index_laps` after `session.json` is created/confirmed present, on every plan it reaches (`Write`, `Regenerate`, and `Skip` — never `Collision`, which already returns early) with `force = false`; the `SessionHandle` is built from the already-parsed `Session` (`SessionHandle::from_session`, consumed by value, last thing `finish_import` does with it) rather than re-reading `data.parquet` or cloning channel data. A lap-index failure is non-fatal — it sets the new `ImportReport.lap_index_warning` (the error's `Display`) and leaves `ImportReport.lap_index: None`, but the import itself still returns `Ok`, mirroring idl0's `_detectAndSaveVisits`; `LapIndexReport::warnings` stay on `ImportReport.lap_index` and are never folded into `import_warnings` (different provenance). `ImportReport` drops its `Clone`/`PartialEq`/`Eq` derive (nothing needs to compare or duplicate a whole report; `LapIndexReport` carries neither). The CLI gains `idl-rs rescan <data_root> --session <session_id> [--format json]` over `store::lap_index::reindex_laps`, a new structured command (§29.7 envelope) printing visit/lap counts, any lap-flag fields cleared (ruling R83 Q3), and warnings; a new `From<LapIndexError> for CliError` maps its `Io`/`Track` kinds onto the existing `io`/`invalid_input` error kinds. `docs/IDL0_SPEC.md` §29.6 documents `rescan` and §29.7's structured-command list and per-command `data` table are updated to include it.

- **Lap indexing writes `session.json` (L2b Task 2, R83, C1 §6 spec-during).** `core/src/store/lap_index.rs` gains `LAP_DETECTOR_VERSION` (a bump-when-detector-output-changes constant, seeded `"1"`) and two entry points: `index_laps(data_root, session_id, handle, force)`, which reads (or starts from `empty_session_json` for) `session.json`, recomputes `compute_lap_index` only when `force` or the freshly-loaded track library's hash or `lap_detector_version` no longer match what is stamped on disk, and otherwise leaves the file byte-for-byte untouched (`LapIndexReport.skipped_up_to_date`); and `reindex_laps(data_root, session_id)` — IDL0_SPEC §17.4's "Rescan Tracks" — which rebuilds the `SessionHandle` from `data.parquet` and calls `index_laps` with `force = true`, mapping a missing `data.parquet` to a typed `LapIndexErrorKind::Io` rather than panicking. On recompute, only `track_visits`, `laps`, `track_visits_library_hash`, `lap_detector_version`, and the lap-flag fields below are overwritten — rider, bike, comments, gates, and `bike_profile_snapshot` carry through verbatim. Ruling R83 Q3: `main_lap_number`/`reference_lap_number`/`starred_lap_number` are cleared to `null` and `ignored_lap_numbers` is filtered when they name a lap number the new `laps[]` no longer has, each cleared field named in `LapIndexReport.flags_cleared`; `overlay_lap_key` is left untouched, since it names a lap in a different session, which this session's own renumbering cannot invalidate. `session_json.rs` gains the additive `SessionJson.lap_detector_version: Option<String>` (C1 §6, `SESSION_JSON_SCHEMA_VERSION` unchanged — the field is optional and an older file parses unaffected). `docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md` §6 and `docs/IDL0_SPEC.md` §17.4 amended to describe both entry points and the two-stamp cache key.

- **Lap indexing pure core: `store::lap_index` (L2b Task 1, R83, spec-first).** New `core/src/store/lap_index.rs` provides `track_library_hash` (a port of idl0's `trackLibraryHash`, using this crate's own `sha2` dependency in place of idl0's `sha1`), `load_track_library` (every `<data_root>/tracks/*.idl0t`, sorted by id; a missing `tracks/` directory or an unreadable/version-rejected artifact is honest-empty/skipped-with-a-warning, never an error), a deterministic `visit_id` (ruling R83 Q4: 16 hex characters of a hash over `track_id`/`start_ms`/`end_ms`, not idl0's random UUID, so a rescan of an unchanged visit does not churn a synced `session.json`), and `compute_lap_index` — pure over an in-memory `SessionHandle` and the loaded `Track` library: runs `tracks::detect_visits`, resolves each window's `Track`, runs `laps::detect_laps` within the window when the track has lap timing, and session-wide-renumbers the top-level lap list via `laps::renumber_session_laps` while each visit keeps its own per-visit numbering. A visit whose track is missing from the library or has no lap timing is still recorded, with `laps: []` and a warning (IDL0_SPEC §17.4's "visits present, laps absent"). No file I/O in this task — `session.json` merge/write is a following task. `docs/IDL0_SPEC.md` §17.4 rewritten for idl1's import-time indexing, the idl0/`Workspace` wording kept below a divider pending the rest of §17's rewrite.

- **L10 wave-2 cosmetic pass on the Notebook (review follow-ons, no behaviour change to any shipped command).** `PropertiesForm.tsx`'s FFT hop-size control gets a comment explaining why it disables by swapping to a read-only `<span>` rather than a `disabled` input, unlike window size (Task 20 review Minor). `docs/IDL0_SPEC.md` §26.6's "Delivered in wave 2" summary reworded from "(single whole-record spectrum)" to "(whole-channel spectrum, no time-range selection)" so it can't be read as narrower than what shipped (Task 20 review Minor). A new pure `Notebook/model/jsCellFrameHeight.ts` (`resolveJsCellFrameHeightPx`) floors a plain-mount `js` cell's frame height when it carries a note or error, so a tiny `cellRendered` height (e.g. no session selected) can no longer clip the note text in a multi-cell workbook (ledger 2026-09-06, after Task 21). Six stale `§26.x`/`§25.x` cross-references outside §25/§26 (`docs/IDL0_SPEC.md` lines 1067, 1375, 2111, 2147, 2187, 2213 — pointing at subsection numbers the §26 rewrite removed) repointed at the current section that now holds that content (§26.6 or §26.1); the Controls-table row's `§26.7` citation (Task 16 review Note — semantically wrong, not just renumbered) repointed at §27.10, where the chart controls reference actually lives today.

- **Notebook empty state, New workbook, Rescan and workbook picker (L6 Task 21, R66, ledger 2026-09-06).** The Notebook no longer opens "the first indexed workbook" and reports "No workbooks found." as a document error. An empty catalog now runs one `rebuild_catalog` per page open and then shows a real empty state: an inline name field creating a workbook through `create_workbook` (never a native prompt), and a Rescan button re-running `rebuild_catalog` so a file copied into `workbooks/` becomes visible. Because `create_workbook` writes the file without indexing it, and every other workbook command resolves by scanning `workbooks/`, a new workbook opens immediately from its returned handle and the rebuild only serves the picker. Above one indexed workbook a `<select>` in the editor header chooses which to open, remembered per machine under `idl1.notebook.ui.v1` — the choice is UI state, never written into the file. Which workbook opens and which actions appear are decided by the new pure `model/workbookEntry.ts`, not inline in the page. Two rendering gaps found and fixed alongside: a `js` chart cell with no session selected reserved 240 px of blank space with no explanation (its note slot was only ever filled when a session was resolved) and now says so, and a whole-command `eval_workbook` rejection was swallowed by an empty `catch` and is now a typed `evalError` shown above the cell list.

- **FFT chart in the `plotForm` grammar and the Properties panel (L6 Task 20, R78, R79, R80).** C2 §5.3's FFT production is implemented: `PlotProps` is a discriminated union on `chart: "time" | "fft"`, an FFT cell carries exactly one `spectrum(channel, { windowSize, hopSize, window, detrend, scaling, averaging })` mark, and `generate`/`parse` round-trip every parameter value including the `"all"` whole-record token. `parse` fails closed to custom code on any deviation — a mixed time/spectrum `marks` array, a missing or extra `fft_params` key, a second spectrum mark, `x`/`y` not bound to `"f"`/`"m"`, or `x.type` on a time cell — so a hand-written `spectrum(...)` outside the grammar gets no host variable and renders an empty plot. The Properties pane gains a chart-type control and the FFT parameter panel: hop in samples (C3's own unit) with a derived overlap percentage shown beside it, `Averaging: None` forcing and disabling window/hop at `Whole record` (ruling R76 made unreachable-by-construction), and a y-label seeded per scaling. An FFT cell mounts `JsCellFrame` with no time gestures, fetches through the shared `CellRunSequencer`, and publishes its spectrum under `spectrumKey(channelId, fftParams)` — one shared pure function, in a dependency-free `plotForm/spectrumKey.ts` module, on the host and sandbox sides (R80 Q4). A spectrum over `MAX_FFT_BINS` (16384) bins shows a note and does not fetch (R79 Q4: a cap is a host constant, not a parameter of the picture). A rebuilt sandbox re-pushes each cell's last decoded spectrum from a host-side retained copy rather than re-fetching or going blank (R80 Q5). Time → FFT (and back) preserves the first mark's channel (R80 Q6).

- **FFT chart request/driver plumbing over `fetch_fft` (L6 Task 19, R52 Q7, R63 (3), R76).** New pure `Notebook/model/fftRequest.ts` builds a `fetch_fft` request from a channel's `sample_count` and a segmentation choice — with `averaging: "none"` it forces `window_size = hop_size = sample_count` so the request produces exactly one segment (R76). `binFrequencyHz`/`frequencyAxisHz` derive the frequency axis from the `IDLF` header's `sample_rate_hz` and `bin_count`, the one derivation C3 §3.6 places frontend-side. New `Notebook/model/fftDriver.ts` runs the settle-bound fetch with the lane's standard staleness contract (`isStale()` after the single `await`, a rejection dispatching a typed `IpcError` — including an `invalid_argument`'s `detail.segments` intact — never a thrown string). The spectrum crosses into the sandbox as a new `{ kind: "spectrum", f, m }` host-variable payload (`host/protocol.ts`'s `spectrumPayload`, `SandboxHost.setSpectrumHostVar`, `sandbox/main.ts`'s matching `materializeHostVar` branch) rather than being squeezed into the time-channel `{ t, v }` shape; like a channel payload, it is excluded from `rebuildReplay.ts`'s cached replay since its buffers are detached on transfer. `lap` is `null` throughout (C3 §3.6: lap indexing at import has not landed). No new IPC wrapper and no new decoder — `app/src/ipc/rasters.ts`'s `fetchFft`/`decodeFft` already carry `IDLF`. This task stops at its Step 4 (ruling R78): the surface that lets a document actually author an FFT cell — the `plotForm` grammar production and the Properties panel — is L6 Task 20.

- **Chart cells bind workbook definitions over `fetch_host_channel` (L6 Task 18, R77.3, R52 Q6).** A `js` cell whose `marks[*].channel` names a `math` definition (`eval_workbook`'s `CellOutput.defs[].name`) now binds and fetches its samples through `fetch_host_channel`/`ipc/hostChannel.ts`'s `IDLH` decoder instead of plain-mounting with "not part of this session"; the data reaches the sandbox as a host variable exactly like a session channel. Budget is the tile point budget for the chart's pixel width, clamped to C3's `1..=65536`. Fetches run on the initial bind and on gesture settle through the same `CellRunSequencer`, and a settle whose budget is unchanged issues no call. Limitation, stated: `fetch_host_channel` takes no time window, so zooming a definition-bound cell re-decimates the whole definition rather than resolving a sub-range.

- **Prose renders in the host DOM from core's HTML, not from a TS regex scan (L6 Task 17, R77.2 revised by R78).** `Notebook/components/ProseSpan.tsx` and its `${…}` regex scanner (`extractInlineSpans`) are deleted — `CellOutput.prose_before_html`/`prose_after_html`/`prose_spans` (R70) are core output, Rust-escaped and trusted like any other IPC value, so the new `Notebook/components/ProseBlock.tsx` renders them directly with `dangerouslySetInnerHTML`, the one place this app does so (R69's "never `dangerouslySetInnerHTML` on sandbox output" is unaffected — prose never touches the sandbox). Each `<span data-span-id="…">` placeholder inside that HTML is filled in place, after render, by `textContent` only — the value itself still comes from the sandbox's existing `evalInline`/`inlineResult` round trip, and a thrown span still shows as text in its own placeholder via `spanError`; neither message changes. New pure `Notebook/model/proseBlocks.ts` (`proseBlocksFor`/`spansToEvaluate`) decides which prose blocks exist per cell, splits one flat `prose_spans` list between a cell's before/after block by which block's HTML literally contains each id, and gives a cell with no `eval_workbook` result yet a `raw` block showing the document's own text verbatim (`${…}` sources intact) until its first evaluation. `CellList.tsx` takes a `proseBlocks` map instead of re-decoding markdown byte ranges itself; `Notebook/index.tsx`'s span-evaluation effect now depends on `state.outputs` as well as `state.cells`/`state.markdown`, since a span is only knowable once its cell has an output.
- **A field skipped during the `localStorage` → `settings.json` migration is named, not silent (L7c Task 9, R82).** `migrationPlan` now also returns a `skipped: SkippedField[]` list — an engine field left as-is because `settings.json` already held a value different from the `localStorage` copy, with both values, never listed when the two already agree or the field was imported instead. `MigrationOutcome`'s `"migrated"` and `"nothing-to-migrate"` kinds carry it through; `ProfileSection`/`UnitsSection`'s existing `role="status"` migration notice now reads "Kept rider name 'X' from settings.json; your browser had 'Y'." for a skipped field instead of saying nothing.
- **Settings persist to `settings.json`, not `localStorage` (L7c Task 8, R77.4, R53 Settings Q1).** New `Settings/settingsBackend.ts` implements the existing `PrefsBackend` seam over `get_settings`/`set_settings`: the engine half (`rider_name`, `unit_system`) round-trips through the command and the UI half (`last_section`, `section_list_width_px`) stays in the WebView's own storage, recombined into the one document shape `parsePrefs` already understands, so no section and no `createPrefsStore` behaviour changed. `engine.data_dir` is read from `get_settings` but written only by `set_data_dir` — `set_settings` ignores that field (R59 Q5) and a write through it would have been a silent no-op. New `Settings/prefsMigration.ts` runs a one-time import of an existing `localStorage` engine half into `settings.json` and then clears just that half, keeping the UI keys and any unknown keys a newer app version wrote; `settings.json` wins on conflict, a failed import is shown to the user and retried next launch rather than marked done.
- **Device tab goes live: status, controls, persisted profiles (L7b Task 10, R77.4).** `device_status` is polled at 1 Hz through a new pure `Device/statusPoll.ts` driver (one request in flight at a time, the next timer armed only when the previous settles, a rejection logged and the poll continued) while the Device tab is mounted and a device is connected; `HeroCard` now shows real recording state, SD, GPS, IMU, HRM, battery, WiFi and mode, keeping the literal "unavailable" only for a field the device did not report and a distinct "not polled yet" before the first result. Start/stop recording and WiFi on/off go through `device_control`, gated by a pure `Device/control.ts` (WiFi and recording are mutually exclusive, SPEC §23.9) and reported from the status the command returns, not from the promise resolving — on this desktop BLE stack the SPEC §7.2 ack byte never reaches the app (R63.1, R71 correction), so a refusal is indistinguishable from a silent no-op and a provisional-controls banner says so. Bike profiles now persist over `list_profiles`/`save_profile`/`delete_profile`, last-write-wins, through a new `Device/profilesSync.ts`; a stored profile whose config fails validation, and any file `list_profiles` itself skipped, are shown rather than silently defaulted. The connect path moves from `ble_connect` to the managed `connect_device`/`disconnect_device` pair — a 1 Hz poll is not implementable on a command that reconnects each call.

- **UI shell task: every ipcStubs.ts swapped for the real L8w commands (2026-09-06).** `app/src/ipc/` gains wrapper modules for all 20 wave-2 write commands: `catalog.ts` (`saveSessionMetadata`, `deleteSession`), `device.ts` (`connectDevice`, `disconnectDevice`, `deviceStatus`, `deviceControl`, `pullConfig`, `previewChannelRegistry`), `workbook.ts` (`readWorkbook`, `createWorkbook`, `listMathBuiltins`, `fetchHostChannel`, `evalWorkbook`'s new `lapContext` argument, `CellOutput.prose_before_html`/`prose_after_html`/`prose_spans`, `WorkbookEvent.hash`), `rasters.ts` (`fetchFft`, an `IDLF` decoder), and a new `app.ts` group (`getSettings`/`setSettings`/`getDataDir`/`setDataDir`/`listProfiles`/`saveProfile`/`deleteProfile`). New `ipc/hostChannel.ts` decodes `IDLH` v1 host-channel bytes (24-byte header, `DataView` copy, throws a typed `HostChannelDecodeError` on bad magic/version/length). `Settings/ipcStubs.ts` and `Device/ipcStubs.ts` are deleted outright — every command either file stood in for now exists; `Data/ipcStubs.ts` keeps only `saveTrack`/`deleteTrack`/`listQuarantine`/`resolveQuarantine` (C3 then had no command for any of the four, deferred to wave 3 — **since landed 2026-09-06, L8x, ruling R86**; swapping these four stubs for the real commands is that lane's own post-lane TS shell task). `Settings/DataSection.tsx`, `Device/PushConfigBar.tsx`, `Data/MetadataForm.tsx`/`DetailPane.tsx`/`index.tsx` now call the real commands; `MetadataForm` gains an `onSaved` callback so a successful `save_session_metadata` redraws the detail pane (and refreshes the sessions list) from the command's own re-read `SessionDetail`, per that command's own contract note. `Data/FilePicker.ts`'s `pickImportFile` seam (ruling R55) now opens `@tauri-apps/plugin-dialog`'s native `open()` dialog filtered to the four importer extensions, with the seam's `openDialog` parameter kept injectable for tests. **Correction (2026-09-06, review-shell-stub-swap Major, R77.1):** this bullet originally said the pasted-path field became the dialog's starting folder instead of the literal import target — that repurposing violated R55/R77.1's standing "paste a path → import" contract and has been reverted; the pasted-path field keeps its original direct-import behaviour (an `Import` button that imports the trimmed text verbatim, no dialog), and `pickImportFile`'s native dialog is exposed as a separate `Browse…` button beside it, optionally seeded from the pasted text as its starting folder. `Notebook/index.tsx`'s `readWorkbook`/`NotImplementedError` stub import is replaced by `ipc/workbook.ts`'s real `readWorkbook`; `workbookState.ts` drops the now-unreachable `"not_implemented"` `MarkdownStatus`/`markdownNotImplemented` action; `saveFlow.ts`'s interim `WorkbookEventWithHash` (`hash?: string`) becomes a plain alias for the now-real, always-present `WorkbookEvent.hash` (ledger R67). `evalWorkbook` calls thread `AppState.selection.lapContext` through (mapped to the wire `LapContext` shape) via a ref, matching the existing `sessionIdRef` pattern. New `Notebook/model/functionCatalog.ts`'s `diffFunctionCatalog` compares the hand-transcribed `MATH_FUNCTIONS` against `list_math_builtins` once at notebook open; a mismatch renders as a dismissable warning banner, never thrown. **Left unwired, and why:** `fetch_host_channel`/`ipc/hostChannel.ts` has no UI call site yet — binding a `math`-cell definition to a chart is a new feature (which definition triggers a fetch, what budget, gesture-settle semantics) with no existing seam or spec section to build against, not a stub swap; `CellOutput.prose_before_html`/`prose_spans` are typed and carried through IPC but `ProseSpan.tsx`'s client-side `${…}` regex scanner is not yet retired — rendering server-provided HTML with live-filled placeholder spans needs a DOM-manipulation design this task did not specify (and getting it wrong risks the R69 sandbox-escaping boundary), and the pre-first-eval prose state (no `prose_before_html` exists before a cell's first `eval_workbook` round trip) has no stated fallback. `Device` tab's `device_status`/`device_control`, `list_profiles`/`save_profile`/`delete_profile` persistence, and `connect_device`/`disconnect_device`'s managed link are now real commands but still have no call site — `HeroCard.tsx`/`ProfileBar.tsx` deliberately show static "unavailable" text with no wiring at all (not a stub), and building that wiring is new product/UX design, not a stub swap.

- **L6 Notebook lane wrap-up: `docs/IDL0_SPEC.md` §26 "Tab — Notebook" (L6 Task 16, spec-during).** §25 "Tab — Maths" is now a two-line pointer -- idl1 has no separate maths tab, math cells live in the notebook. §26 covers the four cell kinds and how each renders (prose/`math`/`table` via existing components, `js` via `ChartCell` when its code `plotForm.parse`s or `JsCellFrame`'s plain mount otherwise), the Properties+Code editor (D13) and the custom-code/Reset-to-form rule, the interaction rules and point budget restated as spec prose (P1-P8), the sandbox boundary and the six-variable cell API with `channel()`'s settled `{t, v}[]` return shape (R52 Q2), the per-cell bound-channel registry and shared run-sequence guard (R72), the interim TS `${…}` prose-span scanner pending R70's `prose_spans` wire field, and the reload-or-overwrite conflict banner with the per-cell merge named as L11's, not this tab's. A full parity-gap table (every idl0 Analyze/Maths feature not delivered, with its reason) is ported into the SPEC itself. `TASKS.md`'s `L6 notebook UI` line stays unticked: `plotForm`'s exhaustive round-trip test passes as part of this task's whole-suite gate, but design §10's 60fps-pan/zoom/hover-on-a-real-session criterion can only be observed in the running dev app, which is the lead's merge-gate eyeball pass, not this task's (R50 precedent). `runs/2026-09-05/lanes/l6/CONTRACT-AMENDMENTS.md` files proposed C2 §5.1 and C3 §3.4/§3.6 amendment text (N1/N3/N4/N5, R52 Q2/Q4-Q7) for the lead to apply -- this lane never edits a contract directly. Known cross-reference gap left for L10's pass: other legacy-idl0 sections of the SPEC (e.g. §14/§15/§19/§21's math/table engine descriptions) still point at old `§26.x` subsection numbers this rewrite removed (`§26.8`, `§26.11`-`§26.13`); not fixed here, out of this task's declared scope (§25/§26 only).
- **Properties + Code editor shell (L6 Task 15, D13).** Selecting a `js` cell opens Properties and Code side by side, writing through the same cell body; every other cell kind shows Code only. `CellList.tsx` gains one optional `frame` wrapper prop (ruling R74, out of this task's original file list — the smallest hook that lets `CellFrame`'s select affordance reach every cell kind, math/table included, without `index.tsx` re-implementing `CellList`'s own cell iteration or restricting selection to `js` cells); `workbookState.ts`'s `editCell` action gains an optional `markdown` field so a local edit actually updates `state.markdown`/`state.cells` (re-scanned), not only `dirtyCellIds` — both existing test suites pass unmodified. A new debounced re-eval effect in `index.tsx` re-runs `evalWorkbook` after a burst of local edits settles. `model/editorEcho.ts`'s `isEditorEcho` (tested) lets `EditorPanes` recognise and drop a pane's `onChange` echo of the exact text this component itself just wrote, so a Properties edit and `CodePane`'s own external-`code`-sync re-application never bounce indefinitely between the two panes. No unit tests for `EditorPanes.tsx`/`CellFrame.tsx` themselves (rendering, CLAUDE.md §4) — the logic under test is Tasks 3, 4, 11, 12's existing coverage plus the new `editorEcho.test.ts`.
- **The bound-channel registry holds every channel of a `js` cell, not the first (L6 Task 13c, ruling R72).** `NotebookSession.setBoundChannel(cellId, bound)` is replaced by `setBoundChannels(cellId, bound: BoundChannel[])`, keyed per cell to a whole list instead of a single entry; `allBoundChannels()` flattens across cells for `onChannelsInvalidated`'s rebuild replay (order unchanged: `init` → JSON host vars → channels → `setCells`). `model/channelBindDriver.ts`'s `runChannelBind` (initial bind) and the new `runChannelSettle` (gesture-settle refetch, called from `ChartCell`'s `onViewportSettled` in `index.tsx`) both delegate to one shared loop that fetches every distinct bound channel for a given window and registers all of them in one `setBoundChannels` call once the run is still current — a two-channel `js` cell's non-mounted channels now get refetched and re-registered on every pan/zoom settle, and both survive a sandbox rebuild, not only the channel `ChartCell` renders. The re-fetch of the mounted channel on settle is a cache hit off the same `TileCache` `ChartCell`'s own settle-fetch just filled, so it costs no extra `fetchTile` call. Removes the `// TODO(idl0)` this gap left in `channelBindDriver.ts` and the mirrored limitation described in `index.tsx`'s channel-bind effect doc comment.
- **js cells bind to ChartCell; cell outputs render inside the sandbox iframe, not injected into the host DOM (L6 Task 13b, R66, R69).** A `js` cell whose code `plotForm.parse`s against a real session channel (`model/jsCellBinding.ts`'s `bindingFor`) mounts `ChartCell`'s real settle-driven viewport/tile-fetch pipeline; custom code, or code naming a channel the session doesn't have, mounts the new `JsCellFrame` plain-mount path instead (the latter with a visible note naming the unresolvable channel). `cellResult.html` and the host's `dangerouslySetInnerHTML` are gone: the sandbox renders every cell's output inside its own per-cell DOM container and reports `cellRendered { cellId, heightPx }`; `ChartCell`/`JsCellFrame` become host-side gesture/orchestration frames that reserve that height, capture pointer/wheel input, and keep the sandbox's rendered container positioned to match via a `layout` message (a plumbing addition beyond R69's two named messages, `host/protocol.ts`). A gesture frame's CSS transform is sent host→sandbox as `transform { cellId, translateXPx, scaleX }` (`postMessage`, never IPC); on settle, the host resends the channel's real data as before. A distinct `spanError { spanId, message }` message replaces `cellError`'s prior reuse for inline `${…}` span failures (R66 item 2). Multi-channel cells bind and send *every* distinct channel's data into the sandbox (`model/channelBindDriver.ts`'s `runChannelBind`) but mount `ChartCell` for the first only (`// TODO(idl0)`, lead pre-ruling #3 — `NotebookSession.setBoundChannel` is one-per-cell today, so only the mounted channel survives a sandbox rebuild); lap scope (`MarkProps.lap`) is read and stored on each bound channel but not yet applied to narrow the fetched tile window (lead pre-ruling #2). The session's recorded span for a cell's initial viewport comes from `SessionSummary.duration_ms` (`model/sessionSpanDriver.ts`), falling back to the first channel's coarsest-tile recorded span when `duration_ms` is null (lead pre-ruling #1) — never `sample_count / nominal_rate_hz`. Also closes `review-task13.md`'s Minor: `openEvalDriver.test.ts` gains a case driving `isStale()` true specifically between `evalWorkbook`'s resolution and its `evalResult` dispatch. Follow-up (`review-task13b.md`): the channel-bind effect's fetch/send/register sequencing moved into the new pure, unit-tested `model/channelBindDriver.ts` so a superseded fetch (this cell's binding changing again before the first one resolves) is dropped by a staleness check on every per-channel `await`, matching the tightened IPC-effects rule's other drivers; `saveFlow.test.ts` gains `Error`/non-string cases for `toIpcErrorOrUnknown`.
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
- **L8w Rust write-amendment lane complete for wave 2 (2026-09-06).** 20
  commands land in `idl-rs-tauri` against the R59 wave-2 C3 amendment: App
  group `get_settings`/`set_settings`/`get_data_dir`/`set_data_dir` and
  `list_profiles`/`save_profile`/`delete_profile` (thin wrappers, C3 §3.10);
  `read_workbook` (unparsed source + hash, C3 §3.4); catalog writes
  `save_session_metadata`/`delete_session` (read-hash-write and cascading
  lap/lap-summary delete, C3 §3.2); Device group managed-connection
  `connect_device`/`disconnect_device`/`device_status`,
  `device_control`/`pull_config` and `preview_channel_registry` (C3 §3.8);
  `create_workbook` (reuses `save_workbook`'s sanitiser/collision suffix, C3
  §3.4). Two commands are genuinely new core code rather than thin
  wrappers: `fetch_host_channel` (Task 11, the `IDLH` v1 24-byte-header
  binary encoder, C3 §3.4) and `fetch_fft` (Task 12, the `IDLF` v1 16-byte
  encoder over `idl_rs::fft`, extending `Averaging` with `None`/`Max` so
  the wire union `"none" | "mean" | "median" | "max"` hides nothing landed,
  C3 §3.6 spec-during, R63 3). `preview_channel_registry`'s registry-preview
  derivation covers SPEC §5.2's fixed channel ids (IMU, wheel, pressure, HR)
  only — configured analog/digital channels have no fixed wire id and are
  out of scope for wave 2 (R63 2). `list_math_builtins` (lead-added Task
  12b, spec-during, R64.2) is a thin pass-through over
  `idl_rs::math::math_builtin_catalog` for the notebook editor's function
  reference to self-verify against; it ships `{ name, arity, status }` —
  **no `unit_rule` field**, dropped by ruling R64.2 because no source
  defines its vocabulary and a signed contract should not carry a
  free-form placeholder (a future amendment adds it once C2 states
  per-builtin unit-propagation rules).
  `eval_workbook` gains an additive `lap_context: LapContext | null`
  argument (Task 9, C3 §3.4, R52 Q5/R64.1): `overlay_laps` names laps of
  the *same* session only in wave 2 (cross-session overlay stays a
  documented parity gap until L7a's own); a session that is honestly
  out of lap context (no session bound, or `laps[]` empty pending wave-1
  lap indexing) rejects a `[Channel]` reference as a per-cell
  `math_unknown_channel` rather than failing the whole call — the
  "honest natural rejection" the ledger calls it, not a special case.
  Three new cross-cutting `IpcErrorKind` variants: `DeviceRejected`
  (Task 7, `device_control`, SPEC §7.2 `AckCode`) and `ConfigParse`/
  `ConfigUnsupportedVersion` (Task 8, `preview_channel_registry`).
  **Platform limitation, stated not hidden (R63 1, R71, R71 correction
  2026-09-06):** `device_rejected` and `pull_config`'s `config` kind are
  both practically unreachable on this desktop build — `btleplug`'s
  Windows backend surfaces only `Ok(())` or a generic `Ble` error from a
  Control/Config write or read, never the raw SPEC §7.2 ack byte, so no
  `idl-rs-tauri` call site can construct either kind without matching on
  error text (forbidden); both kinds are defined and mapped wherever a
  future transport (mobile plugins, L9) does surface an `AckCode`. The
  dialog plugin (Task 13, `tauri-plugin-dialog` 2.7.3 / `@tauri-apps/
  plugin-dialog` ^2, R55) is wired into `app/src-tauri` and its default
  capability, unblocking L7a's picker seam. **Open item, not resolved by
  this lane:** `MathOverlay` cannot be constructed from `eval_workbook`'s
  `lap_context.overlay_laps` as C3 currently shapes it (one lap window vs.
  a list) — the first entry drives the overlay until the same amendment
  that ships lap indexing at import settles the multi-overlay shape (R73),
  a wave-3-or-later contract question. Lane gate: `cargo test -p
  idl-rs-tauri` 189 passed / 0 failed (lead, at merge); `cargo test -p idl-rs -p
  idl-rs-cli -- --test-threads=4` idl-rs 943 passed / 1 ignored,
  idl-rs-cli 51 passed, doctest 1 passed — all green, once, at this task.
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

### Fixed

- **Per-route error boundary in `shell/RouteHost.tsx` (2026-09-07).** `RouteHost`
  mounts every destination unconditionally (mount-and-hide, R93) and none of the
  four had anything catching a throw — an uncaught render or effect exception in
  *any* always-mounted route, active or not, propagated to React's root and
  unmounted the entire shell with no fallback UI (confirmed live: a plain
  `useEffect` throw in the hidden Data tab blanked the whole app, nav bar
  included, while the user was on Notebook). New `shell/RouteErrorBoundary.tsx`
  (class component) plus pure `shell/routeErrorFallback.ts` (`describeRouteError`,
  tested) wrap each route's element individually in `RouteHost`, so one tab's
  failure now renders a token-styled "`<Route>` hit an error and could not
  render" message with a Retry button in that tab alone, leaving the shell chrome
  and every other tab unaffected.
- **Notebook column's real blank-screen cause: dev-server CORS blocked the
  sandbox iframe's own module fetch (2026-09-07, from Isaac's WebView console).**
  The Notebook sandbox is a deliberately origin-isolated `<iframe
  sandbox="allow-scripts">` (R69, no `allow-same-origin`), so its document has
  an opaque `null` origin; in dev that document's module-script fetches
  (`sandbox/main.ts` and `@vitejs/plugin-react`'s auto-injected Fast Refresh
  preamble) are cross-origin requests from `Origin: null`, which Vite's
  default `server.cors` allowlist does not match, so both requests failed
  outright and the sandbox never sent `ready` — the output column stayed
  blank forever with nothing watching for it. `app/vite.config.ts`
  (lead-owned, touched with the lead's sign-off) now (a) adds the literal
  `"null"` origin to `server.cors` alongside Vite's own default allowlist —
  dev-only, no effect on a `vite build`'s output or Tauri's own production
  asset responses — and (b) wraps `@vitejs/plugin-react`'s plugin objects so
  the preamble is never injected into the sandbox's HTML entry at all (it is
  not a React page); `allow-same-origin` is untouched, R69's isolation is
  unweakened either way. Separately, `host/SandboxHost.ts` now arms a 5s
  boot timer per iframe generation and reports a new
  `onSandboxUnavailable` callback if `ready` never arrives — `Notebook/
  index.tsx` shows a `NoteBlock` banner ("The cell runtime failed to start…")
  with a Retry button (`SandboxHost.retry()`) instead of a permanently silent
  blank column, for this or any future load failure. Flagged, not fixed here:
  `SandboxHost.tick()`'s ping/stall watchdog is not wired to any
  `setInterval` caller today, so it never actually runs.
- **Global window-error/unhandledrejection surfacing (2026-09-07,
  follow-up to the blank-Notebook fix above).** Traced the boot-timer path
  end to end for the reported "Notebook renders, then goes black after a
  few seconds": `bootTimer.ts`'s `onReady`/`dispose` correctly cancel the
  pending 5s deadline the moment `ready` arrives or the host is torn down,
  and `SandboxHost.tick()` (the watchdog) still has no caller anywhere
  (confirmed unchanged from the note above), so neither can retroactively
  fire `onSandboxUnavailable` against an already-booted sandbox — no
  reproducible defect found in that path. `RouteErrorBoundary.tsx`'s own
  doc comment already names the real remaining gap: it "cannot catch a
  rejected promise ... that class of failure needs its own `.catch`, not a
  boundary" — an async throw anywhere in the app (a timer callback, an
  unguarded `.then()` such as `AppShell.tsx`'s own `fetchEngineVersion()`
  call) had nothing watching for it and could leave whatever it happened to
  blank with no visible trace beyond a console line. New pure
  `shell/globalErrorFallback.ts` (`describeWindowError`/
  `describeUnhandledRejection`, tested) plus two `window` listeners
  registered once in `AppShell.tsx` and removed on teardown now catch
  every `"error"`/`"unhandledrejection"` event app-wide and show a
  token-styled, always-on-top banner naming the source/error with a Reload
  button — no failure path can leave a blank screen with nothing to look
  at again.

- **Doc carry-over fixes (2026-09-03, L10).** `tools/README.md` no longer documents the
  uncarried `idl0_dump.dart`; points at `idl-rs info`/`idl-rs channels` for the overlapping
  functionality. `app/README.md` replaced (was still the Tauri scaffolder's generic template).

### Verified

- Binary IPC path (Rust 2/2, vitest 3/3, cargo build, tsc clean) on Windows desktop, 2026-09-02 — automated; visual check via `npm run tauri dev` confirmed by Isaac 2026-09-03 (Engine 0.1.0, smoke tile 0–7 rendered).
- `idl-transport` unit/integration tests (`cargo test -p idl-transport`, 29/29 passed) and
  `cargo build -p idl-transport --release` on Windows desktop, 2026-09-03 — automated. Real-device
  BLE scan/connect/WiFi-mode entry, WiFi file list + resumable download, and BLE config push +
  read-back verify against a physical IDL0 device pending (Isaac).
