# L6 Task 9 — implementer brief (raster layering — spectrogram and 2-D histogram under Plot axes)

You are the implementer for L6 Task 9 of the idl1 rewrite — the pure raster
request/alignment math and the `<canvas>` underlay that draws a Rust-computed
spectrogram or 2-D histogram beneath a chart cell's Plot axes. TDD, ONE
commit, then report.

## Before anything else: verify Task 8 landed

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook"
git log --oneline -20
```

You need, in this worktree's history, a commit adding
`Notebook/model/viewport.ts` and `Notebook/model/settle.ts` (Task 8: pan/zoom
transform math and the settle debouncer, wired into `ChartCell.tsx`). **If it
is missing — STOP and report.** Do not implement Task 8 yourself or guess its
shape from the plan text; read the actual committed `viewport.ts` (its
`Viewport` interface, `panBy`/`zoomAt`/`clampTo`/`transformFor`) and the
settle callback wired in `ChartCell.tsx` — this task's raster fetch reuses
that exact settle callback, it does not build a second one.

Also confirm these already exist (they should, from Tasks 6–8 and pre-lane
IPC wrappers) and read them before writing anything:
- `app/src/ipc/rasters.ts` — `fetchRaster`, `fetchRasterMeta`,
  `DecodedRaster`, `RasterMeta`, `RasterKind`, `SpectrogramParams`,
  `Histogram2dParams` (all already landed on `main`, not this lane's to
  create).
- `Notebook/components/ChartCell.tsx` — already has a placeholder
  `<canvas className="chart-cell-underlay">` sized to `width`/`height`,
  positioned `absolute; inset: 0` beneath the sandbox mount div, added by
  Task 7 specifically so this task doesn't have to restructure the
  component. You are filling in what draws to it, and wiring the settle
  callback to fetch into it.
- `Notebook/model/tiers.ts`'s `chooseTier` — a raster fetch does **not** go
  through tile tiers; it is sized in device pixels for the current viewport
  directly (see Interfaces below). Read it anyway so you don't accidentally
  reuse tier logic where it doesn't apply.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. Status clean before starting.
- Work ONLY in `app/` inside this worktree. Do NOT touch the shared checkout,
  the `rust/` submodule, or any other worktree. Do NOT edit `docs/`. Do NOT
  push.
- **No cargo, ever, in this worktree.**
- **No new npm dependency.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l6/BRIEF.md`; the plan's
  `## Task 9` (`docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md`,
  lines 706–744); C3 §3.6 "Rasters" in full
  (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`, lines
  688–760) — the header layout `fetchRaster`/`decodeRaster` already decode,
  and `fetch_raster_meta`'s `x_domain`/`y_domain`/`scale` shape; ruling R42
  (`runs/2026-09-03/decisions.md`, search "R42") — `x_bins`/`y_bins` must
  equal `width`/`height` for `histogram2d` in wave 1/2 (bins-under-pixels is
  a future extension, not this task's job); ruling R38 — `scale.vmin`/`vmax`
  are resolution-independent, so the legend must not be recomputed in JS
  when the chart resizes; design §6's "Point budget" line ("Density
  (spectrogram, g-g scatter, whole-session histograms) is a Rust raster
  under Plot axes").

## Interfaces (from the plan, Task 9)

- Produces:
  ```ts
  /** Builds one fetch_raster/fetch_raster_meta request from the current
   *  viewport and cell size. width/height are device pixels (CSS px *
   *  devicePixelRatio), clamped to C3 §3.6's u16 bound (65535) — a chart
   *  wider than that on a very-high-DPI display clamps and reports it so
   *  the caller can log/ignore rather than silently request a bogus size. */
  interface RasterRequest {
    width: number;   // device px, u16-clamped
    height: number;  // device px, u16-clamped
    params: SpectrogramParams | Histogram2dParams;
    clamped: boolean; // true if width or height was clamped from the requested size
  }

  function rasterRequestFor(
    viewport: Viewport,          // Task 8's type, imported from model/viewport.ts
    kind: RasterKind,
    params: SpectrogramParams | Histogram2dParams,
    devicePixelRatio: number
  ): RasterRequest;

  /** Where to draw a fetched raster given the current viewport, in CSS px
   *  source/dest rectangles for drawImage/putImageData. null when the
   *  raster's x_domain (RasterMeta, seconds since session start) does not
   *  overlap the viewport's [startUs, endUs] window at all. */
  interface RasterDrawRect {
    /** Source rect within the decoded raster's own pixel buffer. */
    srcX: number; srcY: number; srcWidth: number; srcHeight: number;
    /** Destination rect in the canvas's CSS px space. */
    destX: number; destY: number; destWidth: number; destHeight: number;
  }
  function alignRasterToAxes(meta: RasterMeta, viewport: Viewport): RasterDrawRect | null;

  /** Blits decoded RGBA8 pixels into ctx at the rect alignRasterToAxes
   *  computed. Uses createImageBitmap when available, falling back to
   *  putImageData — document which path vitest's jsdom environment can
   *  exercise, since createImageBitmap is not implemented there (this
   *  function itself is DOM-touching and therefore NOT unit-tested per
   *  CLAUDE.md §4 — only rasterRequestFor/alignRasterToAxes are). */
  function drawRaster(ctx: CanvasRenderingContext2D, decoded: DecodedRaster, rect: RasterDrawRect): void;
  ```
  `x_bins`/`y_bins` for a `Histogram2dParams` request are always set equal to
  the request's own `width`/`height` (R42) — `rasterRequestFor` sets them,
  the caller never supplies its own bin count for a wave-2 request.
- Consumes `app/src/ipc/rasters.ts` (`fetchRaster`, `fetchRasterMeta`,
  `DecodedRaster`, `RasterMeta`, `RasterKind`, `SpectrogramParams`,
  `Histogram2dParams` — already landed, this task adds no new IPC wrapper),
  `Notebook/model/viewport.ts`'s `Viewport` (Task 8).

## The task

**Files:**
- Create: `Notebook/model/rasterLayer.ts`, `Notebook/model/rasterLayer.test.ts`,
  `Notebook/components/RasterUnderlay.tsx`
- Modify: `Notebook/components/ChartCell.tsx` (wire the settle callback to
  also fetch+draw a raster when the cell is raster-kind; draw into the
  existing `<canvas className="chart-cell-underlay">`)

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests** (`rasterLayer.test.ts` — pure
  functions only, `rasterRequestFor`/`alignRasterToAxes`; `drawRaster` and
  `RasterUnderlay.tsx` are not unit-tested, CLAUDE.md §4)

  - `rasterRequestFor — a histogram2d request — sets x_bins and y_bins equal to width and height (R42)`
  - `rasterRequestFor — a chart wider than u16 max — clamps width and reports the clamp`
  - `rasterRequestFor — a spectrogram request — passes window, detrend and scaling through unchanged`
  - `rasterRequestFor — a devicePixelRatio of 2 — requests twice the CSS pixel dimensions`
  - `alignRasterToAxes — a raster meta whose x_domain differs from the viewport — returns the source rectangle to draw`
  - `alignRasterToAxes — a raster meta whose domain does not overlap the viewport at all — returns null`

  6 tests, matching the plan's Step 1 list exactly. A/A/A with blank lines
  between sections.

- [ ] **Step 2: Implement**

  `rasterRequestFor`: device pixels = `Math.round(viewport.pixelWidth *
  devicePixelRatio)` for width, and the caller-supplied CSS height ×
  `devicePixelRatio` for height (the cell's own height prop, not derived from
  `Viewport`, which carries no vertical extent — take height as a parameter
  or fold it into the function signature; document whichever you choose).
  Clamp both to `[1, 65535]` (C3 §3.6's `u16` bound) and set `clamped: true`
  if either was reduced.

  `alignRasterToAxes`: convert `meta.x_domain` (seconds since session start,
  per `RasterMeta`'s doc comment in `ipc/rasters.ts`) to the viewport's own
  µs axis (`viewport.startUs`/`endUs`) — note the unit mismatch (`RasterMeta`
  is in **seconds**, `Viewport` is in **µs**) and convert explicitly and
  visibly in the doc comment; a silent factor-of-1e6 bug here is exactly the
  kind of thing a reviewer must be able to spot by reading one function. If
  the domains don't overlap at all, return `null`. Otherwise compute the
  overlapping source rectangle (which columns of the decoded pixel buffer
  correspond to the visible time window) and the destination rectangle in
  CSS px within the cell (`transformFor`-style linear mapping, but this is
  its own function — do not import Task 8's `transformFor`, which is for the
  *rendered-picture* transform during a gesture, not for a fresh raster
  fetch's static placement).

  `drawRaster`: `ctx.putImageData(new ImageData(decoded.pixels, decoded.width,
  decoded.height), ...)` is the simplest correct path (no async
  `createImageBitmap` needed for RGBA8 already in the right byte order); if
  you use `createImageBitmap` for scaling quality, guard it and fall back,
  and say so in the doc comment. Never recompute a colour scale in this file
  — `scale.vmin`/`vmax` from `RasterMeta` (already resolution-independent,
  R38) is the only source of legend bounds, and this task does not draw a
  legend at all (that's a Plot/CSS concern for whichever task adds a legend
  control, not raster layering) — state that explicitly so a reviewer
  doesn't look for a missing legend here.

  `RasterUnderlay.tsx`: a small component wrapping the fetch-on-settle +
  draw sequence. It receives the raster kind/params, the current viewport,
  and a ref to the canvas (or renders its own `<canvas>` — pick whichever
  fits `ChartCell.tsx`'s existing structure with the least disruption, and
  say which you picked). **The fetch is triggered only from the settle
  callback Task 8 built** — this component (or the effect that drives it)
  must not fetch on every render or every viewport change; wire it the same
  way Task 8 wires `ensureTiles`. Per the operating brief's IPC-effects rule
  (§4, `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md`): the decision of *whether*
  to fetch (kind changed? viewport settled? already have this exact
  request's data?) belongs in a pure function this task also writes and
  tests if it does anything beyond "call fetchRaster with rasterRequestFor's
  output" — if the wiring really is that trivial (settle fires → compute
  request → fetch → decode → alignRasterToAxes → drawRaster), say so
  explicitly in the commit message per the rule's own escape hatch ("the
  effect only calls it"), rather than inventing a driver module with nothing
  to decide.

  Fetches use `fetchRaster` for pixels and `fetchRasterMeta` for the
  domain/scale needed by `alignRasterToAxes` — both settle-bound (C3 §4),
  never called from `onWheel`/`onPointerMove`/`onTouchMove`/
  `requestAnimationFrame` (P1, P3, P4).

- [ ] **Step 3: Gate**

  ```
  npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model/rasterLayer
  ```
  Expected: 6 passed, 0 failed.

- [ ] **Step 4: CHANGELOG**

  ```
  - **Rust raster underlay (L6 Task 9).** Spectrogram and 2-D histogram rasters drawn beneath Plot axes via `fetch_raster`/`fetch_raster_meta`, settle-bound only (P1/P3/P4); colour scale never recomputed in JS (R38, P8).
  ```

- [ ] **Step 5: Commit**

  Explicit paths:
  ```
  git add src/routes/pages/Notebook/model/rasterLayer.ts src/routes/pages/Notebook/model/rasterLayer.test.ts src/routes/pages/Notebook/components/RasterUnderlay.tsx src/routes/pages/Notebook/components/ChartCell.tsx ../CHANGELOG.md
  ```
  Message, single line, no AI attribution trailer:
  ```
  app: Rust raster underlay (spectrogram, 2-D histogram) beneath Plot axes
  ```

## Do not

- Do not compute or adjust a colour scale, bin count, or any statistic in
  TypeScript — `scale.vmin`/`vmax` from `fetch_raster_meta` is the only
  legend source (P8, R38). A "nicer" client-side rescale is exactly the
  numbers-in-JS mistake CLAUDE.md §2 forbids.
- Do not call `fetchRaster`/`fetchRasterMeta` from any gesture handler or
  `requestAnimationFrame` callback — settle only (P1, P3, P4). A reviewer
  will grep for this.
- Do not set `x_bins`/`y_bins` to anything other than the request's own
  `width`/`height` for `histogram2d` (R42) — even though `Histogram2dParams`
  carries those fields as if they were independently choosable.
- Do not draw a legend, axis, or any Plot mark in this task — that is Plot's
  job on the SVG layer above the canvas; this task only blits pixels.
- Do not reuse Task 8's `transformFor` for raster placement — that function
  is for transforming an *already-rendered* picture during a gesture with no
  fetch; raster placement here follows a fresh fetch and its own
  `alignRasterToAxes` geometry.
- Do not build or run any cargo command in this worktree.

## Style / hygiene

Doc comment on every exported symbol, with units (`width`/`height` in device
px unless stated otherwise, `x_domain`/`y_domain` conversion from seconds to
µs stated explicitly); `// TODO(idl0):` never bare `// TODO`; A/A/A tests
with blank lines between sections.

## Report back (concise)

Commit hash + `git show --stat`; the exact gate command and result line
(expect 6 passed); which unit-mismatch handling you implemented for
`x_domain`/`y_domain` (seconds) vs `Viewport` (µs) — state the conversion
factor and where it lives; whether `RasterUnderlay`'s fetch-on-settle wiring
needed a pure driver module beyond calling `rasterRequestFor` +
`fetchRaster`/`fetchRasterMeta` + `alignRasterToAxes` + `drawRaster`, or
whether it was trivial enough that the effect calling those directly
satisfies the operating brief's IPC-effects rule (state which, and why);
confirmation no raster fetch is reachable from `onWheel`/`onPointerMove`/
`onTouchMove`/`requestAnimationFrame` (grep it yourself, paste the result);
per-step done/deviated; anything ambiguous you resolved (say how) or that
needs a lead ruling (stop and report instead of guessing — CLAUDE.md §1).
