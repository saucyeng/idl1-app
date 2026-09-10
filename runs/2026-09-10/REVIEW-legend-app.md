# Review: legend lane, app (TypeScript) half

Commit reviewed: `4006c98` "app: spectrogram colour-bar legend built from
engine ramp stops (R177, C3 3.6)", worktree
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\legend`, branch
`legend`.

Files touched:
- `app/src/ipc/rasters.ts`, `app/src/ipc/rasters.test.ts`
- `app/src/routes/pages/Notebook/components/RasterUnderlay.tsx`
- `app/src/routes/pages/Notebook/model/rasterLayer.test.ts`
- `app/src/routes/pages/Notebook/model/rasterLegend.ts` (new)
- `app/src/routes/pages/Notebook/model/rasterLegend.test.ts` (new)

Test command run (from `app/`, once each):
- `npx tsc --noEmit` — clean, no errors.
- `npx vitest run src/routes/pages/Notebook/model/rasterLegend.test.ts src/routes/pages/Notebook/model/rasterLayer.test.ts src/ipc/rasters.test.ts`
  — `Test Files 3 passed (3)`, `Tests 35 passed (35)`. Non-zero passed
  count, satisfies the gate.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | CHANGELOG.md (not touched by 4006c98) | Brief item 7 and CLAUDE.md §6 require a CHANGELOG line for shipped-behaviour work; the *existing* entry for R177's first half explicitly says the colour-bar legend "stays that way until a later lane hands TypeScript RGBA stops... (R177's own deferred half)" — i.e. it points forward to exactly this commit — and this commit never closes that forward reference or adds its own entry. `git log -- CHANGELOG.md` shows no commit for this lane. | Add a CHANGELOG `### Added` (or amend-note) entry describing the legend bar landing, per the brief. |
| Minor | `app/src/routes/pages/Notebook/model/rasterLegend.ts:34` | `a / 255` alpha division can produce long floats (e.g. `0.996078431...`) for non-`255`/`0` alpha inputs; harmless for the current always-opaque (`255`) stops the engine sends, but the function doesn't clamp/round, so a future non-opaque stop would emit an ugly (still valid) CSS value. | Not worth blocking on; note for a future task if alpha ever varies. |
| Minor | `app/src/routes/pages/Notebook/model/rasterLegend.test.ts:30` | The 16-stop test's per-stop percent assertion checks only one interior stop (`i=1`) by literal computation; a broader loop over all 16 would be a slightly stronger check of the `i/(n-1)*100` formula, though combined with the "every input stop appears" test and the two-stop exact-string test, the formula is already pinned at the endpoints and one interior point. | Optional strengthening; not required. |

## Verification detail

- **Colour values are never computed, only read.** `buildLegendGradient`
  (`rasterLegend.ts:30-35`) does no arithmetic on `r`/`g`/`b`, only formats
  the given tuple into `rgba(...)` and computes a **position** percentage
  from the stop's *index*, not its colour. No Turbo/HSL/interpolation code
  exists in this diff. Matches R177's core claim and the spec's "never
  reimplements the ramp" line verbatim.
- **`RasterMeta.ramp_stops` type matches the spec exactly.** Spec:
  `ramp_stops: [number, number, number, number][]`. TS
  (`app/src/ipc/rasters.ts:113`): `ramp_stops: [number, number, number, number][];`
  — identical shape, and the doc comment (added just above it) reproduces
  the spec's stop-sampling, opacity, and "never reimplemented" language
  faithfully.
- **Stop-position formula matches the brief.** `(i / last) * 100` where
  `last = stops.length - 1`, i.e. `i/(n-1)*100` — exact match. Verified
  against the 16-stop test's hand-computed values: `stops[1] = [16, 1, 239, 255]`
  gives `rgba(16, 1, 239, 1) 6.666...%` = `(1/15)*100`, matching the
  assertion; `stops[15] = [240, 15, 15, 255]` at `100%`; `stops[0]` at `0%`.
  Arithmetic re-checked by hand, correct.
- **Fixtures still assert what they used to.** `rasterLayer.test.ts`'s two
  `RasterMeta` fixtures gained `ramp_stops: [[35,23,27,255],[144,13,0,255]]`
  (a 2-stop sample, one of the two options the brief allows) with no other
  fields changed; the `alignRasterToAxes` assertions in those tests are
  unrelated to `ramp_stops` and untouched. `rasters.test.ts`'s
  `fetchRasterMeta` fixture gained the same field; the existing assertion
  compares the whole returned object against `meta`, so the new field
  is implicitly required to round-trip correctly through `invoke`, which
  it does (`tsc`/`vitest` both green).
- **Tests are real, not tautological.** The two-stop test asserts a fully
  literal expected string (not derived via the function under test's own
  formula), so a formula bug (wrong separator, wrong endpoint order, wrong
  position) would fail it. The 16-stop test asserts three independently
  hand-picked literal values (index 0, 1, 15) plus a colour count, not a
  self-referential comparison. The "no literal colour not in input" test
  builds its `allowed` set from the *input* stops with the same `rgba(...)`
  string shape the implementation happens to use, which narrows what it can
  catch (a colour-swap bug within the allowed set, e.g. reordering channels,
  wouldn't be caught if the swapped triple happened to coincide with another
  input stop's channels — vanishingly unlikely given randomized-looking
  test data, not a real gap) but it does catch any invented/interpolated
  colour, which is the property R177 cares about. The "every input stop
  appears" test is a real complement, checking no stop is silently dropped.
  The `< 2 stops → null` test checks both empty and singleton lists.
- **Deliberate deviation (print handling location) — agreed.**
  `app/src/styles/report-print.css` scopes everything under
  `@media print { #report-print-root { ... } }`, and its own header comment
  states `#report-print-root` is the *only* thing `Notebook/index.tsx`'s
  export action ever mounts `ReportView` into. Grep confirms neither
  `ReportView.tsx` nor anything under `model/report/` references
  `Raster`/`RasterUnderlay` at all — the report renders tables/captions/SVG
  chart exports, never a live raster canvas. A print rule for the legend
  bar placed in `report-print.css` would be unreachable/dead CSS. Putting
  `printColorAdjust: "exact"` / `WebkitPrintColorAdjust: "exact"` directly
  on the bar `<span>` in `RasterUnderlay.tsx` is the only place that can
  matter (the notebook's own — non-report — print path, if any, or a
  future path), and it is scoped precisely to the one element that is
  "data, not decoration." Agreed with the lane's reasoning; not a bug.
- **No unrelated reformatting.** The diff is additive except for the single
  `<div>` block in `RasterUnderlay.tsx` that had to be restructured
  (adding a flex row with the new bar `<span>` beside the existing text)
  — a necessary, minimal change, not a driveby reformat.
- **CLAUDE.md §5 (doc comments, units, typed errors).** Every new/changed
  public symbol (`ramp_stops` field, `RampStop` type, `buildLegendGradient`,
  the `legendGradient` field on `RasterLabels`) has a doc comment. No new
  error paths introduced (pure function, no `unwrap`-equivalent, no thrown
  exceptions) — `stops.length < 2` returns `null` rather than throwing.
  Units: RGBA channels documented as "each 0–255"; positions documented as
  percentages.
- **Layering (CLAUDE.md §2).** `rasterLegend.ts` is pure (no Tauri import,
  no DOM), sits beside `rasterLayer.ts` as the brief specifies, and does
  only string formatting from given numbers — no numeric ramp computation,
  consistent with "Rust = numbers, JS = pictures."

## Verdict rationale

The implementation is spec-compliant on every substantive axis checked:
it reads colours rather than computing them, the wire type matches the
contract exactly, the stop-position formula matches the brief precisely,
the tests are genuine (would fail on a broken formula, dropped stop, or
invented colour), and the one deliberate deviation from the brief's literal
text (print handling on the element instead of in `report-print.css`) is
correctly reasoned given that the report never renders a raster. The only
real gap is procedural: the brief's own gate item 7 required a CHANGELOG
line, and the prior CHANGELOG entry for R177's first half explicitly
promised this exact follow-up would close it — this commit doesn't. That's
a documentation-discipline miss (CLAUDE.md §6), not a code-correctness one,
so it does not block merge but should be fixed before the lane closes.

VERDICT: NEEDS_FIXES
