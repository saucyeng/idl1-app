/**
 * "Solve travel automatically" (Settings › Data, `UiPrefs.auto_solve`,
 * 2026-11-23): runs the physics solver by itself. The engine refuses a
 * second solve while one runs, so every automatic solve goes through one
 * queue, one at a time, and a stretch already solved is skipped.
 */
import { getSession } from "../../../../ipc/catalog";
import { physicsCoverage, solvePhysics } from "../../../../ipc/physics";
import { prefsStore } from "../../Settings/appPrefsStore";
import { coveredFraction, lapSolveSpans, needsSolve } from "./physicsSolve";

let queue: Promise<unknown> = Promise.resolve();

/** Runs `job` after every automatic solve already queued; a failure never stops the queue. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

/** Solves `[startUs, endUs]` of `sessionId` unless it is already ≥ 90 % solved. `true` when it solved. */
export function solveIfNeeded(sessionId: string, startUs: number, endUs: number, onProgress: (done: number, total: number | null) => void = () => {}): Promise<boolean> {
  return enqueue(async () => {
    const spans = await physicsCoverage(sessionId);
    if (!needsSolve(coveredFraction(spans, startUs, endUs))) return false;
    await solvePhysics(sessionId, startUs, endUs, (p) => onProgress(p.done, p.total ?? null));
    return true;
  });
}

/** After a download imports `sessionId`: when the setting is "every lap after a download", queues a solve of each lap (with 5 s either side). Never throws. */
export async function autoSolveAfterImport(sessionId: string): Promise<void> {
  try {
    const prefs = await prefsStore.get();
    if (prefs.ui.auto_solve !== "import") return;
    const detail = await getSession(sessionId);
    for (const [a, b] of lapSolveSpans(detail.laps ?? [])) await solveIfNeeded(sessionId, a, b).catch(() => false);
  } catch {
    // A ride with no bike calibration, or no laps: the Solve button still works by hand.
  }
}

/** Whether the setting is "when I select a lap". */
export async function autoSolveOnSelect(): Promise<boolean> {
  try {
    return (await prefsStore.get()).ui.auto_solve === "lap";
  } catch {
    return false;
  }
}
