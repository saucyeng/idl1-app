import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { IpcError } from "./workbook";

/** Which step of C4 §5's scan a `rebuild_progress` observation belongs to
 *  (C3 §3.2). */
export type RebuildPhase = "blobs" | "tracks" | "sessions" | "laps" | "workbooks";

/** `rebuild_progress`'s payload (C3 §3.2) — one observation as each entity
 *  in a phase is finished. `done` counts entities *finished*, so `done + 1`
 *  is the one being worked on. */
export interface RebuildProgressEvent {
  done: number;
  total: number;
  phase: RebuildPhase;
  /** `true` on the one observation emitted after the staged database has
   *  swapped in, and on nothing else. `done === total` cannot stand in for
   *  it: every phase ends that way, and the last workbook of the last phase
   *  reaches it before the swap. */
  finished: boolean;
}

/** A finished rebuild's counts (C3 §3.2). `blobs_carried`/`blobs_hashed`
 *  are ruling R219 item 1's incremental step 1: how many blobs came across
 *  from the previous catalog untouched, and how many had to be re-hashed. */
export interface RebuildRunSummary {
  sessions_indexed: number;
  workbooks_indexed: number;
  tracks_indexed: number;
  blobs_carried: number;
  blobs_hashed: number;
  duration_ms: number;
}

/** `rebuild_status()`'s return (C3 §3.2): what the chip shows, whether or
 *  not the frontend was mounted when the rebuild started. */
export interface RebuildStatus {
  running: boolean;
  done: number;
  total: number;
  phase: RebuildPhase | null;
  last_run: RebuildRunSummary | null;
  /** Why the last run failed, `null` when it finished. A background job has
   *  no promise to reject, so this is the only place a broken data root
   *  surfaces. */
  last_error: IpcError | null;
}

/** Starts the incremental catalog rebuild in the background (C3 §3.2).
 *  Resolves as soon as the job is started — never when it finishes — with
 *  `false` when a run was already in flight.
 *
 *  Nothing waits on this (ruling R219 item 3): the staged database swaps in
 *  atomically at the end, so the app keeps reading the old catalog until the
 *  new one lands, and refreshes on the run's completion event.
 *
 *  Never rejects. A failure the run hits later is in
 *  {@link RebuildStatus.last_error}. */
export async function startRebuildJob(): Promise<boolean> {
  return invoke<boolean>("start_rebuild_job");
}

/** The rebuild's current state (C3 §3.2). Read once on mount so a chip that
 *  appears mid-run shows the run already in progress. */
export async function rebuildStatus(): Promise<RebuildStatus> {
  return invoke<RebuildStatus>("rebuild_status");
}

/** Subscribes to `rebuild_progress` (C3 §3.2). Resolves with an unlisten
 *  function; call it on unmount. */
export async function onRebuildProgress(
  handler: (event: RebuildProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<RebuildProgressEvent>("rebuild_progress", (event) => handler(event.payload));
}

/** Resolves when the rebuild that is running *now* finishes, or immediately
 *  when none is running. Never rejects and never itself starts one — a
 *  caller that wants the catalog refreshed calls {@link startRebuildJob}
 *  first and then awaits this **outside** its render path, to know when to
 *  re-list (ruling R219 item 3: the route renders whatever the catalog has
 *  meanwhile).
 *
 *  Implemented on the completion event rather than by polling: the run's
 *  terminal observation is the one carrying `finished`, emitted after the
 *  swap and after the status is updated, so the `last_run` read below is
 *  this run's and not the previous one's. */
export async function whenRebuildFinishes(): Promise<RebuildRunSummary | null> {
  const initial = await rebuildStatus();
  if (!initial.running) return initial.last_run;

  let settle: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    settle = resolve;
  });

  const unlisten = await onRebuildProgress((event) => {
    if (!event.finished) return;
    settle();
  });
  // The run can finish between the status read above and this subscription,
  // in which case its terminal event is already gone: re-check rather than
  // wait forever for an observation that will never come again.
  if (!(await rebuildStatus()).running) settle();

  await finished;
  unlisten();
  return (await rebuildStatus()).last_run;
}
