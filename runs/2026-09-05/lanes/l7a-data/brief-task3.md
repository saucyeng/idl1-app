# L7a Task 3 — implementer brief (filter model and filter rail)

You are the implementer for L7a Task 3 — the facet/filter model and the
filter rail UI. This task rewrites part of `docs/IDL0_SPEC.md` §24 in the
same commit as the code (spec-during). TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
  branch `wave2-l7a-data`, HEAD must be Task 2's commit, status clean. Verify
  first; if not, stop and report.
- Work ONLY there. Same "Never touch" list as Task 1/2. Do NOT push. Editing
  `docs/IDL0_SPEC.md` **in this worktree** is the one exception this task
  makes to "never touch docs shared elsewhere" — it is explicitly this
  lane's spec-during obligation, not a lead-owned file.
- **No cargo, ever.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7a-data/BRIEF.md`
  (R53 Q2 — has-gates/has-GPS dropped for wave 2, filed as a wave-3
  amendment); the plan's Task 3
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7a-data-tab.md`, lines
  230–292) — your starting point, unchanged; `docs/IDL0_SPEC.md` §24's
  current facet-inventory text (read it before rewriting it — your diff
  should read as a replacement of idl0's facet set with idl1's, not an
  unexplained deletion); `app/src/ipc/catalog.ts`'s `SessionSummary` and
  `listTracks`/`TrackSummary` (the facet's actual data sources); the
  read-only reference `C:\Users\isaac\Documents\Saucy\saucyeng\idl0-app\app\lib\ui\tabs\data\filter_rail.dart`
  for the rail's facet groups and `_ActiveChipRow`'s chip semantics (the
  `mm:ss` lap-range label, the `start → end` date label, "Clear all") — port
  semantics, not the widget.

## The task (plan Task 3, Steps 1–5, unchanged)

**Files:**
- Create: `Data/filters.ts`, `Data/filters.test.ts`, `Data/facets.ts`,
  `Data/facets.test.ts`, `Data/FilterRail.tsx`, `Data/ActiveChips.tsx`
- Modify: `Data/index.tsx`, `docs/IDL0_SPEC.md` (§24 facet inventory),
  `CHANGELOG.md`

**Interfaces:**
- `filters.ts`: the `DataFilters` shape (date range ms, `trackIds`/`bikes`/
  `riders`/`tags`/`venues` as `Set<string>` where `""` is the synthetic
  "(none)", `lapTimeMs` range, `sources`, `searchText`, `view`, `sortField`,
  `sortAscending`), `initialFilters`, a pure `filtersReducer(state, action)`
  covering every toggle/set/clear, plus `activeCount(filters)` and
  `hasAnyActiveFilter(filters)`.
- `facets.ts`: `matchesFilters(row, filters): boolean` — AND across
  categories, OR within a multi-select facet, `""` matching a row whose
  field is empty — and `facetCounts(rows, filters)` for the per-option `(N)`
  badges.

- [ ] **Step 1: Write the failing tests**

`filters.test.ts`:
- `filtersReducer — TOGGLE_BIKE on an unselected value — adds it; toggling again — removes it`
- `filtersReducer — CLEAR_ALL — returns exactly initialFilters, view and sort preserved`
- `filtersReducer — SET_VIEW — leaves every row-affecting facet untouched`
- `activeCount — three facets active — counts three, ignoring view and sort`
- `hasAnyActiveFilter — only view and sort set — false`
- `filtersReducer — SET_SORT_FIELD — direction resets to that field's default`
  (uses Task 2's `defaultAscendingFor` from `Data/sort.ts` — import it, do
  not redefine the default table here)

`facets.test.ts`:
- `matchesFilters — no active facets — every row matches`
- `matchesFilters — two bikes selected — a row matching either passes (OR within a facet)`
- `matchesFilters — a bike and a rider selected — a row must match both (AND across facets)`
- `matchesFilters — "(none)" selected for tag — matches only rows whose tag is ""`
- `matchesFilters — date range — a row on the range's own last day still matches (inclusive)`
- `matchesFilters — search text — matches case-insensitively across venue, comments and tag`
- `matchesFilters — lap-time range with a null duration row — the row is excluded, not included by default`
- `facetCounts — counts each option against the other facets, not against its own — selecting one bike leaves the other bikes' counts visible`

- [ ] **Step 2: Implement, then build the rail and the chip row.**

  `FilterRail.tsx` renders the facet groups (date, track, bike, rider, tag,
  venue, lap time, source) with counts; `ActiveChips.tsx` renders one
  dismissible chip per active facet plus "Clear all" — idl0's
  `_ActiveChipRow` semantics, including the `mm:ss` lap-range label and the
  `start → end` date label. **Track facet options come from `listTracks()`**
  (C3 §3.2), not from session summaries. **Source facet vocabulary is C3's
  `source_format`** (`idl0 | fit | gpx | csv`), not idl0's
  `SessionSourceType` enum — do not port idl0's source labels verbatim if
  they name a format idl1 doesn't have or vice versa. **Has-gates and
  has-GPS facets are dropped** (R53 Q2) — do not build them, do not stub
  them, they are simply absent from this task's facet groups. Narrow-width
  behaviour (the rail as a bottom sheet, the "FILTERS (n)" bar) is a
  CSS/media-query concern of these two components; no separate module.

- [ ] **Step 3: Rewrite `docs/IDL0_SPEC.md` §24's facet inventory.**

  State: the idl1 facet set (date, track, bike, rider, tag, venue, lap time,
  source); what each facet reads (`SessionSummary` field, or `list_tracks`
  for the track facet); the AND-across-categories / OR-within-a-facet rule;
  the `""`-is-"(none)" convention; and — explicitly, by name — that has-gates
  and has-GPS are **not present in wave 2**, with the one-sentence reason
  (neither is derivable from a `SessionSummary`; filed as a wave-3 C4 §5 +
  C3 §3.2 amendment, R53 Q2). A future reader of §24 should not need to ask
  why those two are missing.

- [ ] **Step 4: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
  ```
  Expected: 14 new tests passed on top of the running total (24 + 14 = 38
  for this directory), 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

  CHANGELOG bullet naming the facet set and the has-gates/has-GPS drop.

  ```bash
  git add app/src/routes/pages/Data/filters.ts app/src/routes/pages/Data/filters.test.ts app/src/routes/pages/Data/facets.ts app/src/routes/pages/Data/facets.test.ts app/src/routes/pages/Data/FilterRail.tsx app/src/routes/pages/Data/ActiveChips.tsx app/src/routes/pages/Data/index.tsx docs/IDL0_SPEC.md CHANGELOG.md
  git commit -m "app: Data tab filter model, facets, and filter rail"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not add has-gates or has-GPS facets, real or stubbed (R53 Q2).
- Do not redefine `defaultAscendingFor` — import Task 2's `sort.ts`.
- Do not invent a track facet from session data alone — it must read
  `listTracks()`.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Spec discipline (say it out loud in your report)

**Spec-during** — `docs/IDL0_SPEC.md` §24's facet inventory rewritten in this
commit, per Step 3 above.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line
(`passed` count, expect 38 total for the directory); per-step done/deviated;
confirmation has-gates/has-GPS are absent from the facet groups and §24 says
why; confirmation the track facet reads `listTracks()`; anything ambiguous
you resolved (say how) or that needs a lead ruling (stop and report instead
of guessing — CLAUDE.md §1).
