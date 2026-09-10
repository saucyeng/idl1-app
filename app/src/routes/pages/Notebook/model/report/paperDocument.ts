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
