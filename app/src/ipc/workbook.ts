import { Channel, invoke } from "@tauri-apps/api/core";

/** One JSON error crossing every fallible command (C3 §2). `detail`'s shape
 *  depends on `kind`; absent when there is nothing structured to add. Kept
 *  local here (rather than a shared module) because `CellOutput.error` is
 *  the only place in `app/src/ipc/` a command's success payload nests an
 *  `IpcError` — everywhere else it only ever surfaces as a rejected
 *  `Promise`, which callers catch without needing the type by name. */
export interface IpcError {
  /** Machine-readable failure class. Frontend code routes on this string,
   *  never on `message` (C3 §2). */
  kind: string;
  /** Human-readable text. No stack traces (CLAUDE.md §5). */
  message: string;
  /** Optional structured detail, shape depends on `kind`. Absent when there
   *  is nothing structured to add. */
  detail?: Record<string, unknown>;
}

/** `open_workbook`'s return (C3 §3.4). */
export interface WorkbookHandle {
  id: string;
  name: string;
  path: string;
  /** u32 */
  cell_count: number;
}

/** One cell's evaluation result (C3 §3.4). A per-cell failure never rejects
 *  `evalWorkbook` — it appears here, in that cell's `error`; other cells
 *  still evaluate. */
export interface CellOutput {
  /** C2 fence-string id */
  cell_id: string;
  kind: "math" | "table" | "js" | "prose";
  /** present when evaluation succeeded; shape depends on `kind` */
  value: unknown | null;
  /** present when this cell failed; other cells still evaluate */
  error: IpcError | null;
}

/** `save_workbook`'s return (C3 §3.4). */
export interface SaveResult {
  /** sha256 of the written bytes, hex */
  hash: string;
  /** i64 */
  saved_utc_ms: number;
}

/** One file-watcher event for a subscribed workbook (C3 §3.4, design §7). */
export interface WorkbookEvent {
  kind: "changed" | "conflict";
  /** cells affected by this event */
  cell_ids: string[];
}

/** Opens a workbook by id or path (C3 §3.4). */
export async function openWorkbook(idOrPath: string): Promise<WorkbookHandle> {
  return invoke<WorkbookHandle>("open_workbook", { idOrPath });
}

/** Evaluates every cell in document order (C3 §3.4). Runs on cell content
 *  change (debounced by the editor), on a `watchWorkbook` file-change event,
 *  and once on workbook open — never per animation frame (C3 §4). */
export async function evalWorkbook(id: string): Promise<CellOutput[]> {
  return invoke<CellOutput[]>("eval_workbook", { id });
}

/** Saves `markdown` as the workbook's new content (C3 §3.4). Explicit save
 *  action. */
export async function saveWorkbook(id: string, markdown: string): Promise<SaveResult> {
  return invoke<SaveResult>("save_workbook", { id, markdown });
}

/** Subscribes to the file watcher (design §7) for one workbook (C3 §3.4).
 *  The returned `Promise` resolves once subscription is established; events
 *  after that arrive via `onEvent` for the life of the subscription
 *  (unsubscribe is closing the channel from the frontend side — not yet
 *  exposed by this wrapper). One-time subscribe, not a hot path. */
export async function watchWorkbook(id: string, onEvent: (e: WorkbookEvent) => void): Promise<void> {
  const channel = new Channel<WorkbookEvent>();
  channel.onmessage = onEvent;
  return invoke<void>("watch_workbook", { id, channel });
}
