import type { ReactNode } from "react";

import type { CellOutput } from "../../../../ipc/workbook";
import type { ProseBlock as ProseBlockData } from "../model/proseBlocks";
import type { ScannedCell, ScannedDoc } from "../model/cells";
import MathCell from "./MathCell";
import TableCell from "./TableCell";
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
}

/**
 * Renders a workbook's cells in document order (design §6, C3 §3.4):
 * prose, then each fenced cell (dispatched to `MathCell`/`TableCell`/the
 * injected `renderJsCell` by `kind`), then trailing prose. A cell not yet
 * present in `outputs` (evaluation still in flight, or never run) renders a
 * pending placeholder rather than nothing, so document order and cell
 * count are stable across a re-render mid-evaluation.
 *
 * A cell whose scan found no `id` (`cell.id === null` — a malformed or
 * not-yet-assigned fence, `model/cells.ts` ruling R21) can never have an
 * evaluated `CellOutput` (Rust indexes by id) — it always renders as
 * pending; a later `open_workbook`/`eval_workbook` round trip, once the
 * document is corrected, is what resolves it, not anything in this
 * component.
 */
export default function CellList({ doc, proseBlocks, outputs, inlineResults, spanErrors, renderJsCell, frame = identityFrame }: CellListProps) {
  return (
    <div className="cell-list">
      {doc.cells.map((cell, index) => {
        const key = cell.id ?? `unresolved-${index}`;
        const before = cell.id !== null ? proseBlocks.get(`${cell.id}::before`) : undefined;
        const after = cell.id !== null ? proseBlocks.get(`${cell.id}::after`) : undefined;
        const output = cell.id !== null ? outputs.get(cell.id) : undefined;
        const rendered =
          output === undefined ? (
            <div className="cell-list-pending">…</div>
          ) : output.kind === "math" ? (
            <MathCell output={output} />
          ) : output.kind === "table" ? (
            <TableCell output={output} />
          ) : (
            renderJsCell(cell.id as string)
          );

        return (
          <div className="cell-list-item" key={key}>
            {before !== undefined && (
              <ProseBlock content={before.content} inlineResults={inlineResults} spanErrors={spanErrors} />
            )}
            {frame(cell, rendered, index)}
            {after !== undefined && (
              <ProseBlock content={after.content} inlineResults={inlineResults} spanErrors={spanErrors} />
            )}
          </div>
        );
      })}
    </div>
  );
}
