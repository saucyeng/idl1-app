# L7a Task 2 — implementer brief (formatting and sorting)

You are the implementer for L7a Task 2 — pure formatters and the per-view
sort model, ported from idl0's `data_filters_provider.dart`. TDD, ONE commit,
then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
  branch `wave2-l7a-data`, HEAD must be Task 1's commit (given in the dispatch
  message), status clean. Verify first; if not, stop and report.
- Work ONLY there. Same "Never touch" list as Task 1's brief (`rust/`,
  `app/src-tauri/`, `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`,
  `state/AppState.tsx`, `package.json`, `vite.config.ts`). Do NOT push.
- **No cargo, ever.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7a-data/BRIEF.md`; the
  plan's Task 2 (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7a-data-tab.md`,
  lines 179–227) — your starting point, unchanged; Task 1's landed
  `Data/sessionRow.ts` and `Data/index.tsx` (this task edits both); the
  read-only reference `C:\Users\isaac\Documents\Saucy\saucyeng\idl0-app\app\lib\providers\data_filters_provider.dart`
  for `DataSortField`, `DataSortFieldX.defaultAscending`, `sortFieldsForView`,
  and the `_SortControl` widget's field-then-direction semantics — port the
  semantics (which fields, default direction per field, per-view field
  lists), not the Flutter widget code.

## The task (plan Task 2, Steps 1–4, unchanged)

**Files:**
- Create: `Data/format.ts`, `Data/format.test.ts`, `Data/sort.ts`,
  `Data/sort.test.ts`
- Modify: `Data/index.tsx` (sort control in the toolbar), `Data/sessionRow.ts`
  (use `format.ts` instead of any inline formatting Task 1 wrote)

**Interfaces:**
- `format.ts`: `formatLapTimeMs(ms) → "m:ss.SSS"`, `formatDurationMs(ms) →
  "h:mm:ss"`, `formatDateMs(ms) / formatTimeMs(ms)` (locale, via
  `Intl.DateTimeFormat` — no new dependency, this is a platform API), one
  `formatBytes(n)`, `localIsoDate(ms)`.
- `sort.ts`: `SortField = "date" | "bestLap" | "duration" | "lapCount" |
  "lastRidden" | "name"`, `sortFieldsForView(view)`, `defaultAscendingFor(field)`,
  `compareSessions(a, b, field, ascending)`, `compareTracks(...)` — ported
  field-for-field from idl0's `data_filters_provider.dart`.

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

- [ ] **Step 2: Implement, then wire the sort control.**

  The toolbar gets idl0's compact control: a field chooser (only the fields
  valid for the active view) plus an independent direction toggle. Choosing a
  field resets direction to that field's `defaultAscendingFor`; the arrow
  then overrides it — exactly idl0's `_SortControl` semantics. Update
  `Data/sessionRow.ts` to call `format.ts`'s functions instead of any inline
  formatting.

- [ ] **Step 3: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
  ```
  Expected: 13 new tests passed on top of Task 1's 11 (24 total for this
  directory), 0 failed.

- [ ] **Step 4: CHANGELOG + commit**

  CHANGELOG bullet:
  `- **Data tab: formatting and sort model.** Lap/duration/byte/date formatters and the per-view sort field sets with their default directions, ported from idl0's data_filters_provider.`

  Spec discipline: **no spec change needed.** Say this out loud in your report.

  ```bash
  git add app/src/routes/pages/Data/format.ts app/src/routes/pages/Data/format.test.ts app/src/routes/pages/Data/sort.ts app/src/routes/pages/Data/sort.test.ts app/src/routes/pages/Data/index.tsx app/src/routes/pages/Data/sessionRow.ts CHANGELOG.md
  git commit -m "app: Data tab formatting and sort model"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not add a date/number-formatting npm package — `Intl.DateTimeFormat` is
  a platform API and needs none (plan's own Tech Stack note).
- Do not build the filter rail or facets yet — Task 3.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line
(`passed` count, expect 24 total for the directory); per-step done/deviated;
confirmation `sessionRow.ts` now calls `format.ts` rather than any inline
formatting from Task 1; anything ambiguous you resolved (say how) or that
needs a lead ruling (stop and report instead of guessing — CLAUDE.md §1).
