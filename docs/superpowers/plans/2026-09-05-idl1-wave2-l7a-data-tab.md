# idl1 Wave 2 — L7a: Data tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port idl0's Data tab — the faceted catalog browser, the session/lap
results tree, the tracks table, the session-detail and metadata surfaces, and
file import — onto the landed C3 catalog and import commands. The user opens
idl1, sees every session in the store, narrows it by facet, opens one, reads
its channels and laps, edits its metadata, and imports new files with visible
progress.

**Architecture:** One lane, one directory. `app/src/routes/pages/Data/`
becomes a directory of a page component plus **pure TypeScript modules** that
hold every decision worth testing: row view-models, formatting, sort
comparators, the filter model and its predicate, facet counting, the import
queue reducer, and the metadata-form draft. React components read those
modules and draw. No number the store depends on is computed here — everything
this lane computes is a *display* derivation of what `list_sessions`,
`get_session`, `list_laps`, `list_tracks` and `get_track` already returned
(CLAUDE.md §2's "Rust = numbers, JS = pictures"; the catalog's own numbers come
from Rust).

The lane calls only the typed wrappers already in `app/src/ipc/`:
`catalog.ts` (§3.2, all seven commands landed with L5) and `import.ts`
(§3.3, landing with L5 Task 9). Every write the tab needs — metadata edits,
track CRUD, session delete, quarantine review — has **no C3 command**; those
go through a lane-local typed stub that throws until the Rust write lane
lands them (operating brief §3). The stubs' signatures are the ones proposed
in `runs/2026-09-05/lanes/l7/IPC-NEEDS.md`, so replacing a stub with a real
wrapper is an import-path change, not a rewrite.

**Tech Stack:** React 19 + TypeScript + Vite + vitest at the M0 ecosystem
report's pins (`docs/superpowers/specs/2026-09-02-idl1-m0-ecosystem.md`).
**No new npm dependency is added by this plan.** Date formatting, number
formatting and list virtualisation are hand-written in the lane's own pure
modules — `intl` (idl0's `DateFormat`) is replaced by the platform's own
`Intl.DateTimeFormat`, which needs no package and is available in every
WebView the app targets.

**Spec:**
- `CLAUDE.md` (standing orders; §1 ambiguity, §2 layers, §3 principles, §4 testing, §7 hygiene, §8 compute).
- `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §2 (ownership), §3 (contract freeze), §4 (gates) — binding.
- `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md` §3, §10 (L7 row: "Feature parity with idl0 for those tabs"), §12.
- `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` §1, §2, §3.2, §3.3, §4 — the only commands this lane may call.
- `docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md` §2, §4, §6 — what a session and its metadata are.
- `docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md` §2, §5 — the tree and the catalog tables the summaries mirror.
- `docs/IDL0_SPEC.md` §24 (Tab — Data) — the app-side section this lane rewrites.
- Read-only reference: `C:\Users\isaac\Documents\Saucy\saucyeng\idl0-app\app\lib\ui\tabs\data\` and `...\lib\providers\data_filters_provider.dart`, `data_results_provider.dart`, `session_provider.dart`.
- Offline docs: `docs/vendor/react-19/`.

**Spec discipline (CLAUDE.md §6), declared per task:**
- Tasks 1, 2, 4, 6, 8 — **no spec change needed** (they implement C3 §3.2/§3.3 and the design doc; nothing user-visible is documented differently in `docs/IDL0_SPEC.md`).
- Tasks 3, 5, 7 — **spec-during**, all three rewriting parts of **`docs/IDL0_SPEC.md` §24 (Tab — Data)** in the same commit as the code: Task 3 rewrites §24's facet inventory (the idl1 facet set differs from idl0's — see Parity gaps), Task 5 rewrites §24's import section (idl0 imported `.idl0`/`.gpx` through a Dart runs provider; idl1 imports through C3 §3.3 with a `Channel<Progress>` and a forced-importer choice), Task 7 rewrites §24's metadata-editor section (the fields are now C1 §6's `session.json` fields, and the save path is an IPC command that does not exist yet).
- Every task appends a `CHANGELOG.md` bullet. `TASKS.md`'s L7a line is ticked only by Task 8.

## Global Constraints

- **Worktree and branch**, created before Task 1's first step:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
  git worktree add -b wave2-l7a-data "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7a-data" main
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7a-data"
  git submodule update --init -- rust
  ```
  Working directory for every task: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`.
  `npm ci` is run **once**, at worktree setup, before Task 1 — never inside a task.
- **No cargo, ever.** Not `cargo test`, not `cargo check`, not `cargo build`, not `npm run tauri`. The §8 hook denies it under `idl1-app-worktrees/wave2-*`. This lane never builds Rust and never needs to: the commands it calls are already registered, and the ones it needs are stubs.
- **No new npm dependency**, and no `npm install` inside a task. A dependency the lane believes it needs is a question to the lead with the bundle-size cost stated (operating brief §2).
- **Files this lane owns** (operating brief §2): `app/src/routes/pages/Data/**`, its own `*.test.ts` files, and — additive type fixes only, where the file disagrees with C3 as written — `app/src/ipc/catalog.ts` / `app/src/ipc/import.ts`. **Never** a new command in `app/src/ipc/`, never `rust/`, never `app/src-tauri/`, never `App.tsx` / `App.css` / `main.tsx` / `routes/types.ts` / `state/AppState.tsx` / `package.json` / `vite.config.ts`.
- **The app shell does not change.** Task 1 keeps `app/src/routes/pages/DataPage.tsx` alive as a one-line re-export of the new directory, so `App.tsx`'s import path is untouched. Retiring the shim is a lead shell task, not this lane's (see Open questions).
- **Gate, every task, never skipped** (operating brief §4), run from the worktree:
  ```
  cd app && npx tsc --noEmit && npx vitest run <the filter this task names>
  ```
  `vitest` must report a **non-zero `passed` count** — a filter matching nothing is a failed gate, not a pass. `tsc` must print nothing.
- **Testing** (CLAUDE.md §4): Arrange / Act / Assert with blank lines between; test names `thing — condition — result`; tests beside the module as `*.test.ts`. Test **only what we own** — the pure modules named in each task (> 80 % of their lines). **No rendering tests**: no React Testing Library, no snapshot of a component tree, no jsdom assertions about the DOM. A component is correct when its pure module is tested and the lead eyeballs the tab.
- **Errors are typed.** Every `invoke` rejection is a C3 §2 `IpcError` (`{ kind, message, detail? }`). The lane routes on `kind`, never on `message` (C3 §2). One shared mapper, `errors.ts`, turns a rejection into the text the tab shows; it is pure and tested.
- Doc comment on every exported symbol; units on every numeric value (`_ms`, `_bytes`); `// TODO(idl0):` never a bare `// TODO`.
- **No AI attribution trailers** in any commit. **Never `git push`** — Isaac pushes.

---

### Task 1: `DataPage.tsx` → `Data/`, and the session list on screen

**Spec discipline:** no spec change needed.

**Files:**
- Create: `app/src/routes/pages/Data/index.tsx`, `app/src/routes/pages/Data/sessionRow.ts`, `app/src/routes/pages/Data/sessionRow.test.ts`, `app/src/routes/pages/Data/errors.ts`, `app/src/routes/pages/Data/errors.test.ts`
- Modify: `app/src/routes/pages/DataPage.tsx` (becomes `export { default } from "./Data";`)

**Interfaces:**
- Produces `SessionRow` — the view-model every list view renders, derived from one `SessionSummary` (C3 §3.2): the row's stable key, its display date and time in the viewer's locale, its **display venue** (the summary's `venue_name`, falling back to `""` — the track-derived fallback idl0 used needs `get_session`, so it lands in Task 6), its formatted duration and lap count, and its source-format badge.
- Produces `describeIpcError(e: unknown): { kind: string; text: string; retryable: boolean }` — the one place a rejected `invoke` becomes user-facing text.

- [ ] **Step 1: Write the failing tests**

`sessionRow.test.ts` — cases:
- `toSessionRow — summary with duration_ms and lap_count set — formats both`
- `toSessionRow — duration_ms null — duration reads "—", never "0:00"`
- `toSessionRow — lap_count null — lap count reads "—" (laps not indexed yet, C3 §3.2)`
- `toSessionRow — timestamp_utc_ms is 0 — date reads "unknown" (C1 §3.1: 0 = unknown, not 1970)`
- `toSessionRow — venue_name empty — display venue is "(none)", matching the facet's synthetic entry`
- `groupKeyOf — two sessions on the same local date and venue — same key`
- `groupKeyOf — same date, different venue — different keys`

`errors.test.ts` — cases:
- `describeIpcError — IpcError with kind "not_found" — text names the missing entity, retryable false`
- `describeIpcError — IpcError with kind "io" — text suggests rebuilding the catalog, retryable true`
- `describeIpcError — kind the frontend has never seen — falls through to a generic message, never throws (C3 §5: kinds are additive)`
- `describeIpcError — a plain Error, not an IpcError — still produces text, never throws`

- [ ] **Step 2: Implement `sessionRow.ts` and `errors.ts`**

```ts
import type { SessionSummary } from "../../../ipc/catalog";

/** One row in the sessions result list — a pure display derivation of one
 *  `SessionSummary` (C3 §3.2). Holds no engine truth: every number here came
 *  from the catalog, formatted for the screen only. */
export interface SessionRow {
  sessionId: string;
  /** `timestamp_utc_ms` rendered in the viewer's locale; "unknown" when the
   *  summary's `timestamp_utc_ms` is 0 (C1 §3.1: 0 means unknown). */
  dateText: string;
  timeText: string;
  /** `venue_name`, or "(none)" when empty — the same synthetic label the
   *  venue facet uses so a filtered row and its chip agree. */
  venueText: string;
  riderText: string;
  bikeText: string;
  /** `duration_ms` as `h:mm:ss`, or "—" when null. */
  durationText: string;
  /** `lap_count` as digits, or "—" when null (laps not indexed yet). */
  lapCountText: string;
  sourceFormat: SessionSummary["source_format"];
  /** Sort/group key: local ISO date (`YYYY-MM-DD`) plus display venue. */
  groupKey: string;
}
```
`errors.ts` maps the C3 §2 kind vocabulary the Data tab can actually see —
`not_found`, `invalid_argument`, `io`, `internal`, `conflict`, and the seven
`import_*` / three `parse_*` kinds — with a default arm for anything else.

- [ ] **Step 3: Move the page into a directory**

`app/src/routes/pages/Data/index.tsx` — the page component. It calls
`listSessions()` once on mount, holds `{ status: "loading" | "ready" | "error" }`
in a `useReducer`, and renders a plain table of `SessionRow`s with a loading
state, an error state (through `describeIpcError`), and an empty state ("No
sessions yet — import a file"). No filter rail, no sorting, no detail pane
yet; those are Tasks 2–4.

`app/src/routes/pages/DataPage.tsx` becomes exactly:
```tsx
/** Kept so the app shell's import path is unchanged while L7a owns
 *  `routes/pages/Data/`. Retiring this shim is a lead shell task. */
export { default } from "./Data";
```

- [ ] **Step 4: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
```
Expected: 11 new tests passed, 0 failed; `tsc` silent.

- [ ] **Step 5: CHANGELOG**

`- **Data tab: session list over C3 §3.2 list_sessions.** DataPage becomes routes/pages/Data/; pure SessionRow view-model and typed IpcError mapper, both tested.`

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "app: Data tab directory + session list over list_sessions"
```

---

### Task 2: Formatting and sorting

**Spec discipline:** no spec change needed.

**Files:**
- Create: `Data/format.ts`, `Data/format.test.ts`, `Data/sort.ts`, `Data/sort.test.ts`
- Modify: `Data/index.tsx` (sort control in the toolbar), `Data/sessionRow.ts` (use `format.ts`)

**Interfaces:**
- `format.ts`: `formatLapTimeMs(ms) → "m:ss.SSS"`, `formatDurationMs(ms) → "h:mm:ss"`, `formatDateMs(ms) / formatTimeMs(ms)` (locale, via `Intl.DateTimeFormat`), `formatBytes(n)`, `localIsoDate(ms)`.
- `sort.ts`: `SortField = "date" | "bestLap" | "duration" | "lapCount" | "lastRidden" | "name"`, `sortFieldsForView(view)`, `defaultAscendingFor(field)`, `compareSessions(a, b, field, ascending)`, `compareTracks(...)` — ported field-for-field from idl0's `data_filters_provider.dart` (`DataSortField`, `DataSortFieldX.defaultAscending`, `sortFieldsForView`).

- [ ] **Step 1: Write the failing tests**

`format.test.ts`:
- `formatLapTimeMs — 83_456 ms — reads "1:23.456"`
- `formatLapTimeMs — under a minute — still shows a leading "0:"`
- `formatLapTimeMs — negative or NaN — reads "—", never a nonsense clock`
- `formatDurationMs — 3_723_000 ms — reads "1:02:03"`
- `formatDurationMs — under an hour — omits the hour field`
- `formatBytes — 1_048_576 bytes — reads "1.0 MB"`
- `localIsoDate — a UTC ms value — groups by the viewer's local date, not the UTC date`

`sort.test.ts`:
- `sortFieldsForView — sessions view — date leads the list (its default field)`
- `sortFieldsForView — tracks view — lastRidden leads the list`
- `defaultAscendingFor — bestLap and name — ascending; every other field — descending`
- `compareSessions — sorting by duration with one null duration_ms — nulls sort last in both directions`
- `compareSessions — sorting by date ascending then descending — exactly reverses the order`
- `compareSessions — two sessions with equal keys — order is stable by session_id`

- [ ] **Step 2: Implement, then wire the sort control**

The toolbar gets idl0's compact control: a field chooser (only the fields
valid for the active view) plus an independent direction toggle. Choosing a
field resets direction to that field's `defaultAscendingFor`; the arrow then
overrides it — exactly idl0's `_SortControl` semantics.

- [ ] **Step 3: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
```
Expected: 13 new tests passed on top of Task 1's, 0 failed.

- [ ] **Step 4: CHANGELOG + commit**

`- **Data tab: formatting and sort model.** Lap/duration/byte/date formatters and the per-view sort field sets with their default directions, ported from idl0's data_filters_provider.`

---

### Task 3: The filter model and the filter rail

**Spec discipline:** **spec-during** — rewrites `docs/IDL0_SPEC.md` §24's facet
inventory in the same commit. idl1's facet set is not idl0's: the Track facet
is present but its options come from `list_tracks`; the source facet's
vocabulary is C3's `source_format` (`idl0 | fit | gpx | csv`), not idl0's
`SessionSourceType`; and **has-gates / has-GPS are dropped for wave 2** (see
Parity gaps) because neither is derivable from a `SessionSummary`.

**Files:**
- Create: `Data/filters.ts`, `Data/filters.test.ts`, `Data/facets.ts`, `Data/facets.test.ts`, `Data/FilterRail.tsx`, `Data/ActiveChips.tsx`
- Modify: `Data/index.tsx`, `docs/IDL0_SPEC.md` (§24 facet inventory), `CHANGELOG.md`

**Interfaces:**
- `filters.ts`: the `DataFilters` shape (date range ms, `trackIds`/`bikes`/`riders`/`tags`/`venues` as `Set<string>` where `""` is the synthetic "(none)", `lapTimeMs` range, `sources`, `searchText`, `view`, `sortField`, `sortAscending`), `initialFilters`, a pure `filtersReducer(state, action)` covering every toggle/set/clear, plus `activeCount(filters)` and `hasAnyActiveFilter(filters)`.
- `facets.ts`: `matchesFilters(row, filters): boolean` — AND across categories, OR within a multi-select facet, `""` matching a row whose field is empty — and `facetCounts(rows, filters)` for the per-option `(N)` badges.

- [ ] **Step 1: Write the failing tests**

`filters.test.ts`:
- `filtersReducer — TOGGLE_BIKE on an unselected value — adds it; toggling again — removes it`
- `filtersReducer — CLEAR_ALL — returns exactly initialFilters, view and sort preserved`
- `filtersReducer — SET_VIEW — leaves every row-affecting facet untouched`
- `activeCount — three facets active — counts three, ignoring view and sort`
- `hasAnyActiveFilter — only view and sort set — false`
- `filtersReducer — SET_SORT_FIELD — direction resets to that field's default`

`facets.test.ts`:
- `matchesFilters — no active facets — every row matches`
- `matchesFilters — two bikes selected — a row matching either passes (OR within a facet)`
- `matchesFilters — a bike and a rider selected — a row must match both (AND across facets)`
- `matchesFilters — "(none)" selected for tag — matches only rows whose tag is ""`
- `matchesFilters — date range — a row on the range's own last day still matches (inclusive)`
- `matchesFilters — search text — matches case-insensitively across venue, comments and tag`
- `matchesFilters — lap-time range with a null duration row — the row is excluded, not included by default`
- `facetCounts — counts each option against the other facets, not against its own — selecting one bike leaves the other bikes' counts visible`

- [ ] **Step 2: Implement, then build the rail and the chip row**

`FilterRail.tsx` renders the facet groups (date, track, bike, rider, tag,
venue, lap time, source) with counts; `ActiveChips.tsx` renders one dismissible
chip per active facet plus "Clear all" — idl0's `_ActiveChipRow` semantics,
including the `mm:ss` lap-range label and the `start → end` date label.
Narrow-width behaviour (the rail as a bottom sheet, the "FILTERS (n)" bar) is
a CSS/media-query concern of these two components; no separate module.

- [ ] **Step 3: Rewrite `docs/IDL0_SPEC.md` §24's facet inventory**

State the idl1 facet set, what each facet reads (`SessionSummary` field or
`list_tracks`), the AND-across / OR-within rule, the `""`-is-"(none)"
convention, and — explicitly — that has-gates and has-GPS are not present in
wave 2 and why.

- [ ] **Step 4: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
```
Expected: 14 new tests passed, 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

---

### Task 4: Session detail — `get_session` + `list_laps`

**Spec discipline:** no spec change needed.

**Files:**
- Create: `Data/sessionDetail.ts`, `Data/sessionDetail.test.ts`, `Data/DetailPane.tsx`, `Data/LapTable.tsx`
- Modify: `Data/index.tsx` (selection → detail), `Data/sessionRow.ts` (venue fallback, now that detail is available)

**Interfaces:**
- `sessionDetail.ts`: `toDetailView(detail: SessionDetail, laps: LapSummary[]): DetailView` — merges C3 §3.2's two shapes into what the pane draws: the metadata block, the channel table (`channel_id`, unit, `source_kind`, `channel_kind`, `sample_count`, and `nominal_rate_hz` **labelled metadata-only**, C1 §3.5), and one lap table joining `SessionDetail.laps` (`LapDetail`, file-native) to `list_laps`'s `LapSummary` (catalog-cached) **by `lap_number`**, marking rows present in one source but not the other rather than silently dropping them.
- `bestLapMs(laps)`, `ignoredLapNumbers` / `referenceLapNumber` display flags from `SessionDetail`.

- [ ] **Step 1: Write the failing tests**

- `toDetailView — laps present in both sources — one row per lap_number, catalog stats attached`
- `toDetailView — a lap in session.json with no catalog row — row present, stats marked unavailable, never dropped`
- `toDetailView — a catalog lap with no session.json lap — row present and flagged stale, never dropped`
- `toDetailView — ignored_lap_numbers contains lap 3 — lap 3's row is flagged ignored`
- `toDetailView — reference_lap_number null — the fastest lap is marked as reference (C1 §6: null means "use fastest lap")`
- `bestLapMs — every lap ignored — returns null, not Infinity`
- `toDetailView — a channel with nominal_rate_hz 0 — renders as an event channel (C1 §4.2)`

- [ ] **Step 2: Implement and wire**

Selecting a row calls `getSession(id)` and `listLaps(id)` **in parallel**, on
selection settle, never on hover (C3 §4 lists both as settle-bound). A
`list_laps` rejection with kind `not_found` is not an error state for the pane
— it means laps are not indexed yet; the pane renders the metadata and channel
blocks and says so.

- [ ] **Step 3: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
```
Expected: 7 new tests passed, 0 failed.

- [ ] **Step 4: CHANGELOG + commit**

---

### Task 5: Import — file picking, `Channel<Progress>`, and the result

**Spec discipline:** **spec-during** — rewrites `docs/IDL0_SPEC.md` §24's
import section in the same commit (idl1 imports via C3 §3.3 with streamed
progress and an optional forced importer; idl0's Dart runs-provider flow is
gone).

**Files:**
- Create: `Data/importQueue.ts`, `Data/importQueue.test.ts`, `Data/ImportPanel.tsx`
- Modify: `Data/index.tsx` (toolbar Import button), `docs/IDL0_SPEC.md` §24

**Interfaces:**
- `importQueue.ts`: a pure reducer over `{ items: ImportItem[] }` where `ImportItem = { path, importerId: string | null, phase: string, done: number, total: number | null, status: "queued" | "running" | "done" | "failed", error?: string, sessionId?: string }`, with actions `ENQUEUE`, `START`, `PROGRESS` (a C3 §1 `Progress` payload), `SUCCEEDED` (a `SessionSummary`), `FAILED` (an `IpcError`), `DISMISS`. Plus `overallPercent(state): number | null` — `null` when any running item has `total === null` (C3 §1 allows an unknown total; a fake percentage is worse than none).

- [ ] **Step 1: Write the failing tests**

- `importQueue — PROGRESS with total null — item shows a phase and a count, overallPercent is null`
- `importQueue — PROGRESS then SUCCEEDED — status done, session id recorded, progress no longer advances`
- `importQueue — FAILED with kind import_gpx_no_trackpoints — status failed, the kind's text is kept for display`
- `importQueue — one file fails, another succeeds — the failure never cancels the other item`
- `importQueue — PROGRESS for an item already done — ignored, no state change`
- `overallPercent — three items, two done — reports progress across the queue, not per file`
- `importQueue — DISMISS a failed item — removed; a running item — refused`

- [ ] **Step 2: Implement and wire**

The Import button opens the file picker, enqueues the chosen paths, and runs
them **one at a time** (serialised — the engine's import is CPU- and I/O-heavy
and this machine is memory-bound, R13). Each call is `importFile(path,
importerId, onProgress)` from `app/src/ipc/import.ts`, which already
constructs the `Channel<Progress>` (C3 §3.3). An importer override menu is
populated from `listImporters()`; `null` means extension auto-detection. On the
queue draining, the tab re-runs `listSessions()`.

**Note on availability:** `import_file` and `list_importers` are C3 §3.3
commands whose Rust side lands with **L5 Task 9** on the Rust track. Until it
lands both calls reject; the panel shows that as a failed item through
`describeIpcError`, which is the correct behaviour and needs no stub. Do not
add a stub for these two — they are contract commands, not IPC needs.

- [ ] **Step 3: Rewrite `docs/IDL0_SPEC.md` §24's import section**

- [ ] **Step 4: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
```
Expected: 7 new tests passed, 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

---

### Task 6: Tracks view

**Spec discipline:** no spec change needed.

**Files:**
- Create: `Data/trackRow.ts`, `Data/trackRow.test.ts`, `Data/TrackResults.tsx`, `Data/TrackDetailPane.tsx`
- Modify: `Data/index.tsx` (view toggle), `Data/sessionRow.ts` (track-derived venue fallback), `Data/ipcStubs.ts` (created here — track write stubs)

**Interfaces:**
- `trackRow.ts`: `toTrackRow(summary: TrackSummary): TrackRow` and `resolveDisplayVenue(session: SessionSummary, visits, tracksById): string` — idl0's `SessionRow.displayVenueName` rule (the session's own `venue_name`, else the first non-empty `venue_name` among its visited tracks, else `""`).
- `ipcStubs.ts`: `NotImplementedError` (a TS `Error` subclass carrying `command: string`) plus one typed stub per IPC need this lane has. **A stub is never an `IpcError`** — C3 §2's kind vocabulary is additive-only and shipping a `not_implemented` kind for a UI placeholder would put a placeholder in a signed contract.

- [ ] **Step 1: Write the failing tests**

- `toTrackRow — a TrackSummary — formats created/updated timestamps and carries venue`
- `resolveDisplayVenue — session has its own venue_name — uses it, ignoring tracks`
- `resolveDisplayVenue — session venue empty, first visited track has a venue — uses the track's`
- `resolveDisplayVenue — a visit whose track_id no longer resolves — skipped, next visit considered (idl0's §12.3 skip-on-resolve rule)`
- `resolveDisplayVenue — nothing resolves — returns "", which renders as "(none)"`
- `ipcStubs — createTrack — rejects with NotImplementedError naming the command`

- [ ] **Step 2: Implement**

`TrackResults.tsx` is the flat sortable table over `listTracks()`;
`TrackDetailPane.tsx` opens one track via `getTrack(id)` on explicit open
(settle-bound, C3 §4) and renders its scalar fields plus a count of neutral
zones / sector gates. It does **not** parse `lap_timing`, `neutral_zones`,
`sector_gates` or `reference_polyline` beyond counting: C3 §6 item 10 leaves
their shapes unfixed (`unknown[]`), so anything more would be a guess. The
track **editor** (idl0's 1204-line `track_editor_modal.dart`) is not built
here — see Parity gaps and IPC-NEEDS.

- [ ] **Step 3: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
```
Expected: 6 new tests passed, 0 failed.

- [ ] **Step 4: CHANGELOG + commit**

---

### Task 7: Metadata editor

**Spec discipline:** **spec-during** — rewrites `docs/IDL0_SPEC.md` §24's
metadata-editor section in the same commit. The editable fields are now C1 §6's
`session.json` fields, and the save path is `save_session_metadata`, an IPC
need with no command behind it in wave 2.

**Files:**
- Create: `Data/metadataForm.ts`, `Data/metadataForm.test.ts`, `Data/MetadataForm.tsx`
- Modify: `Data/DetailPane.tsx`, `Data/ipcStubs.ts`, `docs/IDL0_SPEC.md` §24

**Interfaces:**
- `metadataForm.ts`: `initialDraft(detail: SessionDetail, tracks: TrackSummary[]): MetadataDraft` (nine fields — rider, bike, bike comment, venue, event, event session, tag, short comment, long comment — with venue **pre-filled from the resolved display venue** so saving persists the venue the card already shows, idl0's §24.10 rule), `isDirty(draft, detail)`, `venueOptions(tracks)`, `normalizeDraft(draft)` (trim every field; `""` is the only "not set" representation — C1 §6 has no null), and `toSavePayload(sessionId, draft)`.

- [ ] **Step 1: Write the failing tests**

- `initialDraft — session with an empty venue_name and a visited track that has one — venue pre-filled from the track`
- `initialDraft — session with its own venue_name — venue is the session's, not the track's`
- `isDirty — nothing typed — false; one character typed — true`
- `isDirty — a field changed to a value differing only by surrounding whitespace — false after normalisation`
- `normalizeDraft — fields with leading/trailing spaces — trimmed; a field cleared — becomes "", never null (C1 §6)`
- `venueOptions — tracks with duplicate and empty venues — deduped, empties dropped, sorted`
- `toSavePayload — a draft — carries exactly the nine C1 §6 fields plus session_id, nothing else`

- [ ] **Step 2: Implement**

The form saves through `ipcStubs.saveSessionMetadata(payload)`, which rejects
with `NotImplementedError`. The UI surfaces that honestly ("Saving session
metadata isn't wired up yet") rather than pretending the save succeeded —
a form that silently discards a user's typing is worse than a form that says
it cannot save. The read-only tracks-visited summary (coalescing repeat visits
to one track) is rendered from `SessionDetail.track_visits`.

- [ ] **Step 3: Rewrite `docs/IDL0_SPEC.md` §24's metadata-editor section**

- [ ] **Step 4: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
```
Expected: 7 new tests passed, 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

---

### Task 8: Maintenance actions, and the lane's wrap-up

**Spec discipline:** no spec change needed.

**Files:**
- Modify: `Data/index.tsx` (toolbar overflow menu), `Data/ipcStubs.ts`, `CHANGELOG.md`, `TASKS.md`
- Create: `Data/maintenance.ts`, `Data/maintenance.test.ts`

**Interfaces:**
- `maintenance.ts`: a pure reducer for the long-running maintenance actions the toolbar offers — `rebuildCatalog()` (**real**, C3 §3.2) plus the stubbed `deleteSession`, `forgetSession` and `listQuarantine`/`resolveQuarantine` — tracking `{ action, status, result?, error? }` and producing the summary line each one shows ("Indexed 42 sessions, 3 workbooks, 1 track in 1.2 s").

- [ ] **Step 1: Write the failing tests**

- `maintenance — rebuildCatalog succeeds — summary names every count from the RebuildReport`
- `maintenance — rebuildCatalog with zero of everything — summary says the store is empty, not "0 0 0"`
- `maintenance — an action rejects with kind io — status failed, the error's text is kept`
- `maintenance — a second START while one is running — refused, the running action is untouched`
- `maintenance — a stubbed action — status failed with the "not wired up yet" text, never a crash`

- [ ] **Step 2: Implement the overflow menu**

`Rebuild catalog` is real. `Delete session`, `Forget session` and
`Review quarantine` call stubs and say so; each is confirmed by a dialog first,
because they are destructive the moment they become real.

- [ ] **Step 3: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
```
Expected: 5 new tests passed, 0 failed. Then the lane merge gate (operating
brief §4): `npx tsc --noEmit && npx vitest run` over the whole TS suite.

- [ ] **Step 4: CHANGELOG + TASKS**

`TASKS.md`'s L7a line is ticked here, and **only** if it names what is
outstanding, R50-style: the write commands in IPC-NEEDS, the parity gaps
below.

- [ ] **Step 5: Commit**

---

## Parity gaps

Every idl0 Data-tab feature this plan drops or defers, with its reason.
Silence is not deferral (operating brief §2).

| idl0 feature | Source | Disposition | Reason |
|---|---|---|---|
| Session metadata **save** | `metadata_editor.dart` | Built, stubbed | No C3 write command. IPC need 1. Task 7 builds the whole form against the stub. |
| Track create / edit / delete, lap-timing editor, sector list, neutral-zone list, track sidebar | `track_editor_modal.dart` (1204 lines), `track_editor_*.dart` | **Deferred to wave 3** | Needs both a write command (IPC need 2) *and* C3 §6 item 10's unfixed `TrackDetail` nested shapes. Building an editor over `unknown[]` would guess a wire format. |
| Track import conflict dialog | `track_import_conflict_dialog.dart` | Deferred with track writes | Same blocker. |
| Delete / forget session | `runs_provider.dart` | Stubbed | No C3 write command. IPC need 3. |
| Quarantine review | C4 §7 `tmp/quarantine/` | Stubbed | No C3 command. IPC need 4. |
| Rescan visits | `runs_provider.rescanAllTrackVisits` | **Dropped for wave 2** | Track-visit detection is engine work with no C3 command and no lane assigned. IPC need 5. |
| Rescan disk / repair timestamps & names | `runs_provider.rescanSessionsFromDisk`, `repairSessionFilenames` | **Replaced** by `rebuild_catalog` | idl1's catalog is an index rebuilt by scanning `<data>` (design §3), so idl0's two recovery paths collapse into one real command. The filename repair has no idl1 analogue — blobs are content-addressed and immutable. |
| Google Drive sign-in, status icon, auto-sync toggles | `drive_sync_provider.dart`, toolbar | **Dropped, permanently** | idl1 replaces Drive with LAN sync (design §7, D7). Sync UI belongs to L7c/L11, not here. |
| Has-gates / has-GPS facets | `filter_rail.dart` `_BoolFacets` | **Dropped for wave 2** | Neither is derivable from a `SessionSummary`; both need per-session track-visit and channel data, i.e. a `get_session` per row. A catalog column would be the honest fix — raised as an open question. |
| Session GPS map preview | `session_map_preview.dart`, `map_tile_source.dart` | **Deferred to wave 3** | Needs map tiles. "Offline-first means bundled: no CDN, ever" (CLAUDE.md §3) makes a tile source a real design decision, not a Data-tab detail. |
| FIT export controls | `fit_export_controls.dart` | **Deferred** | C3 has no export command (its own §6 item 1) and design §10 says "L8 (export) does not exist in v1". |
| Compare-with picker, lap ignore/restore, session/lap selection → Analyze | `compare_with_picker.dart`, `selection_provider.dart` | **Deferred to L6** | The selection model is cross-tab state living in `state/AppState.tsx`, a lead-owned shared file, and its only consumer is the notebook. See Open questions. |
| Device file sync screen | `data/sync_screen.dart` | **Moved to L7b** | It is entered from the Device tab and drives `list_device_files`/`download_file` (C3 §3.8). Filed under `data/` in idl0 by accident of layout. |
| Venue detail card | `venue_detail_card.dart` | **Dropped for wave 2** | A venue is not an entity in idl1 — it is a string field on sessions and tracks (C1 §6, C4 §5). Reintroducing a venue card means inventing a venue entity, which no contract has. |
| Narrow-layout bottom sheets and the mobile filter bar | `data_tab.dart` | **Kept as CSS**, not as a separate implementation | The rail and detail pane are one component each, responsive by media query. Mobile is L9's lane. |

## Open questions (need a lead ruling before dispatch)

1. **Retiring the `DataPage.tsx` shim.** Task 1 keeps `routes/pages/DataPage.tsx` as a one-line re-export so the shell is untouched. Options: **(a)** leave the three shims (Data/Device/Settings) permanently — zero coordination, one dead file per tab; **(b)** the lead deletes all three and updates `App.tsx`'s imports as one shell task after the three lanes merge. **Recommendation: (b)**, once, at the end — three shims is clutter, but changing `App.tsx` mid-flight would conflict across three concurrent lanes.
2. **Has-gates / has-GPS facets.** Neither is derivable from `SessionSummary`. Options: **(a)** drop them (this plan's assumption); **(b)** add `has_gps: boolean` and `track_visit_count: u32` columns to the catalog `sessions` table and to `SessionSummary` — a C4 §5 + C3 §3.2 amendment on the Rust track. **Recommendation: (a) for wave 2, (b) filed as a wave-3 amendment** — they are useful facets, but adding catalog columns mid-wave touches L1's schema and the migration, which no lane owns right now.
3. **Selection model ownership.** idl0's session/lap selection is cross-tab (Data selects, Analyze consumes). In idl1 the consumer is L6's notebook. Options: **(a)** the lead adds a `selection` slice to `state/AppState.tsx` as a shell task, and L7a dispatches into it; **(b)** L7a keeps selection lane-local and L6 re-derives it later. **Recommendation: (a)**, but only after L6's plan states what shape it needs — until then this lane keeps selection local and renders no "Analyze N selected" launcher.
4. **`SessionSummary.lap_count` vs `list_laps`.** C3 §3.2 says `lap_count` is null "until laps are indexed", but nothing in the wave-1 lanes indexes laps — L5's catalog read layer landed and `list_laps` reads `laps`/`lap_summary` tables that no import path populates. So in practice every row's lap count and every lap table may be empty at wave 2. Options: **(a)** ship it — the tab renders "—" honestly and the tables fill in when lap indexing lands; **(b)** block Tasks 4 and 8 until a lane populates the lap tables. **Recommendation: (a)**, with the emptiness stated in the CHANGELOG so nobody reads a blank lap table as a bug in this tab. **This is the one item that changes what Isaac sees on screen; it deserves an explicit answer rather than an assumption.**
5. **`LapDetail.sectors` / `.neutral_zone_visits` element shapes** are `unknown[]` (C3 §6 item 11, assigned to lead/C1). The lap table therefore shows a sector **count**, not sector times. Confirm that is acceptable for wave 2, or pin the shape in C1 §6 first.
</content>
</invoke>
