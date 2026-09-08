# S1 — selection becomes an ordered list of time windows (R111 + R115)

Plan only. No implementation code is written by this task. Rulings: **R111**
(selection is a list, one representation, no single-session special case),
**R115** (the list is of *windows*, not sessions — session / lap / explicit
range are one type). Decisions 46–50, 52, 61, 75, 84.

Spec discipline: **spec-first**. The C1 and C3 deltas in §2 land before any
code task in §3.

---

## 1. Survey — every producer and consumer of selection

Line numbers are against `s1-selection` at `f5afc0c`; the Rust submodule is
`bf6a21e` (`Merge branch 'l11-identity'`).

### 1.1 The type itself

| File:line | What it is |
|---|---|
| `app/src/state/AppState.tsx:10-13` | `LapContext { mainLap: number; overlayLaps: number[] }` |
| `app/src/state/AppState.tsx:18-21` | `Selection { sessionId: string \| null; lapContext: LapContext \| null }` |
| `app/src/state/AppState.tsx:24` | `initialSelection` — the "nothing selected" value |
| `app/src/state/AppState.tsx:61-62` | actions `SET_SELECTED_SESSION`, `SET_LAP_CONTEXT` |
| `app/src/state/AppState.tsx:72-77` | reducer arms; `SET_SELECTED_SESSION` clears `lapContext` |
| `app/src/state/AppState.selection.test.ts` | the reducer's unit tests |

### 1.2 TypeScript — producers (who writes selection)

| File:line | What it does |
|---|---|
| `app/src/routes/pages/Data/index.tsx:423-431` | row click → `SET_SELECTED_SESSION` with `nextSelectedSession(...)` |
| `app/src/routes/pages/Data/index.tsx:433-436` | a second site dispatching `SET_SELECTED_SESSION { sessionId: null }` |
| `app/src/routes/pages/Data/sessionRow.ts:84-86` | `nextSelectedSession(currentId, clickedId)` — pure toggle rule (R96); clicking the selected row clears |
| `app/src/routes/pages/Data/sessionRow.test.ts` | its tests |

**Nothing dispatches `SET_LAP_CONTEXT`.** `Data/index.tsx:425` says so in a
comment, and `Data/LapTable.tsx` has no `onClick`/`onSelect` at all — the lap
table is display-only today. So the whole lap half of `Selection` is dead UI
state: written by no one, read by the Notebook, always `null` in the real app.
That is the single biggest fact about this change's cost — **the lap path has
never actually run end to end in the app**, only in Rust tests.

### 1.3 TypeScript — consumers (who reads selection)

| File:line | What it does with it |
|---|---|
| `app/src/shell/AppShell.tsx:96` | passes `state.selection` to `TopBar` |
| `app/src/shell/TopBar.tsx:18-24` | `selectionChipLabel` — `Session <id> · Lap <n> +k overlay`, or `null` |
| `app/src/routes/pages/Data/index.tsx:242` | `selectedSessionId` drives row highlight and the detail pane |
| `app/src/routes/pages/Notebook/index.tsx:219` | destructures `{ sessionId, lapContext }` — the only Notebook read |
| `…/Notebook/index.tsx:226` | `mainLap = lapContext?.mainLap ?? null` |
| `…/Notebook/index.tsx:435-436` | `evalLapContextRef` — maps to the wire `{ main_lap, overlay_laps }` |
| `…/Notebook/index.tsx:595-598` | open+eval effect, keyed on `[sessionId, selectedWorkbookId]` |
| `…/Notebook/index.tsx:619-620` | session-span effect, keyed on `[sessionId]` |
| `…/Notebook/index.tsx:627-628, 641` | `sessionIdRef` for `fetchHostChannel` |
| `…/Notebook/index.tsx:669, 698` | debounced-edit and watch-event re-eval |
| `…/Notebook/index.tsx:986-1025` | js-cell binding effect (session scope) |
| `…/Notebook/index.tsx:1047-1121` | second binding effect, keyed on `mainLap` too |
| `…/Notebook/index.tsx:1249-1325` | per-cell mount: `sessionId` into `ChartCell` |
| `…/Notebook/model/openEvalDriver.ts:7, 68, 77` | `runOpenAndEval` / `runEval` take `sessionId` + `lapContext` |
| `…/Notebook/model/sessionSpanDriver.ts:51-80` | `runSessionSpan(deps, sessionId, …)`; `null` ⇒ dispatch both `null` |
| `…/Notebook/model/fftRequest.ts:16` | carries the selected `mainLap` into `fetch_fft`'s `lap` |
| `…/Notebook/model/jsCellBinding.ts:196, 260` | `bindingFor` takes `mainLap` |
| `…/Notebook/model/jsCellNote.ts:29` | the "no session selected" note |
| `…/Notebook/theme/series.ts:20-66` | `seriesColor(index, read)` over `--chart-1…8`; **no hex literal is ever written outside `tokens.css`** — this constrains what a window's `colour` may be |

Not selection: `ChartCell.tsx`'s `selectionRectPx` / `zoomToSelection` /
`hasSelection` (`chartActions.ts:31-54`) are the drag-rectangle, and
`table.tsx` / `DenseRow.tsx` "selection bar" is a border style. Excluded.

### 1.4 IPC wrappers (`app/src/ipc/`)

| File:line | Command | Scoping today |
|---|---|---|
| `workbook.ts:133-149` | — | the wire `LapContext { main_lap, overlay_laps }` type |
| `workbook.ts:186-192` | `eval_workbook(id, sessionId, lapContext)` | **the** selection-scoped call |
| `workbook.ts:205-211` | `fetch_host_channel(workbookId, sessionId, defName, budget)` | session only — **carries no lap at all** |
| `rasters.ts:165` | `fetch_fft(sessionId, channel, lap, params, averaging)` | `lap?: number` |
| `rasters.ts:73, 100` | `fetch_raster` / `fetch_raster_meta` | session + channel, no lap |
| `tiles.ts:108` | `fetch_tile(sessionId, channel, tier, tileIndex, columnCount)` | session-wide; the host clips by viewport |
| `cursor.ts:24` | `cursor_readout(sessionId, channels, tUs)` | session + an absolute `t_us` |
| `catalog.ts:325/331/379/389/417` | `get_session`, `list_laps`, `save_session_metadata`, `delete_session`, `rescan_tracks` | session-**entity** CRUD, not selection scoping — **out of scope** |

### 1.5 Rust — `idl-rs-tauri`

| File:line | What |
|---|---|
| `rust/tauri/src/commands/workbook.rs:130-149` | `pub struct LapContext { main_lap: Option<u32>, overlay_laps: Vec<u32> }` (the deserialised DTO) |
| `rust/tauri/src/commands/workbook.rs:335-353` | `eval_workbook_via` — `load_session_handle` + `load_lap_context`, or `empty_session_handle()` + `MathLapContext::empty()` |
| `rust/tauri/src/commands/workbook.rs:362` | `eval_cells(&doc, &structural, &handle, &lap_ctx)` — **one** handle, **one** lap ctx |
| `rust/tauri/src/commands/workbook.rs:388` | `table_cell_value(…, session_id.is_some(), &handle)` |
| `rust/tauri/src/commands/workbook.rs:759-773` | `#[tauri::command] eval_workbook(id, session_id, lap_context, data_dir)` |
| `rust/tauri/src/commands/workbook.rs:453-493` | `fetch_host_channel_via` — **passes `None` for the lap selection at line 472**, so a host channel is evaluated with session-wide lap context no matter what the UI selected. Pre-existing gap. |
| `rust/tauri/src/commands/rasters.rs:526-537` | `fetch_fft(session_id, channel, lap: Option<u32>, params, averaging)` |
| `rust/tauri/src/commands/rasters.rs:413-441` | `fetch_raster` / `fetch_raster_meta` — no lap |
| `rust/tauri/src/commands/tiles.rs:68-75` | `fetch_tile` — no lap |
| `rust/tauri/src/commands/cursor.rs:84-92` | `cursor_readout(session_id, channels, t_us)` |
| `rust/tauri/src/session_source.rs:82-89` | `pub fn resolve_lap_window(data_root, session_id, lap) -> Result<(f64,f64), IpcError>` — lap number → `(start_s, end_s)` from `session.json` |
| `rust/tauri/src/session_source.rs:123-175` | `pub fn load_lap_context(data_dir, session_id, handle, selection: Option<&LapContext>) -> Result<MathLapContext, IpcError>` — validates every named lap against `session.json`, builds `main_lap_bounds` / `overlay: Vec<MathOverlay>` |
| `rust/tauri/src/lib.rs:50` | `eval_workbook` registration (all commands register here, not in `app/src-tauri/`) |

### 1.6 Rust — `idl-rs` core

| File:line | What |
|---|---|
| `core/src/math/eval.rs:183-200` | `pub struct MathLapContext { main_lap_bounds: Vec<(f64,f64)>, main_sectors, main_lap_number: Option<u32>, overlay: Vec<MathOverlay>, baseline_row }` |
| `core/src/math/eval.rs:156-165` | `pub struct MathOverlay { lookup, lap_start_ms, lap_end_ms, lap_start_uniform_sec }` |
| `core/src/math/eval.rs:239-330` | `evaluate` / `evaluate_with_constants` / `evaluate_scalar` / `eval` — all take `&MathLapContext` |
| `core/src/workbook/v3/resolve.rs:138-191` | `resolve_workbook_defs(…, lap_ctx: &MathLapContext)` |
| `core/src/math/eval.rs:661-668` | `main_lap_window` |
| `core/src/math/eval.rs:1077-1128, 1204, 1239` | `current_lap()`, `sector_number()`, `lap_start_time/distance()`, `variance_time/dist` |

**Core does not scope evaluation by lap.** The session scope is the
`ChannelLookup` (one `SessionHandle`); `MathLapContext` only *injects lap
bounds* that the lap-aware and `variance_*` functions read. Nothing truncates
a channel to a window. Decision 61 ("nothing shows data outside the current
selection") is therefore not implemented anywhere today — the chart's viewport
does the visual clipping. **Consequence for sizing: a per-window evaluation
loop needs no change to any `pub` signature in `core`.**

### 1.7 One live defect this change must resolve

`core/src/math/eval.rs:661-668`:

```rust
lap_ctx.main_lap_bounds.get((n as usize).saturating_sub(1)).copied().unwrap_or((0.0, 0.0))
```

indexes `main_lap_bounds` by lap *number*. But `session_source.rs:160-163`,
on the `selection = Some(lc)` path, builds `main_lap_bounds` as a **one-entry**
vec while setting `main_lap_number = Some(n)` with the real lap number. So for
any selected main lap other than lap 1, `main_lap_window` reads index `n-1` of a
1-element vec, gets `None`, and falls back to the `(0.0, 0.0)` gating-off
sentinel: **`variance_time` / `variance_dist` silently stop gating**, and
`current_lap_at(&main_lap_bounds, …)` reports the wrong lap. Never observed
because §1.2 shows no UI has ever dispatched a lap. The window model deletes the
number-as-index coupling outright, which is the fix; call it out in the task so
the reviewer sees it is deliberate, not incidental.

---

## 2. Contract delta — prose ready to merge

### 2.1 C1 (`…-c1-session-schema.md`) — new §6.x under `session.json`

> #### Time windows
>
> A **time window** names a contiguous span of one session's recorded
> samples. It is the unit of selection (C3 §3.4, ruling R115) and has exactly
> one representation regardless of how the user picked it:
>
> ```
> Window = { session_id: string, span: Span, colour: string }
> Span   = { kind: "session" }
>        | { kind: "lap", lap_number: u32 }        // 1-based, matches LapSummary.lap_number
>        | { kind: "range", t0_us: i64, t1_us: i64 } // session-relative, t0_us < t1_us
> ```
>
> `t_us` is microseconds since the session's first sample — the same axis as
> `Channel.t_us` (§3.1), `EvalOutput.t_us` and `cursor_readout`'s `t_us`. It is
> *not* epoch time: absolute hardware time stays recorded in the session's own
> stamps (`timestamp_utc_ms`, `<source>_t_recorded_us`, §3.2) and a window
> never restates it. Resolving a window is therefore always a read of one
> session plus arithmetic, and a window is meaningless without its
> `session_id`.
>
> **Resolution.** `{ kind: "session" }` resolves to the session's full recorded
> span. `{ kind: "lap", n }` resolves to `laps[n].start_time_secs …
> end_time_secs` converted to `t_us`; an `n` absent from `laps[]` is
> `invalid_argument` with `detail: { "lap": n }` (unchanged from §6's existing
> rule). `{ kind: "range" }` resolves to itself, clamped to the session's
> recorded span; a range wholly outside it resolves to the empty window.
>
> **Ordering and duplicates.** Windows are an *ordered list*. Two windows over
> the same `session_id` with different spans are legal and are the normal case
> — that is lap-to-lap comparison (R115). Two windows that resolve to the same
> span are also legal; they are not deduplicated, because the user may want the
> same lap in two colours in two roles.
>
> **`colour`** is a chart-token name (`--chart-1` … `--chart-8`), never a hex
> literal — the app resolves it through `Notebook/theme/series.ts`'s
> `seriesColor`, and `tokens.css` stays the only place a chart hue is written
> (decision 84 picks the token in the Data tab).
>
> Nothing about a window is written to `session.json` or to a workbook. A
> window is UI selection state (ledger R41), lives only in memory, and does not
> survive a restart (decision 48).

`session.json` itself is **unchanged**: `laps[]`, `main_lap_number` and the
`lap_detector_version` stamp (R83) all keep their current meaning. `Span`'s
`lap` arm reads them; it does not add to them.

### 2.2 C3 (`…-c3-ipc-surface.md`) §3.4 — `eval_workbook` → `eval_workbook_v2`

C3 §5 forbids changing a signature in place for a breaking change: a new name
or `_v2`, the old one kept deprecated for exactly one revision. The
`session_id` + `lap_context` pair cannot become a window list additively
without leaving two representations alive at once, which R111 forbids in the
app. So:

> **`eval_workbook_v2(id: string, windows: Window[]) → CellOutput[][]`**
>
> Evaluates workbook `id` once per entry of `windows`, in order, returning one
> `CellOutput[]` per window in the same order. `windows: []` evaluates once
> against no session — byte-identical to `eval_workbook(id, null, null)`, the
> "nothing selected" result (decision 48), and returns `[[…]]` (one element,
> not zero) so a caller always has a result array to render.
>
> `Window` is C1 §6.x's shape, `snake_case` on the wire:
> `{ session_id, span, colour }`, `span` a tagged union on `kind`.
>
> Errors are per call, not per window: an unresolvable `session_id`
> (`not_found`) or an unknown lap number (`invalid_argument`, `detail: {
> "lap": n }`) fails the whole call, naming the offending window's index in
> `detail: { "window": i }`. Per-cell evaluation errors keep their existing
> home in `CellOutput.errors`.
>
> **`eval_workbook(id, session_id, lap_context)` is deprecated** as of this
> revision and is removed in the next. It is kept registered and behaves
> exactly as before. No TypeScript caller uses it after this revision.

> **`fetch_host_channel(workbook_id, session_id, def_name, budget)` →
> `fetch_host_channel_v2(workbook_id, window, def_name, budget)`**
>
> `window` is a single `Window | null`. This closes a live gap:
> `fetch_host_channel_via` passes `None` for the lap selection today
> (`workbook.rs:472`), so a host channel is evaluated session-wide while the
> matching `eval_workbook` result is evaluated lap-aware — the two disagree
> whenever a lap is selected. `null` reproduces today's session-less
> behaviour. Old command deprecated, removed next revision.

> **`fetch_fft(session_id, channel, lap, params, averaging)` →
> `fetch_fft_v2(window, channel, params, averaging)`**
>
> `lap: Option<u32>` becomes the window's span, so an FFT over a dragged range
> is expressible for the first time. R85's order stands: slice to the window
> first, then apply R76's guards to the window's own samples. R76's kinds are
> unchanged. Old command deprecated, removed next revision.

**Unchanged commands, stated so no lane guesses.** `fetch_tile` stays
session-scoped: tiles are a resolution pyramid over the whole session and the
host clips by viewport — putting a window in the tile key would fragment the
cache for no gain. `cursor_readout` stays `(session_id, channels, t_us)`: a
cursor is a point, and the caller already knows which window it is in.
`fetch_raster` / `fetch_raster_meta` keep no window in **this** lane — the
spectrogram's own time axis is a separate question, deferred to the T lane, and
noted here so it is not silently assumed done. `get_session`, `list_laps`,
`save_session_metadata`, `delete_session`, `rescan_tracks` are session-entity
CRUD and are untouched.

### 2.3 Migration — what an old workbook or persisted state does

- **Workbooks: nothing.** Selection is not in the file (R41) and C2 has no
  selection grammar. Every existing `.idl1wb` opens byte-identically. Decision
  75 is satisfied trivially, and this must be stated in the delta rather than
  left implied.
- **Persisted state: nothing.** Selection is not persisted anywhere. The only
  `localStorage` keys are `Settings/prefsStore` and `idl1.notebook.ui.v1`
  (`Notebook/model/notebookPrefs.ts`, the remembered workbook choice, R81), and
  neither holds a session or lap. Decision 48 says selection must *not* survive
  a restart, so the migration is "the app opens with `windows: []`".
- **The wire is the only lossless-migration surface**, and §2.2 handles it by
  deprecation rather than mutation: `eval_workbook(id, sid, lc)` maps forward
  as `windows: [{ session_id: sid, span: lc?.main_lap ? {kind:"lap", lap_number}
  : {kind:"session"}, colour: "--chart-1" }]` plus one window per
  `overlay_laps` entry — recorded in the contract as the equivalence the
  deprecated command's tests assert, so the removal in the next revision is
  provably behaviour-preserving.

---

## 3. Task plan

Ordered so the tree builds and tests pass at every commit. Rust and TS are
separable because the deprecated commands stay live: TS keeps calling the old
ones until Task 7.

| # | Lang | Task | Test filter |
|---|---|---|---|
| 1 | docs | Write the C1 §6.x and C3 §3.4/§3.6 deltas of §2 into the contracts, including the deprecation revision line under C3's title (C3 §5.3). Spec-first; no code. | none (lead spot-check) |
| 2 | Rust | `session_source.rs`: add `pub enum SpanDto` + `pub struct WindowDto` (serde, `snake_case`) and `pub fn resolve_window(data_root, &WindowDto) -> Result<(f64, f64), IpcError>`, generalising `resolve_lap_window` (which stays, calling the new one, until Task 6). Unit-test all three span kinds plus unknown-lap and out-of-span-range. **Touches no `pub` signature in `core`.** | `cargo test -p idl-rs-tauri session_source` |
| 3 | Rust | `session_source.rs`: `pub fn load_window_context(data_dir, &WindowDto, handle) -> Result<MathLapContext, IpcError>` — builds a `MathLapContext` whose `main_lap_bounds` is the resolved window and whose `main_lap_number` is `Some(1)` for *every* span kind, so lap number is no longer an index into that vec. **Fix `core/src/math/eval.rs:661-668`'s `main_lap_window` indexing bug (§1.7) in the same commit** and add the regression test that fails without it (`main_lap_number = Some(3)` over a one-entry bounds vec). `main_lap_window` is private; no `pub` signature changes, but note the core edit in the commit message. | `cargo test -p idl-rs main_lap` and `cargo test -p idl-rs-tauri load_window_context` |
| 4 | Rust | `commands/workbook.rs`: add `eval_workbook_v2(id, windows)` looping `load_session_handle` + `load_window_context` + `eval_cells` per window, returning `Vec<Vec<CellOutput>>`; `windows: []` → one session-less result. Register in `rust/tauri/src/lib.rs`. Old `eval_workbook` untouched. Test the empty-list case is byte-identical to `eval_workbook_via(id, None, None)` (the fixture at `workbook.rs:1403` is the model), plus two windows over one session with different laps. | `cargo test -p idl-rs-tauri commands::workbook` |
| 5 | Rust | `commands/workbook.rs`: `fetch_host_channel_v2(workbook_id, window, def_name, budget)` — same `load_window_context`, closing the `None`-at-line-472 gap. Register. Test that a lap window and `eval_workbook_v2` over the same window agree on the def's value. | `cargo test -p idl-rs-tauri fetch_host_channel` |
| 6 | Rust | `commands/rasters.rs`: `fetch_fft_v2(window, channel, params, averaging)` over `resolve_window`; R85's slice-then-guard order preserved. Register. Retire `resolve_lap_window`'s pass-through if nothing else calls it. Test: range window vs the lap window covering the same span produce identical bytes. | `cargo test -p idl-rs-tauri commands::rasters` |
| 7 | TS | `app/src/state/selection.ts` (new, pure): `SelectionWindow`, `Span`, `windowKey`, `nextWindows(current, clicked, modifier)` (toggle / add / replace), `assignColour(windows)` cycling `--chart-1…8`, `describeWindow` for the top-bar chip. No React, no IPC. Tests beside it. | `npx vitest run selection` |
| 8 | TS | `AppState.tsx`: `Selection` becomes `SelectionWindow[]`; `initialSelection = []`; replace `SET_SELECTED_SESSION`/`SET_LAP_CONTEXT` with `SET_WINDOWS` / `TOGGLE_WINDOW` / `SET_WINDOW_COLOUR` delegating to Task 7's pure functions. **Delete the old shape outright (R111).** Update `AppState.selection.test.ts`. Tree breaks until Task 9 — so 8 and 9 are one commit if `tsc` cannot pass between them; prefer one commit and say so. | `npx tsc --noEmit && npx vitest run AppState` |
| 9 | TS | `ipc/workbook.ts` + `ipc/rasters.ts`: wire types for `Window`/`Span`, `evalWorkbookV2`, `fetchHostChannelV2`, `fetchFftV2`; delete the `LapContext` wire type and the old wrappers (the Rust commands stay registered but unused). Update `ipc/workbook.test.ts`. | `npx tsc --noEmit && npx vitest run ipc/workbook ipc/rasters` |
| 10 | TS | Notebook read path: `openEvalDriver.ts` (`runOpenAndEval`/`runEval` take `windows`), `sessionSpanDriver.ts` (per-window, or first-window — see Open question 4), `fftRequest.ts`, `jsCellBinding.ts`, `jsCellNote.ts`. Effect dependency arrays key on a stable `windowsKey` string, never the array identity (operating brief §4 tightening). | `npx vitest run openEvalDriver fftRequest jsCellBinding` |
| 11 | TS | `Notebook/index.tsx` wiring to the new drivers; one chart series per (window × channel), coloured by the window's token via `seriesColor`. Rendering is not unit-tested (CLAUDE.md §4); the gate is `tsc` plus the Task 10 filters still green. | `npx tsc --noEmit && npx vitest run Notebook` |
| 12 | TS | Data tab: multi-select rows (`sessionRow.ts` → `nextWindows`), lap rows in `LapTable.tsx` become clickable and mint a `{kind:"lap"}` window, and the per-window colour picker (decision 84) in `DetailPane.tsx`, choosing among the eight tokens only. | `npx vitest run sessionRow Data` |
| 13 | TS | `shell/TopBar.tsx`: the chip becomes n chips (or "n windows" past a threshold), each in its window's colour, dismissable. | `npx tsc --noEmit && npx vitest run TopBar` |

No task changes a `pub` signature in `core`, so **no task needs `cargo check -p
idl-rs-cli --tests`** — Task 3 edits a private fn (`main_lap_window`) in
`core/src/math/eval.rs` and adds a test; if the reviewer disagrees that it is
private-only, add the check to Task 3 and nowhere else.

Lane merge gate (once, per CLAUDE.md §8): `cargo test -p idl-rs -p idl-rs-cli
-- --test-threads=4`, then `npx tsc --noEmit && npx vitest run`.

---

## 4. Open questions for the lead

1. **Explicit ranges: session-relative or absolute hardware time?**
   *Recommendation: session-relative `t_us` (i64), microseconds since the
   session's first sample.* It is the axis `Channel.t_us`, `EvalOutput.t_us`
   and `cursor_readout` already speak, and it is what a drag gesture produces
   without conversion. "Time is recorded, not assumed" is honoured because the
   window is meaningless without its `session_id`, and the absolute stamps stay
   in the session, unrestated. Absolute epoch time would force every consumer to
   subtract, and would make a window silently wrong if a session's stamps were
   later corrected.

2. **Two windows over the same session with different laps — legal?**
   *Recommendation: yes, explicitly, and stated in C1 so no consumer
   deduplicates by `session_id`.* R115 makes lap-to-lap comparison the same
   operation as session-to-session, so this is the common case, not an edge.
   Also allow two windows resolving to the *same* span (same lap, two colours).

3. **`eval_workbook_v2` vs an additive `windows` argument.**
   C3 §5 forbids in-place signature changes, but there is precedent for an
   additive trailing optional argument (`lap_context` was added that way).
   *Recommendation: `_v2` with the old command deprecated for one revision.*
   An additive argument would leave `session_id`, `lap_context` and `windows`
   all live simultaneously — exactly the two-representations state R111 forbids
   — whereas `_v2` keeps one representation in the app while satisfying §5's
   migration window. Costs three new command names (`eval_workbook_v2`,
   `fetch_host_channel_v2`, `fetch_fft_v2`).

4. **Is evaluation scoped per window, or does it get the whole list?**
   *Recommendation: per window — `eval_workbook_v2` loops and returns
   `CellOutput[][]`, one per window, and `core` is not touched.* §1.6 shows
   evaluation is scoped by the `ChannelLookup` (one `SessionHandle`), so
   "the whole list at once" would need a multi-session lookup in `core` — a
   language change adjacent to R110's n-D work, not a selection change. The
   cost is N session loads per eval (the existing `TODO(idl0)` at
   `cursor.rs:80` about re-reading `data.parquet` per call gets N times worse);
   if that bites, the fix is the session cache that TODO already names, not a
   different contract. **If you want cross-window expressions in the language
   (`variance` against another *session*'s lap), that is the R73 cross-session
   overlay amendment and is out of this lane — say so and I will not build
   toward it.**

5. **What happens to a window when its session is deleted?**
   *Recommendation: `delete_session` returns as it does today, and the Data tab
   drops every window naming that `session_id` from the list, immediately and
   silently.* Decision 61 already says an unselected window empties everything
   that depended on it, so this is the same behaviour with a different trigger,
   and a modal confirming "this will deselect 2 windows" adds a click the field
   loop does not need (philosophy 73). Alternative if you prefer: keep the
   window and render it as an error slot (decision 58's empty-slot-plus-Fix
   pattern). I recommend against — there is nothing to fix.

6. **`colour` as a `--chart-N` token name, or a free hex?**
   *Recommendation: token name only, eight choices.* `theme/series.ts` exists
   specifically so no hex literal is written outside `tokens.css`, and
   `tokenSheet.test.ts` enforces it. A free picker would be the first
   hardcoded colour in the app. If you want more than eight distinct windows on
   one chart, the answer is line style (decision 84's "line type would be a
   great addition"), not a ninth hue.

7. **Should this lane fix `fetch_host_channel`'s missing lap context
   (`workbook.rs:472`)?** *Recommendation: yes, in Task 5.* It is a real
   disagreement between two results of the same selection, it is invisible
   today only because no UI ever picked a lap, and the command is being
   re-minted as `_v2` anyway — fixing it later would mean a third version.
