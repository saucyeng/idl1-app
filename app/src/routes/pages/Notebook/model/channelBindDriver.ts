/**
 * Pure(-IO-injected) driver for `Notebook/index.tsx`'s channel-bind effect
 * (R66 item 1; lead pre-ruling 2026-09-05 #3, `runs/2026-09-05/lanes/l6/
 * brief-task13b.md`) and its gesture-settle refetch (R72, Task 13c): given
 * one `js` cell's distinct bound channels, fetches each one's window of
 * tiles for a given `[startUs, endUs)` span and dispatches its transfer
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
 * {@link runChannelBind} (initial bind, `binding.initialSpan`) and
 * {@link runChannelSettle} (a gesture settle's newly committed viewport)
 * both delegate to the same {@link runChannelBindWindow} loop -- the only
 * difference between the two call sites is which `[startUs, endUs)` window
 * and which channel is "mounted" (feeds `ChartCell`'s tiles/viewport). A
 * settle's re-fetch of the mounted channel is a cache hit off the same
 * `TileCache` `ChartCell`'s own settle-fetch just filled (same key), so it
 * costs no extra `fetchTile` call.
 */
import type { DecodedHostChannel } from "../../../../ipc/hostChannel";
import type { DecodedTile } from "../../../../ipc/tiles";
import { tileToChannelData } from "./channelData";
import type { BoundChannel } from "./channelRebind";
import type { JsCellBindingChannel, TimeCellBinding } from "./jsCellBinding";
import { chooseTier, pointBudget, tileRange } from "./tiers";
import { ensureTiles, type TileCache, type TileCacheKey } from "./tileCache";
import type { Viewport } from "./viewport";

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

/** One piece of state a completed (non-stale) run writes. */
export type ChannelBindAction =
  | { type: "channelData"; channelId: string; length: number; t: ArrayBuffer; v: ArrayBuffer }
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
  sessionId: string,
  cellId: string,
  channels: JsCellBindingChannel[],
  mountedChannelId: string | null,
  startUs: number,
  endUs: number,
  chartWidthPx: number,
  dispatch: ChannelBindDispatch,
  isStale: () => boolean,
  previousBound: BoundChannel[] = []
): Promise<void> {
  const bounds: BoundChannel[] = [];

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
      } catch {
        // Never throws out of the driver -- a `fetch_host_channel`
        // rejection drops only this channel's bind, exactly as an evicted
        // tile does for a `"session"` channel below.
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

      dispatch({
        type: "channelData",
        channelId: channel.channelId,
        length: result.v.length,
        t: result.t.buffer as ArrayBuffer,
        v: result.v.buffer as ArrayBuffer,
      });
      bounds.push({ source: "definition", name: channel.channelId, budget });
      // No `chartWindow` dispatch: a definition channel is never the
      // mounted channel (`bindingFor`'s `mountedChannelId` is always a
      // `"session"` channel or `null`).
      continue;
    }

    const result = await fetchChannelWindow(deps, cache, sessionId, channel, startUs, endUs, chartWidthPx);
    // The whole run was superseded (a newer run for this cell started) --
    // drop everything, including `boundChannels` below and any channel not
    // yet fetched. Distinct from the `result === null` check just below:
    // that one drops only *this* channel (its own tile was evicted) while
    // the run itself is still current and every other channel still lands.
    if (isStale()) return;
    // Only this channel's own fetch came back empty (a tile evicted
    // between `ensureTiles` resolving and `fetchChannelWindow`'s read) --
    // the run is still current, so skip just this channel and keep going;
    // see `fetchChannelWindow`'s doc comment for why it returns `null`
    // instead of throwing.
    if (result === null) continue;

    const budget = pointBudget(chartWidthPx, false);
    const data = tileToChannelData(result.tiles, startUs, endUs, budget);
    dispatch({
      type: "channelData",
      channelId: channel.channelId,
      length: data.length,
      t: data.t.buffer as ArrayBuffer,
      v: data.v.buffer as ArrayBuffer,
    });

    const key: Omit<TileCacheKey, "tileIndex"> = { sessionId, channelId: channel.channelId, tier: result.tier, columnCount: chartWidthPx };
    bounds.push({ source: "session", name: channel.channelId, key, range: result.range, startUs, endUs, budget });

    if (channel.channelId === mountedChannelId) {
      dispatch({
        type: "chartWindow",
        cellId,
        chartWindow: { viewport: { startUs, endUs, pixelWidth: chartWidthPx }, tiles: result.tiles },
      });
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
 */
export async function runChannelBind(
  deps: ChannelBindDeps,
  cache: TileCache,
  sessionId: string,
  cellId: string,
  binding: TimeCellBinding,
  chartWidthPx: number,
  dispatch: ChannelBindDispatch,
  isStale: () => boolean
): Promise<void> {
  const { startUs, endUs } = binding.initialSpan;
  return runChannelBindWindow(deps, cache, sessionId, cellId, binding.channels, binding.mountedChannelId, startUs, endUs, chartWidthPx, dispatch, isStale);
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
 * @param previousBound This cell's `BoundChannel[]` as registered before
 *   this settle (`NotebookSession.boundChannelsFor(cellId)`) -- read only to
 *   decide the definition-channel budget-unchanged skip above.
 */
export async function runChannelSettle(
  deps: ChannelBindDeps,
  cache: TileCache,
  sessionId: string,
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
  return runChannelBindWindow(deps, cache, sessionId, cellId, channels, mountedChannelId, startUs, endUs, chartWidthPx, dispatch, isStale, previousBound);
}
