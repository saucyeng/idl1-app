import type { DecodedHostChannel } from "../../../../ipc/hostChannel";
import type { DecodedTile } from "../../../../ipc/tiles";
import type { UnitLabel } from "../../../../ipc/workbook";
import { tileToChannelData, type ChannelData } from "./channelData";
import type { TileCache, TileCacheKey } from "./tileCache";

/**
 * One channel currently bound as a sandbox host variable, with enough
 * state to re-derive/re-fetch its transfer buffers after a sandbox
 * rebuild. A discriminated union on `source` (L6 Task 18, R77.3): a
 * `"session"` channel carries the viewport parameters needed to re-derive
 * its buffers from the shared `TileCache` alone (Task 8's settle-bound
 * fetch state); a `"definition"` channel has no tile-cache entry at all
 * (`fetch_host_channel` takes no time window, C3 §3.4) and is restored by
 * calling it again (Q1(a), R78) — see {@link rebindChannelsAfterRebuild}.
 */
export type BoundChannel =
  | {
      source: "session";
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
      /** This channel's unit as it was last known when bound (R154/R164) —
       *  never re-derived on a rebuild (nothing in this module's own re-fetch
       *  path carries a fresh one; a rebuild is a rare, watchdog-triggered
       *  event, so resending the last-known unit costs nothing a subsequent
       *  settle wouldn't already correct). */
      unit: UnitLabel;
    }
  | {
      source: "definition";
      /** The sandbox host-variable name this channel is bound under — the workbook `math` definition's name. */
      name: string;
      /** The `fetch_host_channel` budget last used for this definition (`clampHostChannelBudget`'s result) — re-sent verbatim on a rebuild's re-fetch. */
      budget: number;
      /** This channel's unit as it was last known when bound (R154/R165) —
       *  `fetch_host_channel`'s IDLH bytes never carry one (R165), so a
       *  rebuild's re-fetch below has nothing fresher to read; the
       *  last-known `CellDefResult.unit` is resent instead, same reasoning
       *  as the `"session"` arm above. */
      unit: UnitLabel;
    };

/** The IPC this module needs to restore a `"definition"` `BoundChannel`
 *  after a rebuild (Q1(a), R78) — injected so this module never imports
 *  `ipc/workbook.ts` directly (mirrors `channelBindDriver.ts`'s own
 *  `ChannelBindDeps.fetchHostChannel`). */
export interface HostChannelRebindDeps {
  /** Re-fetches one definition's decimated data by name and budget (`ipc/workbook.ts`'s `fetchHostChannel`). */
  fetchHostChannel(defName: string, budget: number): Promise<DecodedHostChannel>;
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
 * A `"session"` bound channel whose tile range is not *fully* present in
 * `cache` (e.g. one was evicted, or never finished fetching before the
 * stall that triggered the rebuild) is skipped rather than sent with
 * holes — rebuild is not itself a fetch trigger for a tile-backed channel;
 * a subsequent settle re-fetches any missing tile the normal way (Task 8's
 * `ensureTiles`).
 *
 * A `"definition"` bound channel has no tile-cache entry to re-derive from
 * at all, so it is restored by calling `deps.fetchHostChannel` again
 * (Q1(a), R78) rather than reading `cache` — this costs one IPC call per
 * definition channel on a rebuild, accepted because a rebuild is already
 * the rare, watchdog-triggered path (R78's cost-if-wrong note). The
 * re-fetch is fired without awaiting it here (this function itself stays
 * synchronous, matching `onChannelsInvalidated`'s `() => void` shape); a
 * definition whose re-fetch rejects, or whose result has lost its recorded
 * axis (`hasT` false) since it was last bound, is silently dropped rather
 * than sent with `t` empty (mirrors `bindingFor`'s own refusal to bind an
 * axis-less definition, Q3(a)) — the cell's own next settle retries it the
 * normal way.
 *
 * @param bound Every channel currently bound in the sandbox.
 * @param cache The tile cache to read decoded `"session"` tiles from (never fetches).
 * @param deps Re-fetches a `"definition"` channel's data (never reads `cache` for one).
 * @param send Called once per `bound` entry that could be restored, with that channel's {@link ChannelData} and its last-known {@link UnitLabel} (`channel.unit`, never re-derived here — see `BoundChannel`'s own doc comment). For a `"session"` entry this call is synchronous with the loop; for a `"definition"` entry it fires later, once its re-fetch resolves.
 */
export function rebindChannelsAfterRebuild(
  bound: BoundChannel[],
  cache: TileCache,
  deps: HostChannelRebindDeps,
  send: (name: string, data: ChannelData, unit: UnitLabel) => void
): void {
  for (const channel of bound) {
    if (channel.source === "definition") {
      void deps
        .fetchHostChannel(channel.name, channel.budget)
        .then((result) => {
          if (!result.hasT) return;
          send(channel.name, { length: result.v.length, t: result.t, v: result.v }, channel.unit);
        })
        .catch((error: unknown) => {
          // A rebuild is not itself a fetch trigger even for a definition
          // channel's re-fetch failure -- the cell's own next settle
          // retries. Warned (R153) so the failure is visible somewhere
          // rather than the channel simply staying stale with no trace.
          console.warn(`[channelRebind] fetchHostChannel(${JSON.stringify(channel.name)}) failed on rebuild:`, error);
        });
      continue;
    }

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
    send(channel.name, data, channel.unit);
  }
}
