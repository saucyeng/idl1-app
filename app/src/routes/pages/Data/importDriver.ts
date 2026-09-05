import type { ImportOutcome, Progress } from "../../../ipc/import";
import type { ImportItem, ImportQueueAction, ImportQueueState } from "./importQueue";

/** Structurally matches `ipc/import.ts`'s `importFile` — injected so
 *  [[runImport]] is unit-testable without a real Tauri IPC round-trip. */
export type ImportFileFn = (
  path: string,
  importerId: string | null,
  onProgress: (p: Progress) => void,
) => Promise<ImportOutcome>;

/** The next item the driving effect should start, or `null` when either an
 *  item is already `"running"` (R13: never more than one at a time) or
 *  nothing is `"queued"`. Pure — a plain function of `state`, so the
 *  driving effect can call it on every render without needing to track
 *  "did the thing I'm babysitting change identity" itself (review-task5
 *  Critical: the previous effect tied its own cancellation to `state.items`
 *  identity, which its own dispatches changed on every message). */
export function nextItemToStart(state: ImportQueueState): ImportItem | null {
  if (state.items.some((item) => item.status === "running")) return null;
  return state.items.find((item) => item.status === "queued") ?? null;
}

/** `true` once every item in a non-empty queue has reached a terminal
 *  status (`"done"`/`"failed"`) — the driving effect's "fire `onImported`"
 *  condition. `false` for an empty queue (nothing has drained). */
export function isDrained(state: ImportQueueState): boolean {
  return state.items.length > 0 && state.items.every((item) => item.status === "done" || item.status === "failed");
}

/** Runs `item` through `importFile`, dispatching `START` immediately, then
 *  zero or more `PROGRESS` and exactly one of `SUCCEEDED`/`FAILED` — every
 *  dispatch addressed by `item.id`, which stays valid even if a later
 *  `DISMISS` shrinks `ImportQueueState.items` around it (review-task5
 *  Important). Installs no cancellation flag: the caller (`ImportPanel.tsx`'s
 *  driving effect) calls this once per item and lets the returned promise
 *  chain run to completion regardless of how many times the effect itself
 *  re-runs in the meantime — tying cancellation to a dependency the
 *  callbacks below themselves change (the queue state) was the Critical bug
 *  this replaces, since it tore down every in-flight import before its real
 *  IPC round-trip could resolve. `mapById` (`importQueue.ts`) already no-ops
 *  safely if `item.id` is ever dismissed out from under a running import. */
export function runImport(item: ImportItem, importFile: ImportFileFn, dispatch: (action: ImportQueueAction) => void): void {
  dispatch({ type: "START", id: item.id });

  importFile(item.path, item.importerId, (progress) => {
    dispatch({ type: "PROGRESS", id: item.id, progress });
  })
    .then((outcome) => {
      dispatch({ type: "SUCCEEDED", id: item.id, outcome });
    })
    .catch((error: unknown) => {
      dispatch({ type: "FAILED", id: item.id, error });
    });
}
