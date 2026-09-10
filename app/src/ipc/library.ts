import { Channel, invoke } from "@tauri-apps/api/core";

import type { SessionDetail } from "./catalog";
import type { Progress } from "./import";

/** One file `scanFolder` found directly inside the scanned folder
 *  (C3 §3.3, ruling R191). Nothing is imported by the scan itself — the
 *  panel enqueues `importFile` per chosen row, so progress and errors stay
 *  per file. */
export interface ScanEntry {
  /** Absolute path — the value handed back to `importFile`. */
  path: string;
  /** The file's own name, including extension. */
  file_name: string;
  /** u64 */
  size_bytes: number;
  /** Importer id by extension (`listImporters`' vocabulary), or `null` when
   *  no importer covers this file. */
  importer_id: string | null;
  /** `true` when this file's sha256 is already a blob in `<data>/blobs` —
   *  importing it again would be a no-op. */
  already_imported: boolean;
  /** i64 UTC ms from a header peek where the format offers one (`0` =
   *  the header carries no clock value); `null` when there is no peek. */
  session_start_utc_ms: number | null;
}

/** One catalogued session whose `data.parquet` was written by a different
 *  importer version than the running build (C3 §3.3). Versions are SemVer
 *  strings (ruling R194 item 3). */
export interface StaleSession {
  session_id: string;
  importer_id: string;
  /** e.g. "0.1.0" — what is stamped on the session's `data.parquet`. */
  stored_version: string;
  /** The running build's constant for `importer_id`. */
  current_version: string;
}

/** One session `reimportSessions` could not rebuild (C3 §3.3). Its old
 *  `data.parquet` is untouched — a failed rebuild is never half-applied. */
export interface ReimportFailure {
  session_id: string;
  /** The C3 §2 error shape; route on `kind`, never on `message`. */
  error: unknown;
}

/** `reimportSessions`' return (C3 §3.3). */
export interface ReimportReport {
  /** Session ids rebuilt from their blob with the current importer. */
  rebuilt: string[];
  failed: ReimportFailure[];
}

/** One file sitting in `<data>/inbox/failed/` (C3 §3.3). Never retried
 *  automatically (ruling R191). */
export interface InboxFailure {
  file_name: string;
  /** The C3 §2 error shape recorded when the import failed. */
  error: unknown;
}

/** `inboxStatus`' return (C3 §3.3). Desktop only — the command rejects
 *  with `unsupported_platform` on mobile. */
export interface InboxStatus {
  /** `<data>/inbox` (C4 §2). */
  path: string;
  /** u32 — files imported from the inbox since the app launched. */
  imported_since_launch: number;
  failed: InboxFailure[];
}

/** Writes a user-supplied wall-clock start for a session whose importer
 *  could not determine one (C3 §3.3, C1 §3.1/§6, ruling R194). Stored in
 *  `session.json` with `timestamp_source: "user"`; `data.parquet` is never
 *  touched, because it is a function of (blob, importer version) and never
 *  of a human. Resolves with the re-read `SessionDetail`, so the caller
 *  redraws from what was written rather than an echo. Explicit user action,
 *  never a hot path. */
export async function setSessionStart(sessionId: string, timestampUtcMs: number): Promise<SessionDetail> {
  return invoke<SessionDetail>("set_session_start", { sessionId, timestampUtcMs });
}

/** Lists importable files directly inside `path` (C3 §3.3, non-recursive).
 *  Hashes each file to answer `already_imported`, so it is allowed to be
 *  slow on a folder of large files — call it once per picker use, never on
 *  a timer (ruling R191). Desktop only. */
export async function scanFolder(path: string): Promise<ScanEntry[]> {
  return invoke<ScanEntry[]>("scan_folder", { path });
}

/** Every catalogued session whose stored `importer_version` differs from
 *  the running build's constant (C3 §3.3). Cheap — one catalog query. */
export async function listStaleSessions(): Promise<StaleSession[]> {
  return invoke<StaleSession[]>("list_stale_sessions");
}

/** Rebuilds each session's `data.parquet` from its blob with the current
 *  importer, keeping every human-owned `session.json` field and dropping
 *  `derived/` (C3 §3.3). Streams `Progress` with `phase: "sessions"` and
 *  `done` counting sessions. Per-session failures come back in the report;
 *  the call itself only rejects on `internal`. */
export async function reimportSessions(
  sessionIds: string[],
  onProgress: (p: Progress) => void
): Promise<ReimportReport> {
  const progress = new Channel<Progress>();
  progress.onmessage = onProgress;
  return invoke<ReimportReport>("reimport_sessions", { sessionIds, progress });
}

/** The inbox folder, how many files it has imported since launch, and
 *  what is sitting in `inbox/failed/` (C3 §3.3). Rejects with
 *  `unsupported_platform` on mobile, where the inbox does not exist. */
export async function inboxStatus(): Promise<InboxStatus> {
  return invoke<InboxStatus>("inbox_status");
}
