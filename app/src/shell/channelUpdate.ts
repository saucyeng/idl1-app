import { checkAppUpdate, currentBuild, isAndroid, updateLink, type AppChannel, type CurrentBuild } from "../ipc/appUpdate";
import { checkForUpdate, downloadAndInstallUpdate, relaunchApp } from "../ipc/updater";
import { parsePrefs } from "../routes/pages/Settings/prefs";
import { localStorageBackend } from "../routes/pages/Settings/prefsStore";
import { runUpdateCheck, type UpdateCheckerOptions, type UpdateIO } from "./updateState";

/** What this build was built as (`release.yml` sets the variables); `null`
 *  for a local build, which keeps the desktop updater path. */
export const BUILD: CurrentBuild | null = currentBuild(import.meta.env);

/** The channel to check: Settings' pick when there is one, else the
 *  build's own. */
export function effectiveChannel(picked: AppChannel | null, build: CurrentBuild): AppChannel {
  return picked ?? build.channel;
}

/** Settings' channel pick, read straight from the `ui` half's storage (the
 *  half `prefsStore` keeps in `localStorage`), so the shell needs no store
 *  of its own. `null` when unset or unreadable. */
async function pickedChannel(): Promise<AppChannel | null> {
  const raw = await localStorageBackend().read();
  if (raw === null) return null;
  try {
    return parsePrefs(JSON.parse(raw)).ui.app_channel;
  } catch {
    return null;
  }
}

/** The C3 IPC error shape is a plain object; keep its message. */
function asError(e: unknown): Error {
  if (e instanceof Error) return e;
  const message = typeof e === "object" && e !== null && "message" in e ? String(e.message) : String(e);
  return new Error(message);
}

/** {@link UpdateIO} over the channel check for `build`. Only
 *  `checkForUpdate` is real: these releases update by download, never in
 *  place, so `restartToUpdate` is never reached for them. */
function channelIo(build: CurrentBuild): UpdateIO {
  const android = typeof navigator !== "undefined" && isAndroid(navigator.userAgent);
  const notHere = () => Promise.reject(new Error("this build updates by download, not in place"));
  return {
    checkForUpdate: async () => {
      const channel = effectiveChannel(await pickedChannel(), build);
      let update;
      try {
        update = await checkAppUpdate({ ...build, channel });
      } catch (e) {
        throw asError(e);
      }
      if (update === null) return null;
      return { version: update.label, notes: update.notes, date: update.published_at || null, link: updateLink(update, android) };
    },
    downloadAndInstallUpdate: notHere,
    relaunchApp: notHere,
  };
}

/** The update check's IO and tuning (2026-10-15). A CI build checks its
 *  channel once, 5 s after launch; Settings ▸ About has the manual check.
 *  A local build keeps the updater plugin (ruling R231), which is off until
 *  it is signed. */
export function updateWiring(): { io: UpdateIO; options: UpdateCheckerOptions } {
  if (BUILD === null) return { io: { checkForUpdate, downloadAndInstallUpdate, relaunchApp }, options: {} };
  return { io: channelIo(BUILD), options: { launchDelayMs: 5_000, recheckIntervalMs: null } };
}

/** Settings' "Check for updates": one check now, its outcome published to
 *  the same store the banner and chip read. A no-op on a local build. */
export async function checkForUpdatesNow(): Promise<void> {
  if (BUILD === null) return;
  await runUpdateCheck(channelIo(BUILD));
}
