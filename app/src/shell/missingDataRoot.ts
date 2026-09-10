/** The launch-time "the library is not there" condition (C4 §1 "Missing
 *  root", ruling R196), as the frontend sees it: the engine refuses to open
 *  a `settings.json` override that is absent or unwritable, rather than
 *  silently falling back to the platform default and showing an empty
 *  library. The recovery is UI, so the window opens and this blocks it. */
export interface MissingDataRoot {
  /** The override path exactly as `settings.json` spells it — shown to the
   *  user, because "D:\race-data" is the whole diagnosis when D: is
   *  unplugged. */
  path: string;
}

/** Recognises the missing-root rejection among all the other ways an IPC
 *  call can fail.
 *
 *  `kind` alone is not enough: C3 §2 folds every filesystem failure to
 *  `"io"`, so the discriminant is `detail.reason === "missing_root"`, which
 *  `idl-rs-tauri`'s `paths::ResolveError` sets deliberately for exactly this
 *  consumer. Anything else — a different `kind`, a different `reason`, a
 *  rejection that is not even `IpcError`-shaped — is not this condition and
 *  must not be shown as it; a genuine disk error dressed up as "your drive
 *  is unplugged" would send the user hunting for the wrong problem.
 *
 * @param error - A rejection value from any IPC call, of unknown shape.
 * @returns The missing root and its path, or `null` when `error` is
 *  something else entirely. */
export function missingDataRootFrom(error: unknown): MissingDataRoot | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const candidate = error as { kind?: unknown; detail?: unknown };
  if (candidate.kind !== "io") {
    return null;
  }
  if (typeof candidate.detail !== "object" || candidate.detail === null) {
    return null;
  }
  const detail = candidate.detail as { reason?: unknown; path?: unknown };
  if (detail.reason !== "missing_root" || typeof detail.path !== "string") {
    return null;
  }
  return { path: detail.path };
}

/** The sentence shown on the blocking screen, naming the folder and saying
 *  what the app did *not* do — the reassurance that matters here is that
 *  nothing was created, moved, or lost while the folder was away.
 *
 * @param root - The missing root, from {@link missingDataRootFrom}.
 * @returns One paragraph of user-facing text. Not localized. */
export function describeMissingDataRoot(root: MissingDataRoot): string {
  return (
    `idl1 is set up to keep your library in "${root.path}", and that folder is not available right now. ` +
    "Nothing has been changed: no library was created anywhere else, and nothing was removed from that folder. " +
    "Reconnect the drive or restore the folder and choose Retry, or pick a different folder to use instead."
  );
}
