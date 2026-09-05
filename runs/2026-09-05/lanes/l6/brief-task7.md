# L6 Task 7 — implementer brief (the chart frame — Plot line marks inside the sandbox, hover with no IPC)

You are the implementer for L6 Task 7 of the idl1 rewrite — the conversion
from decoded tiles to the shape the sandbox's `channel()` binds for Plot,
and the hover path that reads a tile's own column stats instead of calling
IPC. TDD for the pure modules, ONE commit, then report.

## Before anything else: verify Tasks 4–6 landed

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook"
git log --oneline -15
```

You need, in this worktree's history: Task 4 (`app: pure cell scan over the
C2 §2 fence grammar`), Task 5 (`app: sandboxed iframe host, postMessage cell
API, watchdog`), and Task 6 (`app: tier selection, point budget, and the
(session,channel,tier,index,columnCount) tile cache`). **If any is
missing — STOP and report** which one and do not proceed by implementing it
yourself or by guessing at its shape. This task imports Task 6's
`model/tiers.ts` types and, for the host-var wiring, Task 5's
`host/protocol.ts` — both need to actually exist on disk with the exports
this brief cites below, not just be assumed present because the plan lists
them in order.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. Status clean before starting.
- Work ONLY in `app/` inside this worktree. Do NOT touch the shared checkout,
  the `rust/` submodule, or any other worktree. Do NOT edit `docs/`. Do NOT
  push.
- **No cargo, ever, in this worktree.**
- **No new npm dependency.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l6/BRIEF.md`; the plan's
  `## Task 7` (`docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md`,
  lines 608–648); `app/src/ipc/tiles.ts` (`DecodedTile`, `COLUMN_T_US_EMPTY`
  — quoted in `runs/2026-09-05/lanes/l6/brief-task6.md`, read that copy);
  C2 §5.1 (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`, lines
  558–592 — the `channel()` host-variable row and its "provisional note",
  quoted below); performance-budget statements P1, P2, P5, P7
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md`, lines
  132–159, quoted below).

## The settled shape of `channel()` — read before writing `channelData.ts`

C2 §5.1 originally proposed `channel()` returning `{ length, t: Float64Array,
v: Float64Array }` (structure-of-arrays) so that Plot's `{x: "t", y: "v"}`
literal field names would resolve directly. That shape does not work: Plot
resolves a string channel accessor by `d["t"]` **per element** while
iterating the data array — iterating a `{length, t, v}` object yields
`undefined` at every index, not the intended columns. This is now settled,
not open: **`channel()` returns an array of `{ t, v }` records**, materialised
**inside the sandbox** from the two `ArrayBuffer`s the host transfers
(`HostVarPayload`'s `{ kind: "channel", length, t, v }` shape from Task 5's
protocol). C2 §5.3's grammar is unaffected — it already reads `x: "t", y:
"v"` as literal strings addressing record fields, which is exactly what an
array of `{t, v}` records supports. The two `ArrayBuffer`s stay the
zero-copy transfer (P7); only what Plot iterates changes, from a
column-oriented object to a record array. The record count is capped by the
point budget (Task 6's `pointBudget`, ~2 per pixel column) so materialising
records inside the sandbox is a few thousand objects at most, not hundreds
of thousands.

This task's job is the **host-side half**: converting decoded tiles into the
two flat typed-array buffers (`t: Float64Array`, `v: Float32Array` or
whatever concrete types you choose — document them) that get handed to
Task 5's `channelPayload` for transfer. Where the sandbox-side record
materialisation lives is `sandbox/main.ts` (Task 5) — if Task 5 left it as a
stub or didn't wire the channel case at all, this task's Step 2 modifies
`host/protocol.ts`/`sandbox/main.ts` only as far as needed to complete that
one path; check Task 5's own commit message and report first before
touching either file, since your job is the tile→buffer conversion, not a
second pass over Task 5's whole protocol.

## Performance-budget statements this task must satisfy (grep-checkable)

- **P1 — no `invoke` inside a pointer/wheel/touch/animation-frame handler.**
  `ChartCell`'s pointer handler calls `hoverAt` (pure, reads the cache) and
  sets React state — it never calls `invoke` or any `ipc/*` function.
- **P2 — hover reads the tile's column region, never `cursor_readout`.**
  `hoverAt` reads `DecodedTile.columnMin/columnMax/columnMean/columnTUs`
  from tiles already in the cache; `cursorReadout()` is not called from this
  task at all (that's Task 10).
- **P5 — point budget.** `tileToChannelData` emits at most `budget` records
  (Task 6's `pointBudget`).
- **P7 — heavy arrays cross as bytes.** The two buffers `channelPayload`
  transfers are the only thing that crosses the sandbox boundary for a
  channel's data — never a JSON array of numbers.

## The task

**Files:**
- Create: `Notebook/model/hover.ts`, `Notebook/model/hover.test.ts`,
  `Notebook/model/channelData.ts`, `Notebook/model/channelData.test.ts`,
  `Notebook/components/ChartCell.tsx`.
- Modify: `Notebook/host/protocol.ts` — **only** if Task 5 left the
  `channel` host-var payload path incomplete; check first (see above).

**Interfaces:**
- `channelData.ts` produces:
  ```ts
  /** The flat host-transfer buffers for one channel's window, built from
   *  one or more DecodedTiles. `t` is in **seconds** since session start
   *  (µs → s, matching `to_host_channel`'s convention) — computed from
   *  columnTUs with the COLUMN_T_US_EMPTY sentinel dropped, never plotted
   *  as zero. `v` is columnMean (the coarse per-pixel-column stat — this
   *  is a chart-width-resolution rendering, not the raw samples). Length
   *  of both arrays is at most `budget`. */
  interface ChannelData {
    length: number;
    t: Float64Array;
    v: Float32Array;
  }

  function tileToChannelData(
    tiles: DecodedTile[], startUs: number, endUs: number, budget: number
  ): ChannelData;
  ```
- `hover.ts` produces:
  ```ts
  /** Reads the tile column under `pixelX`, no IPC (P2). `geometry` carries
   *  whatever pixel↔time mapping ChartCell already has (viewport start/end
   *  and CSS width) — define its exact shape to match how ChartCell holds
   *  that state; document it. Returns null when pixelX falls outside the
   *  plotted area or lands on a column carrying COLUMN_T_US_EMPTY. */
  function hoverAt(
    tiles: DecodedTile[], pixelX: number, geometry: HoverGeometry
  ): { tUs: bigint; min: number; max: number; mean: number } | null;
  ```
- `ChartCell.tsx` owns the DOM: a `<div>` holding the sandbox iframe's
  rendered Plot output plus a `<canvas>` for the raster underlay (Task 9
  wires the canvas's content; this task only needs the element to exist so
  Task 9 doesn't have to restructure the component) and an absolutely
  positioned hover tooltip. Its pointer handler calls `hoverAt` and sets
  React state only — **never `invoke`**.
- Consumes `model/tiers.ts`, `model/tileCache.ts` (Task 6), `ipc/tiles.ts`
  types (type-only import — never calls `fetchTile` itself; the cache/fetch
  orchestration is Task 8's settle callback, not this task's).

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests**

  `channelData.test.ts`:
  - `tileToChannelData — one tile covering the window — emits one record per column with t in seconds`
  - `tileToChannelData — a column carrying the COLUMN_T_US_EMPTY sentinel — is dropped, not plotted at zero`
  - `tileToChannelData — a column whose stats are all NaN but whose time is real — keeps the time and emits no value`

    ("emits no value" — your call how a per-column NaN mean surfaces in
    `ChannelData`; a `NaN` in the `v` array that Plot itself will skip when
    drawing, or an equal-length parallel validity mask, are both acceptable
    as long as the record isn't silently coerced to a plotted zero. State
    your choice in `channelData.ts`'s doc comment.)
  - `tileToChannelData — more columns than the point budget — emits at most budget records`
  - `tileToChannelData — two adjacent tiles — emits records in ascending time with no duplicate at the seam`

  `hover.test.ts`:
  - `hoverAt — a pixel inside the plotted area — returns that column's min, max, mean and recorded t_us`
  - `hoverAt — a pixel outside the plotted area — returns null`
  - `hoverAt — a column with the empty-time sentinel — returns null rather than a bogus instant`

  8 tests total. A/A/A with blank lines between sections; names exactly as
  above. Build small fake `DecodedTile`s (typed arrays of a handful of
  values) rather than real fetched tiles — these modules never fetch.

- [ ] **Step 2: Implement `channelData.ts` and `hover.ts`**

  `tileToChannelData`: iterate tiles in order, for each column compute
  `t_s = Number(columnTUs[j]) / 1_000_000` **after** checking
  `columnTUs[j] !== COLUMN_T_US_EMPTY` (checking the `bigint` sentinel before
  converting to `Number` — converting first would lose the exact sentinel
  value to floating-point rounding and make the check unreliable). When the
  budget is smaller than the total column count across all tiles, downsample
  evenly (a stride, not a truncation to the first `budget` columns — a
  truncation would silently lose the tail of the visible window; matching
  the "at most 2× pixel width" intent means evenly reducing density, not
  cropping time).

  `hoverAt`: map `pixelX` to a column index via `geometry`, look up that
  column across whichever tile in `tiles` covers it, return `null` if no
  tile covers it or if the column's time is the empty sentinel.

- [ ] **Step 3: Implement `ChartCell.tsx`**

  No unit tests for this component (CLAUDE.md §4 — UI rendering). Its
  pointer handler is the one place a reviewer will grep for `invoke(` and
  for `onPointerMove|onWheel|onTouchMove|requestAnimationFrame` reaching
  into `ipc/` — keep both clean per P1/P2.

- [ ] **Step 4: Gate**

  ```
  npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model
  ```
  Expected: 24 (Tasks 4+6, already landed — confirmed above) + 8 (this
  task) = 32 passed, 0 failed.

- [ ] **Step 5: CHANGELOG**

  ```
  - **Tiles → Plot data, hover from the column region (L6 Task 7).** `tileToChannelData` materialises the sandbox's `channel()` records (an array of `{t, v}`, per the settled C2 §5.1 shape) from transferred buffers; `hoverAt` reads a tile's own column stats — no `cursor_readout`, no IPC on the hover path.
  ```

- [ ] **Step 6: Commit**

  Explicit paths (include `host/protocol.ts` only if you actually modified
  it):
  ```
  git add src/routes/pages/Notebook/model/hover.ts src/routes/pages/Notebook/model/hover.test.ts src/routes/pages/Notebook/model/channelData.ts src/routes/pages/Notebook/model/channelData.test.ts src/routes/pages/Notebook/components/ChartCell.tsx ../CHANGELOG.md
  ```
  Message, single line, no AI attribution trailer:
  ```
  app: tiles → Plot line data, hover from the tile column region (no IPC per move)
  ```

## Do not

- Do not emit the SoA `{length, t, v}` object as what `channel()` "returns"
  anywhere in this task's code or comments — that shape is superseded (see
  above). This task's own `ChannelData` interface is the **host-side
  transfer buffers**, a different thing from what the sandbox exposes as
  `channel()`'s return value to cell code (an array of records, built
  inside `sandbox/main.ts` from these buffers).
- Do not convert a `BigInt64Array` sentinel to `Number` before comparing it
  to `COLUMN_T_US_EMPTY` — compare as `bigint` first.
- Do not call `cursor_readout`, `invoke`, or any `ipc/*` function from
  `hover.ts`, `channelData.ts`, or `ChartCell.tsx`'s pointer handler.
- Do not truncate to the first `budget` columns when downsampling — stride
  evenly across the full visible range.
- Do not fetch tiles from `ChartCell.tsx` in this task — the cache/fetch
  orchestration (settle-bound `ensureTiles`/`fetchTile` calls) is Task 8's
  job; this task's component receives already-decoded tiles as props/state
  it doesn't itself populate via IPC.

## Style / hygiene

Doc comment on every exported symbol, with units (`t` in seconds, `pixelX`
in CSS px); `// TODO(idl0):` never bare `// TODO`; A/A/A tests with blank
lines between sections.

## Report back (concise)

Commit hash + `git show --stat`; the exact gate command and result line
(with `passed`/`failed` counts, expect 32); whether Task 5's `host/protocol.ts`
needed any change and what (or confirmation it didn't); your chosen
representation for "no value" on an all-NaN column; confirmation of the
`bigint`-before-`Number` sentinel-check ordering (paste the line);
confirmation no `invoke(`/gesture-handler IPC call appears in `ChartCell.tsx`
(grep it yourself, paste the negative result); per-step done/deviated;
anything ambiguous you resolved (say how) or that needs a lead ruling (stop
and report instead of guessing — CLAUDE.md §1).
