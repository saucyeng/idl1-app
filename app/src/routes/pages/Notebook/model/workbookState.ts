/**
 * The pure reducer over a notebook's open/eval/save/watch results (design
 * §6, plan Task 13 Step 1). Owns no I/O — `Notebook/index.tsx` calls
 * `ipc/workbook.ts` and `ipcStubs/readWorkbook.ts` and dispatches their
 * results in here.
 *
 * The plan's sketch names one `status` field over the whole state; this
 * refinement narrows it to `markdownStatus`, since evaluation/rendering
 * (via `evalWorkbook`, which needs no source text) proceeds independently
 * of whether the document's own markdown/hash could be read (N1, IPC need
 * `runs/2026-09-05/lanes/l6/IPC-NEEDS.md`) — a single whole-state `status`
 * would force "evaluating fine, but markdown unavailable" into one of four
 * values that doesn't actually describe that combination.
 */
import type { CellOutput, WorkbookEvent, WorkbookHandle } from "../../../../ipc/workbook";
import { scanCells, type ScannedCell } from "./cells";

/** The document-text slice's own status — independent of whether cells have evaluated. */
export type MarkdownStatus = "loading" | "ready" | "not_implemented" | "error";

/** One notebook's full open/eval/save/watch state. */
export interface WorkbookState {
  /** Set once `open_workbook` resolves; `null` before the first response. */
  handle: WorkbookHandle | null;
  /** The document-text slice's status (see the module doc comment). */
  markdownStatus: MarkdownStatus;
  /** The file's UTF-8 text, verbatim — `null` until `read_workbook` (N1) succeeds. */
  markdown: string | null;
  /** sha256 of `markdown`'s bytes, hex — the `based_on_hash` a later save passes; `null` until a read or a save. */
  hash: string | null;
  /** Set only when `markdownStatus === "error"` — a real (non-`NotImplementedError`) failure's message. */
  markdownError: string | null;
  /** This scan's non-authoritative cells (`model/cells.ts`), empty while `markdown` is `null`. */
  cells: ScannedCell[];
  /** The last `evalWorkbook` result, by `cell_id`. A cell absent from this map has not yet evaluated. */
  outputs: Map<string, CellOutput>;
  /** Cell ids that need re-evaluation: either edited locally (`editCell`) or named by a `watchWorkbook` event (`watchEvent`). Cleared wholesale on a successful save. */
  dirtyCellIds: Set<string>;
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
};

/** Every action `workbookReducer` accepts. */
export type WorkbookAction =
  | { type: "handleOpened"; handle: WorkbookHandle }
  | { type: "markdownLoading" }
  | { type: "markdownReady"; markdown: string; hash: string }
  | { type: "markdownNotImplemented" }
  | { type: "markdownError"; message: string }
  | { type: "evalResult"; outputs: CellOutput[] }
  | { type: "editCell"; cellId: string }
  | { type: "saveResult"; hash: string }
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
      };

    case "markdownNotImplemented":
      return { ...state, markdownStatus: "not_implemented", markdown: null, cells: [] };

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
      return { ...state, dirtyCellIds };
    }

    case "saveResult":
      return { ...state, hash: action.hash, dirtyCellIds: new Set() };

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
