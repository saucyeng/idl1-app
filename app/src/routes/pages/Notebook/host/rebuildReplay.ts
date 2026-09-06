/**
 * Pure "what to resend after a rebuild" logic for `SandboxHost`, split out
 * so it can be unit-tested with an injected `post` recorder — `SandboxHost`
 * itself is not unit-tested (CLAUDE.md §4: it owns a live `<iframe>`).
 *
 * Design §6: "a stalled cell... gets the iframe torn down and rebuilt —
 * state loss is the cost" describes losing *reactive/variable* state, not
 * the notebook's own cell definitions — otherwise a stall would silently
 * empty the whole notebook, not just cost some recomputation
 * (review-task5.md, Important finding). `SandboxHost` retains the last
 * `init`/`setCells` payloads it sent and this function replays them into
 * the freshly rebuilt iframe.
 *
 * `lastJsonHostVars` closes review-task5b.md's Major finding: `laps`,
 * `session`, `constants`, and any other `{kind:"json"}` host variable are
 * replayed too, after `init` (so the sandbox's `SandboxRuntime` exists to
 * bind them into) and before `setCells` (so a cell computes against real
 * values on its first post-rebuild run rather than transiently seeing
 * defaults). A `{kind:"channel"}` payload is deliberately excluded — its
 * two `ArrayBuffer`s are detached once transferred and cannot be replayed
 * verbatim from a cached copy; `SandboxHost.onChannelsInvalidated()` asks
 * the caller to re-derive and re-send those instead (`model/channelRebind.ts`).
 */
import type { HostToSandboxMessage, SandboxCell } from "./protocol";

/** The last `init`/`setCells`/JSON-`setHostVar` payloads `SandboxHost` has
 *  sent, kept so a rebuild can restore them. `null` in `lastInitRuntimeVersion`/
 *  `lastCells` means that message was never sent yet (nothing to replay for
 *  it); an empty `lastJsonHostVars` means no JSON host variable was ever set. */
export interface RebuildReplayState {
  /** The `runtimeVersion` of the most recent `init` call, or `null` if `init` was never called. */
  lastInitRuntimeVersion: string | null;
  /** The cell list of the most recent `setCells` call, or `null` if `setCells` was never called. */
  lastCells: SandboxCell[] | null;
  /** Last-sent value of every JSON-kind (`{kind:"json"}`) host variable, by name. */
  lastJsonHostVars: ReadonlyMap<string, unknown>;
}

/**
 * Resends `state`'s cached `init`, then every cached JSON host variable (in
 * that order — the sandbox's `setHostVar` handler is a no-op until `init`
 * has created its `SandboxRuntime`) via `post`, skipping either message
 * whose payload was never set. Split out from {@link replayAfterRebuild} so
 * `SandboxHost.rebuild()` (L6 Task 8, review-task5c.md Critical finding) can
 * insert `onChannelsInvalidated()`'s channel `setHostVar` messages between
 * this step and {@link replaySetCells} — channel messages need `init` to
 * have run for the same no-op reason JSON host vars do, but are not
 * themselves cached here (their `ArrayBuffer`s are detached once
 * transferred; `model/channelRebind.ts` re-derives them from the tile cache
 * instead).
 *
 * @param post Sends one message to the (freshly rebuilt) sandbox iframe.
 * @param state The payloads to replay.
 */
export function replayInitAndHostVars(post: (message: HostToSandboxMessage) => void, state: RebuildReplayState): void {
  if (state.lastInitRuntimeVersion !== null) {
    post({ type: "init", runtimeVersion: state.lastInitRuntimeVersion });
  }
  for (const [name, value] of state.lastJsonHostVars) {
    post({ type: "setHostVar", name, value: { kind: "json", value } });
  }
}

/**
 * Resends `state`'s cached `setCells`, if any was ever sent, via `post`.
 * Split out from {@link replayAfterRebuild} — see {@link replayInitAndHostVars}'s
 * doc comment for why: `SandboxHost.rebuild()` calls this *after*
 * `onChannelsInvalidated()` so a cell's first post-rebuild run sees its
 * bound channels' real values already applied, not the runtime's hard-coded
 * defaults, mirroring the JSON-host-var-before-`setCells` reasoning below.
 *
 * @param post Sends one message to the (freshly rebuilt) sandbox iframe.
 * @param state The payload to replay.
 */
export function replaySetCells(post: (message: HostToSandboxMessage) => void, state: RebuildReplayState): void {
  if (state.lastCells !== null) {
    post({ type: "setCells", cells: state.lastCells });
  }
}

/**
 * Resends `state`'s cached `init`, then every cached JSON host variable,
 * then `setCells` (in that order — the sandbox's `setHostVar`/`setCells`
 * handlers are no-ops until `init` has created its `SandboxRuntime`, and a
 * cell should see its host variables' real values on its first
 * post-rebuild run rather than the runtime's hard-coded defaults) via
 * `post`, skipping any message whose payload was never set. Equivalent to
 * {@link replayInitAndHostVars} followed by {@link replaySetCells}; kept as
 * a single call for callers (and this module's own pre-existing tests) that
 * have no reason to insert anything between the two steps — `SandboxHost.rebuild()`
 * is the one caller that does (see {@link replayInitAndHostVars}) and calls
 * the two halves separately instead of this combined function.
 *
 * @param post Sends one message to the (freshly rebuilt) sandbox iframe.
 * @param state The payloads to replay.
 */
export function replayAfterRebuild(post: (message: HostToSandboxMessage) => void, state: RebuildReplayState): void {
  replayInitAndHostVars(post, state);
  replaySetCells(post, state);
}
