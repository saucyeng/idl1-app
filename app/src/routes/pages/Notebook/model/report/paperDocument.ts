/**
 * The screen (paper-view) filter over a {@link ReportDocument} — ruling
 * R184 item 2: `cover` and `appendix` are **print furniture** and are
 * dropped on screen, everything else is kept, in order.
 *
 * A sibling of `document.ts`, never an option inside it: print and paper
 * share one builder (`buildReportDocument`), so a block that appears in
 * one and not the other can only differ here, in a pure list filter that
 * is trivially testable — rather than through a mode flag threaded down
 * the builder's whole call tree.
 *
 * Why these two and no others. `cover` is a title page: a generated-at
 * timestamp plus app/engine/importer versions, information a live viewer
 * already has in its own chrome and which would push the actual content
 * off a phone's first screen. `appendix` is the printed document's
 * "why isn't X in here" section, collected because a reader of paper on a
 * desk cannot ask; on screen the same reasons are already in place, as
 * `absence` blocks sitting exactly where the missing content would have
 * been. **Every `absence` block is kept** — R166 item 7's "never a silent
 * gap" is a property of the content, not of the paper it prints on.
 */
import type { ReportBlock, ReportDocument } from "./document";

/** The block kinds that exist only for the printed page (R184 item 2). */
const PRINT_ONLY_KINDS: ReadonlySet<ReportBlock["kind"]> = new Set<ReportBlock["kind"]>(["cover", "appendix"]);

/**
 * Whether `block` belongs on screen — false for the print-only furniture
 * named above, true for every other kind.
 *
 * @param block - The block to classify.
 */
export function blockShowsOnScreen(block: ReportBlock): boolean {
  return !PRINT_ONLY_KINDS.has(block.kind);
}

/**
 * The cell `document`'s block came from, or `null` for a block that
 * belongs to the document rather than to any one cell (`session`,
 * `selection`, `windowSection`, `windowFailure`, `comparison`, and the two
 * print-furniture kinds).
 *
 * Paper's tap-to-edit gesture (R184 item 4) is one delegated handler over
 * this value: a block that has a cell id is tappable and carries it in
 * `data-cell-id`; a block without one is inert. Whether tapping actually
 * opens anything is `Notebook/index.tsx`'s existing narrow `Sheet`
 * condition (`js` cells only) — a `math` or `table` block selects its cell
 * and opens nothing, R184 item 4's accepted no-op.
 *
 * @param block - The block to read.
 */
export function blockCellId(block: ReportBlock): string | null {
  switch (block.kind) {
    case "prose":
    case "defTable":
    case "table":
    case "absence":
    case "chartSlot":
      return block.cellId;
    case "cover":
    case "session":
    case "selection":
    case "windowSection":
    case "windowFailure":
    case "comparison":
    case "appendix":
      return null;
  }
}

/**
 * `document` with its print-only blocks removed, block order otherwise
 * untouched. Returns a new document; `document` itself is never mutated
 * (the same value is still being rendered into `#report-print-root` for
 * printing while paper shows this one).
 *
 * @param document - The document `buildReportDocument` produced.
 */
export function toPaperDocument(document: ReportDocument): ReportDocument {
  return { blocks: document.blocks.filter(blockShowsOnScreen) };
}
