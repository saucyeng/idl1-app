import type { ReactNode } from "react";

import type { CellOutput } from "../../../../ipc/workbook";
import type { ProseBlock as ProseBlockData } from "../model/proseBlocks";
import type { ScannedCell, ScannedDoc } from "../model/cells";
import CellPendingSlot from "./CellPendingSlot";
import MathCell from "./MathCell";
import TableCell from "./TableCell";
import type { LapTimeLookup } from "../model/lapTable";
import ProseBlock from "./ProseBlock";

/** {@link CellListProps.frame}'s default — no wrapper, returns `output` unchanged. */
function identityFrame(_cell: ScannedCell, output: ReactNode, _index: number): ReactNode {
  return output;
}

/** Props for {@link CellList}. */
export interface CellListProps {
  /** This document's non-authoritative fence scan (`model/cells.ts`). */
  doc: ScannedDoc;
  /** Every prose block this document has right now, keyed by `blockId` (`model/proseBlocks.ts`'s `"{cellId}::before"`/`"{cellId}::after"`) — computed once by `Notebook/index.tsx` from `state.cells`/`state.markdown`/`state.outputs` rather than re-decoded here. */
  proseBlocks: ReadonlyMap<string, ProseBlockData>;
  /** The last `evalWorkbook` result, by `cell_id` — a cell with no entry has not yet evaluated. */
  outputs: ReadonlyMap<string, CellOutput>;
  /** Every inline `${…}` span's last-received result, by span id (`model/proseBlocks.ts`'s `ProseSpanRef.id`). */
  inlineResults: ReadonlyMap<string, string>;
  /** Every inline `${…}` span's last-received error message, by span id (R66 item 2, `ProseBlock`'s `spanErrors` prop). */
  spanErrors: ReadonlyMap<string, string>;
  /**
   * Ruling R132: `null` with zero or one window selected (no marker,
   * byte-identical to today), otherwise the primary window's label
   * (`model/jsCellNote.ts`'s `primaryWindowNote`) — passed through to
   * `MathCell`/`TableCell`/`ProseBlock`, every non-chart cell kind that
   * reads only the primary window's value. Optional; defaults to `null` so
   * a caller from before this task is unaffected.
   */
  windowNote?: string | null;
  /**
   * Decision 61: `true` when nothing is selected at all. Passed through to
   * `ProseBlock`, so an inline `${…}` span says so in place rather than
   * showing its raw template text while no result can arrive. Optional;
   * defaults to `false`.
   */
  noSelection?: boolean;
  /**
   * Renders a `js`-kind cell's sandbox-mounted output. Injected rather than
   * built here: a `js` cell's rendering is a `ChartCell` (or similar)
   * carrying its own viewport/tile-cache/cursor-readout state, which
   * `host/NotebookSession.ts` (R60) owns per cell — `CellList` only decides
   * *where in document order* a cell's output goes, not how a chart cell
   * gets its data. `cellId` is the C2 fence-string id (never `null` for a
   * `js`-kind `ScannedCell` produced by a well-formed document).
   */
  renderJsCell: (cellId: string) => ReactNode;
  /**
   * Wraps each cell's own rendered output (the pending placeholder,
   * `MathCell`, `TableCell`, or `renderJsCell`'s result) — never the
   * attached prose spans, which belong to the surrounding document flow
   * rather than to this cell. Optional; defaults to returning `output`
   * unwrapped, so every caller from before Task 15 is unaffected.
   *
   * Added for Task 15 (ruling R74, `runs/2026-09-03/decisions.md`):
   * `CellFrame`'s select/click affordance needs a per-cell wrapper for
   * every kind (math/table/js alike), and `CellList` is the only place
   * that iterates cells one at a time — `Notebook/index.tsx` re-doing that
   * iteration itself would duplicate this component's prose/output/pending
   * logic and orphan it. This is a deviation from Task 15's brief, which
   * did not list this file for modification; it is the smallest hook that
   * lets every cell kind gain a selection affordance without either
   * duplicating this component's iteration in `index.tsx` or restricting
   * selection to `js` cells only.
   */
  frame?: (cell: ScannedCell, output: ReactNode, index: number) => ReactNode;
  /**
   * Ruling R226 item 1: the `blockId` of the prose block currently open in
   * the mini-editor, or `null` when none is. That block renders
   * {@link CellListProps.proseEditor} in place of its own text; every other
   * block renders as usual.
   */
  editingProseBlockId?: string | null;
  /** The mini-editor element for {@link CellListProps.editingProseBlockId},
   *  built by `Notebook/index.tsx` (which owns the edit session). */
  proseEditor?: ReactNode;
  /** Opens a prose block for editing. Omitted on a read-only surface, in
   *  which case no block offers the affordance at all. */
  onEditProseBlock?: (blockId: string) => void;
  /** Whether dense stacking is on (ruling R216 item 3). Passed to
   *  `TableCell`, whose grid tightens its row padding; every other kind's
   *  density is `CellFrame`'s own geometry, which this component does not
   *  own. Also published on this component's root as `data-dense`, which is
   *  how `styles/notebook.css` reaches the rendered-markdown type scale
   *  (ruling R247) — the prose inside a block is `dangerouslySetInnerHTML`
   *  from core, so there is no React element to hand a class to and the
   *  scope has to come from an ancestor. */
  dense?: boolean;
  /** Reads a derived table row's recorded lap time, for `TableCell`'s Main
   *  row resolution under C2 §4's reserved `"fastest"` — see that
   *  component's own doc comment. Omitted leaves no row highlighted. */
  lapTimeSecs?: LapTimeLookup;
}

/**
 * Renders a workbook's cells in document order (design §6, C3 §3.4):
 * prose, then each fenced cell (dispatched to `MathCell`/`TableCell`/the
 * injected `renderJsCell` by `kind`), then trailing prose. A cell not yet
 * present in `outputs` (evaluation still in flight, or never run) renders a
 * {@link CellPendingSlot} rather than nothing, so document order, cell
 * count **and cell height** are stable across a re-render mid-evaluation.
 * Ruling R250: that slot is the size the output will be, and the state line
 * over it comes from `CellFrame`, not from here — this component renders
 * the picture, never the status.
 *
 * A cell whose scan found no `id` (`cell.id === null` — a malformed or
 * not-yet-assigned fence, `model/cells.ts` ruling R21) can never have an
 * evaluated `CellOutput` (Rust indexes by id) — it always renders as
 * pending; a later `open_workbook`/`eval_workbook` round trip, once the
 * document is corrected, is what resolves it, not anything in this
 * component.
 */
export default function CellList({
  doc,
  proseBlocks,
  outputs,
  inlineResults,
  spanErrors,
  renderJsCell,
  frame = identityFrame,
  windowNote = null,
  noSelection = false,
  editingProseBlockId = null,
  proseEditor = null,
  onEditProseBlock,
  dense = false,
  lapTimeSecs,
}: CellListProps) {
  /** One prose block: the open mini-editor when it is the block being
   *  edited, the rendered text otherwise (ruling R226 item 1). */
  function renderProse(block: ProseBlockData): ReactNode {
    if (block.blockId === editingProseBlockId && proseEditor !== null) return proseEditor;

    return (
      <ProseBlock
        content={block.content}
        inlineResults={inlineResults}
        spanErrors={spanErrors}
        windowNote={windowNote}
        noSelection={noSelection}
        onEdit={onEditProseBlock === undefined ? undefined : () => onEditProseBlock(block.blockId)}
      />
    );
  }

  return (
    <div className="cell-list" data-dense={dense ? "true" : "false"}>
      {doc.cells.map((cell, index) => {
        const key = cell.id ?? `unresolved-${index}`;
        const before = cell.id !== null ? proseBlocks.get(`${cell.id}::before`) : undefined;
        const after = cell.id !== null ? proseBlocks.get(`${cell.id}::after`) : undefined;
        const output = cell.id !== null ? outputs.get(cell.id) : undefined;
        const rendered =
          output === undefined ? (
            <CellPendingSlot kind={cell.kind} />
          ) : output.kind === "math" ? (
            <MathCell output={output} windowNote={windowNote} />
          ) : output.kind === "table" ? (
            <TableCell output={output} windowNote={windowNote} dense={dense} lapTimeSecs={lapTimeSecs} />
          ) : (
            renderJsCell(cell.id as string)
          );

        return (
          <div className="cell-list-item" key={key}>
            {before !== undefined && renderProse(before)}
            {frame(cell, rendered, index)}
            {after !== undefined && renderProse(after)}
          </div>
        );
      })}
    </div>
  );
}
