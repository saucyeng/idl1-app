# L6 Task 13b — implementer brief (bind js cells to ChartCell, R66)

You are the implementer for L6 Task 13b of the idl1 rewrite — the task R66
created after Task 13 landed. Task 13 shipped open/eval/render but cut one
corner rather than guess: every `js` cell renders as a plain mounted
`<div dangerouslySetInnerHTML>` of the sandbox's serialized HTML, with no
pan/zoom/hover chart chrome at all. This is M1's core deliverable ("Plot
charts with real pan/zoom/hover") and it does not exist yet in the running
app. This task closes that gap for **form-generated** `js` cells only. ONE
commit, then report (or two at the seam named in Step 7 — your call, state
which you did).

## Before anything else: verify Task 13 landed

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook"
git log --oneline -20
```

You need `a61ab5c` (reducer/driver/orchestrator), `8fb068e` (render +
inline spans), `ae04242` (coverage), and `a13d443` (review fix — `MarkRow`
reuses `PropertiesFormLapOption`). **If any is missing — STOP and report.**

Read, in full, before writing anything:

- `runs/2026-09-03/decisions.md` — **R66** (search "R66: L6 Task 13
  landed"), items 1 and 2 (this task's mandate) and items 3–4 (context, not
  yours to touch). Also **R60** (the `NotebookSession` orchestrator's
  original placement ruling) and **R65** (axis-label suggestion from C1
  `unit` — tells you `PropertiesFormChannelOption.unit` exists and where it
  comes from, relevant to §3 below even though this task does not mount
  `PropertiesForm`).
- `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md` §6 in full —
  the interaction rules (hover/zoom/pan/point-budget), especially "no IPC on
  the interaction path."
- `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §4, the tightened IPC-effects
  rule (data-only dependency arrays, callbacks in refs, staleness by
  sequence, never a cancelling cleanup). Every effect you touch or add in
  `index.tsx` must already satisfy this — it does today; do not regress it.
- `runs/2026-09-05/lanes/l6/review-STANDING.md` — the whole file; it is the
  reviewer's checklist for this task too (purity, IPC-effects rule, hygiene,
  the `x.type` grammar check, etc.).
- `runs/2026-09-05/lanes/l6/brief-task13.md` — Task 13's own brief, so you
  know what it built and why the plain mount happened (its "Interfaces"
  section, and `index.tsx`'s module doc comment explaining the cut corner).

Then read the code as actually committed (not the plan, not this brief's
sketches, where they'd disagree — see "Where the plan/code disagree" below):

- `components/ChartCell.tsx` — full file. Its props as landed by Tasks 6–10:
  `tiles`, `width`, `height`, `viewport`, `sessionSpanUs`, `sessionId`,
  `channelId`, `sampleRateHz`, `cache`, `fetchTile`, `onViewportSettled`,
  `raster?`, `fetchCursorReadout`, `channelLabel?`. Note the doc comment on
  `ChartCellProps`: this component plots **exactly one channel**. Note the
  empty `<div className="chart-cell-sandbox-mount" .../>` in its render —
  today nothing fills it; that is this task's actual mounting point for the
  sandbox's rendered picture (see §2 below). `ChartCell` has never been
  mounted by any page yet — confirm this yourself (`grep -rn "<ChartCell"
  app/src`); you are its first real caller.
- `host/NotebookSession.ts` and `model/channelRebind.ts` — full files.
  `NotebookSession.setBoundChannel(cellId, bound: BoundChannel)` exists and
  is tested (rebuild re-sends), but nothing calls it — `boundByCellId` is
  permanently empty in the running app today. `BoundChannel`'s shape:
  `{ name, key: Omit<TileCacheKey,"tileIndex">, range, startUs, endUs,
  budget }`. `name` is the sandbox host-variable name a channel is bound
  under (`setHostVar`'s `name` / `setChannelHostVar`'s `name`) — for this
  task that is the raw channel id `plotForm` names in `channel("id")`
  (confirm this reading against `sandbox/main.ts`'s `materializeHostVar`/
  `bindHostVar` naming before assuming it, and say in your report if it's
  something else).
- `host/SandboxHost.ts` — full file, especially `SandboxHostCallbacks`
  (`onCellResult`, `onCellError`, `onInlineResult`, `onChannelsInvalidated`)
  and `setChannelHostVar`'s signature. There is exactly **one** iframe per
  notebook (not one per cell) — a cell's rendered picture arrives as one
  `{cellId, html}` string via `onCellResult`; nothing about "mounting
  ChartCell" changes that transport, it only changes *where* that `html`
  string is placed in the host DOM (inside `ChartCell`'s
  `chart-cell-sandbox-mount` div, via `dangerouslySetInnerHTML`, instead of
  `index.tsx`'s current bare div).
- `model/channelData.ts` (`ChannelData`, `tileToChannelData`), `model/
  tileCache.ts` (`TileCache`, `TileCacheKey`), `model/tiers.ts`
  (`chooseTier`, `tileRange`, `TIER_BASE`/`TILE_SIZE_BUCKETS`/`MAX_TIER`,
  the point-budget constants), `model/viewport.ts` (`Viewport`, `clampTo`) —
  all full files, all already landed and tested by Tasks 6–8. This task
  wires them; it does not re-derive their logic.
- `model/workbookState.ts`, `model/openEvalDriver.ts`, `index.tsx` — full
  files, exactly as committed. `index.tsx`'s current `renderJsCell` closure
  (inline inside its JSX, see the `<CellList renderJsCell={(cellId) =>
  ...}>` block) is what you replace/extend.
- `components/CellList.tsx` — full file. `renderJsCell: (cellId: string) =>
  ReactNode` is CellList's own prop; you do not need to touch CellList
  itself, only what `index.tsx` passes into it.
- `plotForm/types.ts` and `plotForm/parse.ts` — full files. `PlotProps.marks:
  MarkProps[]`, each `MarkProps.channel: string` and `MarkProps.lap?: number
  | null`. `parse(code) → PlotProps | null`; `null` is the custom-code
  signal.
- `model/cells.ts` — `ScannedCell` (`id`, `kind`, `bodyRange`,
  `proseBeforeRange`, `proseAfterRange`). `kind` for a fenced `js` cell is
  the literal string your grep of the file will show — confirm the exact
  `CellKindToken` value before branching on it (don't assume `"js"` is
  spelled that way without checking).
- `host/protocol.ts` — full file. `SandboxToHostMessage`'s `cellError` is
  reused today for span failures (`cellId` holding a span id, not a fence
  cell id) — this is exactly what R66 item 2 says to stop doing.
- `sandbox/main.ts` — the whole `SandboxRuntime` class, especially
  `evalInline` (lines ~207–216 as committed) and its doc comment
  acknowledging the `cellError` reuse and inviting a "third, span-specific
  error message" — R66 item 2 is that message landing.
- `app/src/ipc/tiles.ts` (`fetchTile`, `DecodedTile`), `app/src/ipc/
  rasters.ts` (not used by this task — no raster cells in scope; skim only),
  `app/src/ipc/cursor.ts` (`cursorReadout`, `CursorReadout`), `app/src/ipc/
  catalog.ts` (`SessionDetail`, `ChannelSummary` — `channel_id`,
  `nominal_rate_hz`, `unit`, `channel_kind`, `sample_count`; `getSession`)
  — all on `main`, all already landed. **`getSession` is not called
  anywhere in `Notebook/**` today** — confirm this yourself
  (`grep -rn getSession app/src/routes/pages/Notebook`) before assuming
  session-channel metadata is already available to this page.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. Status clean before starting.
- Work ONLY in `app/` inside this worktree. Do NOT touch the shared checkout,
  the `rust/` submodule, or any other worktree. Do NOT edit `docs/`. Do NOT
  push.
- **No cargo, ever, in this worktree.**
- **No new npm dependency.**
- **This task reads `AppState.selection`** (`{ sessionId, lapContext }`,
  read-only import, unchanged from Task 13). Do **not** modify
  `state/AppState.tsx`.

## The problem, precisely

Today's `index.tsx` has one `useEffect` that pushes every `js` cell's raw
`code` into the sandbox (`host.setCells(jsCells)`) and one closure
(`renderJsCell`) that renders whatever `html`/`error` came back for that
cell id as a plain div. Nothing:

1. Decides, per `js` cell, whether its code is **form-generated**
   (`plotForm.parse` succeeds) or **custom** (`parse` returns `null`).
2. For a form-generated cell, resolves `marks[*].channel` (+ each mark's
   `lap`) against the session's actual channels, builds the settle-driven
   tile-fetch loop `ChartCell` needs (`viewport`, `sessionSpanUs`,
   `sampleRateHz`, `cache`, `fetchTile`, `fetchCursorReadout`,
   `onViewportSettled`), and registers the bound channel(s) with
   `NotebookSession.setBoundChannel` so a sandbox rebuild can restore them.
3. Mounts `ChartCell` for that cell instead of the plain div, with the
   sandbox's `cellResult` html placed inside `ChartCell`'s own
   `chart-cell-sandbox-mount` slot.
4. For a **custom-code** cell (`parse` returns `null`), or a form-generated
   cell whose channel isn't a real session channel, keeps exactly today's
   plain mount — this task must not regress that path.

## Interfaces

### 1. `model/jsCellBinding.ts` — pure, the decision logic

```ts
/** What a form-generated `js` cell needs to render through `ChartCell`
 *  instead of a plain mount (R66 item 1). One entry per distinct channel
 *  the cell's marks reference — a multi-mark cell binds every distinct
 *  channel (R52 Q2: `channel()` materialises per-channel arrays; nothing
 *  in the grammar or `ChartCell`'s one-channel-per-instance design lets
 *  two marks on different channels share one binding). */
export interface JsCellBinding {
  /** The cell's parsed form state, for anything a caller needs beyond the channel list (e.g. a future multi-channel overlay). */
  props: PlotProps;
  /** One binding per distinct `marks[*].channel` referenced by `props`, in the order each channel first appears across `marks`. */
  channels: {
    channelId: string;
    /** This channel's own nominal rate (`ChannelSummary.nominal_rate_hz`), for `chooseTier`/`tileRange`. */
    sampleRateHz: number;
    /** The mark(s)' lap scope for this channel occurrence — see the lap-scope question below; document your reading. */
    lap: number | null;
  }[];
  /** The initial viewport every bound channel starts at, before any gesture — see the session-span question below. */
  initialViewport: Viewport;
}

/**
 * `plotForm.parse`s `code`; returns `null` when it doesn't (custom code —
 * plain mount) or when any referenced channel is not in
 * `sessionDetail.channels` (an unknown channel is never fetched — a plain
 * mount with a visible note instead, per this task's dispatch). Pure: no
 * IPC, no DOM, no React.
 */
export function bindingFor(
  cell: { id: string; code: string },
  sessionDetail: SessionDetail | null
): JsCellBinding | null;
```

Tests (pure module, no React, `*.test.ts` beside it):
- form-generated code, one mark, known channel → non-null binding with one
  `channels` entry.
- form-generated code, multiple marks on **distinct** channels → one
  `channels` entry per distinct channel (R52 Q2 "materialises each").
- form-generated code, two marks on the **same** channel → exactly one
  `channels` entry for it, not two (dedupe — state this explicitly, it's
  not obviously implied by the plan text).
- custom code (`parse` returns `null`) → `bindingFor` returns `null`.
- a mark's channel not present in `sessionDetail.channels` → `bindingFor`
  returns `null` (plain mount, never a fetch of a nonexistent channel).
- `sessionDetail === null` (no session selected) → `bindingFor` returns
  `null` for every cell, form-generated or not (nothing to bind against).

Exact test names, A/A/A, are yours to write to CLAUDE.md §4's convention —
the six behaviours above are not optional, their names are.

### 2. `index.tsx`'s `renderJsCell` and the mount effect

Currently `renderJsCell` is an inline closure inside `index.tsx`'s JSX. Pull
it into a named function (or keep it inline if that reads cleaner — your
call) that:

- Looks up the cell's `ScannedCell` (by id, from `state.cells`) to get its
  `code` (via `decodeByteRange`, already in the file).
- Calls `bindingFor({ id: cellId, code }, sessionDetail)`.
- `binding === null` → today's plain mount, unchanged (including the
  "unknown channel" case — add a **visible note** distinguishing it from
  the ordinary custom-code plain mount, e.g. a small caption naming the
  unresolvable channel, so an author sees *why* their form-generated chart
  isn't rendering as a chart; state exactly what text you show).
- `binding !== null` → mount `ChartCell` for this cell, threading:
  - `sessionId` from `AppState.selection.sessionId` (already read).
  - `channelId`/`sampleRateHz` from `binding.channels[0]` for a
    single-channel binding. **A binding with more than one channel is a
    real design question this task does not have a clean answer for** —
    `ChartCell` plots exactly one channel per instance (its own doc
    comment). Do not guess a multi-instance-per-cell layout or a
    multi-series `ChartCell` extension; render the **first** bound channel
    only, leave a `// TODO(idl0):` citing this brief and R52 Q2, and say
    explicitly in your report that multi-channel cells are single-channel-
    rendered for now — this is worth a lead ruling, not a guess baked
    silently into the code.
  - `viewport`/`sessionSpanUs` from `binding.initialViewport` on first
    mount, then whatever `ChartCell`'s own `onViewportSettled` commits back
    (hold as local component state per cell, or in a small map keyed by
    cell id — your call, document it).
  - `cache` from `sessionRef.current.cache` (the one `NotebookSession`
    already owns).
  - `fetchTile`/`fetchCursorReadout` as thin closures over
    `app/src/ipc/tiles.ts`'s `fetchTile` and `app/src/ipc/cursor.ts`'s
    `cursorReadout`, bound to `sessionId`/`channelId` — real fetchers, not
    stubs (this is exactly what R66 item 1 asks for: "the per-cell
    viewport/tile pipeline").
  - `channelLabel` from the matching `SessionDetail.channels[]` entry if
    you have one worth showing (optional prop; omit if you don't have a
    label distinct from the id).
  - The sandbox's `cellResult` html for this cell id, placed inside
    `ChartCell`'s `chart-cell-sandbox-mount` div. `ChartCell` does not
    currently accept a children/html prop for that div — **you will need to
    widen `ChartCellProps`** (e.g. an optional `sandboxHtml?: string`
    rendered via `dangerouslySetInnerHTML` into that div, or an
    equivalent — your call, but document the exact prop you added and why
    in your report, since this is the one place this task touches Tasks
    6–10's already-reviewed component).
  - Registers the binding with `sessionRef.current.setBoundChannel(cellId,
    boundChannel)` — once per cell, whenever its binding's identity
    changes (new cell, or its code's parsed channel changed), **not** on
    every render and **not** inside `ChartCell`'s own settle callback (that
    would call `setBoundChannel` on every gesture settle, which is correct
    per `BoundChannel`'s own doc comment — "call whenever that cell's
    viewport settle re-fetches and re-binds" — but only if `onViewportSettled`
    also updates the registered `BoundChannel`'s `range`/`startUs`/`endUs`
    so a later rebuild replays the *current* window, not the initial one;
    get this right and say explicitly in your report which call sites call
    `setBoundChannel`).

### 3. The `sessionDetail` fetch

`SessionDetail` is not fetched anywhere in `Notebook/**` today. Add exactly
one `useEffect` in `index.tsx`, keyed only on `sessionId` (data-only
dependency, the tightened rule) that calls `getSession(sessionId)` and
stores the result in local component state (`useState<SessionDetail |
null>`), `null` while loading or when `sessionId` is `null`. This is a
second IPC-driving effect alongside the existing open/eval one — keep its
staleness guard (a sequence ref, same shape as `openSeqRef`) independent of
`openSeqRef`, since a session change and a workbook change are different
events that happen to both read `sessionId`.

## Two things this brief does not decide — read before designing around them

**A. Session span for `initialViewport`.** The dispatch that ordered this
task says the initial viewport comes from "the session's recorded span
(R31/C1 §3)." `SessionDetail` (as landed in `app/src/ipc/catalog.ts`) has
**no duration/span field** — `duration_ms` lives only on `SessionSummary`
(the catalog listing row, `listSessions`/`list_sessions`), which
`getSession` does not return and which nothing in `Notebook/**` fetches.
Two honest options: (a) call `listSessions` too and find the matching row's
`duration_ms` (a second IPC round trip, and a linear scan for one session —
cheap but odd shape for one field); (b) derive a session span from
`SessionDetail.channels[]` (`sample_count / nominal_rate_hz` for the
longest fixed-rate channel) — but that is exactly the "physics of the bike"
computation CLAUDE.md §2 assigns to `core`, redone in TypeScript, and it
would silently disagree with whatever gate-synthesis/seam-correction logic
actually produced `duration_ms` in Rust. **Do not silently pick one.**
Implement (a) if it's a one-line addition to the effect in §3 above (call
both `listSessions` and `getSession`, or check whether `app/src/ipc/
catalog.ts` already has a narrower single-session-duration call you missed);
if it turns out more involved than that, stop and report this as a genuine
open question rather than guessing at (b)'s approximation. State which you
did.

**B. Lap scope threading.** `MarkProps.lap` (from `plotForm.parse`) is a lap
number or `null` for session scope. `ChartCellProps` has no lap-scope
parameter at all — Tasks 6–10 built it against a plain time viewport, not a
lap-relative one. Whether "lap scope" for a chart cell means "the fetched
tile range starts from lap N's start/end timestamp" (computable from
`AppState.selection.lapContext` / `SessionDetail.laps`, no IPC change
needed) or means something requiring a wire change is genuinely unclear
from the landed code — this is squarely a design question, not an
implementation detail. Do the plumbing (accept and store `binding.channels[
].lap` on the `BoundChannel`/local per-cell state you build), but **do not
attempt to make lap-scoped fetching actually narrow the tile-fetch window**
this task — leave a `// TODO(idl0):` citing this brief, and say explicitly
in your report that lap scope is read and stored but not yet applied to
what gets fetched. This mirrors Task 13's own honest treatment of
`lapContext`/N4.

## The `spanError` message (R66 item 2)

Add a distinct sandbox→host message so a span failure and a cell failure
are never both represented by `cellError`:

- `host/protocol.ts`: add `{ type: "spanError"; spanId: string; message:
  string }` to `SandboxToHostMessage`'s union; add its case to
  `isHostMessage`'s switch (`typeof msg.spanId === "string" && typeof
  msg.message === "string"`, mirroring `cellError`'s check); add/extend a
  test in `protocol.test.ts` for the new guard (accept a well-formed
  `spanError`, reject one missing `spanId`, reject one missing `message` —
  match the existing `cellError` test's shape).
- `sandbox/main.ts`: in `SandboxRuntime.evalInline`'s `catch` block, replace
  `postToHost({ type: "cellError", cellId: spanId, message })` with
  `postToHost({ type: "spanError", spanId, message })`. Update the method's
  doc comment (it currently explains and justifies the `cellError` reuse —
  that explanation is now wrong and must be corrected, not left stale).
- `host/SandboxHost.ts`: add a `case "spanError":` to `onMessage`'s switch,
  calling a new `SandboxHostCallbacks.onSpanError(spanId, message)` (mirror
  `onInlineResult`'s shape exactly). `cellError`'s case and
  `SandboxHostCallbacks.onCellError` are unchanged and now only ever carry
  a real fence-string cell id.
- `index.tsx`: wire `onSpanError` into whatever UI state
  `inlineResults`/`ProseSpan` reads today for a span's pending/resolved
  state — a failed span should show its error inline (mirroring how a
  failed cell shows its error today), not silently stay on the pending
  placeholder forever. Check `components/ProseSpan.tsx`'s existing
  `results: ReadonlyMap<string, string>` prop — you likely need either a
  second map (`spanErrors: ReadonlyMap<string, string>`) threaded through
  `CellList`/`ProseSpan`, or a widened value type; your call, document it,
  and add the render case to `ProseSpan.tsx`.

## Do not

- Do not mount `ChartCell` for a custom-code `js` cell — `parse() === null`
  always means plain mount, unchanged.
- Do not fetch a channel that is not in `SessionDetail.channels` — no
  `fetchTile` call for an unresolvable channel id, ever.
- Do not call `setBoundChannel` more than once per settle per cell, and
  never from a render body (React strict-mode double-invoke would double
  the registration if it wrote to a `Map` from render — keep it in an
  effect or the settle callback, not inline in JSX).
- Do not add a lap-scoped fetch-window narrowing (§B above) — plumb and
  flag, do not implement, this task.
- Do not silently pick option (b) for session span (§A) without saying so.
- Do not touch `PropertiesForm.tsx`/`PropertiesForm.types.ts` — that pane
  is not mounted by this task (Task 15's editor shell does that); this task
  only needs `plotForm.parse` and `SessionDetail`, neither of which requires
  touching the Properties component.
- Do not modify `state/AppState.tsx`.
- Do not build or run any cargo command in this worktree.

## Gates

```
cd app
npx tsc --noEmit
npx vitest run src/routes/pages/Notebook/model/jsCellBinding
npx vitest run src/routes/pages/Notebook/host
```
Report the exact `passed`/`failed` counts for both filters (the first must
be non-zero for the new module's tests; the second must show no regression
in `protocol.test.ts` after the `spanError` addition — report the delta).
Also confirm, by inspection or a targeted run, that `NotebookSession.test.ts`
(Task 13's existing "after a rebuild every bound channel is re-sent exactly
once and nothing is fetched" test) still passes and now exercises a
**populated** registry — per the dispatch, that existing test's fixture
must be extended to seed one or more `BoundChannel` entries before asserting
the rebuild behaviour, since today it passes vacuously against an empty
map. If `NotebookSession.test.ts` doesn't already have such a test, add one;
if it does but seeds an empty registry, strengthen it. State which.

Do not run the whole-suite gate here — that's the lane merge gate (Task 16
or wherever the lane closes).

## CHANGELOG

```
- **js cells bind to ChartCell (L6 Task 13b, R66).** A `js` cell whose code `plotForm.parse`s mounts through `ChartCell`'s real viewport/tile-fetch pipeline instead of a plain sandbox-output div; custom code and cells naming an unresolvable channel keep the plain mount (the latter with a visible note). Multi-channel cells render their first bound channel only (`// TODO(idl0)`); lap scope is read and stored but not yet applied to fetch windows. A distinct `spanError` message replaces `cellError`'s prior reuse for inline `${…}` span failures.
```

## Commit

Two commits at the natural seam is fine and probably cleaner than one:
1. `model/jsCellBinding.ts` + its test, plus the `spanError` protocol/
   sandbox/host changes (self-contained, testable without touching
   `index.tsx`).
2. `index.tsx`'s mount wiring + `ChartCell.tsx`'s widened prop +
   `NotebookSession.test.ts`'s strengthened fixture.

If you do one commit instead, that's fine too — state which you chose and
why. Explicit `git add` paths either way (no `git add -A`). Message(s),
single line, no AI attribution trailer, e.g.:
```
app: bind js cells to ChartCell for form-generated code (R66)
```
Never amend a previously reported commit — a fix after report is a new
commit.

Before committing: merge `main` into `wave2-l6-notebook` first (R19
pattern — CHANGELOG conflicts resolved by keeping both bullets, any other
conflict is STOP and report to the lead). NUL-byte check every file you
add/modify (`grep -lP '\x00'` or equivalent) before `git add`.

## Style / hygiene

Doc comment on every exported symbol, units on every numeric value
(`sampleRateHz` in Hz, `startUs`/`endUs` in µs, `budget` in points); `//
TODO(idl0):` never bare `// TODO`; A/A/A tests with blank lines between
sections; `.tsx` files untested per CLAUDE.md §4 (only `jsCellBinding.ts`
and the protocol/host changes get `*.test.ts`); pure modules keep
`plotForm`'s and `model/`'s existing purity (no React/DOM/IPC import in
`model/jsCellBinding.ts`).

## Report back (concise)

Commit hash(es) + `git show --stat`; the exact gate commands and results
(all three filters); which session-span option (§A) you implemented, or
that you stopped and are reporting it as open; confirmation lap scope (§B)
is read/stored but not applied to fetch windows, with the `TODO(idl0)`
citing this brief; the exact `ChartCellProps` addition you made for the
sandbox html slot; which call site(s) call `setBoundChannel` and how often;
confirmation `NotebookSession.test.ts`'s rebuild test now exercises a
populated registry (or that you added one); the multi-channel-cell
single-channel-render limitation, stated plainly as a lead-ruling candidate,
not buried; per-step done/deviated; anything else ambiguous you resolved
(say how) or that needs a lead ruling (stop and report instead of guessing —
CLAUDE.md §1).

## Where the plan/code disagree

There is no numbered plan task text for "13b" (R66 created it after the
plan was written) — this brief is the sole authority for this task's scope.
Where *this brief* and the landed code disagree (a prop that doesn't exist,
a type that doesn't match what's described above), the landed code wins;
say so in your report rather than forcing the brief's sketch.

## Lead pre-rulings 2026-09-05 (so this task need not STOP)

1. **Initial viewport span.** Use `listSessions()` once per selected session (settle-bound, through the pure driver) and take `SessionSummary.duration_ms`; when it is null, fall back to the recorded span of the first bound channel read from that channel's coarsest tile (`MAX_TIER`, index 0: first and last non-empty column `t_us`) -- that is data the engine produced, not physics recomputed in TS. Never derive a span from `sample_count / nominal_rate_hz`.
2. **Lap scope.** Plumb `MarkProps.lap` into the binding and `NotebookSession`'s registry; lap-window narrowing of the fetch is not implemented this task (R52 Q5's `lap_context` and the lap tables are wave-2 gaps) -- state it in a doc comment, not a bare TODO.
3. **Multi-channel cells.** Bind every distinct channel (R52 Q2) but mount `ChartCell` for the first only; the others are re-sent on rebuild like any bound channel. Report it; the multi-series composition (the cell's own Plot code over all bound channels inside the sandbox) is Task 15/16's design note, not this task's.

## Lead ruling 2026-09-05 (R69) -- outputs render in the sandbox; this task implements it

Read R69 in `runs/2026-09-03/decisions.md` before starting; it supersedes any line above that mounts sandbox HTML in the host. Required: (a) remove `cellResult.html` and the host's `dangerouslySetInnerHTML`; the sandbox renders each cell's output in its own DOM (a per-cell container keyed by cell id inside the iframe) and posts `cellRendered { cellId, heightPx }`; the host lays out a frame per cell at that height. (b) `transform { cellId, translateXPx, scaleX }` host->sandbox per gesture frame (postMessage, not IPC), applied as a CSS transform on that cell's Plot; settle sends channel data as today. (c) `ChartCell` becomes the host-side gesture/orchestration frame around the iframe-rendered output; its canvas polyline is removed once the sandbox path renders. (d) Multi-channel cells: the cell's own Plot code receives every bound channel via `channel()`; no per-channel `ChartCell` instances. (e) Prose: plain text with spans filled until L8w Task 4c lands `CellOutput.html`; a stated seam, not a TODO. Split into commits at the protocol / render / gesture seams; tests on every pure piece (protocol guards, layout reducer, transform message shaping); one `vite build`. Also close review-task13.md's Minor: a staleness test where `isStale()` flips between `evalWorkbook`'s resolution and the dispatch.
