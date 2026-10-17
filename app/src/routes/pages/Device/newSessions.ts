import type { Progress } from "../../../ipc/device";
import type { DeviceFileView } from "./files";

/**
 * Pure state for the Logger dashboard's new-sessions banner (navigation map
 * v4, 2026-10-14; R53's "no import from the Device tab" reversed by Isaac the
 * same day). One tap checks the logger for sessions the library doesn't
 * have; a second downloads and imports every one of them, in order, one at a
 * time (SPEC §24.17). The component runs the IPC; this module only decides
 * what the banner says and which button it offers.
 */

/** One file queued for transfer: its device name and size in bytes. */
export interface QueuedFile {
  name: string;
  /** Bytes, as `/files` reported it. */
  sizeBytes: number;
}

/** One file that failed, with the user-facing reason. */
export interface FailedFile {
  name: string;
  error: string;
}

/** The banner's lifecycle. */
export type NewSessionsState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "ready"; files: QueuedFile[] }
  | {
      phase: "transferring";
      files: QueuedFile[];
      /** Index into `files` of the file in progress. */
      index: number;
      step: "download" | "import";
      /** Bytes of the current file received so far. */
      doneBytes: number;
      imported: number;
      failed: FailedFile[];
      warnings: string[];
    }
  | { phase: "done"; imported: number; failed: FailedFile[]; warnings: string[] }
  | { phase: "failed"; error: string };

export const initialNewSessionsState: NewSessionsState = { phase: "idle" };

/** Actions the banner's runner dispatches around `listDeviceFiles`,
 *  `downloadFile` and `importFile`. */
export type NewSessionsAction =
  | { type: "CHECK_START" }
  | { type: "CHECK_DONE"; files: DeviceFileView[] }
  | { type: "CHECK_FAILED"; error: string }
  | { type: "TRANSFER_START" }
  | { type: "PROGRESS"; progress: Progress }
  | { type: "IMPORT_START" }
  | { type: "FILE_IMPORTED"; warnings: string[] }
  | { type: "FILE_FAILED"; error: string }
  | { type: "DISMISS" };

/** Moves a transfer to its next file, or to `done` after the last one. */
function advance(state: Extract<NewSessionsState, { phase: "transferring" }>, imported: number, failed: FailedFile[], warnings: string[]): NewSessionsState {
  const next = state.index + 1;
  if (next >= state.files.length) return { phase: "done", imported, failed, warnings };
  return { ...state, index: next, step: "download", doneBytes: 0, imported, failed, warnings };
}

/** Pure reducer. Actions that don't fit the current phase are ignored. */
export function newSessionsReducer(state: NewSessionsState, action: NewSessionsAction): NewSessionsState {
  switch (action.type) {
    case "CHECK_START":
      return state.phase === "transferring" ? state : { phase: "checking" };
    case "CHECK_DONE":
      if (state.phase !== "checking") return state;
      return { phase: "ready", files: action.files.filter((f) => f.isNew).map((f) => ({ name: f.name, sizeBytes: f.size_bytes })) };
    case "CHECK_FAILED":
      return state.phase === "checking" ? { phase: "failed", error: action.error } : state;
    case "TRANSFER_START":
      if (state.phase !== "ready" || state.files.length === 0) return state;
      return { phase: "transferring", files: state.files, index: 0, step: "download", doneBytes: 0, imported: 0, failed: [], warnings: [] };
    case "PROGRESS":
      return state.phase === "transferring" && state.step === "download" ? { ...state, doneBytes: action.progress.done } : state;
    case "IMPORT_START":
      return state.phase === "transferring" ? { ...state, step: "import" } : state;
    case "FILE_IMPORTED":
      if (state.phase !== "transferring") return state;
      return advance(state, state.imported + 1, state.failed, [...state.warnings, ...action.warnings]);
    case "FILE_FAILED":
      if (state.phase !== "transferring") return state;
      return advance(state, state.imported, [...state.failed, { name: state.files[state.index].name, error: action.error }], state.warnings);
    case "DISMISS":
      return state.phase === "done" || state.phase === "failed" || (state.phase === "ready" && state.files.length === 0) ? { phase: "idle" } : state;
    default:
      return state;
  }
}

/** What automatic download (Settings' `auto_download`) should do next in
 *  `state`, given whether it has already checked and already started a
 *  transfer since the banner mounted. Each happens at most once per mount:
 *  the banner mounts on connect and again each time a recording stops, so
 *  that is when a check runs, and a failure never loops. */
export function autoStep(state: NewSessionsState, checked: boolean, transferred: boolean): "check" | "download" | null {
  if (state.phase === "idle" && !checked) return "check";
  if (state.phase === "ready" && state.files.length > 0 && !transferred) return "download";
  return null;
}

/** What the banner's button does. */
export type BannerAction = "check" | "download" | "retry" | "dismiss";

/** What the banner shows. */
export interface BannerView {
  text: string;
  /** Second, dimmer line, or null. */
  detail: string | null;
  /** The button, or null while busy. */
  action: { kind: BannerAction; label: string } | null;
  /** 0–1 progress through the whole transfer, or null when not transferring. */
  fraction: number | null;
  /** Tone for the banner's edge: `accent` something to do, `good` finished
   *  cleanly, `warn` finished with failures or warnings, `bad` the check
   *  failed, `plain` otherwise. */
  tone: "accent" | "good" | "warn" | "bad" | "plain";
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Bytes as MB with one decimal, for the transfer line. */
export function mb(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** When a ride was recorded, from its logger file name: the firmware names
 *  a session `YYYY-MM-DD_HH-MM-SS.idl1` in UTC at its first GPS fix, so this
 *  is that instant in `timeZone` (the device's own when omitted). A file
 *  that never got a fix keeps its boot-time name and reads "No GPS time". */
export function rideWhen(name: string, timeZone?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/.exec(name);
  if (m === null) return "No GPS time";
  const utc = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return utc.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZone });
}

/** The files a selection keeps, in the logger's order. */
export function pickFiles(files: QueuedFile[], picked: ReadonlySet<string>): QueuedFile[] {
  return files.filter((f) => picked.has(f.name));
}

/** The banner's text and button for `state`. */
export function bannerView(state: NewSessionsState): BannerView {
  switch (state.phase) {
    case "idle":
      return { text: "Check the logger for new sessions", detail: null, action: { kind: "check", label: "Check" }, fraction: null, tone: "plain" };
    case "checking":
      return { text: "Checking the logger…", detail: null, action: null, fraction: null, tone: "plain" };
    case "ready": {
      if (state.files.length === 0) {
        return { text: "Everything on the logger is in your library", detail: null, action: { kind: "dismiss", label: "OK" }, fraction: null, tone: "good" };
      }
      const total = state.files.reduce((sum, f) => sum + f.sizeBytes, 0);
      return {
        text: `${plural(state.files.length, "new session", "new sessions")} on the logger`,
        detail: mb(total),
        action: { kind: "download", label: "Download" },
        fraction: null,
        tone: "accent",
      };
    }
    case "transferring": {
      const totalBytes = state.files.reduce((sum, f) => sum + f.sizeBytes, 0);
      const before = state.files.slice(0, state.index).reduce((sum, f) => sum + f.sizeBytes, 0);
      const current = state.files[state.index];
      const doneInFile = state.step === "import" ? current.sizeBytes : Math.min(state.doneBytes, current.sizeBytes);
      const fraction = totalBytes > 0 ? (before + doneInFile) / totalBytes : null;
      const verb = state.step === "import" ? "Importing" : "Downloading";
      return {
        text: `${verb} ${state.index + 1} of ${state.files.length}`,
        detail: state.step === "import" ? current.name : `${current.name} · ${mb(doneInFile)} of ${mb(current.sizeBytes)}`,
        action: null,
        fraction,
        tone: "plain",
      };
    }
    case "done": {
      const failedText = state.failed.length === 0 ? null : `${plural(state.failed.length, "file", "files")} failed: ${state.failed.map((f) => `${f.name} (${f.error})`).join("; ")}`;
      const warnText = state.warnings.length === 0 ? null : state.warnings.join("; ");
      return {
        text: `${plural(state.imported, "ride", "rides")} added · notes in the Data tab`,
        detail: [failedText, warnText].filter((t) => t !== null).join(" · ") || null,
        action: { kind: "dismiss", label: "OK" },
        fraction: null,
        tone: state.failed.length > 0 || state.warnings.length > 0 ? "warn" : "good",
      };
    }
    case "failed":
      return { text: "Couldn't check the logger", detail: state.error, action: { kind: "retry", label: "Retry" }, fraction: null, tone: "bad" };
  }
}
