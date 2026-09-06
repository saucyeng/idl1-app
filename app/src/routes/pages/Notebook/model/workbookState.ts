/**
 * The pure reducer over a notebook's open/eval/save/watch results (design
 * §6, plan Task 13 Step 1). Owns no I/O — `Notebook/index.tsx` calls
 * `ipc/workbook.ts` and dispatches its results in here.
 *
 * The plan's sketch names one `status` field over the whole state; this
 * refinement narrows it to `markdownStatus`, since evaluation/rendering
 * (via `evalWorkbook`, which needs no source text) proceeds independently
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
 */
import type { CellOutput, WorkbookEvent, WorkbookHandle } from "../../../../ipc/workbook";
import { scanCells, type ScannedCell } from "./cells";

/** The document-text slice's own status — independent of whether cells have evaluated. */
export type MarkdownStatus = "loading" | "ready" | "error";

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
  /** The last `evalWorkbook` result, by `cell_id`. A cell absent from this map has not yet evaluated. */
  outputs: Map<string, CellOutput>;
  /** Cell ids that need re-evaluation: either edited locally (`editCell`) or named by a `watchWorkbook` event (`watchEvent`). Cleared wholesale on a successful save. */
  dirtyCellIds: Set<string>;
  /** True while `saveFlow.ts`'s state is `"conflict"` (Task 14, R44) -- `Notebook/index.tsx` renders `ConflictBanner` while this is true. Cleared by a fresh read (`markdownReady`, i.e. "Reload from disk") or a subsequent successful save (`saveResult`, i.e. "Overwrite" landing). */
  conflict: boolean;
}

/** `WorkbookState`'s value before `open_workbook` resolves. */
export const initialWorkbookState: WorkbookState = {
  handle: null,
  markdownStatus: "loading",
  markdown: null,
  hash: null,
  markdownError: null,
  cells: [],
  outputs: new Map(),
  dirtyCellIds: new Set(),
  conflict: false,
};

/** Every action `workbookReducer` accepts. */
export type WorkbookAction =
  | { type: "handleOpened"; handle: WorkbookHandle }
  | { type: "markdownLoading" }
  | { type: "markdownReady"; markdown: string; hash: string }
  | { type: "markdownError"; message: string }
  | { type: "evalResult"; outputs: CellOutput[] }
  /** A cell's body changed locally (Task 15's `EditorPanes`, via
   *  `model/cells.ts`'s `replaceCellBody`). `markdown` is the whole
   *  document's new text (the caller already applied the replacement);
   *  omitted when a caller only wants to mark `cellId` dirty without
   *  changing the document's text (kept backward compatible with Task 13's
   *  original two-field shape/tests, which never touch `markdown`). When
   *  present, `cells` is re-derived from it the same way `markdownReady`
   *  does, so a cell's byte ranges stay correct after the edit. */
  | { type: "editCell"; cellId: string; markdown?: string }
  | { type: "saveResult"; hash: string }
  /** `saveFlow.ts`'s state reached `"conflict"` (Task 14, R44) -- `Notebook/index.tsx` should now render `ConflictBanner`. */
  | { type: "saveConflict" }
  | { type: "watchEvent"; event: WorkbookEvent };

/**
 * Advances `state` by one `action`. Pure: no I/O, no mutation of `state`'s
 * own `Map`/`Set` fields in place — every branch returns a fresh state with
 * fresh `Map`/`Set` instances where those fields change, so a caller
 * comparing `prevState.outputs !== nextState.outputs` (a `useEffect`
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
        // either way any prior conflict is now addressed.
        conflict: false,
      };

    case "markdownError":
      return { ...state, markdownStatus: "error", markdownError: action.message };

    case "evalResult": {
      const outputs = new Map(state.outputs);
      for (const output of action.outputs) {
        outputs.set(output.cell_id, output);
      }
      return { ...state, outputs };
    }

    case "editCell": {
      const dirtyCellIds = new Set(state.dirtyCellIds);
      dirtyCellIds.add(action.cellId);
      if (action.markdown === undefined) {
        return { ...state, dirtyCellIds };
      }
      return { ...state, dirtyCellIds, markdown: action.markdown, cells: scanCells(action.markdown).cells };
    }

    case "saveResult":
      return { ...state, hash: action.hash, dirtyCellIds: new Set(), conflict: false };

    case "saveConflict":
      return { ...state, conflict: true };

    case "watchEvent": {
      const dirtyCellIds = new Set(state.dirtyCellIds);
      for (const cellId of action.event.cell_ids) {
        dirtyCellIds.add(cellId);
      }
      return { ...state, dirtyCellIds };
    }

    default:
      return state;
  }
}
