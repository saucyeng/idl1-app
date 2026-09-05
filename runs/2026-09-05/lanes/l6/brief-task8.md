# L6 Task 8 — implementer brief (pan and zoom — transform during the gesture, IPC on settle)

You are the implementer for L6 Task 8 of the idl1 rewrite — the pure
viewport-transform math that lets a pinch/scroll/drag move the already-drawn
picture with no fetch, and the settle debouncer that is the **only** caller
of `ensureTiles`/`fetchTile` once the gesture stops. TDD, ONE commit, then
report.

## Before anything else: verify Tasks 4–7 landed

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook"
git log --oneline -20
```

You need, in this worktree's history: Task 4 (cell scan), Task 5 (sandbox
host), Task 6 (tier selection, point budget, tile cache — `app: tier
selection, point budget, and the (session,channel,tier,index,columnCount)
tile cache`), and Task 7 (`app: tiles → Plot line data, hover from the tile
column region (no IPC per move)`). This task wires gesture handlers into
Task 7's `ChartCell.tsx`, so Task 7 in particular must actually exist with
that file present. **If any of the four is missing — STOP and report** which
one; do not implement it yourself or assume its shape from the plan text
alone (a prior task's brief may have corrected something the plan's prose
didn't anticipate — read that task's actual commit, not just the plan).

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. Status clean before starting.
- Work ONLY in `app/` inside this worktree. Do NOT touch the shared checkout,
  the `rust/` submodule, or any other worktree. Do NOT edit `docs/`. Do NOT
  push.
- **No cargo, ever, in this worktree.**
- **No new npm dependency.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l6/BRIEF.md`; the plan's
  `## Task 8` (`docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md`,
  lines 652–702); design §6's interaction rules
  (`docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`, lines
  148–153, quoted below); C3 §4 "Interaction budget" in full
  (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`, lines
  891–929, quoted below — this is the checkable, contract-level version of
  the same rule); Task 7's landed `ChartCell.tsx` and `model/hover.ts`
  (read them before writing anything — this task modifies the former).

## The rule this task exists to make mechanically true (C3 §4, verbatim)

> **Never called on a hot path** (every render frame, every pointer-move
> event): `fetch_tile`, `fetch_raster`, `cursor_readout`, `eval_workbook`.
>
> **Zoom** is quantised to tiers. During a pinch/scroll gesture the current
> tile's picture scales via a canvas/CSS transform — no IPC. `fetch_tile` at
> the new tier is called once, on **settle**.
>
> **Pan** is translation: the picture slides locally; `fetch_tile` is called
> only for newly exposed edge tiles, on settle. Playback prefetches ahead of
> the playhead — also `fetch_tile`, but proactive and off the interaction
> path (it runs on a timer/lookahead, not in response to a gesture frame).

This is performance-budget statements **P3** and **P4** from the plan,
restated as a grep-checkable pair: no `invoke`/`fetchTile`/`ensureTiles`
call reachable from `onWheel`/`onPointerMove`/`onTouchMove`/
`requestAnimationFrame`; exactly one call site (the settle callback) reaches
`ensureTiles`.

## The task

**Files:**
- Create: `Notebook/model/viewport.ts`, `Notebook/model/viewport.test.ts`,
  `Notebook/model/settle.ts`, `Notebook/model/settle.test.ts`.
- Modify: `Notebook/components/ChartCell.tsx` (wire the gesture handlers
  Task 7 left unwired — Task 7's pointer handler calls `hoverAt`; this task
  adds the pan/zoom transform on top of it, in the same component).

**Interfaces:**
- `viewport.ts` produces:
  ```ts
  /** The visible time window and the chart's own pixel width. startUs/endUs
   *  are µs on the session's t axis (C1 §3.1); pixelWidth is CSS px. */
  interface Viewport {
    startUs: number;
    endUs: number;
    pixelWidth: number;
  }

  /** Translates the window by `pixelDx` CSS px (positive = drag right =
   *  window moves earlier in time, or the reverse — pick one convention
   *  and document it explicitly in the doc comment, since a reviewer and
   *  Task 7's hover geometry both need to agree with it). Pure — no clamp;
   *  see clampTo. */
  function panBy(viewport: Viewport, pixelDx: number): Viewport;

  /** Scales the window by `factor` (>1 = zoom in) about the time instant
   *  currently under `pixelX`, keeping that instant fixed under the
   *  pointer. Pure — no clamp. */
  function zoomAt(viewport: Viewport, pixelX: number, factor: number): Viewport;

  /** Clamps a viewport to [0, sessionSpanUs], preserving span where
   *  possible (a pan past either edge stops at the edge; a zoom-out past
   *  the whole-session span clamps to exactly the session). */
  function clampTo(viewport: Viewport, sessionSpanUs: number): Viewport;

  /** The CSS/canvas transform that makes the picture **already drawn** for
   *  `rendered` appear to be `current` — the mechanism that lets a gesture
   *  move the view with zero fetch (P3/P4). translateXPx moves the
   *  rendered picture in CSS pixels; scaleX stretches it horizontally
   *  about the left edge (document your origin choice). */
  function transformFor(rendered: Viewport, current: Viewport): { scaleX: number; translateXPx: number };
  ```
- `settle.ts` produces:
  ```ts
  /** A debouncer for gesture settle: `notify(value)` records the latest
   *  value and (re)starts a `delayMs` timer via the injected `timer`;
   *  `onSettle` fires once the timer elapses with no further `notify` call
   *  in between. `cancel()` stops a pending timer without firing.
   *  `timer` is injected (setTimeout/clearTimeout-shaped) so tests are
   *  deterministic without vitest's fake-timer setup beyond what it
   *  already provides — define the exact injected shape yourself and
   *  document it. */
  function makeSettle<T>(
    delayMs: number,
    onSettle: (value: T) => void
  ): { notify(value: T): void; cancel(): void };
  ```
  Adjust the exact signature if a `timer` injection parameter is needed to
  make the tests below deterministic (it likely is — do not rely on real
  `setTimeout` timing in the test file; either inject `timer` explicitly or
  use vitest's `vi.useFakeTimers()`, whichever the plan's own emphasis on
  "an injected timer, so tests are deterministic without fake clocks beyond
  vitest's" was pointing at — re-read that line in the plan's Task 8
  Interfaces section before choosing).
- Consumes `model/tiers.ts` (Task 6) for tier re-selection on settle.

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests**

  `viewport.test.ts`:
  - `panBy — a drag of 100 px on a 1000 px wide 10 s window — moves the window by exactly 1 s`
  - `panBy — a drag past the session start — clamps at zero with the span preserved`

    (this test necessarily composes `panBy` with `clampTo` — say so in a
    comment if the test calls both, since `panBy` alone is unclamped by
    design)
  - `zoomAt — a pinch centred on the left edge — keeps that instant under the pointer`
  - `zoomAt — repeated zoom-out past the session span — clamps to the whole session`

    (again composes `zoomAt` with `clampTo`)
  - `transformFor — a viewport equal to the rendered one — is the identity transform`
  - `transformFor — a viewport panned half a width — translates by half the pixel width and does not scale`
  - `transformFor — a viewport zoomed 2x — scales by 2 about the correct origin`

  `settle.test.ts`:
  - `makeSettle — three calls inside the delay — fires onSettle once with the last value`
  - `makeSettle — two calls separated by more than the delay — fires twice`
  - `makeSettle — cancelled before the delay elapses — never fires`

  10 tests total. A/A/A with blank lines between sections; names exactly as
  above.

- [ ] **Step 2: Implement `viewport.ts` and `settle.ts`, then wire `ChartCell.tsx`**

  `panBy`/`zoomAt`/`clampTo`/`transformFor` are plain arithmetic over
  `{startUs, endUs, pixelWidth}` — no DOM, no timers, no IPC. `zoomAt`'s
  "keep the instant under the pointer fixed" is the standard
  scale-about-a-point formula: convert `pixelX` to a time instant under the
  *current* viewport, scale the span by `1/factor`, then re-center so that
  instant maps back to the same `pixelX` under the new viewport.

  In `ChartCell.tsx`: `onWheel`/`onPointerMove` (for drag-pan) update
  viewport **state** and the CSS transform only, via `transformFor` —
  neither handler calls `ensureTiles`, `fetchTile`, or anything under
  `ipc/`. The settle callback (built from `makeSettle`, delay a named
  constant in ms) is the **sole** caller of Task 6's `ensureTiles` — on
  firing, it re-runs `chooseTier` for the new viewport, computes the tile
  range via `tileRange`, and calls `ensureTiles` for any indices the cache
  is missing. Playback prefetch (design §6: "Playback prefetches ahead of
  the playhead") is explicitly **not** this task's gesture path — if you
  stub or note it, say in a doc comment that it runs off a separate
  timer/lookahead, not from a gesture frame, so a reviewer doesn't mistake
  a future prefetch call for a P4 violation.

- [ ] **Step 3: Gate**

  ```
  npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model
  ```
  Expected: 32 (Tasks 4+6+7, already landed — confirmed above) + 10 (this
  task) = 42 passed, 0 failed.

- [ ] **Step 4: CHANGELOG**

  ```
  - **Pan/zoom viewport transforms, settle-bound tile fetch (L6 Task 8).** Gesture frames update a CSS/canvas transform only (P3/P4); the debounced settle callback is the sole caller of `ensureTiles`/`fetchTile` at the re-chosen tier.
  ```

- [ ] **Step 5: Commit**

  Explicit paths:
  ```
  git add src/routes/pages/Notebook/model/viewport.ts src/routes/pages/Notebook/model/viewport.test.ts src/routes/pages/Notebook/model/settle.ts src/routes/pages/Notebook/model/settle.test.ts src/routes/pages/Notebook/components/ChartCell.tsx ../CHANGELOG.md
  ```
  Message, single line, no AI attribution trailer:
  ```
  app: viewport transforms for pan/zoom, settle-bound tile fetch
  ```

## Do not

- Do not call `ensureTiles`, `fetchTile`, or any `ipc/*` function from
  `onWheel`, `onPointerMove`, `onTouchMove`, or any
  `requestAnimationFrame` callback in `ChartCell.tsx` — a reviewer will grep
  for exactly this (P3/P4) and any hit outside the settle callback is a
  Critical finding.
- Do not clamp inside `panBy`/`zoomAt` themselves — `clampTo` is the
  separate, explicit clamping step; a `panBy` that silently clamps makes it
  impossible for a caller to detect "this pan would have gone past the
  edge" separately from "this pan was applied as requested."
- Do not use a real `setTimeout` untested/unmocked in `settle.test.ts` —
  either inject the timer explicitly or use vitest's fake timers
  consistently; do not mix real waits with fake-timer assertions in the same
  test.
- Do not implement playback prefetch as part of this task's gesture path —
  it is explicitly out of scope here (a separate timer/lookahead mechanism,
  not blocked on this task, and not to be invented ad hoc just because it's
  mentioned in the design doc's same paragraph).
- Do not build or run any cargo command in this worktree.

## Style / hygiene

Doc comment on every exported symbol, with units (`startUs`/`endUs` in µs,
`pixelDx`/`pixelX`/`translateXPx` in CSS px, `delayMs` in ms); state your
pan-direction and zoom-origin conventions explicitly in the doc comments
(the tests will only make sense against a stated convention); `// TODO(idl0):`
never bare `// TODO`; A/A/A tests with blank lines between sections.

## Report back (concise)

Commit hash + `git show --stat`; the exact gate command and result line
(with `passed`/`failed` counts, expect 42); the pan-direction and
zoom-origin conventions you chose (state them explicitly — the reviewer
needs to check the tests against your stated convention, not guess one);
confirmation no `ensureTiles`/`fetchTile`/`invoke(` call appears inside
`onWheel`/`onPointerMove`/`onTouchMove`/`requestAnimationFrame` in
`ChartCell.tsx` (grep it yourself, paste the negative/positive result
showing the settle callback is the only reachable call site); per-step
done/deviated; anything ambiguous you resolved (say how) or that needs a
lead ruling (stop and report instead of guessing — CLAUDE.md §1).
