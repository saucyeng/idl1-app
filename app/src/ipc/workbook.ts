import { Channel, invoke } from "@tauri-apps/api/core";

import { decodeHostChannel, type DecodedHostChannel } from "./hostChannel";

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

/** One `${…}` inline span (C2 §5.2) inside a cell's rendered prose HTML
 *  (`CellOutput.prose_before_html`/`prose_after_html`), added post-sign
 *  (2026-09-05, ledger R70) so a consumer can fill each
 *  `<span data-span-id="…"></span>` placeholder without its own `${…}` scan
 *  of the raw prose text. */
export interface ProseSpan {
  /** Matches a `prose_before_html`/`prose_after_html` placeholder's
   *  `data-span-id` attribute exactly, e.g. `"{cell_id}-before:0"`. */
  id: string;
  /** The JavaScript expression text between `${` and `}`, verbatim (C2 §5.2). */
  expr: string;
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
  /** Rendered HTML of this cell's `prose_before` (C2 §2.4), added post-sign
   *  (2026-09-05, ledger R70) — `null` when this cell has no `prose_before`.
   *  `${…}` spans appear as `<span data-span-id="{id}"></span>` placeholders
   *  (see `prose_spans`) for the sandbox to fill; raw HTML the author typed
   *  is escaped, never passed through (R69's sandbox security boundary). */
  prose_before_html: string | null;
  /** Same as `prose_before_html`, for `prose_after` — non-`null` only on the
   *  last cell in the document (C2 §2.4). */
  prose_after_html: string | null;
  /** Every `${…}` span across `prose_before_html` then `prose_after_html`,
   *  in document order (ledger R70). */
  prose_spans: ProseSpan[];
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
  /** sha256 of the file's bytes after this change, hex — equals
   *  `SaveResult.hash` when this event reflects the app's own successful
   *  save (added post-sign, 2026-09-05, ledger R67). */
  hash: string;
}

/** `read_workbook`'s return (C3 §3.4, ledger R59): the file's raw text and
 *  hash, without parsing — a document whose front matter is malformed
 *  enough for `openWorkbook` to reject it must still be readable here, so
 *  it can be repaired in the editor. */
export interface WorkbookSource {
  /** The file's UTF-8 text, verbatim. */
  markdown: string;
  /** sha256 of `markdown`'s bytes, hex — the `basedOnHash` a later
   *  `saveWorkbook` call passes. */
  hash: string;
  /** Absolute path, under `<data>/workbooks/`. */
  path: string;
}

/** C3 §3.4 `LapContext` (ledger R52 Q5/R59, R64.1): a per-call UI
 *  selection, not a property of the file — passed unchanged from
 *  `state/AppState.tsx`'s `selection.lapContext`. 1-based lap numbers,
 *  matching `LapSummary.lap_number`. `overlayLaps` names laps of the same
 *  recorded session only in wave 2 (R64.1). */
export interface LapContext {
  /** `null` designates no main lap. */
  main_lap: number | null;
  overlay_laps: number[];
}

/** One `list_math_builtins` catalog row (C3 §3.4, ledger R64.2). */
export interface MathBuiltinDto {
  name: string;
  /** Valid argument counts for `name` — more than one entry when the
   *  builtin documents more than one call form. */
  arity: number[];
  status: "implemented" | "not_implemented";
}

/** Opens a workbook by id or path (C3 §3.4). */
export async function openWorkbook(idOrPath: string): Promise<WorkbookHandle> {
  return invoke<WorkbookHandle>("open_workbook", { idOrPath });
}

/** Reads a workbook's raw text and hash, without parsing (C3 §3.4, ledger
 *  R59) — closes the gap that made `saveWorkbook` unusable as specified:
 *  nothing else lets the editor read the file it is about to save
 *  `basedOnHash` against. Deliberately does not raise the document-fatal
 *  `workbook_*` kinds `openWorkbook` does. */
export async function readWorkbook(idOrPath: string): Promise<WorkbookSource> {
  return invoke<WorkbookSource>("read_workbook", { idOrPath });
}

/** Mints a new, minimal valid v3 workbook named `name` (C3 §3.4, ledger
 *  R59). The file name derives from `name`, filesystem-sanitised — a
 *  `file_name` collision appends `-2`, `-3`, … rather than erroring. */
export async function createWorkbook(name: string): Promise<WorkbookHandle> {
  return invoke<WorkbookHandle>("create_workbook", { name });
}

/** Evaluates every cell in document order (C3 §3.4). Runs on cell content
 *  change (debounced by the editor), on a `watchWorkbook` file-change event,
 *  and once on workbook open — never per animation frame (C3 §4).
 *  `sessionId` added post-sign (ledger R41): `null` means no session is
 *  bound — every `[Channel]` reference then surfaces as a per-cell
 *  `math_unknown_channel` rather than rejecting the whole command.
 *  `lapContext` added post-sign (ledger R59, R64.1): `null` reproduces
 *  today's behaviour exactly (`MathLapContext::empty()`) — pass
 *  `state/AppState.tsx`'s `selection.lapContext`, mapped to this module's
 *  `LapContext` wire shape. A `lapContext` naming a lap that does not exist
 *  in `sessionId`'s `session.json` `laps[]` rejects with `invalid_argument`
 *  (detail `{ lap }`, C3 §3.4) — lap indexing at import landed (R83), so a
 *  real lap number now succeeds. */
export async function evalWorkbook(
  id: string,
  sessionId: string | null,
  lapContext: LapContext | null = null
): Promise<CellOutput[]> {
  return invoke<CellOutput[]>("eval_workbook", { id, sessionId, lapContext });
}

/** A decoded `fetch_host_channel` result (C3 §3.4): the binary counterpart
 *  to `evalWorkbook`'s `HostChannelRef` marker — the definition's actual
 *  decimated sample data. */
export type HostChannel = DecodedHostChannel;

/** Evaluates the named `math` definition and fetches its sample data,
 *  decimated to `budget` points (C3 §3.4, ledger R59). `budget`: max
 *  points, `1..=65536`. Settle-bound only (C3 §4) — never a hover/pan/zoom
 *  handler; decimation to the caller's own tile/chart budget happens
 *  server-side before any byte is produced. */
export async function fetchHostChannel(
  workbookId: string,
  sessionId: string | null,
  defName: string,
  budget: number
): Promise<HostChannel> {
  const buf = await invoke<ArrayBuffer>("fetch_host_channel", { workbookId, sessionId, defName, budget });
  return decodeHostChannel(buf);
}

/** Lists every math builtin the engine implements (C3 §3.4, ledger R64.2) —
 *  a thin catalog dump for the notebook editor's function reference to
 *  verify itself against at startup. Never rejects. */
export async function listMathBuiltins(): Promise<MathBuiltinDto[]> {
  return invoke<MathBuiltinDto[]>("list_math_builtins");
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
