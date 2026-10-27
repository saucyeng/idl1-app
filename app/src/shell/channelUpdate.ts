import { checkAppUpdate, currentBuild, isAndroid, updateLink, type AppChannel, type CurrentBuild } from "../ipc/appUpdate";
import { checkForUpdate, downloadUpdate, installUpdate, relaunchApp } from "../ipc/updater";
import { parsePrefs } from "../routes/pages/Settings/prefs";
import { localStorageBackend } from "../routes/pages/Settings/prefsStore";
import { RECHECK_INTERVAL_MS, runUpdateCheck, type UpdateCheckerOptions, type UpdateIO } from "./updateState";

/** What this build was built as (`release.yml` sets the variables); `null`
 *  for a local build, which keeps the desktop updater path. */
export const BUILD: CurrentBuild | null = currentBuild(import.meta.env);

/** The channel to check: Settings' pick when there is one, else the
 *  build's own. */
export function effectiveChannel(picked: AppChannel | null, build: CurrentBuild): AppChannel {
  return picked ?? build.build_channel;
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

/** True on an Android webview — no updater plugin there; an APK is always
 *  a download. */
function onAndroid(): boolean {
  return typeof navigator !== "undefined" && isAndroid(navigator.userAgent);
}

/** {@link UpdateIO} over the channel check for `build`. Only
 *  `checkForUpdate` is real: every release it finds carries a `link`, so
 *  nothing downloads or installs in place. */
function channelIo(build: CurrentBuild): UpdateIO {
  const android = onAndroid();
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
      // A switch names the channel: "beta 0.3.0-beta.1".
      const version = update.switch ? `${update.channel} ${update.label}` : update.label;
      return { version, notes: update.notes, date: update.published_at || null, link: updateLink(update, android) };
    },
    downloadUpdate: notHere,
    installUpdate: notHere,
    relaunchApp: notHere,
  };
}

/** True when `build` updates in place (2026-10-26): a desktop nightly or
 *  stable build, whose `release.yml` manifest the updater plugin reads.
 *  Android and beta builds keep the channel check's download link. */
export function updatesInPlace(build: CurrentBuild, android: boolean): boolean {
  return !android && (build.build_channel === "nightly" || build.build_channel === "stable");
}

/** The updater plugin's version as the chrome names it: a nightly's
 *  `…nightly.31` reads `build 31`, the same label the channel check uses;
 *  any other version passes through. */
export function inPlaceVersionLabel(version: string): string {
  const nightly = /[.-]nightly\.(\d+)$/.exec(version);
  return nightly === null ? version : `build ${nightly[1]}`;
}

/** {@link UpdateIO} for a build that {@link updatesInPlace}: the updater
 *  plugin on the build's own channel, or the channel check (a download)
 *  when Settings picks another channel — a switch is always a download. */
function inPlaceIo(build: CurrentBuild): UpdateIO {
  const channel = channelIo(build);
  return {
    checkForUpdate: async () => {
      if (effectiveChannel(await pickedChannel(), build) !== build.build_channel) return channel.checkForUpdate();
      const update = await checkForUpdate();
      return update === null ? null : { ...update, version: inPlaceVersionLabel(update.version) };
    },
    downloadUpdate,
    installUpdate,
    relaunchApp,
  };
}

/** The update check's IO and tuning. A desktop nightly or stable build
 *  updates in place: checked 5 s after launch and every 4 h, downloaded in
 *  the background, installed on "Restart to update" (2026-10-26). Any other
 *  CI build checks its channel once, 5 s after launch (2026-10-15).
 *  Settings ▸ About has the manual check. A local build keeps the bare
 *  updater plugin (ruling R231), which its dev identifier keeps off. */
export function updateWiring(): { io: UpdateIO; options: UpdateCheckerOptions } {
  if (BUILD === null) return { io: { checkForUpdate, downloadUpdate, installUpdate, relaunchApp }, options: {} };
  if (updatesInPlace(BUILD, onAndroid())) {
    return { io: inPlaceIo(BUILD), options: { launchDelayMs: 5_000, recheckIntervalMs: RECHECK_INTERVAL_MS } };
  }
  return { io: channelIo(BUILD), options: { launchDelayMs: 5_000, recheckIntervalMs: null } };
}

/** Settings' "Check for updates": one check now, its outcome published to
 *  the same store the banner and chip read. A no-op on a local build. */
export async function checkForUpdatesNow(): Promise<void> {
  if (BUILD === null) return;
  await runUpdateCheck(updateWiring().io);
}
