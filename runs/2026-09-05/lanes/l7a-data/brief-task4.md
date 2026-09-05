# L7a Task 4 — implementer brief (session detail: get_session + list_laps)

You are the implementer for L7a Task 4 — the session detail pane over
`get_session`/`list_laps`, and the point where this lane starts writing into
`state/AppState.tsx`'s `selection` slice (R53 Data Q3). No spec change
needed. TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
  branch `wave2-l7a-data`. **HEAD must be Task 3's commit** ("app: Data tab
  filter model, facets, and filter rail"), status clean. Verify first with
  `git log -1` and `git status`; **if Task 3's commit is not there, STOP and
  report** rather than starting from Task 2's commit — Task 3 was in
  progress when this brief was written and this task's `index.tsx` edit
  must land on top of it, not replace it. Task 3 is expected to have added
  `Data/filters.ts`, `Data/facets.ts`, `Data/FilterRail.tsx`,
  `Data/ActiveChips.tsx` and to have wired the filter rail into
  `Data/index.tsx` — this task does not touch any of those files' internals,
  only adds a selection handler to `index.tsx`.
- Work ONLY there. Never touch `rust/`, `app/src-tauri/`, `App.tsx`,
  `App.css`, `main.tsx`, `routes/types.ts`, `package.json`, `vite.config.ts`.
  **Exception, narrow:** this task reads from and dispatches into
  `app/src/state/AppState.tsx` via its exported `useAppState()` hook — it
  does **not** edit that file (it already carries the `selection` slice on
  `main`; merge `main` into this worktree first if a merge is needed to see
  it — see the merge step below).
- **No cargo, ever.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7a-data/BRIEF.md` (R53 Q3,
  Q4, Q5 sections); the plan's Task 4
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7a-data-tab.md`, lines
  294–333); `app/src/state/AppState.tsx` on `main` — confirm the `selection`
  slice (`{ sessionId: string | null, lapContext: LapContext | null }`) and
  the `SET_SELECTED_SESSION` / `SET_LAP_CONTEXT` actions are present (they
  landed in wave-2 shell task 1, commit `4272675`); if they are **not**
  present when you start, STOP and report rather than inventing the slice —
  this lane writes into it, it does not define it. `app/src/ipc/catalog.ts`'s
  `SessionDetail`, `LapDetail`, `LapSummary`, `ChannelSummary` (read the
  actual file — field names below are copied from it verbatim); the
  read-only reference `...\idl0-app\app\lib\ui\tabs\data\session_detail_card.dart`
  and `providers\session_provider.dart` for the pane's semantics (port
  behaviour, not widgets).

## Merging `main` first (R19 pattern)

Before Step 1, merge `main` into `wave2-l7a-data` to pick up the `selection`
slice and any other concurrent shell-task changes. A `CHANGELOG.md` conflict
between independent bullets under the same heading: keep both (main's first,
then this lane's), note "CHANGELOG: kept both bullets" in the merge commit
(operating brief §4). Any conflict in any other file: STOP and report — do
not resolve it yourself.

## The task (plan Task 4, adapted — Steps 1–4, plus the selection wiring the plan text predates)

**Files:**
- Create: `Data/sessionDetail.ts`, `Data/sessionDetail.test.ts`,
  `Data/DetailPane.tsx`, `Data/LapTable.tsx`
- Modify: `Data/index.tsx` (selection → detail, and dispatch into
  `AppState.selection`), `Data/sessionRow.ts` (venue fallback, now that
  detail is available)

**Interfaces:**
- `sessionDetail.ts`: `toDetailView(detail: SessionDetail, laps: LapSummary[]): DetailView`
  — merges `SessionDetail` and `LapSummary[]` (both from `app/src/ipc/catalog.ts`)
  into what the pane draws: the metadata block (rider/bike/venue/event/tag/
  comments), the channel table (`channel_id`, `unit`, `source_kind`,
  `channel_kind`, `sample_count`, and `nominal_rate_hz` **labelled
  metadata-only** — C1 §3.5 says it is never used to synthesize time, and
  the label must say so, not just omit units), and one lap table joining
  `SessionDetail.laps` (`LapDetail`, file-native, keyed by `lap_number`) to
  `list_laps`'s `LapSummary` (catalog-cached, also keyed by `lap_number`) —
  a row present in one source but not the other is **flagged, never
  dropped** (a `presence: "both" | "session-only" | "catalog-only"` field
  works).
- `bestLapMs(laps: DetailView["laps"])`, and read `ignored_lap_numbers` /
  `reference_lap_number` straight off `SessionDetail` for the pane's
  ignored/reference display flags — no new module needed for those two.

- [ ] **Step 1: Write the failing tests**

  `sessionDetail.test.ts`:
  - `toDetailView — laps present in both sources — one row per lap_number, catalog stats attached, presence "both"`
  - `toDetailView — a lap in session.json with no catalog row — row present, stats marked unavailable, presence "session-only", never dropped`
  - `toDetailView — a catalog lap with no session.json lap — row present, presence "catalog-only", never dropped`
  - `toDetailView — ignored_lap_numbers contains lap 3 — lap 3's row is flagged ignored`
  - `toDetailView — reference_lap_number null — the fastest lap (by lap_time_ms among non-ignored laps) is marked as reference (C1 §6: null means "use fastest lap")`
  - `bestLapMs — every lap ignored — returns null, not Infinity`
  - `toDetailView — a channel with nominal_rate_hz 0 — renders as an event channel (C1 §4.2), matching ChannelSummary.channel_kind`
  - `toDetailView — a lap's sectors array is non-empty — the row carries a sector count only, never parses element shape (R53 Q5; C3 §6 item 11 leaves the element shape unfixed)`

- [ ] **Step 2: Implement and wire**

  Selecting a row in the sessions list calls `getSession(id)` and
  `listLaps(id)` **in parallel** (`Promise.all`), on selection settle — a
  click/keyboard-activate on the row, never on hover (C3 §4 lists both as
  settle-bound). A `list_laps` rejection with `kind: "not_found"` is not an
  error state for the pane — R53 Q4: laps are not indexed for most sessions
  at wave 2 (no wave-1 import path populates `laps`/`lap_summary`), so the
  pane renders the metadata and channel blocks and the lap table reads
  "—"/empty, never an error banner, for that specific rejection kind. Any
  other rejection kind is a real error, routed through `describeIpcError`.

  **Selection dispatch (R53 Q3):** on selecting a row, also call
  `useAppState()`'s dispatch with `{ type: "SET_SELECTED_SESSION", sessionId }`
  — this is the one line that makes the Data tab's selection visible to L6's
  notebook later. Do not dispatch `SET_LAP_CONTEXT` from this task — no lap
  UI in this task chooses a main/overlay lap; that stays `null` until a
  later feature picks one (idl0's compare-with picker / lap selection →
  Analyze is a Parity gap, "Deferred to L6" — not this task's job to build).
  Deselecting (closing the detail pane, if the UI offers that) dispatches
  `{ type: "SET_SELECTED_SESSION", sessionId: null }`.

- [ ] **Step 3: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
  ```
  Expected: 8 new tests passed on top of the running total, 0 failed.

- [ ] **Step 4: NUL-byte check**

  For every file created or modified this task:
  ```
  grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]' app/src/routes/pages/Data/sessionDetail.ts app/src/routes/pages/Data/sessionDetail.test.ts app/src/routes/pages/Data/DetailPane.tsx app/src/routes/pages/Data/LapTable.tsx app/src/routes/pages/Data/index.tsx app/src/routes/pages/Data/sessionRow.ts
  ```
  Every count must print `0`. A non-zero count is a STOP-and-report, not a
  fix-it-yourself — name which file and byte offset.

- [ ] **Step 5: CHANGELOG + commit**

  CHANGELOG bullet naming the detail pane, the lap-table join rule, and —
  explicitly, per R53 Q4 — that lap counts/tables may legitimately be empty
  because no wave-1 import path indexes laps yet (this is not a bug in this
  task).

  ```bash
  git add app/src/routes/pages/Data/sessionDetail.ts app/src/routes/pages/Data/sessionDetail.test.ts app/src/routes/pages/Data/DetailPane.tsx app/src/routes/pages/Data/LapTable.tsx app/src/routes/pages/Data/index.tsx app/src/routes/pages/Data/sessionRow.ts CHANGELOG.md
  git commit -m "app: Data tab session detail pane over get_session/list_laps"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not parse `LapDetail.sectors` / `.neutral_zone_visits` beyond
  `.length` — both are `unknown[]` (C3 §6 item 11); a sector **count** is
  the wave-2 ceiling (R53 Q5).
- Do not treat a `list_laps` `not_found` rejection as an error state.
- Do not dispatch `SET_LAP_CONTEXT` from this task.
- Do not invent the `AppState.selection` slice if it is missing — STOP and
  report instead.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Spec discipline (say it out loud in your report)

No spec change needed (plan's own declaration for Task 4; §24's session-
detail prose already describes catalog-backed laps generically enough that
this task's join rule doesn't contradict it — if you find it does, say so
and treat it as a question rather than silently rewriting §24).

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line;
per-step done/deviated; confirmation the merge from `main` picked up the
`AppState.selection` slice cleanly (or that it was already present without a
merge); confirmation `SET_SELECTED_SESSION` fires on row selection and
`SET_LAP_CONTEXT` is untouched; confirmation the NUL-byte check printed `0`
for every file; confirmation a `list_laps not_found` renders as empty, not
an error; anything ambiguous you resolved (say how) or that needs a lead
ruling (stop and report instead of guessing — CLAUDE.md §1).
