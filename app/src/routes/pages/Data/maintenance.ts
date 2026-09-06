import type { RebuildReport, RescanReport } from "../../../ipc/catalog";
import { describeIpcError } from "./errors";
import { NotImplementedError } from "./ipcStubs";

/** The toolbar's overflow menu runs one long-running maintenance action at
 *  a time (`rebuild_catalog`, or a stubbed write command) and shows its
 *  outcome. Unlike `importQueue.ts`, there is no queue: these are one-shot
 *  operator actions, not a batch of files, so a second `START` while one is
 *  `"running"` is refused rather than enqueued (Step 1's test). */
export interface MaintenanceState {
  /** The C3/stub command name of the action last started (e.g.
   *  `"rebuild_catalog"`), or `""` before any action has ever run. */
  action: string;
  status: "idle" | "running" | "done" | "failed";
  /** User-facing summary line, set only when `status` is `"done"`. */
  result?: string;
  /** User-facing error text, set only when `status` is `"failed"`. */
  error?: string;
}

/** The overflow menu's state before any action has run. */
export const initialMaintenanceState: MaintenanceState = { action: "", status: "idle" };

/** State-changing gestures [[startMaintenanceAction]] dispatches around a
 *  running action. Never dispatched directly by UI code — only by
 *  [[startMaintenanceAction]], so `START`'s running-action guard cannot be
 *  bypassed by a stray dispatch. */
export type MaintenanceAction =
  | { type: "START"; action: string }
  | { type: "SUCCEEDED"; action: string; result: string }
  | { type: "FAILED"; action: string; error: string };

/** Pure reducer over [[MaintenanceState]]. `START` while another action is
 *  already `"running"` is a no-op — the running action's state is returned
 *  unchanged, never overwritten by the refused start (Step 1's test: "the
 *  running action is untouched"). */
export function maintenanceReducer(state: MaintenanceState, action: MaintenanceAction): MaintenanceState {
  switch (action.type) {
    case "START":
      if (state.status === "running") return state;
      return { action: action.action, status: "running" };
    case "SUCCEEDED":
      return { action: action.action, status: "done", result: action.result };
    case "FAILED":
      return { action: action.action, status: "failed", error: action.error };
  }
}

/** "1 session" / "42 sessions" — [[summarizeRebuildReport]] never says "1
 *  sessions". */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Turns `rebuild_catalog`'s (C3 §3.2) `RebuildReport` into the toolbar's
 *  summary line, e.g. "Indexed 42 sessions, 3 workbooks, 1 track in 1.2 s."
 *  An all-zero report (an empty store, or a rebuild that found nothing new)
 *  reads as "the store is empty" rather than the misleading, count-shaped
 *  "Indexed 0 sessions, 0 workbooks, 0 tracks" (Step 1's test). */
export function summarizeRebuildReport(report: RebuildReport): string {
  const { sessions_indexed, workbooks_indexed, tracks_indexed, duration_ms } = report;
  const seconds = (duration_ms / 1000).toFixed(1);

  if (sessions_indexed === 0 && workbooks_indexed === 0 && tracks_indexed === 0) {
    return `The store is empty — nothing to index (${seconds} s).`;
  }

  return `Indexed ${plural(sessions_indexed, "session")}, ${plural(workbooks_indexed, "workbook")}, ${plural(tracks_indexed, "track")} in ${seconds} s.`;
}

/** Text for a failed maintenance action. A [[NotImplementedError]] (any
 *  `ipcStubs.ts` stub) reads as naming the command and saying it "isn't
 *  wired up yet", rather than `describeIpcError`'s generic fallback for an
 *  error shape C3 §2 never defined (`NotImplementedError` is not an
 *  `IpcError`, by `ipcStubs.ts`'s own design). Every other rejection routes
 *  through `describeIpcError` (CLAUDE.md §5: route on kind, never on
 *  message). */
function describeMaintenanceError(error: unknown): string {
  if (error instanceof NotImplementedError) {
    return `${error.command} isn't wired up yet.`;
  }
  return describeIpcError(error).text;
}

/** Starts `run` for `actionName` and dispatches its outcome — `START`
 *  immediately, then exactly one of `SUCCEEDED`/`FAILED` once `run`
 *  settles. A no-op, touching nothing, if `state.status` is already
 *  `"running"` (Step 1's test: a second start is refused, not queued).
 *  `run` never throws synchronously by contract (every caller wraps a
 *  Promise-returning IPC/stub call) — a rejection is routed to `FAILED`
 *  regardless of shape, so a stub's [[NotImplementedError]] can never
 *  surface as an unhandled rejection or a crash (Step 1's "never a
 *  crash" test). */
export function startMaintenanceAction(
  state: MaintenanceState,
  actionName: string,
  run: () => Promise<string>,
  dispatch: (a: MaintenanceAction) => void,
): void {
  if (state.status === "running") return;

  dispatch({ type: "START", action: actionName });

  run()
    .then((result) => dispatch({ type: "SUCCEEDED", action: actionName, result }))
    .catch((error: unknown) => dispatch({ type: "FAILED", action: actionName, error: describeMaintenanceError(error) }));
}

/** Structurally matches `ipc/catalog.ts`'s `rebuildCatalog` — injected so
 *  [[startMaintenanceAction]]'s tests don't need a real Tauri IPC
 *  round-trip. */
export type RebuildCatalogFn = () => Promise<RebuildReport>;

/** Wraps the real `rebuild_catalog` (C3 §3.2) as a `run` function for
 *  [[startMaintenanceAction]], turning its report into the summary line. */
export function runRebuildCatalog(rebuildCatalog: RebuildCatalogFn): () => Promise<string> {
  return () => rebuildCatalog().then(summarizeRebuildReport);
}

/** Structurally matches the proposed `delete_session` stub
 *  (`ipcStubs.ts`, IPC need 3) — injected for the same reason as
 *  [[RebuildCatalogFn]]. */
export type DeleteSessionFn = (sessionId: string, deleteBlob: boolean) => Promise<void>;

/** Wraps `deleteSession` as a `run` function. `deleteBlob: true` is idl0's
 *  "Delete session" (removes the immutable source blob too); `false` is
 *  idl0's "Forget session" ([[runForgetSession]]) — CLAUDE.md §3's "log
 *  files and blobs are immutable" is exactly why the two are separate
 *  destructive actions rather than one with a checkbox nobody notices. */
export function runDeleteSession(deleteSession: DeleteSessionFn, sessionId: string, deleteBlob: boolean): () => Promise<string> {
  return () =>
    deleteSession(sessionId, deleteBlob).then(() =>
      deleteBlob ? "Session and its source file were deleted." : "Session was removed; its source file was kept.",
    );
}

/** idl0's non-blob-deleting "Forget session" — [[runDeleteSession]] with
 *  `deleteBlob: false`. There is no separate `forgetSession` IPC stub: the
 *  brief's own note that this may be simpler than a fourth stub function is
 *  the choice made here (see this task's report). */
export function runForgetSession(deleteSession: DeleteSessionFn, sessionId: string): () => Promise<string> {
  return runDeleteSession(deleteSession, sessionId, false);
}

/** Turns `rescan_tracks`'s (C3 §3.2, ruling R83) `RescanReport` into the
 *  toolbar's summary line, e.g. "Indexed 1 track visit, 3 laps. Cleared
 *  main_lap_number. 1 warning." A report with no cleared flags and no
 *  warnings omits both trailing sentences rather than saying "Cleared none;
 *  0 warnings." */
export function summarizeRescanReport(report: RescanReport): string {
  const parts = [`Indexed ${plural(report.visits_indexed, "track visit")}, ${plural(report.laps_indexed, "lap")}.`];
  if (report.flags_cleared.length > 0) {
    parts.push(`Cleared ${report.flags_cleared.join(", ")}.`);
  }
  if (report.warnings.length > 0) {
    parts.push(`${plural(report.warnings.length, "warning")}: ${report.warnings.join("; ")}`);
  }
  return parts.join(" ");
}

/** Structurally matches `ipc/catalog.ts`'s `rescanTracks` — injected so
 *  [[startMaintenanceAction]]'s tests don't need a real Tauri IPC
 *  round-trip. */
export type RescanTracksFn = (sessionId: string) => Promise<RescanReport>;

/** Wraps `rescanTracks` as a `run` function for [[startMaintenanceAction]],
 *  turning its report into the summary line (C3 §3.2, ruling R83). */
export function runRescanTracks(rescanTracks: RescanTracksFn, sessionId: string): () => Promise<string> {
  return () => rescanTracks(sessionId).then(summarizeRescanReport);
}

/** Structurally matches the proposed `list_quarantine` stub (IPC need 4). */
export type ListQuarantineFn = () => Promise<unknown[]>;

/** Wraps `listQuarantine` as a `run` function. The entry shape is IPC need
 *  4's proposed `QuarantineEntry[]`, not yet a landed contract type, so
 *  this counts entries rather than parsing them. */
export function runListQuarantine(listQuarantine: ListQuarantineFn): () => Promise<string> {
  return () => listQuarantine().then((entries) => `${plural(entries.length, "item")} awaiting review.`);
}

/** Structurally matches the proposed `resolve_quarantine` stub
 *  (IPC need 4). */
export type ResolveQuarantineFn = (entryId: string, action: "retry" | "discard") => Promise<void>;

/** Wraps `resolveQuarantine` as a `run` function. */
export function runResolveQuarantine(
  resolveQuarantine: ResolveQuarantineFn,
  entryId: string,
  action: "retry" | "discard",
): () => Promise<string> {
  return () => resolveQuarantine(entryId, action).then(() => (action === "retry" ? "Quarantine entry was retried." : "Quarantine entry was discarded."));
}
