/**
 * Pure(-IO-injected) driver for `Notebook/index.tsx`'s channel-bind effect
 * (R66 item 1; lead pre-ruling 2026-09-05 #3, `runs/2026-09-05/lanes/l6/
 * brief-task13b.md`) and its gesture-settle refetch (R72, Task 13c): given
 * one `js` cell's distinct bound channels, fetches each one's window of
 * tiles for every selected window's own mapped `[startUs, endUs)` span
 * (S1 Task 11b, ruling R131 Q2) and dispatches its combined transfer
 * buffers, then -- once every channel has resolved and the run is still
 * current -- registers the *whole* channel list with the caller's
 * `NotebookSession` (`setBoundChannels`, one call, replacing the cell's
 * prior registration) and the chart-window state for the one channel
 * `ChartCell` actually mounts. Mirrors `openEvalDriver.ts`'s and
 * `sessionSpanDriver.ts`'s shape: every branch lives here, `isStale()` is
 * checked after every `await`, and the caller in `index.tsx` only supplies
 * data-only dependencies and holds callbacks in refs (the tightened
 * IPC-effects rule, `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §4).
 *
 * **Multi-window (Task 11b).** `windows[0]` is always the *primary* window
 * -- the one `binding.initialSpan`/a settle's viewport is expressed
 * against (`index.tsx`'s own "primary window" convention, S1 Task 11a).
 * For each `"session"` channel, `model/viewportWindows.ts`'s
 * `mapViewportToWindow` re-bases the current viewport onto every selected
 * window's own start (R131 Q2) and each window is fetched independently;
 * a window the mapped span excludes entirely (`null`) or whose own fetch
 * fails contributes nothing and every other window still renders (R121,
 * requirement 4) -- never a blanked chart for one bad window. The
 * per-channel results are combined into one host variable via
 * `host/protocol.ts`'s `combineChannelWindows` (R127/R129's break-row
 * rule; not reimplemented here). A single selected window is a pure
 * re-basing with no behaviour change (`mapViewportToWindow`'s own doc
 * comment) and `combineChannelWindows` is itself byte-identical for
 * `series.length <= 1` (R127 item 3) -- so one window's chart stays
 * byte-identical to the pre-multi-window shape end to end.
 *
 * {@link runChannelBind} (initial bind, `binding.initialSpan`) and
 * {@link runChannelSettle} (a gesture settle's newly committed viewport)
 * both delegate to the same {@link runChannelBindWindow} loop -- the only
 * difference between the two call sites is which viewport and which
 * channel is "mounted" (feeds `ChartCell`'s tiles/viewport, always fetched
 * against the *primary* window's own mapped span). A settle's re-fetch of
 * the mounted channel against the primary window is a cache hit off the
 * same `TileCache` `ChartCell`'s own settle-fetch just filled (same key),
 * so it costs no extra `fetchTile` call.
 */
import type { DecodedHostChannel } from "../../../../ipc/hostChannel";
import type { DecodedTile } from "../../../../ipc/tiles";
import { tileToChannelData } from "./channelData";
import type { BoundChannel } from "./channelRebind";
import { combineChannelWindows, type WindowDescriptor, type WindowSeries } from "../host/protocol";
import type { JsCellBindingChannel, TimeCellBinding } from "./jsCellBinding";
import { chooseTier, pointBudget, tileRange } from "./tiers";
import { ensureTiles, type TileCache, type TileCacheKey } from "./tileCache";
import type { Viewport } from "./viewport";
import { mapViewportToWindow, type AbsoluteSpan } from "./viewportWindows";

/**
 * One selected window as `channelBindDriver.ts` needs it: `span` is that
 * window's own already-resolved absolute bounds (`model/viewportWindows.ts`'s
 * `resolveWindowSpan`, run by the caller against `SessionDetail` before
 * calling in -- this module never resolves a lap itself), `sessionId`
 * names which session to fetch tiles from, and `descriptor` is the
 * `host/protocol.ts` `WindowDescriptor` this window's samples carry in the
 * combined payload (colour/label/span for the sandbox). `windows[0]` is
 * always the primary window -- see this module's own top doc comment.
 */
export interface BindWindow {
  sessionId: string;
  span: AbsoluteSpan;
  descriptor: WindowDescriptor;
}

/** Largest `budget` `fetch_host_channel` accepts (C3 §3.4: validated `1..=65536`). */
const MAX_HOST_CHANNEL_BUDGET = 65536;

/** Smallest `budget` `fetch_host_channel` accepts (C3 §3.4: validated `1..=65536`). */
const MIN_HOST_CHANNEL_BUDGET = 1;

/** Clamps a point-budget number (e.g. `pointBudget`'s result, a float when
 *  `pixelWidth` isn't a whole number) to C3 §3.4's `fetch_host_channel`
 *  validation range `1..=65536`, rounding to the nearest integer first
 *  (L6 Task 18). Pure. */
export function clampHostChannelBudget(n: number): number {
  const rounded = Math.round(n);
  return Math.min(MAX_HOST_CHANNEL_BUDGET, Math.max(MIN_HOST_CHANNEL_BUDGET, rounded));
}

/**
 * Whether a definition channel's host-channel budget changed since it was
 * last fetched (L6 Task 18). `fetch_host_channel` takes no `[startUs,
 * endUs)` window (C3 §3.4) -- it always returns the whole definition,
 * decimated to `budget` -- so a pan/zoom settle that leaves the chart's
 * pixel width (and so its budget) unchanged would refetch byte-identical
 * data; this decides "skip the call" for that case. `prevBudget` is `null`
 * when this channel has never been fetched (always refetch then). Pure.
 */
export function shouldRefetchHostChannel(prevBudget: number | null, nextBudget: number): boolean {
  return prevBudget !== nextBudget;
}

/**
 * Decides whether `Notebook/index.tsx`'s channel-bind effect must call
 * {@link runChannelBind} again for one cell, and updates `perWindowIdentity`
 * in place to reflect the decision (ruling R133, `runs/2026-09-03/
 * decisions.md`).
 *
 * A binding's own content never varies by selected window (R127 item 1: a
 * channel's host-variable name must not encode which windows are
 * selected), so `identity` is the same string regardless of which window
 * is being considered -- but it is recorded **per window** rather than
 * once per cell. That is the fix: keying this purely by `cellId` (the
 * pre-R133 shape) meant a sibling window's `SessionDetail` resolving after
 * the primary window's left the cell's one recorded identity unchanged,
 * so an already-bound cell's gate never re-opened and that window's
 * channel data was never fetched -- even though the effect's own
 * dependency array had already re-run it. An inner identity cache and a
 * dependency array are two staleness gates in series; a value absent from
 * either is invisible to the effect (R133's general point).
 *
 * `resolvedWindowKeys` names which of `windowKeys` currently have a
 * resolved `SessionDetail` (`sessionDetailsByWindow.has(...)` at the call
 * site) -- a still-resolving window is skipped on both sides: it has
 * nothing to bind yet (already excluded from the caller's `bindWindows`),
 * and it must not itself look "stale" and force a run before it is ready.
 *
 * Mutates `perWindowIdentity`: prunes entries for windows no longer in
 * `windowKeys` (decision 61 — nothing lingers for a deselected window),
 * then, only when a run is needed, records `identity` for every currently
 * resolved window. Pure otherwise — no IPC, no React.
 */
export function updateChannelBindIdentity(
  perWindowIdentity: Map<string, string>,
  windowKeys: readonly string[],
  resolvedWindowKeys: ReadonlySet<string>,
  identity: string
): boolean {
  const currentWindowKeys = new Set(windowKeys);
  for (const wKey of Array.from(perWindowIdentity.keys())) {
    if (!currentWindowKeys.has(wKey)) perWindowIdentity.delete(wKey);
  }

  let needsRun = false;
  for (const wKey of windowKeys) {
    if (!resolvedWindowKeys.has(wKey)) continue;
    if (perWindowIdentity.get(wKey) !== identity) {
      needsRun = true;
      break;
    }
  }
  if (!needsRun) return false;

  for (const wKey of windowKeys) {
    if (resolvedWindowKeys.has(wKey)) perWindowIdentity.set(wKey, identity);
  }
  return true;
}

/** One bound `js` cell's currently rendered tile window (`ChartCell`'s `tiles`/`viewport` props), for the one channel it mounts. */
export interface ChartWindow {
  viewport: Viewport;
  tiles: DecodedTile[];
}

/** The IPC this driver needs, injected so it never imports `ipc/tiles.ts` or
 *  `ipc/workbook.ts` directly. */
export interface ChannelBindDeps {
  fetchTile: (sessionId: string, channelId: string, tier: number, tileIndex: number, columnCount: number) => Promise<DecodedTile>;
  /** Fetches a workbook `math` definition's decimated sample data by name
   *  (L6 Task 18, R77.3) -- injected already bound to a `workbookId` and
   *  `sessionId` by the caller (`Notebook/index.tsx`); this module never
   *  learns a workbook id. Mirrors `ipc/workbook.ts`'s `fetchHostChannel`. */
  fetchHostChannel: (defName: string, budget: number) => Promise<DecodedHostChannel>;
}

/**
 * The combined per-window `{t, v, w, windows}` payload this driver builds
 * for one (cell, channel) pair, retained by the caller instead of being
 * dropped after `setChannelHostVar` (ruling R139: "the host builds the
 * combined arrays itself, immediately before handing them to the sandbox,
 * and then drops them -- keep them"). `spans[k]` is `windows[k]`'s own
 * already-resolved `AbsoluteSpan`, aligned 1:1 by construction -- both
 * arrays are built from the same filtered, in-order pass over this
 * driver's own `windows: BindWindow[]` parameter (a window with no overlap
 * for this channel is skipped from both, never leaving a gap between
 * them). This is what `model/cursorCard.ts`'s row-per-window read needs to
 * re-base a cursor offset into each window's own absolute time (R131 Q2)
 * without re-resolving `SessionDetail` a second time (R138's lesson: one
 * definition, shared).
 *
 * These are the **same typed-array objects** `combineChannelWindows`
 * built -- never the ones handed to `setChannelHostVar`'s transfer list,
 * which `postMessage` detaches. The driver clones a copy for transfer and
 * keeps these for retention (see {@link runChannelBindWindow}'s own
 * comment at its dispatch sites).
 */
export interface CombinedChannelPayload {
  length: number;
  t: Float64Array;
  v: Float64Array;
  w: Float64Array;
  windows: WindowDescriptor[];
  spans: AbsoluteSpan[];
}

/** One piece of state a completed (non-stale) run writes. `channelData`
 *  carries `host/protocol.ts`'s `combineChannelWindows` output verbatim
 *  (`w`/`windows` included) -- ready for the caller's `setChannelHostVar`
 *  with no further shaping (Task 11b; previously this action carried only
 *  `{t, v}` and the caller filled an all-zero `w` itself as an interim
 *  single-window shim -- that shim is gone). `t`/`v`/`w` here are
 *  **transfer-safe clones** (R139) -- the caller passes them straight to
 *  `setChannelHostVar`'s transfer list; `retained` (a separate, un-
 *  transferred copy) is what a caller keeps for `model/cursorCard.ts`. */
export type ChannelBindAction =
  | { type: "channelData"; cellId: string; channelId: string; length: number; t: ArrayBuffer; v: ArrayBuffer; w: ArrayBuffer; windows: WindowDescriptor[]; retained: CombinedChannelPayload }
  | { type: "boundChannels"; cellId: string; bound: BoundChannel[] }
  | { type: "chartWindow"; cellId: string; chartWindow: ChartWindow };

/** Dispatches one `ChannelBindAction` -- a caller's `setState`/`setChannelHostVar` closures, or a test's recorder. */
export type ChannelBindDispatch = (action: ChannelBindAction) => void;

/**
 * Resolves the tile range `channel` needs for `[startUs, endUs)` at
 * `chartWidthPx`, filling `cache` via `deps.fetchTile` as needed
 * (`ensureTiles`), then reads every tile back out. Returns `null` if a tile
 * in range was evicted between `ensureTiles` resolving and this read (mirrors
 * `ChartCell`'s own settle-handler TODO) -- the caller drops this channel's
 * bind entirely rather than send a partial range. Exported for
 * `channelBindDriver.test.ts`'s direct per-channel fixtures; the two public
 * drivers below are the only production callers.
 */
export async function fetchChannelWindow(
  deps: ChannelBindDeps,
  cache: TileCache,
  sessionId: string,
  channel: JsCellBindingChannel,
  startUs: number,
  endUs: number,
  chartWidthPx: number
): Promise<{ tiles: DecodedTile[]; tier: number; range: { first: number; last: number } } | null> {
  const tier = chooseTier(endUs - startUs, chartWidthPx, channel.sampleRateHz);
  const range = tileRange(startUs, endUs, tier, channel.sampleRateHz);
  const key: Omit<TileCacheKey, "tileIndex"> = { sessionId, channelId: channel.channelId, tier, columnCount: chartWidthPx };

  await ensureTiles(cache, key, range, (tileIndex) => deps.fetchTile(sessionId, channel.channelId, tier, tileIndex, chartWidthPx));

  const tiles: DecodedTile[] = [];
  for (let tileIndex = range.first; tileIndex <= range.last; tileIndex++) {
    const tile = cache.get({ ...key, tileIndex });
    if (tile === undefined) {
      // TODO(idl0): mirrors ChartCell's own settle-handler TODO -- a tile
      // evicted between `ensureTiles` resolving and this read drops this
      // channel's bind entirely rather than a partial range.
      return null;
    }
    tiles.push(tile);
  }
  return { tiles, tier, range };
}

/**
 * Shared "fetch every distinct channel for `[startUs, endUs)`, dispatch
 * each channel's data, and -- once every channel has resolved and the run
 * is still current -- register the *whole* `BoundChannel[]` list in one
 * call" loop behind both {@link runChannelBind} and {@link runChannelSettle}
 * (R72): `NotebookSession.setBoundChannels` replaces a cell's entire
 * registry entry per call, so a partial registration here would silently
 * drop whichever channel this run resolved but a caller chose not to
 * include, rather than only dropping a channel this run itself failed to
 * fetch (an evicted tile, handled by `continue`-ing past it below). Never
 * throws (a per-channel fetch failure -- an evicted tile -- silently drops
 * only that channel's bind, matching `ChartCell`'s own settle-handler
 * treatment).
 *
 * @param channels Every distinct channel this cell's binding references, in
 *   order (lead pre-ruling #3: "bind every distinct channel").
 * @param mountedChannelId The one channel id `ChartCell` actually renders
 *   (`binding.mountedChannelId`, R69(d)) -- gets a `chartWindow` dispatch in
 *   addition to `channelData`; `null` when every one of `channels` is a
 *   `"definition"` (L6 Task 18, Q2(a)) -- no `chartWindow` dispatch happens
 *   then, since there is no mounted `ChartCell` to feed one.
 * @param previousBound This cell's `BoundChannel[]` as of the last time it
 *   was registered (`NotebookSession.boundChannelsFor`, `[]` on an initial
 *   bind) -- read only to decide whether a `"definition"` channel's
 *   `fetch_host_channel` budget actually changed (L6 Task 18,
 *   `shouldRefetchHostChannel`); a `"session"` channel always re-fetches
 *   (its window may have moved even at an unchanged budget).
 * @param isStale Checked after every per-channel `await`; once it returns
 *   `true` this cell's binding (or this settle) has been superseded since
 *   this run started, and every remaining dispatch -- including
 *   `boundChannels` and for channels not yet fetched -- is dropped. Callers
 *   capture their own "is this run still current" identity at call time
 *   (a binding identity for {@link runChannelBind}, a settle sequence number
 *   for {@link runChannelSettle}) and compare it to whatever is current when
 *   `isStale` is invoked (the tightened IPC-effects rule).
 */
async function runChannelBindWindow(
  deps: ChannelBindDeps,
  cache: TileCache,
  windows: BindWindow[],
  cellId: string,
  channels: JsCellBindingChannel[],
  mountedChannelId: string | null,
  viewport: AbsoluteSpan,
  chartWidthPx: number,
  dispatch: ChannelBindDispatch,
  isStale: () => boolean,
  previousBound: BoundChannel[] = []
): Promise<void> {
  const bounds: BoundChannel[] = [];
  // The primary window (`windows[0]`) both defines the offset every other
  // window's mapped span is re-based from (R131 Q2) and is the one
  // `ChartCell` mounts -- see this module's top doc comment. `windows`
  // is never empty in production (a caller with nothing selected never
  // reaches this driver at all); guarded defensively anyway.
  const primary = windows[0];
  if (primary === undefined) {
    if (!isStale()) dispatch({ type: "boundChannels", cellId, bound: [] });
    return;
  }

  for (const channel of channels) {
    if (channel.source === "definition") {
      const budget = clampHostChannelBudget(pointBudget(chartWidthPx, false));
      const previous = previousBound.find((b) => b.source === "definition" && b.name === channel.channelId);
      if (previous !== undefined && !shouldRefetchHostChannel(previous.budget, budget)) {
        // The consequence of `fetch_host_channel` having no time window
        // (L6 Task 18 brief, "the consequence you must design around"): a
        // settle whose budget (this chart's pixel width) is unchanged would
        // refetch byte-identical data. Keep the existing registration --
        // the sandbox host variable this channel is already bound to is
        // still current -- but issue no IPC call.
        bounds.push(previous);
        continue;
      }

      let result: DecodedHostChannel | null;
      try {
        result = await deps.fetchHostChannel(channel.channelId, budget);
      } catch (error) {
        // Never throws out of the driver -- a `fetch_host_channel`
        // rejection drops only this channel's bind, exactly as an evicted
        // tile does for a `"session"` channel below. Warned (R153) so a
        // real fetch failure is distinguishable, at least in the console,
        // from a definition that legitimately has no data yet.
        console.warn(`[channelBindDriver] fetchHostChannel(${JSON.stringify(channel.channelId)}) failed:`, error);
        result = null;
      }
      // `isStale()` after this `await` regardless of outcome (success or
      // rejection) -- matching the tile path's placement below.
      if (isStale()) return;
      if (result === null) continue;
      if (!result.hasT) {
        // Q3(a), R78: an axis-less definition is treated like an
        // unresolvable channel and is not bound at all -- `bindingFor`
        // already excludes a known axis-less definition from
        // `definitionNames` (C1 "time is recorded, not assumed"), so this
        // only fires if a definition's `has_t` changed between the last
        // `eval_workbook` this binding was resolved against and this fetch.
        continue;
      }

      // A definition has no time window at all (`fetch_host_channel` takes
      // none, C3 §3.4) -- it is never re-fetched per selected window, so
      // its combined payload is always the single-window shape:
      // `combineChannelWindows` on a one-entry `series` is byte-identical
      // to the pre-multi-window shape (R127 item 3), `w` all zero.
      const combined = combineChannelWindows([{ descriptor: primary.descriptor, t: result.t, v: result.v }]);
      // R139: clone each buffer for the sandbox's transfer list -- the
      // original `combined.t/v/w` typed arrays are kept in `retained`
      // for `model/cursorCard.ts`, and `postMessage`'s transfer detaches
      // whatever buffer instance it moves, so retaining the same one that
      // gets transferred would leave it unreadable the instant this
      // dispatch's `t/v/w` reach the sandbox.
      dispatch({
        type: "channelData",
        cellId,
        channelId: channel.channelId,
        length: combined.length,
        t: combined.t.buffer.slice(0) as ArrayBuffer,
        v: combined.v.buffer.slice(0) as ArrayBuffer,
        w: combined.w.buffer.slice(0) as ArrayBuffer,
        windows: combined.windows,
        retained: { length: combined.length, t: combined.t, v: combined.v, w: combined.w, windows: combined.windows, spans: [primary.span] },
      });
      bounds.push({ source: "definition", name: channel.channelId, budget });
      // No `chartWindow` dispatch: a definition channel is never the
      // mounted channel (`bindingFor`'s `mountedChannelId` is always a
      // `"session"` channel or `null`).
      continue;
    }

    const budget = pointBudget(chartWidthPx, false);
    const series: WindowSeries[] = [];
    // Every window that actually contributed a `series` entry, in the same
    // order -- `combined.windows[k]`'s own `AbsoluteSpan`, for
    // `CombinedChannelPayload.spans` (R139). Pushed in lockstep with
    // `series` below so the two can never drift apart (a window skipped
    // for no overlap or a failed fetch is skipped from both, together).
    const contributingSpans: AbsoluteSpan[] = [];
    // The primary window's own fetch result, kept for `BoundChannel`
    // (rebuild-replay, `channelRebind.ts`) and the `chartWindow` dispatch
    // -- both stay single-window (the primary's own mapped span/tiles),
    // matching `BoundChannel`'s existing one-window shape; a comparison
    // overlay's *other* windows are represented only in the combined
    // `channelData` payload below, not in the rebuild-replay state.
    let primaryResult: { tiles: DecodedTile[]; tier: number; range: { first: number; last: number } } | null = null;
    let primaryMapped: AbsoluteSpan | null = null;

    for (const w of windows) {
      const mapped = mapViewportToWindow(viewport, primary.span.startUs, w.span);
      // No overlap at all -- this window has no data in the current
      // viewport (requirement 2: a window shorter than the viewport has
      // no data past its end). Skip the fetch entirely; the window is
      // simply absent from the combined result, not an error.
      if (mapped === null) continue;

      let result: { tiles: DecodedTile[]; tier: number; range: { first: number; last: number } } | null;
      try {
        result = await fetchChannelWindow(deps, cache, w.sessionId, channel, mapped.startUs, mapped.endUs, chartWidthPx);
      } catch (error) {
        // A per-window fetch failure (R121, requirement 4) drops only this
        // window's contribution -- every other selected window still
        // fetches and renders, and the whole channel is not dropped
        // unless every window fails (`series` stays empty below). Warned
        // (R153) so a real fetch failure is distinguishable, at least in
        // the console, from a window with no overlap.
        console.warn(`[channelBindDriver] fetchChannelWindow(${JSON.stringify(channel.channelId)}, session ${w.sessionId}) failed:`, error);
        result = null;
      }
      // The whole run was superseded (a newer run for this cell started) --
      // drop everything, including `boundChannels` below and any channel/
      // window not yet fetched. Distinct from `result === null` just
      // below: that drops only *this window* (an evicted tile or a
      // rejected fetch) while the run itself is still current.
      if (isStale()) return;
      if (result === null) continue;

      const data = tileToChannelData(result.tiles, mapped.startUs, mapped.endUs, budget);
      series.push({ descriptor: w.descriptor, t: data.t, v: data.v });
      // `w.span`, not `mapped` -- `model/cursorCard.ts`'s absence rule
      // (R131 Q2/decision 55) is "past *this window's own* end", not past
      // whatever range the current viewport happened to fetch; a cursor
      // beyond the fetched-but-within-window range simply finds no nearby
      // sample (`nearestValue` returns `null`, R31's existing "no data"
      // convention), never a false "absent" for real recorded data the
      // viewport hasn't scrolled to yet.
      contributingSpans.push(w.span);

      if (w === primary) {
        primaryResult = result;
        primaryMapped = mapped;
      }
    }

    // Every selected window either had no overlap or its own fetch
    // failed -- nothing to show for this channel at all; skip it exactly
    // as the single-window path always has (no `channelData`, no
    // `boundChannels` entry).
    if (series.length === 0) continue;

    const combined = combineChannelWindows(series);
    // R139: transfer clones, retained originals -- see the definition-path
    // dispatch above for why.
    dispatch({
      type: "channelData",
      cellId,
      channelId: channel.channelId,
      length: combined.length,
      t: combined.t.buffer.slice(0) as ArrayBuffer,
      v: combined.v.buffer.slice(0) as ArrayBuffer,
      w: combined.w.buffer.slice(0) as ArrayBuffer,
      windows: combined.windows,
      retained: { length: combined.length, t: combined.t, v: combined.v, w: combined.w, windows: combined.windows, spans: contributingSpans },
    });

    // The primary window's own fetch is what `BoundChannel`/`chartWindow`
    // describe (see the comment above the loop) -- if it had no overlap or
    // itself failed while a *different* window still rendered above, this
    // channel keeps its `channelData` (comparison still shows the windows
    // that did resolve, R121) but is left out of `bounds`/`chartWindow`,
    // matching the single-window path's existing "nothing to describe"
    // treatment when its one and only fetch fails.
    if (primaryResult !== null && primaryMapped !== null) {
      const key: Omit<TileCacheKey, "tileIndex"> = { sessionId: primary.sessionId, channelId: channel.channelId, tier: primaryResult.tier, columnCount: chartWidthPx };
      bounds.push({
        source: "session",
        name: channel.channelId,
        key,
        range: primaryResult.range,
        startUs: primaryMapped.startUs,
        endUs: primaryMapped.endUs,
        budget,
      });

      if (channel.channelId === mountedChannelId) {
        dispatch({
          type: "chartWindow",
          cellId,
          chartWindow: { viewport: { startUs: primaryMapped.startUs, endUs: primaryMapped.endUs, pixelWidth: chartWidthPx }, tiles: primaryResult.tiles },
        });
      }
    }
  }

  if (isStale()) return;
  dispatch({ type: "boundChannels", cellId, bound: bounds });
}

/**
 * Fetches and dispatches every distinct channel `binding.channels`
 * references for `binding.initialSpan`, then registers all of them (R72)
 * plus the `ChartWindow` for `binding.mountedChannelId` (`null` when the
 * cell binds only workbook definitions, L6 Task 18, Q2(a) -- no
 * `chartWindow` dispatch then). An initial bind always fetches every
 * `"definition"` channel fresh (`previousBound` defaults to `[]` in
 * {@link runChannelBindWindow}) -- the budget-unchanged skip only applies
 * to a settle re-fetching an *already bound* cell. See
 * {@link runChannelBindWindow} for the shared loop and staleness contract.
 *
 * `binding` is always the **time** arm (`kind: "time"`) -- an FFT cell's
 * binding (L6 Task 20) has no tile-fetch window at all and never reaches
 * this driver; `Notebook/index.tsx` dispatches an FFT cell's binding to
 * `model/fftDriver.ts`'s `runFft` instead.
 *
 * @param windows Every selected window, `windows[0]` the primary --
 *   `binding.initialSpan` is expressed in its coordinate frame (Task 11b,
 *   R131 Q2; see this module's top doc comment).
 */
export async function runChannelBind(
  deps: ChannelBindDeps,
  cache: TileCache,
  windows: BindWindow[],
  cellId: string,
  binding: TimeCellBinding,
  chartWidthPx: number,
  dispatch: ChannelBindDispatch,
  isStale: () => boolean
): Promise<void> {
  const { startUs, endUs } = binding.initialSpan;
  return runChannelBindWindow(deps, cache, windows, cellId, binding.channels, binding.mountedChannelId, { startUs, endUs }, chartWidthPx, dispatch, isStale);
}

/**
 * Re-fetches every one of `channels` for a gesture settle's newly committed
 * `[startUs, endUs)` window (R72, Task 13c) and registers all of them with
 * `NotebookSession.setBoundChannels` in one call, so a two-channel `js`
 * cell's *other* bound channels stay in sync with the pan/zoom that just
 * settled, not only the one `ChartCell` renders. The mounted channel's own
 * re-fetch is a cache hit off the same `TileCache` `ChartCell`'s own
 * settle-fetch just filled (identical key), so this costs no extra
 * `fetchTile` call for it -- only the cell's other distinct channels
 * actually hit the network. A `"definition"` channel among `channels` whose
 * `fetch_host_channel` budget (this settle's `chartWidthPx`) is unchanged
 * from `previousBound`'s last-fetched budget issues no call at all (L6
 * Task 18 -- `fetch_host_channel` has no time window, so an unchanged
 * budget can only ever return the same bytes). See
 * {@link runChannelBindWindow} for the shared loop and staleness contract.
 *
 * @param windows Every selected window, `windows[0]` the primary (the one
 *   `startUs`/`endUs` below are expressed against, and the one
 *   `BoundChannel`/`chartWindow` describe) -- see this module's top doc
 *   comment (Task 11b, R131 Q2).
 * @param startUs,endUs The settled viewport, in the *primary* window's own
 *   coordinate frame -- re-based onto every other window's own start
 *   before fetching (`model/viewportWindows.ts`'s `mapViewportToWindow`).
 * @param previousBound This cell's `BoundChannel[]` as registered before
 *   this settle (`NotebookSession.boundChannelsFor(cellId)`) -- read only to
 *   decide the definition-channel budget-unchanged skip above.
 */
export async function runChannelSettle(
  deps: ChannelBindDeps,
  cache: TileCache,
  windows: BindWindow[],
  cellId: string,
  channels: JsCellBindingChannel[],
  mountedChannelId: string,
  startUs: number,
  endUs: number,
  chartWidthPx: number,
  dispatch: ChannelBindDispatch,
  isStale: () => boolean,
  previousBound: BoundChannel[] = []
): Promise<void> {
  return runChannelBindWindow(deps, cache, windows, cellId, channels, mountedChannelId, { startUs, endUs }, chartWidthPx, dispatch, isStale, previousBound);
}
