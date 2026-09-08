/**
 * The notebook orchestrator (lead ruling R60, 2026-09-05, this task's own
 * wiring obligation): the one piece that ties a `SandboxHost` to a
 * `TileCache` and a per-cell registry of bound channels/viewport, so a
 * watchdog-triggered iframe rebuild (`SandboxHost.rebuild()`) can restore
 * every cell's currently bound channel with no re-fetch.
 *
 * `NotebookSession` itself owns only the registry (pure, unit-tested via an
 * injected fake sandbox — no real `<iframe>`); `Notebook/index.tsx` still
 * constructs the actual `SandboxHost` (it owns the DOM container the host's
 * constructor needs) and passes `session.onChannelsInvalidated(sandboxHost)`
 * as that constructor's `SandboxHostCallbacks.onChannelsInvalidated`.
 *
 * Ruling R72 (2026-09-03 decisions log, Task 13c): the registry holds every
 * channel a `js` cell binds, not only the one `ChartCell` renders — a
 * multi-mark cell on distinct channels must have all of them restored after
 * a sandbox rebuild, not just the first.
 */
import type { ChannelData } from "../model/channelData";
import { rebindChannelsAfterRebuild, type BoundChannel, type HostChannelRebindDeps } from "../model/channelRebind";
import type { TileCache } from "../model/tileCache";
import type { WindowDescriptor } from "./protocol";

/**
 * The subset of `SandboxHost`'s API `onChannelsInvalidated` calls —
 * narrowed to one method so this module's own tests can inject a fake
 * without constructing a real `<iframe>` (`host/SandboxHost.ts` is not
 * unit-tested, per its own doc comment).
 */
export interface ChannelRebindSandbox {
  /** Binds a decoded channel as a sandbox host variable (`SandboxHost.setChannelHostVar`). */
  setChannelHostVar(name: string, length: number, t: ArrayBuffer, v: ArrayBuffer, w: ArrayBuffer, windows: WindowDescriptor[]): void;
}

/**
 * Builds the `onChannelsInvalidated` callback a `SandboxHost` construction
 * needs (`SandboxHostCallbacks`, R60): re-derives every currently bound
 * channel from `cache` (never fetches — `rebindChannelsAfterRebuild`'s own
 * doc comment) and re-sends each one exactly once via
 * `sandboxHost.setChannelHostVar`. `getBound` is called fresh every time
 * the returned function runs (not captured once at construction) so a
 * rebuild reads the registry's state *at rebuild time*, not a stale
 * snapshot from whenever this handler was built. `hostChannelDeps`
 * re-fetches a `"definition"` bound channel (L6 Task 18, Q1(a), R78) — a
 * definition has no tile-cache entry to re-derive from, unlike a
 * `"session"` channel.
 *
 * `getWindowDescriptor` (S1 Task 11a, ruling R131: `channelBindDriver.ts`'s
 * true multi-window fetching is Task 11b; this module stays honest by
 * construction — it never even sees more than one window) is called fresh
 * every rebuild too, same reason as `getBound`. Every bound channel here
 * was bound while exactly one window was selected (the channel-bind
 * effects gate on `windows.length <= 1`, ruling R131) — `w` is always
 * filled with that one window's index (`0`), byte-identical to the
 * pre-multi-window payload (R127 item 3). `null` (nothing selected right
 * now — the selection can change between when a channel was bound and
 * when a rebuild fires) skips the rebuild for every channel rather than
 * guessing a window to label them with; a subsequent settle re-binds once
 * a window is selected again.
 */
export function makeChannelsInvalidatedHandler(
  getBound: () => BoundChannel[],
  cache: TileCache,
  hostChannelDeps: HostChannelRebindDeps,
  sandboxHost: ChannelRebindSandbox,
  getWindowDescriptor: () => WindowDescriptor | null
): () => void {
  return () => {
    const descriptor = getWindowDescriptor();
    if (descriptor === null) return;
    rebindChannelsAfterRebuild(getBound(), cache, hostChannelDeps, (name, data: ChannelData) => {
      // `Float64Array.buffer` types as `ArrayBufferLike` (covering
      // `SharedArrayBuffer`) unless the array's own construction site lets
      // TS narrow it; `ChannelData.t`/`v` are plain `Float64Array` fields,
      // so the narrower cast is asserted here rather than threading a
      // generic parameter through `ChannelData` for one call site.
      const w = new Float64Array(data.length).fill(0);
      sandboxHost.setChannelHostVar(name, data.length, data.t.buffer as ArrayBuffer, data.v.buffer as ArrayBuffer, w.buffer as ArrayBuffer, [descriptor]);
    });
  };
}

/**
 * One open notebook's session-scoped state: the shared `TileCache` every
 * cell's settle-triggered fetch reads/fills (design §6 — "shared with
 * anything else in the notebook rendering the same channel, so two cells
 * never re-fetch what the other already cached"), and a per-cell registry
 * of which channel(s) that cell currently has bound into the sandbox, with
 * enough viewport state to re-derive each after a rebuild
 * (`model/channelRebind.ts`'s `BoundChannel`, R72).
 */
export class NotebookSession {
  private readonly boundByCellId = new Map<string, BoundChannel[]>();

  /** @param cache The tile cache this session's cells fetch through and `onChannelsInvalidated` reads from. */
  constructor(readonly cache: TileCache) {}

  /**
   * Registers (or wholesale replaces) cell `cellId`'s currently bound
   * channels, in order — call whenever that cell's binding is (re)resolved
   * or its viewport settle re-fetches and re-binds (Task 6/8/13c's settle
   * path). A cell with two distinct bound channels (a multi-mark `js` cell,
   * R52 Q2) passes both here in one call so a rebuild restores every one of
   * them, not only the channel `ChartCell` renders (R72).
   */
  setBoundChannels(cellId: string, bound: BoundChannel[]): void {
    this.boundByCellId.set(cellId, bound);
  }

  /** Drops cell `cellId`'s registration — call when that cell leaves the document (a `setCells` narrowing the cell set). */
  removeBoundChannel(cellId: string): void {
    this.boundByCellId.delete(cellId);
  }

  /** Every currently bound channel across every cell, in per-cell registration order — what a rebuild re-sends. */
  allBoundChannels(): BoundChannel[] {
    return [...this.boundByCellId.values()].flat();
  }

  /** Cell `cellId`'s currently registered bound channels, or `[]` if it has
   *  none — read before a gesture settle's re-fetch so a `"definition"`
   *  channel whose `fetch_host_channel` budget hasn't changed can be
   *  skipped rather than re-fetched (L6 Task 18, `shouldRefetchHostChannel`). */
  boundChannelsFor(cellId: string): BoundChannel[] {
    return this.boundByCellId.get(cellId) ?? [];
  }

  /**
   * Builds the `onChannelsInvalidated` callback for `sandboxHost`, reading
   * this session's registry fresh on every rebuild ({@link makeChannelsInvalidatedHandler}).
   *
   * @param hostChannelDeps Re-fetches a `"definition"` bound channel on rebuild (Q1(a), R78).
   * @param getWindowDescriptor The single window every currently bound
   *   channel was bound under (S1 Task 11a, ruling R131), or `null` when
   *   nothing is selected right now — see {@link makeChannelsInvalidatedHandler}'s
   *   own doc comment.
   */
  onChannelsInvalidated(
    sandboxHost: ChannelRebindSandbox,
    hostChannelDeps: HostChannelRebindDeps,
    getWindowDescriptor: () => WindowDescriptor | null
  ): () => void {
    return makeChannelsInvalidatedHandler(() => this.allBoundChannels(), this.cache, hostChannelDeps, sandboxHost, getWindowDescriptor);
  }
}
