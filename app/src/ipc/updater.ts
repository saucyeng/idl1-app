import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** What `shell/updateState.ts` needs from a found update — the fields the
 *  status-bar chip and the release-notes panel read. Everything else the
 *  plugin's `Update` resource carries (the `rid`, `rawJson`) stays behind
 *  this module's boundary. */
export interface UpdateInfo {
  /** The published version, e.g. `"0.2.0"` or `"0.1.0-beta.3.nightly.31"`. */
  version: string;
  /** The release body — the tag's CHANGELOG section, written by
   *  `release.yml` (ruling R231) — rendered by `releaseNotesMarkdown.ts`. */
  notes: string;
  /** The release's publish date as the manifest states it, or `null` when
   *  `latest.json` omits it. */
  date: string | null;
}

/** The live `Update` resource from the last successful {@link checkForUpdate},
 *  held here rather than in `shell/updateState.ts` so that module stays a
 *  plain, serializable state machine. `null` once installed or once a fresh
 *  check finds nothing — {@link downloadUpdate} always acts on the most
 *  recent check, never a stale one. */
let pending: Update | null = null;

/** True once {@link downloadUpdate} has fetched `pending`'s bundle, so
 *  {@link installUpdate} has something to install. */
let downloaded = false;

/** Checks the configured endpoint for a newer release. Resolves `null` when
 *  none is available. Rejects when the updater plugin was never registered
 *  (the dev build / placeholder-pubkey guard in `app/src-tauri/src/lib.rs`)
 *  or the feed can't be read; `shell/updateState.ts` turns that into its
 *  silent `error` state rather than a crash (CLAUDE.md §5). */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const update = await check();
  downloaded = false;
  if (update === null) {
    pending = null;
    return null;
  }
  pending = update;
  return { version: update.version, notes: update.body ?? "", date: update.date ?? null };
}

/** Downloads the update found by the last {@link checkForUpdate} call into
 *  memory, reporting whole-percent progress; nothing is installed yet.
 *  Throws if no check has found an update — a typed failure rather than a
 *  silent no-op. */
export async function downloadUpdate(onProgress: (pct: number) => void): Promise<void> {
  const update = pending;
  if (update === null) throw new Error("no update pending — check() must run first");

  let contentLength = 0;
  let received = 0;
  await update.download((event) => {
    if (event.event === "Started") {
      contentLength = event.data.contentLength ?? 0;
    } else if (event.event === "Progress") {
      received += event.data.chunkLength;
      if (contentLength > 0) onProgress(Math.round((received / contentLength) * 100));
    } else if (event.event === "Finished") {
      onProgress(100);
    }
  });
  downloaded = true;
}

/** Installs what {@link downloadUpdate} fetched. Windows: runs the NSIS
 *  installer (a small progress window), which exits this process and
 *  starts the new version itself. Linux: a `.deb` install asks for the
 *  password through the system prompt (`pkexec`); an AppImage is replaced
 *  in place; either way {@link relaunchApp} then starts the new version. */
export async function installUpdate(): Promise<void> {
  const update = pending;
  if (update === null || !downloaded) throw new Error("no downloaded update — downloadUpdate() must run first");
  await update.install();
  pending = null;
  downloaded = false;
}

/** Relaunches the app. On Windows, {@link installUpdate} already exits the
 *  process after launching the installer, so this call never runs there;
 *  on Linux it is what actually restarts into the new version — the same
 *  two-step the plugin's own README documents. */
export async function relaunchApp(): Promise<void> {
  await relaunch();
}
