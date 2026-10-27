import { useSyncExternalStore } from "react";

/**
 * The app-update state machine (ruling R231): `idle` while nothing has
 * been found, `checking` while a request is in flight, `available` once a
 * newer version is found, `downloading` while an in-place update's bundle
 * is fetched in the background (2026-10-26: no click needed), `ready` once
 * it is downloaded and waits for "Restart to update", `installing` while
 * that runs, and `error` for a check, download or install that failed. A
 * release with a `link` (one the user downloads) stays `available`.
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
  | { kind: "installing" }
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
 *  nothing must not flash a chip that then disappears. `downloading` is
 *  silent too: it happens in the background, and the chip appears once
 *  there is something to do (`ready`). */
export function updateChipLabel(state: UpdateState): string | null {
  if (state.kind === "available") return `Update available · ${versionLabel(state.version)}`;
  if (state.kind === "ready") return "Update ready · restart to apply";
  if (state.kind === "installing") return "Installing update…";
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
  /** Fetches the update the last check found, reporting whole percents. */
  downloadUpdate(onProgress: (pct: number) => void): Promise<void>;
  /** Installs what {@link downloadUpdate} fetched. */
  installUpdate(): Promise<void>;
  relaunchApp(): Promise<void>;
}

/** Delay before the first launch-time check (the brief's "on launch (+30
 *  s)") — long enough that the check never competes with the window's own
 *  first paint or the engine-version fetch. */
export const LAUNCH_CHECK_DELAY_MS = 30_000;

/** Recheck interval once running (the brief's "every 4 h"). */
export const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** The part of {@link UpdateIO} a check needs: the check, and the
 *  background download that follows one finding an in-place update. */
export type UpdateCheckIO = Pick<UpdateIO, "checkForUpdate" | "downloadUpdate">;

/** {@link startUpdateChecker}'s tuning; every field optional. */
export interface UpdateCheckerOptions {
  /** Delay before the first check; default {@link LAUNCH_CHECK_DELAY_MS}. */
  launchDelayMs?: number;
  /** Interval between later checks; default {@link RECHECK_INTERVAL_MS}.
   *  `null` checks at launch only — the channel check (Isaac, 2026-10-15:
   *  launch plus the Settings button is enough). */
  recheckIntervalMs?: number | null;
}

/**
 * Runs one check against `io` and publishes its outcome. An in-place
 * update (no `link`) is then downloaded straight away, in the background,
 * ending `ready`; a release the user downloads stays `available`. Never
 * runs while a download or install is in progress or already finished — a
 * background recheck must not stomp on an update waiting for its restart.
 */
export async function runUpdateCheck(io: UpdateCheckIO): Promise<void> {
  if (state.kind === "downloading" || state.kind === "ready" || state.kind === "installing") return;
  publish({ kind: "checking" });
  try {
    const result = await io.checkForUpdate();
    if (result === null) {
      publish(IDLE);
      return;
    }
    publish({ kind: "available", ...result });
    if (result.link !== undefined) return;

    publish({ kind: "downloading", pct: 0 });
    await io.downloadUpdate((pct) => publish({ kind: "downloading", pct: clampPct(pct) }));
    publish({ kind: "ready" });
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
  const recheckMs = options.recheckIntervalMs === undefined ? RECHECK_INTERVAL_MS : options.recheckIntervalMs;
  let stopped = false;
  let interval: ReturnType<typeof setInterval> | undefined;

  const launchTimer = setTimeout(() => {
    if (stopped) return;
    void runUpdateCheck(io);
    if (recheckMs !== null) interval = setInterval(() => void runUpdateCheck(io), recheckMs);
  }, options.launchDelayMs ?? LAUNCH_CHECK_DELAY_MS);

  return () => {
    stopped = true;
    clearTimeout(launchTimer);
    if (interval !== undefined) clearInterval(interval);
  };
}

/**
 * "Restart to update" (item 2 of the brief): installs the update the
 * background download fetched, then relaunches. Only acts from `ready` —
 * a stray call from any other state (a double click on a chip that has
 * already moved on) is a silent no-op.
 */
export async function restartToUpdate(io: Pick<UpdateIO, "installUpdate" | "relaunchApp">): Promise<void> {
  if (state.kind !== "ready") return;
  publish({ kind: "installing" });
  try {
    await io.installUpdate();
    // Windows: the install above already exited the process, so this never
    // runs. Linux: this is what actually relaunches into the new version
    // (`ipc/updater.ts`'s doc comment).
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
// user clicked the status-bar chip yet?), not a fact about the update. The
// update moving on (a background download finishing, an install starting)
// never opens or closes it.

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
