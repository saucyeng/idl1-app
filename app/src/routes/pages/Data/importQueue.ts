import type { SessionSummary } from "../../../ipc/catalog";
import type { Progress } from "../../../ipc/import";
import { describeIpcError } from "./errors";

/** One file queued or in flight through `import_file` (C3 §3.3). `error` and
 *  `sessionId` are only ever set once the item reaches a terminal status
 *  (`"failed"` / `"done"` respectively). */
export interface ImportItem {
  /** Absolute path as given by the picker seam (`FilePicker.ts`'s
   *  `pickImportFile` in wave 2). */
  path: string;
  /** Forced importer id (`ImporterInfo.id`), or `null` for extension-based
   *  auto-detection (C3 §3.3). */
  importerId: string | null;
  /** Short machine-readable phase name from the last `Progress` message, or
   *  a queue-lifecycle marker (`"queued"`, `"done"`, `"failed"`) before the
   *  first message arrives or after the item finishes. */
  phase: string;
  /** Units completed so far, same meaning as `Progress.done` — frozen at
   *  its last value once the item reaches `"done"` or `"failed"`. */
  done: number;
  /** Units expected in total, or `null` when not known — same meaning as
   *  `Progress.total`. */
  total: number | null;
  /** Queue lifecycle: `"queued"` (enqueued, not yet started) → `"running"`
   *  (the one item `importFile` is currently processing, R13: never more
   *  than one) → `"done"` | `"failed"` (terminal). */
  status: "queued" | "running" | "done" | "failed";
  /** User-facing text from `describeIpcError`, set only when `status` is
   *  `"failed"`. */
  error?: string;
  /** The new session's id, set only when `status` is `"done"`. */
  sessionId?: string;
}

/** The import panel's whole queue. A flat array in enqueue order; the
 *  panel drives at most one `"running"` item at a time (R13: this machine
 *  is memory-bound, import is CPU/I/O-heavy). */
export interface ImportQueueState {
  items: ImportItem[];
}

/** An empty queue — the import panel's state at first render. */
export const initialImportQueueState: ImportQueueState = { items: [] };

/** State-changing gestures the import panel and its driving effect
 *  dispatch. Items are addressed by array index rather than path: the
 *  driving effect always knows the exact index of the item it is acting on
 *  (it started that item itself), and index addressing stays correct even
 *  if the same path is enqueued twice. */
export type ImportQueueAction =
  | { type: "ENQUEUE"; path: string; importerId: string | null }
  | { type: "START"; index: number }
  | { type: "PROGRESS"; index: number; progress: Progress }
  | { type: "SUCCEEDED"; index: number; session: SessionSummary }
  | { type: "FAILED"; index: number; error: unknown }
  | { type: "DISMISS"; index: number };

/** Pure reducer over [[ImportQueueState]]. Never calls `importFile` itself —
 *  that side effect lives in `ImportPanel.tsx`'s driving effect, which
 *  dispatches `START`/`PROGRESS`/`SUCCEEDED`/`FAILED` around each call. */
export function importQueueReducer(state: ImportQueueState, action: ImportQueueAction): ImportQueueState {
  switch (action.type) {
    case "ENQUEUE": {
      const item: ImportItem = {
        path: action.path,
        importerId: action.importerId,
        phase: "queued",
        done: 0,
        total: null,
        status: "queued",
      };
      return { items: [...state.items, item] };
    }
    case "START":
      return { items: mapAt(state.items, action.index, (item) => ({ ...item, status: "running", phase: "starting" })) };
    case "PROGRESS":
      return {
        items: mapAt(state.items, action.index, (item) => {
          // A late message for an item that already reached a terminal
          // status is a race (the `importFile` promise settled before this
          // message's microtask ran) — ignored, not applied.
          if (item.status !== "running") return item;
          return { ...item, phase: action.progress.phase, done: action.progress.done, total: action.progress.total };
        }),
      };
    case "SUCCEEDED":
      return {
        items: mapAt(state.items, action.index, (item) => ({
          ...item,
          status: "done",
          phase: "done",
          done: item.total ?? item.done,
          sessionId: action.session.session_id,
        })),
      };
    case "FAILED": {
      const described = describeIpcError(action.error);
      return {
        items: mapAt(state.items, action.index, (item) => ({
          ...item,
          status: "failed",
          phase: "failed",
          error: described.text,
        })),
      };
    }
    case "DISMISS":
      return {
        items: state.items.filter((item, i) => {
          if (i !== action.index) return true;
          // Refused for "queued"/"running" — nothing to dismiss until the
          // item reaches a terminal status.
          return item.status !== "done" && item.status !== "failed";
        }),
      };
  }
}

/** Applies `fn` to the item at `index`, leaving every other item untouched
 *  by reference (so unrelated rows never re-render). */
function mapAt(items: ImportItem[], index: number, fn: (item: ImportItem) => ImportItem): ImportItem[] {
  return items.map((item, i) => (i === index ? fn(item) : item));
}

/** This item's share of overall queue progress, `0`–`1`, or `null` when a
 *  `"running"` item's `total` isn't known yet. Queued items count as `0`,
 *  terminal items ( `"done"` / `"failed"`) count as `1` — each item counts
 *  equally regardless of its own byte/record size. */
function itemFraction(item: ImportItem): number | null {
  switch (item.status) {
    case "queued":
      return 0;
    case "done":
    case "failed":
      return 1;
    case "running":
      if (item.total === null) return null;
      if (item.total === 0) return 1;
      return item.done / item.total;
  }
}

/** Overall queue progress as a percentage (`0`–`100`), averaged equally
 *  across every item so the bar reflects the whole queue rather than just
 *  the currently running file. `null` when any `"running"` item's `total`
 *  is unknown (C3 §1 allows an unknown total; a fake percentage is worse
 *  than none) or the queue is empty. */
export function overallPercent(state: ImportQueueState): number | null {
  if (state.items.length === 0) return null;

  let sum = 0;
  for (const item of state.items) {
    const fraction = itemFraction(item);
    if (fraction === null) return null;
    sum += fraction;
  }

  return (sum / state.items.length) * 100;
}
