import { useSyncExternalStore } from "react";

/**
 * The app-update state machine (ruling R231): `idle` while nothing has
 * been found, `checking` while a request is in flight, `available` once
 * `latest.json` names a newer version, `downloading` while its bundle is
 * being fetched, `ready` once installed and waiting to relaunch, and
 * `error` for a check or install that failed.
 *
 * A store, the same publish/subscribe shape as `shell/deviceLink.ts` and
 * `shell/memoryBudget.ts`: the checker in {@link startUpdateChecker} runs
 * from `AppShell.tsx`'s mount effect, and the status bar and the release
 * notes panel are both independent readers.
 */
export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | {
      kind: "available";
      version: string;
      notes: string;
      date: string | null;
      /** Set for a release the user fetches themselves (the channel check,
       *  `ipc/appUpdate.ts`): where "Download" goes. Absent for the desktop
       *  updater plugin, which downloads and installs in place. */
      link?: string;
    }
  | { kind: "downloading"; pct: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

const IDLE: UpdateState = { kind: "idle" };

let state: UpdateState = IDLE;
const listeners = new Set<() => void>();

function publish(next: UpdateState): void {
  state = next;
  for (const listener of listeners) listener();
}

/** The current state. */
export function getUpdateState(): UpdateState {
  return state;
}

/** Subscribes `handler` to state changes. Returns an unsubscribe. */
export function subscribeUpdateState(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook: the update state, re-rendering whenever it changes. */
export function useUpdateState(): UpdateState {
  return useSyncExternalStore(subscribeUpdateState, getUpdateState, getUpdateState);
}

/** Resets the store to `idle` with the panel closed. Test-only — production
 *  code never rewinds a real check or install. */
export function resetUpdateStateForTests(): void {
  publish(IDLE);
  publishPanelOpen(false);
}

/** `pct` clamped to a whole number in `0`–`100`; `0` for a non-finite
 *  input, so a malformed progress event can never paint the download bar
 *  past its track or print `NaN%`. */
export function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

/** The status-bar chip's label (item 2 of the brief: `"Update available ·
 *  vX"`), or `null` when the bar should show nothing — `idle`, `checking`
 *  and `error` are silent; a check failing is not something the user
 *  needs to see in a 22 px band, and a launch-time check that finds
 *  nothing must not flash a chip that then disappears. */
export function updateChipLabel(state: UpdateState): string | null {
  if (state.kind === "available") return `Update available · ${versionLabel(state.version)}`;
  if (state.kind === "downloading") return `Downloading update · ${state.pct}%`;
  if (state.kind === "ready") return "Update ready · restart to apply";
  return null;
}

/** `version` as the chrome prints it: `v0.2.0` for semver, verbatim
 *  otherwise (the nightly channel's `build 19`). */
export function versionLabel(version: string): string {
  return /^\d/.test(version) ? `v${version}` : version;
}

/** What {@link startUpdateChecker} and {@link restartToUpdate} call through
 *  to reach the actual plugin — `ipc/updater.ts` in production, a fake in
 *  tests, so this module's orchestration is exercised without Tauri. */
export interface UpdateIO {
  checkForUpdate(): Promise<{ version: string; notes: string; date: string | null; link?: string } | null>;
  downloadAndInstallUpdate(onProgress: (pct: number) => void): Promise<void>;
  relaunchApp(): Promise<void>;
}

/** Delay before the first launch-time check (the brief's "on launch (+30
 *  s)") — long enough that the check never competes with the window's own
 *  first paint or the engine-version fetch. */
export const LAUNCH_CHECK_DELAY_MS = 30_000;

/** Recheck interval once running (the brief's "every 4 h"). */
export const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** The part of {@link UpdateIO} a check needs. */
export type UpdateCheckIO = Pick<UpdateIO, "checkForUpdate">;

/** {@link startUpdateChecker}'s tuning; every field optional. */
export interface UpdateCheckerOptions {
  /** Delay before the first check; default {@link LAUNCH_CHECK_DELAY_MS}. */
  launchDelayMs?: number;
  /** Subscribes to "the app came back to the foreground" (a phone app is
   *  backgrounded for hours, and its timers with it); returns an
   *  unsubscribe. With it, a resume rechecks once the last check is at
   *  least {@link UpdateCheckerOptions.resumeMinAgeMs} old. */
  onResume?: (handler: () => void) => () => void;
  /** Minimum age of the last check before a resume rechecks; default 15 min. */
  resumeMinAgeMs?: number;
  /** Clock, for tests; default `Date.now`. */
  now?: () => number;
}

/**
 * Runs one check against `io` and publishes its outcome. Never runs while
 * a download or install is in progress or already finished — a background
 * recheck must not stomp on a restart the user has already started or
 * completed and is waiting to act on.
 */
export async function runUpdateCheck(io: UpdateCheckIO): Promise<void> {
  if (state.kind === "downloading" || state.kind === "ready") return;
  publish({ kind: "checking" });
  try {
    const result = await io.checkForUpdate();
    publish(result === null ? IDLE : { kind: "available", ...result });
  } catch (e) {
    publish({ kind: "error", message: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Starts the launch (+30 s) and every-4-h checker (item 2 of the brief).
 * Timers only — never invoked from a render or an interaction handler, so
 * a check never lands on the interaction path (CLAUDE.md §3). Returns a
 * stop function; `AppShell.tsx` calls it from its mount effect's cleanup.
 */
export function startUpdateChecker(io: UpdateCheckIO, options: UpdateCheckerOptions = {}): () => void {
  const now = options.now ?? Date.now;
  const resumeMinAgeMs = options.resumeMinAgeMs ?? 15 * 60 * 1000;
  let stopped = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  let lastCheckAt: number | null = null;

  const check = () => {
    lastCheckAt = now();
    void runUpdateCheck(io);
  };

  const launchTimer = setTimeout(() => {
    if (stopped) return;
    check();
    interval = setInterval(check, RECHECK_INTERVAL_MS);
  }, options.launchDelayMs ?? LAUNCH_CHECK_DELAY_MS);

  // Before the launch check has run, a resume leaves it to the timer.
  const unsubscribeResume = options.onResume?.(() => {
    if (stopped || lastCheckAt === null || now() - lastCheckAt < resumeMinAgeMs) return;
    check();
  });

  return () => {
    stopped = true;
    clearTimeout(launchTimer);
    if (interval !== undefined) clearInterval(interval);
    unsubscribeResume?.();
  };
}

/**
 * "Restart to update" (item 2 of the brief): downloads the pending update
 * with progress, installs it, then relaunches. Only acts from `available`
 * — a stray call from any other state (a double click on a chip that has
 * already moved on) is a silent no-op rather than restarting a download
 * that was never found.
 */
export async function restartToUpdate(io: UpdateIO): Promise<void> {
  if (state.kind !== "available") return;
  publish({ kind: "downloading", pct: 0 });
  try {
    await io.downloadAndInstallUpdate((pct) => publish({ kind: "downloading", pct: clampPct(pct) }));
    publish({ kind: "ready" });
    // Windows: the install above already exited the process, so this never
    // runs. macOS/Linux: this is what actually relaunches into the new
    // version (`ipc/updater.ts`'s doc comment).
    await io.relaunchApp();
  } catch (e) {
    publish({ kind: "error", message: e instanceof Error ? e.message : String(e) });
  }
}

/** "Later" (item 2 of the brief): drops an `available` update back to
 *  `idle` without installing it. The next scheduled check (or "Check for
 *  updates…") finds it again — nothing is remembered past this session,
 *  so "Later" never suppresses a real update forever by accident. A no-op
 *  outside `available`, for the same reason as {@link restartToUpdate}. */
export function dismissUpdate(): void {
  if (state.kind === "available") publish(IDLE);
  closeUpdatePanel();
}

// --- Release notes panel visibility -----------------------------------
//
// Separate from `UpdateState` itself: the panel is a UI concern (has the
// user clicked the status-bar chip yet?), not a fact about the update. A
// download or install started from the open panel keeps it open through
// `downloading`/`ready` even though nothing here re-asserts that — those
// states are only reachable by clicking "Restart to update" from inside
// the open panel in the first place.

let panelOpen = false;
const panelListeners = new Set<() => void>();

function publishPanelOpen(next: boolean): void {
  panelOpen = next;
  for (const listener of panelListeners) listener();
}

/** Opens the release-notes panel — the status bar's "Update available ·
 *  vX" item's click handler. */
export function openUpdatePanel(): void {
  publishPanelOpen(true);
}

/** Closes the panel without touching the update state itself. */
export function closeUpdatePanel(): void {
  publishPanelOpen(false);
}

/** Whether the panel is open. */
export function getUpdatePanelOpen(): boolean {
  return panelOpen;
}

/** Subscribes to panel-open changes. Returns an unsubscribe. */
export function subscribeUpdatePanelOpen(handler: () => void): () => void {
  panelListeners.add(handler);
  return () => {
    panelListeners.delete(handler);
  };
}

/** React hook: whether the release-notes panel is open. */
export function useUpdatePanelOpen(): boolean {
  return useSyncExternalStore(subscribeUpdatePanelOpen, getUpdatePanelOpen, getUpdatePanelOpen);
}
