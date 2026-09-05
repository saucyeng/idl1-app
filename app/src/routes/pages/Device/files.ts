import type { DeviceFile, DownloadResult, Progress } from "../../../ipc/device";

/**
 * One device file as this tab renders it: `DeviceFile` (C3 §3.8) plus
 * whether it looks importable-but-not-yet-imported. `toFileViews` computes
 * `isNew` against the catalog's known session ids — this module never calls
 * `listSessions` itself (`app/src/ipc/catalog.ts`, a shared IPC module, not
 * `Data/`-owned code); the caller passes the set in.
 */
export interface DeviceFileView extends DeviceFile {
  /** `true` when this file's `session_id` is not among `knownSessionIds` —
   *  including a `null` `session_id` (an older firmware / unindexed file
   *  cannot already be in the catalog, so it always reads as new). */
  isNew: boolean;
}

/**
 * Marks each `DeviceFile` with whether the catalog already has a session
 * for it. `knownSessionIds` is sourced from `listSessions()`
 * (`app/src/ipc/catalog.ts`, C3 §3.2) by the caller — this function does no
 * IPC of its own, keeping it pure and unit-testable.
 */
export function toFileViews(files: DeviceFile[], knownSessionIds: Set<string>): DeviceFileView[] {
  return files.map((file) => ({
    ...file,
    isNew: file.session_id === null || !knownSessionIds.has(file.session_id),
  }));
}

/** Counts how many `files` are new (idl0's "N new" badge, §24.17). */
export function newCount(files: DeviceFileView[]): number {
  return files.filter((file) => file.isNew).length;
}

/** Lifecycle phase of one queued download. */
export type DownloadStatus = "queued" | "downloading" | "done" | "failed";

/**
 * One entry in the download queue. Byte counts come straight from
 * `Progress`/`DownloadResult` (C3 §3.8) — never a derived percentage when
 * `totalBytes` is unknown (a chunked-transfer firmware reports no
 * `Content-Length`, SPEC §24.17).
 */
export interface DownloadItem {
  /** The device file name this item downloads (matches `DeviceFile.name`). */
  name: string;
  status: DownloadStatus;
  /** Bytes transferred so far. u64-range in practice; `number` is exact up
   *  to 2^53 bytes, far beyond any session file. */
  doneBytes: number;
  /** Bytes expected in total, or `null` when the transfer hasn't reported
   *  one yet (`Progress.total`). */
  totalBytes: number | null;
  /** `DownloadResult.sha256`, set only once `status` is `"done"`. */
  sha256: string | null;
  /** `DownloadResult.path` under `<data>/blobs/sha256/`, set only once
   *  `status` is `"done"`. */
  path: string | null;
  /** User-facing failure text (`describeIpcError`'s output), set only once
   *  `status` is `"failed"`. */
  error: string | null;
}

/** State for the device-files view: the listed files and the download
 *  queue built from user download requests. */
export interface FilesState {
  files: DeviceFileView[];
  queue: DownloadItem[];
}

/** The reducer's state before `listDeviceFiles` has ever resolved. */
export const initialFilesState: FilesState = { files: [], queue: [] };

/** Actions `downloadReducer` accepts, dispatched around `listDeviceFiles`/
 *  `downloadFile` (C3 §3.8) calls. */
export type FilesAction =
  | { type: "FILES_LOADED"; files: DeviceFileView[] }
  | { type: "ENQUEUE"; name: string }
  | { type: "PROGRESS"; name: string; progress: Progress }
  | { type: "SUCCEEDED"; name: string; result: DownloadResult }
  | { type: "FAILED"; name: string; error: string };

/**
 * Pure reducer over the files view's state. `ENQUEUE` is a no-op if `name`
 * is already in the queue — the caller (`DeviceFiles.tsx`) is responsible
 * for not starting a second concurrent download (one at a time, SPEC
 * §24.17's "strictly one at a time" carried into wave 2); this reducer only
 * guards against a duplicate queue entry, not against two "downloading"
 * items existing at once, since it never calls IPC itself.
 */
export function downloadReducer(state: FilesState, action: FilesAction): FilesState {
  switch (action.type) {
    case "FILES_LOADED":
      return { ...state, files: action.files };
    case "ENQUEUE": {
      if (state.queue.some((item) => item.name === action.name)) return state;
      const item: DownloadItem = {
        name: action.name,
        status: "queued",
        doneBytes: 0,
        totalBytes: null,
        sha256: null,
        path: null,
        error: null,
      };
      return { ...state, queue: [...state.queue, item] };
    }
    case "PROGRESS":
      return {
        ...state,
        queue: state.queue.map((item) =>
          item.name === action.name
            ? { ...item, status: "downloading", doneBytes: action.progress.done, totalBytes: action.progress.total }
            : item
        ),
      };
    case "SUCCEEDED":
      return {
        ...state,
        queue: state.queue.map((item) =>
          item.name === action.name
            ? {
                ...item,
                status: "done",
                doneBytes: action.result.size_bytes,
                totalBytes: action.result.size_bytes,
                sha256: action.result.sha256,
                path: action.result.path,
              }
            : item
        ),
      };
    case "FAILED":
      return {
        ...state,
        queue: state.queue.map((item) => (item.name === action.name ? { ...item, status: "failed", error: action.error } : item)),
      };
    default:
      return state;
  }
}

/** `true` when some queue entry is actively transferring — the signal
 *  `DeviceFiles.tsx` uses to disable starting a second download (one at a
 *  time, SPEC §24.17). */
export function isDownloadActive(queue: DownloadItem[]): boolean {
  return queue.some((item) => item.status === "queued" || item.status === "downloading");
}

/**
 * Formats a transfer rate in KB/s from bytes moved over an elapsed span.
 * `elapsedMs <= 0` reads as `"—"`, never a divide-by-zero `Infinity` — a
 * download's first progress tick can arrive at essentially zero elapsed
 * time.
 */
export function formatTransferRate(doneBytes: number, elapsedMs: number): string {
  if (elapsedMs <= 0) return "—";
  const bytesPerSec = doneBytes / (elapsedMs / 1000);
  return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
}
