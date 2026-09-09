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

/** The unit as it crosses IPC (C2 §3.3.1's unit model, rulings R154/R162),
 *  mirroring `idl_rs::math::units::UnitLabel` (via its `idl-rs-tauri` mirror,
 *  `rust/tauri/src/commands/workbook.rs`) exactly — `#[serde(tag = "state",
 *  rename_all = "snake_case")]` on the Rust side, so this is a discriminated
 *  union keyed by `state`, never `unit: string | null` (R154: `null` cannot
 *  mean both "not applicable" and "we could not work it out" — the
 *  three-state model exists specifically to keep those apart). */
export type UnitLabel =
  | { state: "known"; text: string }
  | { state: "dimensionless" }
  | { state: "unknown"; reason: string };

/** One non-fatal unit diagnostic (R154 §2.1) — most often a `+`/`-`
 *  mismatch between two `Known` operands, or a declared `# unit:`
 *  annotation disagreeing with the inferred one (R164 item 1). Never an
 *  evaluation failure — the definition's own `value` is unaffected.
 *  Mirrors `idl_rs::math::units::UnitNote` via its `UnitNote` IPC mirror. */
export interface UnitNote {
  /** Display-ready English, e.g. "`+`: units differ (`bpm` and `km/h`)". */
  message: string;
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
  /** Hz, or `null` when a rate is genuinely **not applicable** — a scalar
   *  reduction has no sample rate. Never "unknown": ruling R152 split this
   *  from the unit. Do not infer a unit from a name. */
  sample_rate_hz: number | null;
  /** This definition's inferred unit (R144/R152/R154, ruling R162) —
   *  independent of `value`/`error`: a definition can carry a determined
   *  unit even when its own evaluation failed. */
  unit: UnitLabel;
  /** Non-fatal unit diagnostics for this definition (R154 §2.1). `[]` in
   *  the overwhelming majority of cases. */
  unit_notes: UnitNote[];
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

/** One retired math-builtin name a migration rewrote (C2 §3.8, ledger
 *  R151 item 9/10) — `SaveResult.migrations` and `WorkbookSource.
 *  pending_migrations`'s element shape, mirroring `idl_rs::math::
 *  DocumentRename` (`rust/tauri/src/commands/workbook.rs`'s
 *  `RenamedFunction`). */
export interface RenamedFunction {
  /** The `math`/`table` cell this rename occurred in. */
  cell_id: string;
  /** u32, the 0-based line within `cell_id` the call was found on. */
  line: number;
  /** The retired spelling, as it appeared in the document. */
  old: string;
  /** What it was (or would be) rewritten to. */
  new: string;
}

/** `save_workbook`'s return (C3 §3.4). */
export interface SaveResult {
  /** sha256 of the written bytes, hex */
  hash: string;
  /** i64 */
  saved_utc_ms: number;
  /** Retired function names this save rewrote to their current spelling
   *  (R151 item 9, C2 §3.8) — `[]` when the document carried none. The
   *  bytes hashed into `hash` above are the migrated markdown, never the
   *  caller's original text with a retired name still in it. */
  migrations: RenamedFunction[];
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
  /** Retired function names this file would be rewritten to on the next
   *  save (R151 item 9's passive on-open notice) — `[]` when `markdown`
   *  carries none, including every `version: 4` document. Read-only:
   *  nothing has been written, and this list plays no part in `hash`
   *  (`markdown` above is unmigrated). */
  pending_migrations: RenamedFunction[];
}

/** C1 §6.1's `Span` (ruling R117): the span a `Window` covers within one
 *  session, `snake_case` on the wire. `t0_us`/`t1_us` on a `"range"` span
 *  are session-relative microseconds from that session's first sample —
 *  the same axis as `Channel.t_us` — never epoch time. */
export type Span =
  | { kind: "session" }
  | { kind: "lap"; lap_number: number }
  | { kind: "range"; t0_us: number; t1_us: number };

/** C1 §6.1's `Window` (ruling R117): one selected span of one session, with
 *  its display colour. `colour` is a `--chart-1` … `--chart-8` token name,
 *  never a hex literal — resolved through `Notebook/theme/series.ts`'s
 *  `seriesColor`. The wire counterpart of `state/selection.ts`'s
 *  `SelectionWindow`; a caller maps `sessionId`→`session_id`,
 *  `lapNumber`→`lap_number`, `t0Us`/`t1Us`→`t0_us`/`t1_us`. */
export interface Window {
  session_id: string;
  span: Span;
  colour: string;
}

/** One `list_math_builtins` catalog row (C3 §3.4, ledger R64.2). */
export interface MathBuiltinDto {
  name: string;
  /** Valid argument counts for `name` — more than one entry when the
   *  builtin documents more than one call form. */
  arity: number[];
  status: "implemented" | "not_implemented";
  /** Retired names that now migrate to this one (C2 §3.8), e.g.
   *  `["variance_time"]` for `lap_delta_time` — `[]` for every function
   *  nothing was ever renamed from (ledger R157, scipy-alignment lane). */
  renamed_from: string[];
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

/** `eval_workbook_v2`'s per-window result (C3 §3.4, ruling R121): a
 *  discriminated union that must be narrowed before a caller can reach the
 *  outputs, so a failed window's `CellOutput[]` cannot be read by accident
 *  — there is no `ok` key to index into on the `error` branch. Errors are
 *  attributed per window (unresolvable `session_id`, unknown lap, an
 *  out-of-span or degenerate `range`) versus per call (an unknown or
 *  unparseable workbook `id`, which rejects the whole `evalWorkbookV2`
 *  `Promise` instead of appearing here). */
export type WindowEval = { ok: CellOutput[] } | { error: IpcError };

/** Evaluates every cell in document order, once per entry of `windows`, in
 *  order (C3 §3.4, ruling R117 — replaces `evalWorkbook`'s `sessionId` +
 *  `lapContext` pair). Runs on cell content change (debounced by the
 *  editor), on a `watchWorkbook` file-change event, and once on workbook
 *  open — never per animation frame (C3 §4).
 *
 *  `windows: []` evaluates once against no session — byte-identical to the
 *  deprecated `eval_workbook(id, null, null)` "nothing selected" result
 *  (decision 48) — and still resolves a one-element array, so a caller
 *  always has a result to render.
 *
 *  The returned array has exactly one {@link WindowEval} per `windows`
 *  entry, same order: each is that window's `{ ok: CellOutput[] }` or that
 *  window's `{ error: IpcError }` (ruling R121) — siblings still evaluate
 *  when one window's session/lap/range fails to resolve. Only an unknown or
 *  unparseable workbook `id` rejects the whole call. */
export async function evalWorkbookV2(id: string, windows: Window[]): Promise<WindowEval[]> {
  return invoke<WindowEval[]>("eval_workbook_v2", { id, windows });
}

/** A decoded `fetch_host_channel_v2` result (C3 §3.4): the binary
 *  counterpart to `evalWorkbookV2`'s `HostChannelRef` marker — the
 *  definition's actual decimated sample data. */
export type HostChannel = DecodedHostChannel;

/** Evaluates the named `math` definition and fetches its sample data,
 *  decimated to `budget` points (C3 §3.4, ruling R117 — replaces
 *  `fetchHostChannel`'s `sessionId`). `window: null` reproduces the old
 *  session-less behaviour; a non-null `window` closes the gap where the old
 *  command evaluated session-wide even when a lap was selected (ruling R117
 *  item 7), so this always agrees with `evalWorkbookV2` over the same
 *  window. `budget`: max points, `1..=65536`. Settle-bound only (C3 §4) —
 *  never a hover/pan/zoom handler; decimation to the caller's own
 *  tile/chart budget happens server-side before any byte is produced. */
export async function fetchHostChannelV2(
  workbookId: string,
  window: Window | null,
  defName: string,
  budget: number
): Promise<HostChannel> {
  const buf = await invoke<ArrayBuffer>("fetch_host_channel_v2", { workbookId, window, defName, budget });
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
