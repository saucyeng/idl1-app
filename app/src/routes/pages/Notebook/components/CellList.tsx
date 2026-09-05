import type { ReactNode } from "react";

import type { CellOutput } from "../../../../ipc/workbook";
import type { ScannedDoc } from "../model/cells";
import MathCell from "./MathCell";
import TableCell from "./TableCell";
import ProseSpan from "./ProseSpan";

/** Decodes `[start, end)` UTF-8 byte offsets (`model/cells.ts`'s convention) back into text. `null` in, `null` out. */
function proseText(markdown: string, range: [number, number] | null): string | null {
  if (range === null) return null;
  const bytes = new TextEncoder().encode(markdown);
  return new TextDecoder().decode(bytes.subarray(range[0], range[1]));
}

/** Props for {@link CellList}. */
export interface CellListProps {
  /** This document's non-authoritative fence scan (`model/cells.ts`). */
  doc: ScannedDoc;
  /** The document's own text, for decoding `doc.cells[i]`'s prose byte ranges. */
  markdown: string;
  /** The last `evalWorkbook` result, by `cell_id` — a cell with no entry has not yet evaluated. */
  outputs: ReadonlyMap<string, CellOutput>;
  /** Every inline `${…}` span's last-received result, by `spanId` (`ProseSpan`'s `extractInlineSpans`). */
  inlineResults: ReadonlyMap<string, string>;
  /** Every inline `${…}` span's last-received error message, by `spanId` (R66 item 2, `ProseSpan`'s `spanErrors` prop). */
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
export default function CellList({ doc, markdown, outputs, inlineResults, spanErrors, renderJsCell }: CellListProps) {
  return (
    <div className="cell-list">
      {doc.cells.map((cell, index) => {
        const before = proseText(markdown, cell.proseBeforeRange);
        const after = proseText(markdown, cell.proseAfterRange);
        const key = cell.id ?? `unresolved-${index}`;
        const output = cell.id !== null ? outputs.get(cell.id) : undefined;

        return (
          <div className="cell-list-item" key={key}>
            {before !== null && (
              <ProseSpan text={before} spanIdPrefix={`${key}-before`} results={inlineResults} spanErrors={spanErrors} />
            )}
            {output === undefined ? (
              <div className="cell-list-pending">…</div>
            ) : output.kind === "math" ? (
              <MathCell output={output} />
            ) : output.kind === "table" ? (
              <TableCell output={output} />
            ) : (
              renderJsCell(cell.id as string)
            )}
            {after !== null && (
              <ProseSpan text={after} spanIdPrefix={`${key}-after`} results={inlineResults} spanErrors={spanErrors} />
            )}
          </div>
        );
      })}
    </div>
  );
}
