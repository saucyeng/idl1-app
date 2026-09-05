import { Channel, invoke } from "@tauri-apps/api/core";

/** One JSON error crossing every fallible command (C3 §2). `detail`'s shape
 *  depends on `kind`; absent when there is nothing structured to add. Kept
 *  local here (rather than a shared module) because `CellOutput.errors` and
 *  `CellDefResult.error` are the only places in `app/src/ipc/` a command's
 *  success payload nests an `IpcError` — everywhere else it only ever
 *  surfaces as a rejected `Promise`, which callers catch without needing the
 *  type by name. */
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

/** The light wire marker for a `HostChannel` (C3 §3.4, ledger R22/R45): the
 *  full `{length, t, v}` shape stays in-process (core) — the sample bytes
 *  cross via a binary command deferred to wave 2 (L5/L6, ledger R45). */
export interface HostChannelRef {
  /** u32 */
  length: number;
  has_t: boolean;
}

/** One `math`-cell definition's evaluated result (C3 §3.4, ledger R21) — one
 *  entry per definition, in `def_line` source order; empty for `table`/`js`
 *  cells. */
export interface CellDefResult {
  name: string;
  label: string | null;
  /** `null` on failure — see `error` (ledger R22). */
  value: HostChannelRef | null;
  /** `math_*` kind only — a structural problem on this definition keeps it
   *  out of `defs` entirely and is reported, if anywhere, on the cell's own
   *  `errors` instead (ledger R22). */
  error: IpcError | null;
}

/** One cell's evaluation result (C3 §3.4). A per-cell failure never rejects
 *  `evalWorkbook` — it appears in `errors` (or a specific `defs[i].error`);
 *  other cells still evaluate. */
export interface CellOutput {
  /** C2 fence-string id */
  cell_id: string;
  /** "prose" removed (ledger R21) — prose has no fence id and never gets its
   *  own `CellOutput` entry. */
  kind: "math" | "table" | "js";
  /** present when evaluation succeeded; `null` for `math`/`js` (their
   *  results live in `defs`); `{ model, results }` for a successfully
   *  evaluated `table` cell (ledger R21). */
  value: unknown | null;
  /** math cells only: one entry per definition; empty for `table`/`js`
   *  cells (ledger R21). */
  defs: CellDefResult[];
  /** plural, always present, `[]` on success (ledger R22) */
  errors: IpcError[];
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
 *  and once on workbook open — never per animation frame (C3 §4).
 *  `sessionId` added post-sign (ledger R41): `null` means no session is
 *  bound — every `[Channel]` reference then surfaces as a per-cell
 *  `math_unknown_channel` rather than rejecting the whole command. */
export async function evalWorkbook(id: string, sessionId: string | null): Promise<CellOutput[]> {
  return invoke<CellOutput[]>("eval_workbook", { id, sessionId });
}

/** Saves `markdown` as the workbook's new content (C3 §3.4). Explicit save
 *  action. `basedOnHash` added post-sign (ledger R44): `null` means
 *  "creating a new workbook" (the target must not already exist); a
 *  non-null value is the hash the editor last read. A stale hash rejects
 *  with the `conflict` kind (C3 §2), not `invalid_argument` — the caller
 *  must present that differently ("this file changed elsewhere — reload?"),
 *  not as a plain error toast. */
export async function saveWorkbook(id: string, markdown: string, basedOnHash: string | null): Promise<SaveResult> {
  return invoke<SaveResult>("save_workbook", { id, markdown, basedOnHash });
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
