# L7c Task 3 review — Profile and Units sections

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7c-settings`,
branch `wave2-l7c-settings`, commit under review `fc5c35c` ("app: Settings tab
Profile and Units sections"), parent `23bf000`. In scope: `Settings/units.ts`,
`Settings/units.test.ts`, `Settings/ProfileSection.tsx`,
`Settings/UnitsSection.tsx`, `Settings/index.tsx`, `CHANGELOG.md`. Out of
scope (correctly untouched): data-directory/sync sections (Tasks 4–5),
`docs/IDL0_SPEC.md`.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Settings
```

`tsc --noEmit` printed nothing (clean). `vitest run` output:

```
 Test Files  5 passed (5)
      Tests  30 passed (30)
```

Reproduces the implementer's reported 30 passed (dispatch note; the task
brief's own pre-computed "26" was written before Task 2 gained extra
`localStorageBackend` coverage tests in `9a22a4c`, so 30 is the correct
current total, not a discrepancy). Coverage report text does not print a row
for `units.ts` individually (the v8/text reporter here omits fully-covered
files from the per-file table even with `--coverage.skipFull=false` passed
explicitly — confirmed by rerun; this is a pre-existing tool/config quirk,
not something this commit changed) — the "units.ts 100%" claim could not be
independently displayed by this exact command, but `units.test.ts` exercises
both branches of `unitSummary` (imperial, metric) plus an every-field
non-empty check and a systems-differ check, which is full coverage of the
function's only branch by inspection.

## Findings

No Critical or Important findings.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `units.ts` (whole file) | The dispatch's field list ("lb·in") doesn't match the actual unit string used (`"lb/in"`), but that's a wording slip in the dispatch, not the code — `units.ts` matches idl0's `app_settings.dart` doc comment verbatim (`lb/in` imperial, `N/mm` metric). No fix needed; noting for the record so it isn't mistaken for a drift. | — |

## Checks performed (all pass)

- `units.ts`'s `IMPERIAL_SUMMARY`/`METRIC_SUMMARY` checked field-by-field
  against idl0's `app_settings.dart` `UnitSystem` doc comment: imperial
  `mph, ft/mi, psi, °F, lbf, hp, lb/in`; metric `km/h, m/km, kPa, °C, N, W,
  N/mm` — exact match, all seven fields present for both systems (force,
  power, springRate included, matching the brief's explicit requirement).
- `ProfileSection.tsx` and `UnitsSection.tsx` write only through
  `store.get()`/`store.set()` from Task 2's `PrefsStore` — no direct
  `localStorage` access, no `invoke`/IPC call anywhere in the diff.
- Rider-name debounce: `handleChange` clears any pending `timerRef.current`
  before scheduling a new `setTimeout(..., 500)` on every keystroke (so no
  write-per-keystroke), and a `useEffect` cleanup on unmount clears the
  timer — no leaked timer, matches the brief's 500 ms requirement exactly.
- No number the engine depends on is computed in this diff — `unitSummary`
  returns unit *label* strings only; no conversion arithmetic anywhere
  (`UnitsSection.tsx`'s toggle just writes the chosen `"imperial"|"metric"`
  string, it doesn't convert stored values), consistent with CLAUDE.md §2
  and the copy text asserting "does not retroactively convert existing
  channel values".
- Ownership boundary: `git show --stat fc5c35c` touches only
  `app/src/routes/pages/Settings/{ProfileSection.tsx,UnitsSection.tsx,
  index.tsx,units.ts,units.test.ts}` and `CHANGELOG.md` — nothing under
  `rust/`, `app/src-tauri/`, or any lead-owned shared file (§2 of the
  operating brief).
- `.tsx` files are excluded from coverage by `app/vitest.config.ts`'s
  existing `coverage.exclude` (`src/**/*.tsx`), unchanged by this commit —
  consistent with CLAUDE.md §4 ("UI rendering is not unit-tested"); no
  rendering tests were added for `ProfileSection.tsx`/`UnitsSection.tsx`,
  as the brief required.
- No new npm dependency: all imports in the diff resolve to `react`,
  `vitest`, and the lane's own `./prefs`/`./prefsStore`/`./units` modules.
- Tests are Arrange/Act/Assert with blank lines between blocks and named
  literally `thing — condition — result` (em dash) in all four
  `units.test.ts` cases, matching the brief's four required names verbatim.
- Doc comments present on every exported symbol in `units.ts`
  (`UnitSystem`, `UnitSystemOption`, `UNIT_SYSTEMS`, `UnitSummary`,
  `unitSummary`) and on `ProfileSectionProps`/`ProfileSection`,
  `UnitsSectionProps`/`UnitsSection`; units named in each `UnitSummary`
  field's doc comment.
- `index.tsx` wires `ProfileSection`/`UnitsSection` behind
  `selected.id === "profile" | "units"`, leaving other sections' "Built in
  a later task" placeholder untouched; a single shared `prefsStore` instance
  is created once at module scope and passed to both sections (matches the
  doc comment's stated intent — one store per page load, shared across
  sections).
- CHANGELOG entry accurately describes the debounce value, the seven
  unit-summary fields (naming the two idl0 never rendered), and states "No
  spec change" — matching the brief's own spec-discipline declaration.
- Commit is a single line ("app: Settings tab Profile and Units sections"),
  no AI attribution trailer; `git show --stat` confirms only the six
  intended paths are staged.
- No `cargo` or `npm run tauri` invocation anywhere in the diff or in the
  commands run for this review.
- `EnginePrefs`'s three fields (`data_dir`, `rider_name`, `unit_system`)
  are unchanged by this commit — Task 3 reads/writes through them without
  redefining or adding fields, as required.

## Verdict rationale

The diff does exactly what brief-task3.md specifies: two new sections built
strictly over Task 2's `PrefsStore`, a verbatim port of idl0's seven-field
unit table (including the two fields idl0's own UI omitted), a correctly
debounced rider-name write with no leak, and tests that are pure,
A/A/A-structured, and correctly named. Ownership, spec discipline, doc
comments, and repo hygiene all check out, and the gate reproduces the
implementer's reported pass count. The one note above is a correction to
the dispatch's own wording, not a defect in the code, so it does not affect
the verdict.

VERDICT: CLEAN
