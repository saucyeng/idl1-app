import type { ImportOutcome, Progress } from "../../../ipc/import";
import { describeIpcError } from "./errors";

/** One file queued or in flight through `import_file` (C3 §3.3). `error` and
 *  `sessionId` are only ever set once the item reaches a terminal status
 *  (`"failed"` / `"done"` respectively). `warnings` is only ever set once
 *  the item reaches `"done"` (R60: the importer's recovered-data warnings
 *  for this one import, never hidden from the user). */
export interface ImportItem {
  /** Stable identity assigned at `ENQUEUE` time (`ImportQueueState.nextId`,
   *  a monotonic counter) — every action addresses an item by this `id`,
   *  never by its position in `items` (review-task5 Important: `DISMISS`
   *  shrinks the array, which would silently misroute or drop an
   *  index-addressed update for whatever item shifted into the dismissed
   *  slot). */
  id: number;
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
  /** Recovered-data warnings from the import (R60), set only when `status`
   *  is `"done"`. Empty when the import had none — the panel still shows
   *  the count honestly rather than omitting the field. */
  warnings?: string[];
}

/** The import panel's whole queue. A flat array in enqueue order; the
 *  panel drives at most one `"running"` item at a time (R13: this machine
 *  is memory-bound, import is CPU/I/O-heavy). `nextId` is the counter that
 *  assigns each new item's stable `id` — carried in state, not a module-
 *  level variable, so the reducer stays pure and two independent panels
 *  (e.g. in tests) never share a counter. */
export interface ImportQueueState {
  items: ImportItem[];
  nextId: number;
}

/** An empty queue — the import panel's state at first render. */
export const initialImportQueueState: ImportQueueState = { items: [], nextId: 0 };

/** State-changing gestures the import panel and its driving effect
 *  (`importDriver.ts`) dispatch. Every action past `ENQUEUE` addresses its
 *  item by the stable `id` `ENQUEUE` assigned, never by array position
 *  (see [[ImportItem.id]]'s doc comment). */
export type ImportQueueAction =
  | { type: "ENQUEUE"; path: string; importerId: string | null }
  | { type: "START"; id: number }
  | { type: "PROGRESS"; id: number; progress: Progress }
  | { type: "SUCCEEDED"; id: number; outcome: ImportOutcome }
  | { type: "FAILED"; id: number; error: unknown }
  | { type: "DISMISS"; id: number };

/** Pure reducer over [[ImportQueueState]]. Never calls `importFile` itself —
 *  that side effect lives in `importDriver.ts`'s `runImport`, called from
 *  `ImportPanel.tsx`'s driving effect, which dispatches
 *  `START`/`PROGRESS`/`SUCCEEDED`/`FAILED` around each call. */
export function importQueueReducer(state: ImportQueueState, action: ImportQueueAction): ImportQueueState {
  switch (action.type) {
    case "ENQUEUE": {
      const item: ImportItem = {
        id: state.nextId,
        path: action.path,
        importerId: action.importerId,
        phase: "queued",
        done: 0,
        total: null,
        status: "queued",
      };
      return { items: [...state.items, item], nextId: state.nextId + 1 };
    }
    case "START":
      return { ...state, items: mapById(state.items, action.id, (item) => ({ ...item, status: "running", phase: "starting" })) };
    case "PROGRESS":
      return {
        ...state,
        items: mapById(state.items, action.id, (item) => {
          // A late message for an item that already reached a terminal
          // status is a race (the `importFile` promise settled before this
          // message's microtask ran) — ignored, not applied.
          if (item.status !== "running") return item;
          return { ...item, phase: action.progress.phase, done: action.progress.done, total: action.progress.total };
        }),
      };
    case "SUCCEEDED":
      return {
        ...state,
        items: mapById(state.items, action.id, (item) => ({
          ...item,
          status: "done",
          phase: "done",
          done: item.total ?? item.done,
          sessionId: action.outcome.session.session_id,
          warnings: action.outcome.warnings,
        })),
      };
    case "FAILED": {
      const described = describeIpcError(action.error);
      return {
        ...state,
        items: mapById(state.items, action.id, (item) => ({
          ...item,
          status: "failed",
          phase: "failed",
          error: described.text,
        })),
      };
    }
    case "DISMISS":
      return {
        ...state,
        items: state.items.filter((item) => {
          if (item.id !== action.id) return true;
          // Refused for "queued"/"running" — nothing to dismiss until the
          // item reaches a terminal status.
          return item.status !== "done" && item.status !== "failed";
        }),
      };
  }
}

/** Applies `fn` to the item whose `id` matches, leaving every other item
 *  untouched by reference (so unrelated rows never re-render). A no-op
 *  (returns `items` structurally unchanged, though as a new array) if `id`
 *  no longer names any item — e.g. a stale dispatch racing a dismiss. */
function mapById(items: ImportItem[], id: number, fn: (item: ImportItem) => ImportItem): ImportItem[] {
  return items.map((item) => (item.id === id ? fn(item) : item));
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
