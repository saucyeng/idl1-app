/**
 * Placeholder for a Data-tab command C3 does not have yet
 * (`runs/2026-09-05/lanes/l7/IPC-NEEDS.md` need 2). Every stub in this file
 * rejects with this, never with an `IpcError`-shaped value — C3 §2's kind
 * vocabulary is additive-only, and a `not_implemented` kind would put a
 * placeholder in a signed contract. Replacing a stub with the real wrapper,
 * once the Rust track lands the command, is an import-path change in the
 * caller, not a change to this file's shape.
 */
export class NotImplementedError extends Error {
  /** The C3 §3.2 command name this stub stands in for. */
  command: string;

  constructor(command: string) {
    super(`${command} is not implemented yet`);
    this.command = command;
  }
}

/** Stands in for `save_track` (IPC need 2) until the Rust track lands it.
 *  The track editor itself is deferred to wave 3 (Parity gaps table) — this
 *  stub exists only so a future editor has a call site to swap in. */
export async function saveTrack(_track: Record<string, unknown>): Promise<never> {
  throw new NotImplementedError("save_track");
}

/** Stands in for `delete_track` (IPC need 2) until the Rust track lands it.
 *  See [[saveTrack]]'s note. */
export async function deleteTrack(_trackId: string): Promise<never> {
  throw new NotImplementedError("delete_track");
}

/** Stands in for `list_quarantine` (IPC need 4,
 *  `runs/2026-09-05/lanes/l7/IPC-NEEDS.md`) until the Rust track lands it.
 *  The real return shape is IPC need 4's proposed `QuarantineEntry[]`, not
 *  yet a landed contract type. */
export async function listQuarantine(): Promise<never> {
  throw new NotImplementedError("list_quarantine");
}

/** Stands in for `resolve_quarantine` (IPC need 4) until the Rust track
 *  lands it. */
export async function resolveQuarantine(_entryId: string, _action: "retry" | "discard"): Promise<never> {
  throw new NotImplementedError("resolve_quarantine");
}
