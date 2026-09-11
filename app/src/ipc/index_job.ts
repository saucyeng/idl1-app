import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { IpcError } from "./workbook";

/** Which half of one session's indexing is running (C3 §3.2). */
export type IndexPhase = "tracks" | "laps";

/** `index_progress`'s payload (C3 §3.2) — one observation as a session
 *  enters a phase. `done` counts sessions *finished* before this one, so
 *  `done + 1` is the one being worked on. */
export interface IndexProgressEvent {
  done: number;
  total: number;
  current_session_id: string;
  phase: IndexPhase;
}

/** A finished index run's counts (C3 §3.2). */
export interface IndexRunSummary {
  indexed: number;
  skipped_up_to_date: number;
  failed: number;
  cancelled: boolean;
}

/** `index_status()`'s return (C3 §3.2): what the chip shows, whether or not
 *  the frontend was mounted when the job started. */
export interface IndexStatus {
  running: boolean;
  done: number;
  total: number;
  current_session_id: string | null;
  phase: IndexPhase | null;
  last_run: IndexRunSummary | null;
  /** Why the last run could not start at all, `null` when it started. A
   *  background job has no promise to reject, so this is the only place a
   *  broken data root surfaces. */
  last_error: IpcError | null;
}

/** Starts the library-wide lap/track index in the background (C3 §3.2).
 *  Resolves as soon as the job is started — never when it finishes — with
 *  `false` when a run was already in flight. Safe to call on every launch:
 *  a library whose index is current finishes in milliseconds.
 *
 *  Never rejects. The job outlives this call, so a failure it hits later
 *  has no promise left to reject; read {@link IndexStatus.last_error}. */
export async function startIndexJob(): Promise<boolean> {
  return invoke<boolean>("start_index_job");
}

/** The index job's current state (C3 §3.2). Read once on mount so a chip
 *  that appears mid-run shows the run already in progress. */
export async function indexStatus(): Promise<IndexStatus> {
  return invoke<IndexStatus>("index_status");
}

/** Asks the running index job to stop after the session in flight (C3
 *  §3.2). Every session already indexed stays indexed; the next run resumes
 *  from what is left. Resolves with whether a run was actually stopped. */
export async function cancelIndexJob(): Promise<boolean> {
  return invoke<boolean>("cancel_index_job");
}

/** Subscribes to `index_progress` (C3 §3.2). Resolves with an unlisten
 *  function; call it on unmount. */
export async function onIndexProgress(
  handler: (event: IndexProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<IndexProgressEvent>("index_progress", (event) => handler(event.payload));
}
