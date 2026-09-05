# L6 review-fixes-9-10 close-out + R65 Properties-pane unit suggestion — re-review

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`, branch `wave2-l6-notebook`.
Commits under review: `5dae71e` ("app: cursor readout notify uses liveViewport during a gesture; devicePxSize extracted (review-fixes-9-10.md)") and `25a3003` ("app: Properties pane axis-label suggestion from channel unit (R65)"). HEAD at review time was `25a3003`, exactly these two commits ahead of `186d499` ("Properties pane over plotForm", already reviewed separately).

Files touched, combined (`git show --stat`): `CHANGELOG.md`, `app/src/routes/pages/Notebook/components/ChartCell.tsx`, `app/src/routes/pages/Notebook/components/RasterUnderlay.tsx`, `app/src/routes/pages/Notebook/components/PropertiesForm.tsx`, `app/src/routes/pages/Notebook/components/PropertiesForm.types.ts`, `app/src/routes/pages/Notebook/model/rasterLayer.ts` (+`.test.ts`), `app/src/routes/pages/Notebook/model/cursorReadoutDriver.test.ts`, `app/src/routes/pages/Notebook/model/propertiesForm.ts` (+`.test.ts`). All within `Notebook/**` + `CHANGELOG.md` — no ownership violation, no `package.json`/lockfile touch, no new dependency (confirmed the diff on `package.json`/`package-lock.json` between `186d499` and `25a3003` is empty).

**Out of scope, present in the worktree at review time:** an uncommitted Task 13 implementer's work (new untracked `model/workbookState.ts`/`.test.ts`, `Notebook/ipcStubs/`). Not part of either commit under review.

## Gate command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage.reporter=json-summary src/routes/pages/Notebook/model
```
`node_modules` was missing entirely in this worktree (fresh checkout); ran `npm ci` once first, per the standing brief's exception for a missing `node_modules`. `package.json`/`package-lock.json` are untouched by either commit under review, so this did not paper over an undeclared dependency. `tsc` was silent (no errors).

```
Test Files  14 passed (14)
     Tests  131 passed (131)
```
Nonzero passed count; every file this review's two commits touch or add (`cursorReadoutDriver.test.ts`, `rasterLayer.test.ts`, `propertiesForm.test.ts`) is among the 14 passing files. `coverage/` was not produced (`--coverage.reporter` is a no-op without a coverage provider installed) — nothing to delete. Run once, as instructed.

## Findings

No Critical, Important, or Minor findings.

## Checks performed (all pass)

**1. `liveViewport` fix (review-fixes-9-10.md Important — closed).**
- `ChartCell.tsx:328`: `cursorDriverRef.current.notify(liveViewport, pixelX)`, replacing the prior `notify(viewport, pixelX)`. `liveViewport` is the same state `transformFor(viewport, liveViewport)` (line ~390) renders the picture from during a drag/zoom, and is exactly what `pixelX` (measured against the on-screen element) should be paired with mid-gesture.
- Traced the call chain: `handlePointerMove` calls `driver.notify(liveViewport, pixelX)`, which goes through `makeSettle`'s debounce into `dispatch(viewport, pixelX)` inside `cursorReadoutDriver.ts`, which computes `t_us` from whichever `viewport` object it was given. New test in `cursorReadoutDriver.test.ts` ("notify during a gesture — maps pixelX against the live (panned) viewport passed in, not a stale one") constructs a stale pre-drag viewport (`startUs:0, endUs:1_000_000`) and a live dragged viewport (`startUs:500_000, endUs:1_500_000`), calls `notify(liveDraggedViewport, 400)`, and asserts the resulting `t_us` is `1_000_000` (computed from the live window) and explicitly not `500_000` (what the stale window would have produced) — a genuinely discriminating test against the pre-fix bug, not just a happy-path check.
- The `useCallback` dependency array changed from ending in `viewport` to ending in `liveViewport`. Confirmed `liveViewport` is React state set both by an effect keyed on the settled `viewport` prop and, during a drag, by `handlePointerMove` itself on every drag frame — so this callback's identity does churn every drag frame, not just at settle. However `handlePointerMove` is wired only via the JSX prop `onPointerMove={handlePointerMove}` (searched `ChartCell.tsx` for `addEventListener` — no hits) — React's synthetic event system does not attach or detach a native DOM listener per render for a delegated prop like this, so a fresh callback identity each drag frame costs one extra function allocation, not a listener re-bind, and the component was already re-rendering every drag frame anyway via the state update that drives the picture's pan. Not a finding.
- `RasterUnderlay.tsx` and `ChartCell.tsx`'s `dispatchNow` (the viewport-settle path) already used the settled viewport correctly before this fix and are unaffected.

**2. `devicePxSize` extraction (review-fixes-9-10.md Minor — closed).**
- `model/rasterLayer.ts` adds a pure `devicePxSize(cssPx, devicePixelRatio)` returning `Math.round(cssPx * devicePixelRatio)`, matching the inline formula it replaces exactly.
- `RasterUnderlay.tsx` now calls `devicePxSize(width, devicePixelRatio)` / `devicePxSize(height, devicePixelRatio)` for the canvas `width`/`height` attributes; the CSS-px `style` box is unchanged.
- Two new tests: `devicePixelRatio` of 1 leaves the size unchanged; `400.4` at `devicePixelRatio` 2 rounds `800.8` to `801` — both real, exercise the rounding behaviour.
- The doc comment explicitly explains why this is not the same as `clampDevicePx`: that function's `[1, U16_MAX]` bound is C3 §3.6's wire `u16` limit on a `fetch_raster` request, unrelated to a canvas element's backing-store size. Keeping them separate is the right call — conflating them would let a wire-protocol limit silently gate a browser API, and would make a future change to one clamp's bound accidentally affect the other.

**3. `rasterFetchKeyEquals` not-equal coverage gap (review-fixes-9-10.md Minor — closed).**
- Three new tests added, each changing exactly one of `width`, `height`, `devicePixelRatio` off a shared `baseKey` via spread and asserting `rasterFetchKeyEquals` returns false. Confirmed `baseKey` is a complete, realistic `RasterFetchKey` and each new test varies only its one named field — genuine, isolated not-equal cases, not vacuous.

**4. R65 — Properties pane axis-label suggestion from channel unit.**
- `PropertiesFormChannelOption.unit?: string`'s doc comment names the exact source: C1's per-channel unit, `SessionDetail.channels[].unit`, `app/src/ipc/catalog.ts`'s `ChannelSummary.unit`. Confirmed in `app/src/ipc/catalog.ts` (`/** C1 §4.1's per-channel unit */ unit: string;`) — field name matches, and the doc correctly notes the wire type is a required string while the TS prop here is optional/emptiable to represent "no suggestion."
- `suggestAxisLabel(channel)` in `model/propertiesForm.ts` returns `undefined` when `channel` is `undefined`, `channel.unit` is `undefined`, or `channel.unit` is the empty string; otherwise returns the label followed by the unit in parentheses. Four tests cover all four branches (with unit, no unit, empty-string unit, no channel selected) — each asserts the specific claimed value or `undefined`, not just truthiness.
- First-mark-only, unset-`y.label`-only gating: `handleMarkChannelChange` in `PropertiesForm.tsx` applies `updateMark` first, then checks `index === 0 && next.y?.label === undefined` before calling `updateYAxis` with the suggestion. It checks against `next` (the post-patch state), not the pre-patch `props`, so a `y.label` already set is correctly respected and never overwritten. The same handler is passed to every `MarkRow`, and the function's own `index === 0` check — not a per-row conditional prop — is what restricts the seed to the first mark, matching the file-level doc comment's stated rationale that `PlotProps` has one `y.label` for the whole plot regardless of mark count. This wiring logic has no dedicated component test (there is no component test file for `PropertiesForm`), consistent with CLAUDE.md §4's "UI rendering is not unit-tested" and the same pattern already used elsewhere in this lane (e.g. `ChartCell.tsx`'s pointer-move handler body is exercised only indirectly, through its pure driver's tests) — not a new gap this commit introduces.
- `unitsPreference`'s doc comment states plainly it has no effect in wave 2 and why (no quantity-to-unit table in TypeScript), matching ruling R65 in substance. A search for "quantity" under `Notebook/` returns only doc-comment prose explaining the absence of such a table — no quantity-to-unit lookup structure was introduced anywhere in this lane.
- Props surface: `PropertiesFormProps` still has exactly its five fields (`code`, `channels`, `laps`, `unitsPreference`, `onChange`); no context, IPC, or router import was added.
- Doc comments and units: every new or changed exported symbol (`devicePxSize`, `suggestAxisLabel`, `PropertiesFormChannelOption.unit`, `PropertiesFormProps.unitsPreference`) carries a doc comment.

**5. Tests, structurally.** All new tests in both commits are named `thing — condition — result`. `cursorReadoutDriver.test.ts` and `rasterLayer.test.ts`'s new cases use explicit Arrange/Act/Assert comment blocks with blank lines between, matching those files' established convention. `propertiesForm.test.ts`'s four new `suggestAxisLabel` tests use bare blank-line-separated blocks with no Arrange/Act/Assert comments — this matches the pre-existing style of every other test already in that file, not a new deviation introduced by this commit.

**6. Ownership/hygiene.** Both commit messages are single lines, no AI attribution trailer. `git show --stat` for both: only files under `Notebook/components`/`Notebook/model` plus `CHANGELOG.md` — no `rust/`, `app/src-tauri/`, `docs/`, `package.json`, or lockfile diff, no new npm dependency. CHANGELOG bullets for both commits accurately describe the changes and correctly cross-reference `review-fixes-9-10.md` and R65.

## Verdict rationale

Both `review-fixes-9-10.md` findings are correctly and completely closed: `handlePointerMove` now pairs the live in-gesture viewport with the live on-screen pixel, backed by a genuinely discriminating new test; `devicePxSize` is extracted, pure, tested, and correctly kept separate from the wire-protocol `clampDevicePx`; the three missing not-equal cases for `rasterFetchKeyEquals` are added and are real, isolated cases. The one process flag noted in the dispatch (the `useCallback`'s `liveViewport` dependency causing per-drag-frame identity churn) does not manifest as a defect, since the handler is wired only through React's synthetic `onPointerMove` prop rather than a raw `addEventListener`, so there is no listener rebinding cost and no new finding. R65 is implemented exactly as ruled: the axis-label suggestion reads C1's `ChannelSummary.unit` by its correct name, degrades to no suggestion on an absent or empty unit, seeds `y.label` only for the first mark and only when unset, never overwrites a user-entered or previously-suggested label, documents `unitsPreference` as a wave-2 no-op without introducing any quantity table, and keeps the component's prop surface unchanged. All touched tests are correctly named and structurally sound, hygiene is clean, and the gate reproduces cleanly with a nonzero passed count. This is ready to ship as is.

VERDICT: CLEAN
