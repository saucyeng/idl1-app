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
 */
import type { ChannelData } from "../model/channelData";
import { rebindChannelsAfterRebuild, type BoundChannel } from "../model/channelRebind";
import type { TileCache } from "../model/tileCache";

/**
 * The subset of `SandboxHost`'s API `onChannelsInvalidated` calls —
 * narrowed to one method so this module's own tests can inject a fake
 * without constructing a real `<iframe>` (`host/SandboxHost.ts` is not
 * unit-tested, per its own doc comment).
 */
export interface ChannelRebindSandbox {
  /** Binds a decoded channel as a sandbox host variable (`SandboxHost.setChannelHostVar`). */
  setChannelHostVar(name: string, length: number, t: ArrayBuffer, v: ArrayBuffer): void;
}

/**
 * Builds the `onChannelsInvalidated` callback a `SandboxHost` construction
 * needs (`SandboxHostCallbacks`, R60): re-derives every currently bound
 * channel from `cache` (never fetches — `rebindChannelsAfterRebuild`'s own
 * doc comment) and re-sends each one exactly once via
 * `sandboxHost.setChannelHostVar`. `getBound` is called fresh every time
 * the returned function runs (not captured once at construction) so a
 * rebuild reads the registry's state *at rebuild time*, not a stale
 * snapshot from whenever this handler was built.
 */
export function makeChannelsInvalidatedHandler(
  getBound: () => BoundChannel[],
  cache: TileCache,
  sandboxHost: ChannelRebindSandbox
): () => void {
  return () => {
    rebindChannelsAfterRebuild(getBound(), cache, (name, data: ChannelData) => {
      // `Float64Array.buffer` types as `ArrayBufferLike` (covering
      // `SharedArrayBuffer`) unless the array's own construction site lets
      // TS narrow it; `ChannelData.t`/`v` are plain `Float64Array` fields,
      // so the narrower cast is asserted here rather than threading a
      // generic parameter through `ChannelData` for one call site.
      sandboxHost.setChannelHostVar(name, data.length, data.t.buffer as ArrayBuffer, data.v.buffer as ArrayBuffer);
    });
  };
}

/**
 * One open notebook's session-scoped state: the shared `TileCache` every
 * cell's settle-triggered fetch reads/fills (design §6 — "shared with
 * anything else in the notebook rendering the same channel, so two cells
 * never re-fetch what the other already cached"), and a per-cell registry
 * of which channel that cell currently has bound into the sandbox, with
 * enough viewport state to re-derive it after a rebuild
 * (`model/channelRebind.ts`'s `BoundChannel`).
 */
export class NotebookSession {
  private readonly boundByCellId = new Map<string, BoundChannel>();

  /** @param cache The tile cache this session's cells fetch through and `onChannelsInvalidated` reads from. */
  constructor(readonly cache: TileCache) {}

  /** Registers (or replaces) cell `cellId`'s currently bound channel — call whenever that cell's viewport settle re-fetches and re-binds (Task 6/8's settle path). */
  setBoundChannel(cellId: string, bound: BoundChannel): void {
    this.boundByCellId.set(cellId, bound);
  }

  /** Drops cell `cellId`'s registration — call when that cell leaves the document (a `setCells` narrowing the cell set). */
  removeBoundChannel(cellId: string): void {
    this.boundByCellId.delete(cellId);
  }

  /** Every currently bound channel across every cell — what a rebuild re-sends. */
  allBoundChannels(): BoundChannel[] {
    return [...this.boundByCellId.values()];
  }

  /**
   * Builds the `onChannelsInvalidated` callback for `sandboxHost`, reading
   * this session's registry fresh on every rebuild ({@link makeChannelsInvalidatedHandler}).
   */
  onChannelsInvalidated(sandboxHost: ChannelRebindSandbox): () => void {
    return makeChannelsInvalidatedHandler(() => this.allBoundChannels(), this.cache, sandboxHost);
  }
}
