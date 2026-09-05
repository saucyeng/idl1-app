/** The shape of C3 §2's `IpcError`, as seen by this tab. Kept local (rather
 *  than imported from an `app/src/ipc/*` module) because Settings only ever
 *  reads `kind`/`message` off a rejected `Promise` and never needs the
 *  command-specific `detail` payloads other modules type against — the same
 *  "kept local" reasoning `app/src/ipc/workbook.ts` uses for its own copy. */
export interface IpcErrorLike {
  /** Machine-readable failure class (C3 §2). Never localized text. */
  kind: string;
  /** Human-readable text from the backend. Not shown directly — this
   *  module's job is to replace it with copy that names what the user was
   *  doing. */
  message: string;
}

/** Turns an {@link IpcErrorLike} this tab can receive into user-facing copy.
 *
 * Covers the kinds Settings' commands and stubs can raise: `sync` (from
 * `sync_status`/`sync_now`/`pair_peer`, C3 §3.9), `invalid_argument` (e.g.
 * `pair_peer` given a malformed code, or a rejected data-directory path),
 * `not_found`, `io` and `internal` (cross-cutting, C3 §2). Any other kind —
 * including one this tab has never seen — falls through to a generic
 * message rather than throwing, since a settings screen that crashes on an
 * unrecognized error is worse than one with vague copy. */
export function describeIpcError(error: IpcErrorLike): string {
  switch (error.kind) {
    case "sync":
      return "LAN sync ran into a problem. Check that both devices are on the same network and try again.";
    case "invalid_argument":
      return "That value isn't valid. If you were entering a pairing code, double-check it and try again.";
    case "not_found":
      return "That item couldn't be found. It may have been removed or moved.";
    case "io":
      return "A file on disk couldn't be read or written. Check available disk space and permissions.";
    case "internal":
      return "Something went wrong on our end. If this keeps happening, please report it.";
    default:
      return "Something unexpected happened. Please try again.";
  }
}
