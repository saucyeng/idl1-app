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
import type { DecodedTile } from "../../../../ipc/tiles";
import { tileToChannelData } from "./channelData";
import type { BoundChannel } from "./channelRebind";
import type { JsCellBinding, JsCellBindingChannel } from "./jsCellBinding";
import { chooseTier, pointBudget, tileRange } from "./tiers";
import { ensureTiles, type TileCache, type TileCacheKey } from "./tileCache";
import type { Viewport } from "./viewport";

/** One bound `js` cell's currently rendered tile window (`ChartCell`'s `tiles`/`viewport` props), for the one channel it mounts. */
export interface ChartWindow {
  viewport: Viewport;
  tiles: DecodedTile[];
}

/** The IPC this driver needs, injected so it never imports `ipc/tiles.ts` directly. */
export interface ChannelBindDeps {
  fetchTile: (sessionId: string, channelId: string, tier: number, tileIndex: number, columnCount: number) => Promise<DecodedTile>;
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
 *   (`binding.channels[0]` today, R69(d)) -- gets a `chartWindow` dispatch
 *   in addition to `channelData`.
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
  mountedChannelId: string,
  startUs: number,
  endUs: number,
  chartWidthPx: number,
  dispatch: ChannelBindDispatch,
  isStale: () => boolean
): Promise<void> {
  const bounds: BoundChannel[] = [];

  for (const channel of channels) {
    const result = await fetchChannelWindow(deps, cache, sessionId, channel, startUs, endUs, chartWidthPx);
    if (isStale()) return;
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
    bounds.push({ name: channel.channelId, key, range: result.range, startUs, endUs, budget });

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
 * plus the `ChartWindow` for the one channel (`binding.channels[0]`)
 * `ChartCell` mounts. See {@link runChannelBindWindow} for the shared loop
 * and staleness contract.
 */
export async function runChannelBind(
  deps: ChannelBindDeps,
  cache: TileCache,
  sessionId: string,
  cellId: string,
  binding: JsCellBinding,
  chartWidthPx: number,
  dispatch: ChannelBindDispatch,
  isStale: () => boolean
): Promise<void> {
  const { startUs, endUs } = binding.initialSpan;
  const mounted = binding.channels[0];
  return runChannelBindWindow(deps, cache, sessionId, cellId, binding.channels, mounted.channelId, startUs, endUs, chartWidthPx, dispatch, isStale);
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
 * actually hit the network. See {@link runChannelBindWindow} for the shared
 * loop and staleness contract.
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
  isStale: () => boolean
): Promise<void> {
  return runChannelBindWindow(deps, cache, sessionId, cellId, channels, mountedChannelId, startUs, endUs, chartWidthPx, dispatch, isStale);
}
