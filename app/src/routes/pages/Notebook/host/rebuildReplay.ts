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
 */
import type { HostToSandboxMessage, SandboxCell } from "./protocol";

/** The last `init`/`setCells` payloads `SandboxHost` has sent, kept so a
 *  rebuild can restore them. `null` in either field means that message was
 *  never sent yet (nothing to replay for it). */
export interface RebuildReplayState {
  /** The `runtimeVersion` of the most recent `init` call, or `null` if `init` was never called. */
  lastInitRuntimeVersion: string | null;
  /** The cell list of the most recent `setCells` call, or `null` if `setCells` was never called. */
  lastCells: SandboxCell[] | null;
}

/**
 * Resends `state`'s cached `init` then `setCells` messages (in that order —
 * the sandbox's `setCells` handler is a no-op until `init` has created its
 * `SandboxRuntime`) via `post`, skipping either message whose payload was
 * never set.
 *
 * @param post Sends one message to the (freshly rebuilt) sandbox iframe.
 * @param state The payloads to replay.
 */
export function replayAfterRebuild(post: (message: HostToSandboxMessage) => void, state: RebuildReplayState): void {
  if (state.lastInitRuntimeVersion !== null) {
    post({ type: "init", runtimeVersion: state.lastInitRuntimeVersion });
  }
  if (state.lastCells !== null) {
    post({ type: "setCells", cells: state.lastCells });
  }
}
