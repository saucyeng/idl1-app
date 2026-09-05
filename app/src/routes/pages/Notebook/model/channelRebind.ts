import type { DecodedTile } from "../../../../ipc/tiles";
import { tileToChannelData, type ChannelData } from "./channelData";
import type { TileCache, TileCacheKey } from "./tileCache";

/**
 * One channel currently bound as a sandbox host variable, with enough of
 * its viewport parameters to re-derive its transfer buffers from cached
 * tiles alone. This is a snapshot of Task 8's settle-bound fetch state for
 * one channel (session/channel/tier/tile range/window/budget) — this
 * module doesn't own or compute any of it, only reads it.
 */
export interface BoundChannel {
  /** The sandbox host-variable name this channel is bound under (`setHostVar`'s `name`). */
  name: string;
  /** The cache key fields shared by every tile in `range` (`tileIndex` excluded — see {@link TileCacheKey}). */
  key: Omit<TileCacheKey, "tileIndex">;
  /** Inclusive tile-index range covering this channel's current visible window. */
  range: { first: number; last: number };
  /** Start of the visible window, in µs since session start (inclusive). */
  startUs: number;
  /** End of the visible window, in µs since session start (exclusive). */
  endUs: number;
  /** Point budget for this channel's rendering (Task 6's `pointBudget`). */
  budget: number;
}

/**
 * Re-derives and re-sends every currently bound channel's transfer buffers
 * after a sandbox rebuild (`SandboxHost.onChannelsInvalidated`, design §6;
 * review-task5b.md Major finding). A channel host variable's two
 * `ArrayBuffer`s are detached once `postMessage` transfers them, so they
 * cannot be replayed verbatim from a cached copy the way a JSON host
 * variable can (`host/rebuildReplay.ts`) — but the decoded tiles
 * themselves are still sitting in `cache`, so re-deriving costs no IPC
 * (performance budgets P2, P7).
 *
 * A bound channel whose tile range is not *fully* present in `cache`
 * (e.g. one was evicted, or never finished fetching before the stall that
 * triggered the rebuild) is skipped rather than sent with holes — rebuild
 * is not itself a fetch trigger; a subsequent settle re-fetches any
 * missing tile the normal way (Task 8's `ensureTiles`).
 *
 * @param bound Every channel currently bound in the sandbox, with the viewport parameters needed to re-derive its buffers.
 * @param cache The tile cache to read decoded tiles from (never fetches).
 * @param send Called exactly once per `bound` entry whose full tile range is cached, with that channel's re-derived {@link ChannelData}.
 */
export function rebindChannelsAfterRebuild(
  bound: BoundChannel[],
  cache: TileCache,
  send: (name: string, data: ChannelData) => void
): void {
  for (const channel of bound) {
    const tiles: DecodedTile[] = [];
    let fullyCached = true;

    for (let tileIndex = channel.range.first; tileIndex <= channel.range.last; tileIndex++) {
      const tile = cache.get({ ...channel.key, tileIndex });
      if (tile === undefined) {
        fullyCached = false;
        break;
      }
      tiles.push(tile);
    }

    if (!fullyCached) {
      continue;
    }

    const data = tileToChannelData(tiles, channel.startUs, channel.endUs, channel.budget);
    send(channel.name, data);
  }
}
