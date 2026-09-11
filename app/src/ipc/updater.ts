import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** What `shell/updateState.ts` needs from a found update — the fields the
 *  status-bar chip and the release-notes panel read. Everything else the
 *  plugin's `Update` resource carries (the `rid`, `rawJson`) stays behind
 *  this module's boundary. */
export interface UpdateInfo {
  /** The published version, e.g. `"0.2.0"`. */
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
 *  check finds nothing — {@link downloadAndInstallUpdate} always acts on the
 *  most recent check, never a stale one. */
let pending: Update | null = null;

/** Checks the configured endpoint for a newer release. Resolves `null` when
 *  none is available, or when the updater plugin was never registered (the
 *  dev build / placeholder-pubkey guard in `app-src-tauri/src/lib.rs`) — the
 *  underlying `invoke` then rejects, which this module treats the same as
 *  "nothing to report" rather than a crash (CLAUDE.md §5: never a crash on
 *  bad data). Callers that need to distinguish "checked, nothing found"
 *  from "could not check at all" should catch around this call instead. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const update = await check();
  if (update === null) {
    pending = null;
    return null;
  }
  pending = update;
  return { version: update.version, notes: update.body ?? "", date: update.date ?? null };
}

/** Downloads and installs the update found by the last {@link checkForUpdate}
 *  call, reporting whole-percent progress. Throws if no check has found an
 *  update yet — the caller (`shell/updateState.ts`'s `restartToUpdate`) only
 *  calls this from the `available` state, so that should never happen in
 *  practice; it is still a typed failure rather than a silent no-op. */
export async function downloadAndInstallUpdate(onProgress: (pct: number) => void): Promise<void> {
  const update = pending;
  if (update === null) throw new Error("no update pending — check() must run first");

  let contentLength = 0;
  let downloaded = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      contentLength = event.data.contentLength ?? 0;
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      if (contentLength > 0) onProgress(Math.round((downloaded / contentLength) * 100));
    } else if (event.event === "Finished") {
      onProgress(100);
    }
  });
  pending = null;
}

/** Relaunches the app. On Windows, `downloadAndInstallUpdate` already exits
 *  the process after launching the installer, so this call never runs
 *  there; on macOS/Linux it is what actually restarts into the new
 *  version — the same two-step the plugin's own README documents. */
export async function relaunchApp(): Promise<void> {
  await relaunch();
}
