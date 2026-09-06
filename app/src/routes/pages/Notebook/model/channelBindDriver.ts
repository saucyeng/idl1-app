/**
 * Pure(-IO-injected) driver for `Notebook/index.tsx`'s channel-bind effect
 * (R66 item 1; lead pre-ruling 2026-09-05 #3, `runs/2026-09-05/lanes/l6/
 * brief-task13b.md`): given one `js` cell's `JsCellBinding`, fetches every
 * distinct bound channel's initial window of tiles and dispatches its
 * transfer buffers, then registers the one channel `ChartCell` actually
 * mounts (`binding.channels[0]`) with the caller's `NotebookSession`/
 * chart-window state. Mirrors `openEvalDriver.ts`'s and
 * `sessionSpanDriver.ts`'s shape: every branch lives here, `isStale()` is
 * checked after every `await`, and the effect in `index.tsx` only supplies
 * data-only dependencies and holds callbacks in refs (the tightened
 * IPC-effects rule, `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §4).
 *
 * `NotebookSession.setBoundChannel` is keyed one-per-`cellId` today
 * (`host/NotebookSession.ts`), so only `binding.channels[0]` can be
 * registered for rebuild-repriming -- every other distinct channel still
 * gets its data sent into the sandbox (review-task13b.md Critical finding:
 * a multi-mark cell's later channels must not go unsent), it just is not
 * restored automatically after a sandbox rebuild.
 * // TODO(idl0): once `NotebookSession`'s registry supports more than one
 * bound channel per cell, register every entry in `binding.channels` here,
 * not only the first.
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

/** One piece of state a completed (non-stale) `runChannelBind` run writes. */
export type ChannelBindAction =
  | { type: "channelData"; channelId: string; length: number; t: ArrayBuffer; v: ArrayBuffer }
  | { type: "boundChannel"; cellId: string; bound: BoundChannel }
  | { type: "chartWindow"; cellId: string; chartWindow: ChartWindow };

/** Dispatches one `ChannelBindAction` -- a caller's `setState`/`setChannelHostVar` closures, or a test's recorder. */
export type ChannelBindDispatch = (action: ChannelBindAction) => void;

/**
 * Resolves the tile range `channel` needs for `[startUs, endUs)` at
 * `chartWidthPx`, filling `cache` via `deps.fetchTile` as needed
 * (`ensureTiles`), then reads every tile back out. Returns `null` if a tile
 * in range was evicted between `ensureTiles` resolving and this read (mirrors
 * `ChartCell`'s own settle-handler TODO) -- the caller drops this channel's
 * bind entirely rather than send a partial range.
 */
async function fetchChannelWindow(
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
      // channel's initial bind entirely rather than a partial range.
      return null;
    }
    tiles.push(tile);
  }
  return { tiles, tier, range };
}

/**
 * Fetches and dispatches every distinct channel `binding.channels`
 * references (lead pre-ruling #3: "bind every distinct channel"), in order,
 * then registers `binding.channels[0]`'s `BoundChannel`/`ChartWindow` --
 * the one channel `ChartCell` mounts. Never throws (a per-channel fetch
 * failure -- an evicted tile -- silently drops only that channel's bind,
 * matching `ChartCell`'s own settle-handler treatment).
 *
 * @param isStale Checked after every per-channel `await`; once it returns
 *   `true` this cell's binding has changed again (a fast re-edit, or a
 *   session change) since this run started, and every remaining dispatch --
 *   including for channels not yet fetched -- is dropped. Callers capture
 *   this cell's binding identity at call time and compare it to whatever is
 *   current when `isStale` is invoked (the same shape `bindingIdentity`
 *   already gives `index.tsx`'s effect, reused here as the "is this result
 *   still current" decision the tightened IPC-effects rule requires).
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

  for (const channel of binding.channels) {
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

    if (channel === mounted) {
      const key: Omit<TileCacheKey, "tileIndex"> = { sessionId, channelId: channel.channelId, tier: result.tier, columnCount: chartWidthPx };
      dispatch({
        type: "boundChannel",
        cellId,
        bound: { name: channel.channelId, key, range: result.range, startUs, endUs, budget },
      });
      dispatch({
        type: "chartWindow",
        cellId,
        chartWindow: { viewport: { startUs, endUs, pixelWidth: chartWidthPx }, tiles: result.tiles },
      });
    }
  }
}
