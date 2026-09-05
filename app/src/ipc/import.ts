import { Channel, invoke } from "@tauri-apps/api/core";
import type { SessionSummary } from "./catalog";

/** Progress payload streamed by long-running commands (C3 §1). */
export interface Progress {
  /** Units completed so far. Meaning is phase-specific: bytes for a file
   *  download, records for an import, cells for a workbook (re)evaluation. */
  done: number;
  /** Units expected in total, or null when not known ahead of time. Same
   *  unit as `done`. */
  total: number | null;
  /** Short machine-readable phase name, e.g. "reading", "decoding",
   *  "indexing". Not localized. */
  phase: string;
}

/** One importer the engine knows how to run (C3 §3.3). */
export interface ImporterInfo {
  /** e.g. "idl0", "fit", "gpx", "csv" */
  id: string;
  /** human-readable, e.g. "IDL0 log" */
  label: string;
  /** e.g. [".idl0"] */
  extensions: string[];
}

/** Resolution of `importFile` (C3 §3.3, amended by R60): the new session's
 *  catalog row plus the importer's recovered warnings (e.g. truncation) for
 *  this one import. `warnings` is per-import state and must never be folded
 *  into `session` — a catalog row (`SessionSummary`) carries no per-import
 *  state (R60 item 1). */
export interface ImportOutcome {
  /** The newly imported session's catalog row (§3.2). */
  session: SessionSummary;
  /** Recovered-data warnings for this import, in no particular order. Empty
   *  when the import had none. Never hidden from the user (CLAUDE.md §5). */
  warnings: string[];
}

/** Imports a file at `path` (C3 §3.3). `importerId` is `null` for
 *  extension-based auto-detection, or one of the ids `listImporters`
 *  returns to force a specific importer. Streams `Progress`
 *  (`phase` e.g. "reading", "decoding", "materializing") then resolves with
 *  the new session's summary and any recovered-data warnings (R60). Explicit
 *  user action on the Data tab, never a hot path (C3 §4). */
export async function importFile(
  path: string,
  importerId: string | null,
  onProgress: (p: Progress) => void
): Promise<ImportOutcome> {
  const progress = new Channel<Progress>();
  progress.onmessage = onProgress;
  return invoke<ImportOutcome>("import_file", { path, importerId, progress });
}

/** Lists every importer the engine can run (C3 §3.3). */
export async function listImporters(): Promise<ImporterInfo[]> {
  return invoke<ImporterInfo[]>("list_importers");
}
