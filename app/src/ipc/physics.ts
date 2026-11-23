import { Channel, invoke } from "@tauri-apps/api/core";

import type { Progress } from "./import";

/** `solve_physics`'s result (C3 §3.16). */
export interface SolveSummary {
  session_id: string;
  /** Seconds of riding solved, s. */
  solved_s: number;
  /** Solve windows planned. */
  windows: number;
  /** Of those, how many failed (their stretch stays unsolved). */
  failed_windows: number;
  /** Median front travel over the solved samples, mm. */
  front_median_mm: number;
  /** Median rear travel over the solved samples, mm. */
  rear_median_mm: number;
  /** This solve also fitted the bike's geometry (a first solve). */
  fitted_geometry: boolean;
  /** Wall time, s. */
  seconds: number;
}

/**
 * C3 §3.16 `solve_physics`: the physics solver over `fromUs`..`toUs` (µs
 * since the ride's first sample). `onProgress` hears phase `"solving"`,
 * `done` of `total` windows. Rejects with `conflict` while another solve
 * runs, and with `detail.cancelled: true` after `cancelSolvePhysics`.
 */
export async function solvePhysics(sessionId: string, fromUs: number, toUs: number, onProgress: (p: Progress) => void): Promise<SolveSummary> {
  const progress = new Channel<Progress>();
  progress.onmessage = onProgress;
  return invoke<SolveSummary>("solve_physics", { sessionId, fromUs: Math.floor(fromUs), toUs: Math.ceil(toUs), progress });
}

/** C3 §3.16 `cancel_solve_physics`: stops the running solve; `true` when one was running. */
export async function cancelSolvePhysics(): Promise<boolean> {
  return invoke<boolean>("cancel_solve_physics");
}

/** Whether a rejection from {@link solvePhysics} was a cancel, not a failure. */
export function isSolveCancelled(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const detail = (error as { detail?: unknown }).detail;
  return typeof detail === "object" && detail !== null && (detail as { cancelled?: unknown }).cancelled === true;
}

/** C3 §3.16 `physics_coverage`: the stretches of `sessionId` the solver has covered, `[startUs, endUs]` since its first sample. */
export async function physicsCoverage(sessionId: string): Promise<[number, number][]> {
  return invoke<[number, number][]>("physics_coverage", { sessionId });
}
