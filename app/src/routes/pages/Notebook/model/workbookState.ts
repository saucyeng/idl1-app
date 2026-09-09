/**
 * The pure reducer over a notebook's open/eval/save/watch results (design
 * §6, plan Task 13 Step 1). Owns no I/O — `Notebook/index.tsx` calls
 * `ipc/workbook.ts` and dispatches its results in here.
 *
 * The plan's sketch names one `status` field over the whole state; this
 * refinement narrows it to `markdownStatus`, since evaluation/rendering
 * (via `evalWorkbookV2`, which needs no source text) proceeds independently
 * of whether the document's own markdown/hash could be read — a single
 * whole-state `status` would force "evaluating fine, but markdown
 * unavailable" into one value that doesn't actually describe that
 * combination. `read_workbook` (`ipc/workbook.ts`'s `readWorkbook`) landed
 * for real in L8w — `markdownStatus` no longer has a `"not_implemented"`
 * value, since a read now either succeeds or fails with a real `IpcError`.
 *
 * `editCell`'s `markdown` field (Task 15 addition, out of this file's
 * original brief scope — flagged in that task's report/commit) completes
 * this action's original doc comment, which already anticipated "edited
 * locally" as a dirty-marking source before anything dispatched it: local
 * edits need `state.markdown`/`state.cells` updated the same way a fresh
 * read does, not only a dirty flag, or the editor shell would have nothing
 * to save.
 *
 * **Per-window eval state (S1 Task 11a, ruling R131 Q1).** The flat
 * `outputs: Map<cellId, CellOutput>` + single `evalError: IpcError | null`
 * this file held through Task 10 could not represent R121's own
 * attribution model — "window 2 failed, 1 and 3 succeeded" — and
 * `model/openEvalDriver.ts`'s Task-10 `evalWindowResult`/`evalWindowError`
 * actions had no case here at all, so eval output silently never reached
 * this state on the merged branch (R131's own finding). `windows: Map<key,
 * WindowEvalState>` mirrors `ipc/workbook.ts`'s `WindowEval` wire union
 * exactly: a consumer must narrow `kind` before reading a window's
 * `outputs`, so a failed window's stale/absent data can never be read by
 * accident — the same guarantee the IPC layer already gives, carried
 * through into state with no impedance mismatch.
 */
import type { CellOutput, IpcError, RenamedFunction, Span, Window as SelectedWindow, WorkbookEvent, WorkbookHandle } from "../../../../ipc/workbook";
import { scanCells, type ScannedCell } from "./cells";

/** The document-text slice's own status — independent of whether cells have evaluated. */
export type MarkdownStatus = "loading" | "ready" | "error";

/** One selected window's eval outcome (ruling R131 Q1) — mirrors
 *  `ipc/workbook.ts`'s `WindowEval` field for field, so a `windows` map
 *  entry needs no re-narrowing beyond what `evalWorkbookV2`'s own response
 *  already required.
 *
 * `generation` (decision 59, `runs/2026-09-07/ui/UI-DIRECTION-2.md` §D)
 * carries the {@link WorkbookState.evalRequestGeneration} value in effect
 * when the `runEval`/`runOpenAndEval` call that produced this entry was
 * *started* (`model/openEvalDriver.ts`'s `requestGeneration` parameter),
 * not when it resolved. A window whose stored `generation` is behind the
 * state's current `evalRequestGeneration` is showing a result from before
 * the document's latest edit — {@link isWindowStale} is the one place that
 * comparison is made, so a chart's "is my data stale" question and the
 * state's own bookkeeping can never drift apart (the R133 lesson: one
 * definition of "resolved/stale", not a gate and a separate derivation). */
export type WindowEvalState =
  | { kind: "ok"; outputs: Map<string, CellOutput>; generation: number }
  | { kind: "error"; error: IpcError; generation: number };

/** The `windows` map key for `window: null` — `evalWorkbookV2`'s
 *  "nothing selected" result (`windows: []`, decision 48) and a whole-call
 *  rejection (unknown/unparseable workbook id, ruling R121) both arrive
 *  this way (`model/openEvalDriver.ts`'s `dispatchWindowResults`/`runEval`
 *  catch block) and neither has a real window to key by. `Notebook/
 *  index.tsx` reads this entry for the page-level error banner the old
 *  flat `evalError` field used to hold. */
export const NO_WINDOW_KEY = "__none__";

/** A stable string identity for one wire `Span` — mirrors
 *  `state/selection.ts`'s `spanKey` byte-for-byte on the fields the two
 *  share (snake_case wire vs. camelCase app state), the same precedent
 *  `model/jsCellBinding.ts`'s own private `spanIdentity` sets for staying
 *  free of `app/src/state/**` imports. */
function wireSpanKey(span: Span): string {
  switch (span.kind) {
    case "session":
      return "session";
    case "lap":
      return `lap:${span.lap_number}`;
    case "range":
      return `range:${span.t0_us}:${span.t1_us}`;
  }
}

/**
 * A stable string identity for one selected window, or {@link NO_WINDOW_KEY}
 * for `null` — `colour` excluded, same reasoning as `state/selection.ts`'s
 * `windowKey`. Produces the **identical string** `windowKey(SelectionWindow)`
 * would for the same window (same `sessionId`/`session_id` and `span`
 * content, just wire vs. app-state field casing) — so a caller holding the
 * app-side `SelectionWindow` (`Notebook/index.tsx`, via `AppState.selection`)
 * can look this map up with `state/selection.ts`'s own exported `windowKey`
 * without this module importing the app-state layer.
 */
export function wireWindowKey(w: SelectedWindow | null): string {
  return w === null ? NO_WINDOW_KEY : `${w.session_id}::${wireSpanKey(w.span)}`;
}

/** One notebook's full open/eval/save/watch state. */
export interface WorkbookState {
  /** Set once `open_workbook` resolves; `null` before the first response. */
  handle: WorkbookHandle | null;
  /** The document-text slice's status (see the module doc comment). */
  markdownStatus: MarkdownStatus;
  /** The file's UTF-8 text, verbatim — `null` until `readWorkbook` succeeds. */
  markdown: string | null;
  /** sha256 of `markdown`'s bytes, hex — the `based_on_hash` a later save passes; `null` until a read or a save. */
  hash: string | null;
  /** Set only when `markdownStatus === "error"` — a rejected `readWorkbook`'s message. */
  markdownError: string | null;
  /** This scan's non-authoritative cells (`model/cells.ts`), empty while `markdown` is `null`. */
  cells: ScannedCell[];
  /** One entry per resolved window (ruling R131 Q1), keyed by
   *  {@link wireWindowKey} / `state/selection.ts`'s `windowKey` (the two
   *  produce identical strings for the same window). A window with no
   *  entry has not yet evaluated — absence means pending, exactly as a
   *  per-cell entry's absence in the pre-Task-11a flat `outputs` map did.
   *  {@link NO_WINDOW_KEY} holds the "nothing selected" result or a
   *  whole-call rejection — see that constant's own doc comment. */
  windows: Map<string, WindowEvalState>;
  /** Cell ids that need re-evaluation: either edited locally (`editCell`) or named by a `watchWorkbook` event (`watchEvent`). Cleared wholesale on a successful save. */
  dirtyCellIds: Set<string>;
  /**
   * Decision 59's staleness generation: bumped every time `editCell` (with a
   * markdown change) or `watchEvent` fires — i.e. every time the document
   * changes in a way that makes every currently-landed `windows` entry a
   * candidate for being outdated. Never reset by a save (unlike
   * `dirtyCellIds`): saving does not change what the document evaluates to,
   * only whether the change is persisted, so it must not affect staleness.
   * See {@link WindowEvalState.generation} and {@link isWindowStale}.
   */
  evalRequestGeneration: number;
  /** Set by `editFrontMatter` (the maths graph's `graph` key, C2 §3.7.1) —
   *  a document change that needs saving but never re-evaluating, so it is
   *  tracked separately from {@link dirtyCellIds} rather than folded into
   *  it (an empty `dirtyCellIds` must keep meaning "no re-eval pending",
   *  not "nothing to save"). Cleared on a successful save, same as
   *  `dirtyCellIds`. */
  frontMatterDirty: boolean;
  /** True while `saveFlow.ts`'s state is `"conflict"` (Task 14, R44) -- `Notebook/index.tsx` renders `ConflictBanner` while this is true. Cleared by a fresh read (`markdownReady`, i.e. "Reload from disk") or a subsequent successful save (`saveResult`, i.e. "Overwrite" landing). */
  conflict: boolean;
  /** Retired function names the last `markdownReady` read found still
   *  un-migrated (`WorkbookSource.pending_migrations`, R151 item 9) --
   *  `[]` when the document carries none. `MigrationBanner`'s `"pending"`
   *  variant reads this; a fresh read or a save (`saveResult`, which
   *  resolves them) both clear it. */
  pendingMigrations: RenamedFunction[];
  /** Retired function names the most recent successful save rewrote
   *  (`SaveResult.migrations`, R151 item 9) -- `[]` before any save this
   *  session, and after a save that carried none. `MigrationBanner`'s
   *  `"applied"` variant reads this. */
  appliedMigrations: RenamedFunction[];
}

/** `WorkbookState`'s value before `open_workbook` resolves. */
export const initialWorkbookState: WorkbookState = {
  handle: null,
  markdownStatus: "loading",
  markdown: null,
  hash: null,
  markdownError: null,
  cells: [],
  windows: new Map(),
  dirtyCellIds: new Set(),
  evalRequestGeneration: 0,
  frontMatterDirty: false,
  conflict: false,
  pendingMigrations: [],
  appliedMigrations: [],
};

/** Every action `workbookReducer` accepts. */
export type WorkbookAction =
  | { type: "handleOpened"; handle: WorkbookHandle }
  | { type: "markdownLoading" }
  /** `pendingMigrations` is `WorkbookSource.pending_migrations` (R151 item
   *  9) -- defaults to `[]` so the many existing call sites/tests that
   *  predate the migration lane still type-check without naming it. */
  | { type: "markdownReady"; markdown: string; hash: string; pendingMigrations?: RenamedFunction[] }
  | { type: "markdownError"; message: string }
  /** One `windows` entry's success (ruling R121/R131) — dispatched once per
   *  `evalWorkbookV2` result by `model/openEvalDriver.ts`'s
   *  `dispatchWindowResults`. Replaces cell-by-cell merging into a flat map
   *  (Task 10's `evalResult`): a window's entire `outputs` is replaced
   *  wholesale each time, matching `WindowEval`'s own "one window, one
   *  result" shape — there is no cross-window merge to perform.
   *  `generation` (decision 59) is the `evalRequestGeneration` value the
   *  originating `runEval`/`runOpenAndEval` call captured when it started —
   *  stored on the resulting `WindowEvalState` unchanged. */
  | { type: "evalWindowResult"; window: SelectedWindow | null; outputs: CellOutput[]; generation: number }
  /** One `windows` entry's failure — a per-window resolve failure (R121) or
   *  a whole-call rejection (`window: null`, see {@link NO_WINDOW_KEY}).
   *  `generation` — see `evalWindowResult`'s own doc comment. */
  | { type: "evalWindowError"; window: SelectedWindow | null; error: IpcError; generation: number }
  /** Drops every `windows` entry whose key is not in `keep` (ruling R131:
   *  "the reducer prunes" — decision 61, nothing shows data outside the
   *  current selection). Dispatched by `Notebook/index.tsx` whenever the
   *  selected windows change, before the next `evalWorkbookV2` run for the
   *  new selection lands. {@link NO_WINDOW_KEY} is kept only when `keep` is
   *  empty (mirrors `evalWorkbookV2([])`'s own "nothing selected" result,
   *  which legitimately keys under it) — a non-empty `keep` drops any
   *  stale whole-call-rejection banner from a previous selection along
   *  with every other unselected window, so a fresh rejection (if any) is
   *  the only thing that can repopulate it. */
  | { type: "pruneWindows"; keep: ReadonlySet<string> }
  /** A cell's body changed locally (Task 15's `EditorPanes`, via
   *  `model/cells.ts`'s `replaceCellBody`). `markdown` is the whole
   *  document's new text (the caller already applied the replacement);
   *  omitted when a caller only wants to mark `cellId` dirty without
   *  changing the document's text (kept backward compatible with Task 13's
   *  original two-field shape/tests, which never touch `markdown`). When
   *  present, `cells` is re-derived from it the same way `markdownReady`
   *  does, so a cell's byte ranges stay correct after the edit. */
  | { type: "editCell"; cellId: string; markdown?: string }
  /** A front-matter-only edit — today, the maths graph's `graph` key
   *  (C2 §3.7.1, `model/graphLayout.ts`'s `writeGraphLayout`) — landed by a
   *  gesture that touches no cell (a drag settle, a canvas-only rename
   *  half). `markdown` is the whole document's new text, same convention
   *  as `editCell`'s. Deliberately does **not** touch `dirtyCellIds`: a
   *  moved node is not a reason to re-evaluate (§3.7.1's advisory
   *  guarantee — nothing in `graph` feeds a value), so this must not
   *  re-arm the debounced re-eval effect the way `editCell` does. It marks
   *  {@link WorkbookState.frontMatterDirty} instead — a separate flag,
   *  since `dirtyCellIds` empty must not read as "nothing to save" the way
   *  it correctly does for `editCell` (`Notebook/index.tsx`'s `WorkbookBar`
   *  `dirty` prop watches both). */
  | { type: "editFrontMatter"; markdown: string }
  /** `migrations` is `SaveResult.migrations` (R151 item 9) -- defaults to
   *  `[]` for the same reason `markdownReady`'s `pendingMigrations` does. */
  | { type: "saveResult"; hash: string; migrations?: RenamedFunction[] }
  /** `saveFlow.ts`'s state reached `"conflict"` (Task 14, R44) -- `Notebook/index.tsx` should now render `ConflictBanner`. */
  | { type: "saveConflict" }
  | { type: "watchEvent"; event: WorkbookEvent };

/**
 * Advances `state` by one `action`. Pure: no I/O, no mutation of `state`'s
 * own `Map`/`Set` fields in place — every branch returns a fresh state with
 * fresh `Map`/`Set` instances where those fields change, so a caller
 * comparing `prevState.windows !== nextState.windows` (a `useEffect`
 * dependency, e.g.) sees the expected identity change exactly on that
 * branch.
 */
export function workbookReducer(state: WorkbookState, action: WorkbookAction): WorkbookState {
  switch (action.type) {
    case "handleOpened":
      return { ...state, handle: action.handle };

    case "markdownLoading":
      return { ...state, markdownStatus: "loading" };

    case "markdownReady":
      return {
        ...state,
        markdownStatus: "ready",
        markdown: action.markdown,
        hash: action.hash,
        markdownError: null,
        cells: scanCells(action.markdown).cells,
        // A fresh read is "Reload from disk" landing (or the first open) --
        // either way any prior conflict, and any front-matter-only edit
        // that hadn't been saved, is now moot (the reload replaced it).
        frontMatterDirty: false,
        conflict: false,
        // A fresh read re-establishes what is pending from scratch -- it
        // may find fewer (a peer already saved) or more (a peer wrote a
        // still-older document) retired names than the previous read did.
        pendingMigrations: action.pendingMigrations ?? [],
      };

    case "markdownError":
      return { ...state, markdownStatus: "error", markdownError: action.message };

    case "evalWindowResult": {
      const key = wireWindowKey(action.window);
      const outputs = new Map<string, CellOutput>();
      for (const output of action.outputs) {
        outputs.set(output.cell_id, output);
      }
      const windows = new Map(state.windows);
      windows.set(key, { kind: "ok", outputs, generation: action.generation });
      return { ...state, windows };
    }

    case "evalWindowError": {
      const key = wireWindowKey(action.window);
      const windows = new Map(state.windows);
      windows.set(key, { kind: "error", error: action.error, generation: action.generation });
      return { ...state, windows };
    }

    case "pruneWindows": {
      const keepNoWindow = action.keep.size === 0;
      let changed = false;
      const windows = new Map<string, WindowEvalState>();
      for (const [key, value] of state.windows) {
        if (key === NO_WINDOW_KEY ? keepNoWindow : action.keep.has(key)) {
          windows.set(key, value);
        } else {
          changed = true;
        }
      }
      return changed ? { ...state, windows } : state;
    }

    case "editCell": {
      const dirtyCellIds = new Set(state.dirtyCellIds);
      dirtyCellIds.add(action.cellId);
      if (action.markdown === undefined) {
        return { ...state, dirtyCellIds };
      }
      // Decision 59: a text-changing edit invalidates every currently-landed
      // window result, since the debounced re-eval effect (`Notebook/
      // index.tsx`) has not run yet — bumping here, at the moment the edit
      // itself is recorded, means a chart reads as stale from the instant
      // the keystroke lands, not only once the IPC call is in flight.
      return {
        ...state,
        dirtyCellIds,
        markdown: action.markdown,
        cells: scanCells(action.markdown).cells,
        evalRequestGeneration: state.evalRequestGeneration + 1,
      };
    }

    case "editFrontMatter":
      return { ...state, markdown: action.markdown, cells: scanCells(action.markdown).cells, frontMatterDirty: true };

    case "saveResult":
      return {
        ...state,
        hash: action.hash,
        dirtyCellIds: new Set(),
        frontMatterDirty: false,
        conflict: false,
        // A completed save rewrote every retired name `pendingMigrations`
        // named (R151 item 9) -- both fields are the same save's two
        // sides: what was pending going in, what was just applied.
        pendingMigrations: [],
        appliedMigrations: action.migrations ?? [],
      };

    case "saveConflict":
      return { ...state, conflict: true };

    case "watchEvent": {
      const dirtyCellIds = new Set(state.dirtyCellIds);
      for (const cellId of action.event.cell_ids) {
        dirtyCellIds.add(cellId);
      }
      // A change landing from outside this session (another sync peer, a
      // device transfer) is exactly as staleness-causing as a local edit —
      // decision 59 makes no distinction by source.
      const evalRequestGeneration = action.event.cell_ids.length > 0 ? state.evalRequestGeneration + 1 : state.evalRequestGeneration;
      return { ...state, dirtyCellIds, evalRequestGeneration };
    }

    default:
      return state;
  }
}

/**
 * Decision 59: `true` when `entry` (a landed `WindowEvalState`) reflects an
 * older edit than `evalRequestGeneration`'s current value — the one place
 * "is this window's data stale" is decided, so `Notebook/index.tsx`'s
 * per-cell status and any other consumer read the same answer (the R133
 * lesson: a single definition, not a second gate that can drift from this
 * one). `entry === undefined` (the window has never evaluated at all) is
 * not stale — that is "pending", a distinct state this function does not
 * speak to; the caller decides "pending" vs "stale" from whether `entry`
 * exists at all before asking this.
 */
export function isWindowStale(entry: WindowEvalState | undefined, evalRequestGeneration: number): boolean {
  return entry !== undefined && entry.generation < evalRequestGeneration;
}
