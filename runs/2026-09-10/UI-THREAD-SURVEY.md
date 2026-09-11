# UI main-thread survey — Notebook (2026-09-10)

Scope: `app/src` only, read-only. `grep -r "new Worker" app/src` → **zero hits**,
no Web Worker exists anywhere in the app today. `app/vite.config.ts` has no
`worker:` build config and no `?worker` imports, so workers aren't wired up yet —
adding one is infra work, not just a call-site change.

The good news: the tile/tier pipeline (`model/tiers.ts`) already bounds
per-render point counts to `pixelWidth * 2` (desktop) via `pointBudget`, and
`model/channelData.ts`'s `tileToChannelData` downsamples to `budget` (≤65536)
before building host-var buffers. Raster drawing (`model/rasterLayer.ts`,
`components/RasterUnderlay.tsx`) is bounded by device-pixel canvas size, not
session length. So most rendering is not the problem — the *pre-render*
column/tile scans and the sandbox materialisation are.

## Hotspots

1. **`model/channelData.ts:74-104` `tileToChannelData`** — the first loop
   walks every column of every fetched tile (`for (const tile of tiles) for
   (j < tile.columnTUs.length)`) pushing into JS arrays (`times: bigint[]`,
   `means: number[]`) *before* the budget downsample runs. A window spanning
   a full long session at a coarse tier can still cover thousands of tiles ×
   1024 columns each. At ~1M raw columns in the window: ~1M `BigInt` compares
   and two ~1M-length push-growing arrays, then a second full pass to
   downsample. Order of magnitude: **tens of ms to low hundreds of ms**,
   synchronous, inside the async channel-bind driver (`channelBindDriver.ts`)
   — not chunked, not yielded. Fix class: move to a Web Worker (this is pure
   data, ideal worker candidate), or at minimum stream/stride-skip during the
   scan itself instead of collecting-then-downsampling.

2. **`sandbox/main.ts:138-166` `materializeHostVar`** — for every `channel`/
   `spectrum` payload, allocates `new Array(payload.length)` and writes one
   object literal (`{t, v, w}`) per element in a synchronous `for` loop.
   `payload.length` is bounded by `budget` (max 65536) but runs on **every**
   settle/bind for **every** bound channel and window, in the sandbox
   document — same-process with the host in Chromium's common case, so it
   contributes to jank felt on the whole window. At 65536: object-per-element
   allocation is on the order of a few ms per channel; with several bound
   channels/windows per settle this stacks up on the interaction path (a
   pan/zoom settle, not just initial load). Fix class: this is the one place
   Observable Plot's tabular contract forces record objects — worth
   revisiting whether Plot can consume a SoA `{length, t, v}` view directly
   (per this function's own doc comment, that shape was already considered
   and deferred pending a spec amendment) before optimizing further.

3. **`host/protocol.ts:350` `combineChannelWindows` / `:383`
   `combineSpectrumWindows`** (via shared `combinePairedWindows`) — merges
   `n` windows' typed arrays into one flat buffer synchronously on every
   fetch resolution. Cost scales with total combined length across all
   selected windows (bounded by `budget` per window, but multiplied by
   window count — S1 Task 11b allows several simultaneous windows). At
   budget×windows ~= a few hundred thousand: low tens of ms, one more
   synchronous pass alongside #1 and #2 in the same driver tick.

4. **`model/report/document.ts`** (687 lines) — loops are over cells/windows/
   defs (bounded by notebook structure, not sample count), so this scales
   with *notebook complexity* not point count. Lower risk than 1-3, but
   `buildReportDocument`'s per-window per-cell nested loops (lines 498-583)
   run synchronously on every report rebuild, and if a report embeds
   rendered chart data (`report/renderChart.ts`, 287 lines — not fully
   audited this pass) it may re-touch full-resolution series. Flagging for
   a closer look, not confirmed as a top-5 offender.

5. **`components/PaperView.tsx:70-71`** — `useMemo(() => toPaperDocument(document), [document])`
   recomputes the whole paper layout on any document identity change; cheap
   in isolation but re-triggers `report/document.ts`'s builder (#4) on the
   render path if `document` isn't stable across unrelated notebook edits.
   Worth confirming the memo key is narrow enough; not independently a
   large cost.

Checked and clean: `RasterUnderlay.tsx`/`rasterLayer.ts` (canvas-bounded),
`tiers.ts` (tier/budget math is O(1)/O(MAX_TIER)), `cursorReadoutDriver.ts`
and `cursor.ts` (no loops over sample arrays — operate on already-bound
per-cursor values), `TimelineStrip`/`timelineStrip.ts` (loops are over
windows/lanes, small N), Data page's session list/import queue (scales with
session count, not point count — not a concern at any realistic library
size). `SandboxHost.ts` already uses `postMessage` transfer lists (P7) for
typed arrays, not copies — the transport layer is fine; the cost is in what
runs before/after the transfer.

## Ranked worst offenders

1. `model/channelData.ts` `tileToChannelData` — collect-then-downsample scan, no chunking, no worker.
2. `sandbox/main.ts` `materializeHostVar` — per-element object allocation on every settle, same-process as host.
3. `host/protocol.ts` `combineChannelWindows`/`combineSpectrumWindows` — synchronous multi-window merge, scales with window count × budget.
4. `model/report/document.ts` — report rebuild loops, notebook-structure-bound but unaudited `renderChart.ts` dependency.
5. `model/channelBindDriver.ts` — orchestrates 1-3 back-to-back per settle with no `scheduler.yield`/`requestIdleCallback` between phases.

## Proposed lane (3-5 tasks)

1. Add a dedicated Web Worker for `tileToChannelData` + `combineChannelWindows`/
   `combineSpectrumWindows`: move the pure decode/combine pipeline off-thread,
   transferring tile buffers in and combined buffers out. Needs vite worker
   build config (currently absent) as a sub-task.
2. Chunk or worker-ize `materializeHostVar` in the sandbox, or (spec task)
   revisit the SoA-vs-records host-var shape decision noted in its own doc
   comment now that main-thread cost is a stated principle.
3. Insert a `scheduler.yield()`/`requestIdleCallback` boundary between
   fetch-resolve, combine, and dispatch phases in `channelBindDriver.ts` so a
   multi-window settle doesn't run 1-3 back-to-back in one task.
4. Audit `report/renderChart.ts` and confirm `report/document.ts` never
   touches full-resolution series (only already-decimated chart data);
   downsample earlier in Rust if it does.
5. Add a vitest perf-shaped regression (large synthetic tile set) asserting
   `tileToChannelData` stays under a millisecond budget per call, to catch
   regressions before this becomes a worker.
