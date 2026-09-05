# L7a Task 3 review — filter model, facets and filter rail (net of Task 3 + R54 fix + Task 2 fix)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
branch `wave2-l7a-data`. Commits under review, in order:
`37433a2` (Task 3: filter model, facets, filter rail, spec-during §24.4),
`278f7f9` (R54: drop Track facet), `436a899` (review-task2 Minor fix: hide
Sessions-view Best-lap sort option). Reviewed as the net diff these three
produce over `filters.ts`, `facets.ts`, `FilterRail.tsx`, `ActiveChips.tsx`,
`index.tsx`, `sort.ts`, `docs/IDL0_SPEC.md` §24.4 and `CHANGELOG.md`.

**Out of scope, present but not reviewed:** an untracked `sessionDetail.test.ts`
importing a not-yet-created `./sessionDetail` module (Task 4 work in progress in
the shared worktree, per the dispatch note) — this file's one failing suite is
excluded from the gate result below and is not this task's responsibility.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Data
```

`tsc --noEmit` printed nothing (clean). `vitest run` output:

```
 FAIL  src/routes/pages/Data/sessionDetail.test.ts [ src/routes/pages/Data/sessionDetail.test.ts ]
Error: Cannot find module './sessionDetail' imported from .../src/routes/pages/Data/sessionDetail.test.ts

 Test Files  1 failed | 6 passed (7)
      Tests  48 passed (48)
```

The one failed suite is the untracked Task-4-in-progress file noted above (its
target module doesn't exist yet); every suite that belongs to Task 3's net
diff passed. **48 passed, 0 failed among Task 3's own files** — reproduces the
implementer's reported 48/0 exactly. The coverage summary was not printed to
stdout alongside the failed-suite report; it was not re-run, per the
"run the gate exactly once" rule. Line/branch coverage was instead checked by
reading `filters.ts`/`facets.ts` against their test files directly — every
branch (both toggle directions, `SET_VIEW` same-view/different-view/valid-field,
`CLEAR_ALL`, every facet's OR-within/AND-across/`"(none)"`/null-exclusion path)
has a corresponding assertion.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical or Important findings. | — |
| Minor | `ActiveChips.tsx:19` (`dateChipLabel`) | Uses `formatDateMs` (locale-formatted, e.g. "Sep 5, 2026") for the chip's day text rather than idl0's plain `YYYY-MM-DD` (`_ActiveChipRow._dateLabel` in `data_tab.dart:739`). Reuses an existing Task-2 formatter for consistency with the rest of the tab; not a correctness issue, but it is a semantic difference from the idl0 reference the brief didn't call out explicitly. | None required; optionally note the deliberate deviation in the SPEC's chip-label sentence. |
| Minor | `filters.test.ts:69` (`"every remaining toggle/set action — applies its own field only"`) | One test exercises seven different reducer actions in sequence rather than one behaviour each — harder to localize a future regression to a specific action. | Acceptable as-is; split only if it starts failing. |

## Checks performed (all pass)

- **AND-across / OR-within / `""` = "(none)"**: each proven by a dedicated test in `facets.test.ts` (two-bikes-OR, bike+rider-AND, tag "(none)"), matching idl0's `data_filters_provider.dart` combining rule verbatim.
- **No IPC in any filter/facet/sort handler**: `filters.ts`, `facets.ts`, `sort.ts` import only `./sort`, `./format`, and `SessionSummary`/`TrackSummary` *types* from `ipc/catalog` — no `invoke`, no async, filtering/sorting/counts all run over the array already fetched once in `index.tsx`'s `useEffect`. No IPC per keystroke.
- **No Track, has-gates, has-GPS facet survives**: grepped the whole `Data/` tree for "track" — every hit is either a doc comment explaining the R54 absence, the pre-existing `DataView`/`sortFieldsForView` `"tracks"` *view* (a different, still-present concept — the Tracks table itself, Task 6), or `TrackSummary`/`compareTracks` from Task 2's sort model (untouched by Task 3). No `trackIds` field, no `requireGates`/`requireGps`, no disabled placeholder UI.
- **`listTracks()` not called** anywhere under `Data/` (confirmed by grep — zero hits).
- **Lap-time facet keys off `duration_ms` honestly**: `matchesFiltersExcept` excludes a row with `duration_ms === null` rather than including it by default (`facets.ts:47`), proven by the null-duration-row-is-excluded test.
- **`facetCounts` excludes the facet's own selection**: `matchesFiltersExcept(row, filters, key)` skips exactly `key`'s own predicate before tallying (`facets.ts:38,90`), proven by the bikes-selected-still-shows-other-bikes-counts test; matches idl0's `facetCountsProvider` semantics.
- **`sortFieldsForView("sessions")` omits `bestLap`** (`sort.ts:22`, `SESSION_FIELDS`), the comparator's `bestLap` arm is retained (`sort.ts:107`) so sorting resumes once the field lands — matches the review-task2 Minor ruling and its own test (`sort.test.ts:41`).
- **§24.4 rewrite** (`278f7f9`'s version) names all three absent facets (Track, has-gates, has-GPS) together with the one-paragraph R54 reason a future reader needs — not a one-line stub, a real rewrite of the section covering combining rule, `""` convention, and every remaining facet's data source.
- **Reducers pure**: `filtersReducer` and `matchesFilters`/`facetCounts` never mutate their inputs (`toggled` copies the `Set`; `filtersReducer`'s every arm returns a new object via spread).
- **Tests A/A/A**, named `thing — condition — result` with the literal em dash — confirmed by grep (0 `it("...")` lines lack `—` across `filters.test.ts`/`facets.test.ts`/`sort.test.ts`).
- **No rendering tests**: `FilterRail.tsx`/`ActiveChips.tsx` have no matching `.test.ts`; the two `.test.ts` files present (`filters.test.ts`, `facets.test.ts`) both exercise pure modules only.
- **Doc comments and units**: every exported symbol in `filters.ts`/`facets.ts` has a doc comment; `MsRange`, `dateRange`, `lapTimeMs` explicitly state milliseconds.
- **Ownership boundary**: `git diff --stat` for all three commits touches only `app/src/routes/pages/Data/**`, `docs/IDL0_SPEC.md` (spec-during, §24 only), and `CHANGELOG.md`. No touch to `rust/`, `app/src-tauri/`, `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`, `package.json`, `vite.config.ts`.
- **No new IPC command**: `app/src/ipc/*.ts` untouched by any of the three commits.
- **No cargo** anywhere in the diff or the reported steps.
- **Repo hygiene**: all three commit messages are single-line, no AI attribution trailer; `37433a2`'s `git add` used the explicit path list from the brief (verified against `--stat`); CHANGELOG bullets are accurate and were correctly updated in-place by the two follow-up commits (no duplicate/stale bullet).
- **CHANGELOG accuracy**: the bullet's final text (post-`278f7f9`) correctly lists the shipped facet set and the three dropped facets with the R54 reason, matching the code exactly.

## Verdict rationale

The net result of the three commits does exactly what the Task 3 brief and R54 specify: an idl0-faithful `DataFilters`/`filtersReducer`/`matchesFilters`/`facetCounts` model with AND-across/OR-within/`"(none)"` semantics each proven by a test, a Track facet dropped outright (no trap, no dead code) per the lead's ruling, a correctly-worded §24.4 rewrite naming all three absent facets with their reason, and a Best-lap sort fix that leaves the comparator's fallback arm intact for when the field lands. The gate reproduces the implementer's reported 48 passed with a clean `tsc`; the one failing suite in the working tree belongs to Task 4's in-flight work and is explicitly out of scope per the dispatch. The two Minor notes (a locale date format for the chip label, one multi-action reducer test) would not change a maintainer's decision to ship this.

VERDICT: CLEAN
