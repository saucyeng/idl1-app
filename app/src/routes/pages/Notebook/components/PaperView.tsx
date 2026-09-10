import { useMemo } from "react";
import type { MouseEvent } from "react";
import type { ReportDocument } from "../model/report/document";
import { blockCellId, toPaperDocument } from "../model/report/paperDocument";
import { buildPaperPalette } from "../model/report/paperPalette";
import type { PaperScheme } from "../model/report/paperPalette";
import { documentVars } from "../theme/series";
import { ReportBlockView } from "./reportBlocks";

/** Props for {@link PaperView}. `document` is the full document
 *  `buildReportDocument` produced — this component applies the screen
 *  filter itself (`toPaperDocument`), so a caller can hand the same value
 *  to paper and to print without deciding which blocks are furniture.
 *  `onSelectCell` receives the cell id of a tapped block; a block with no
 *  cell of its own never calls it. */
export interface PaperViewProps {
  document: ReportDocument;
  onSelectCell: (cellId: string) => void;
  /** The scheme paper is drawn in — `model/report/paperPalette.ts`'s
   *  `effectivePaperTheme` applied to the app's theme and the user's own
   *  paper theme (ruling R185 item 3). Resolved by the caller, not here,
   *  so this component takes one already-decided value rather than two
   *  preferences and the rule connecting them. It picks both the palette
   *  and the `data-paper-theme` scope `styles/paper.css` styles through. */
  scheme: PaperScheme;
}

/**
 * The mobile **paper** view (design doc line 154, ruling R184): the report
 * document rendered to the screen, in the app's own theme, in place of the
 * notebook's cell list at `paperViewActive` widths
 * (`model/paperView.ts`).
 *
 * It is the same document print gets, drawn by the same per-block renderer
 * (`reportBlocks.tsx`), differing in exactly three ways, each deliberate:
 *
 * 1. **Which blocks.** `toPaperDocument` drops `cover` and `appendix`,
 *    print furniture a live viewer does not need (R184 item 2). Every
 *    `absence` block survives — a phone must still say why something is
 *    missing rather than leaving a gap.
 * 2. **Which palette.** `model/report/paperPalette.ts`, chosen by the
 *    `scheme` prop (R185 item 3) — the app's live `--chart-N` tokens on
 *    dark, paper's own fixed values on light. Never `printPalette.ts`:
 *    that palette belongs to the printed page.
 * 3. **Taps.** Every block that belongs to a cell carries that cell's id in
 *    `data-cell-id`, and one delegated handler on the container turns a tap
 *    into `onSelectCell` — `Notebook/index.tsx` then opens its narrow
 *    `Sheet` over the paper: Properties beside Code for a `js` cell, the
 *    code editor alone for every other kind (ruling R185 item 1, which
 *    replaced R184's `js`-only sheet). Paper and the editor alternate on a
 *    phone; they never share the screen.
 *
 * Charts are `renderChart`'s static SVG, not the live sandbox iframe (R184
 * item 1): outputs rendered, with no `position: fixed` layout tracking and
 * no IPC on a gesture. The consequence, named rather than discovered: no
 * hover, pan or zoom on paper in v1.
 *
 * `ReportBlockView`'s chart-settle callback is print's own bookkeeping (it
 * decides when `window.print()` may start). Paper has nothing to wait for,
 * so it passes a no-op.
 *
 * Rendering only — not unit-tested (CLAUDE.md §4); `paperDocument.test.ts`
 * and `screenPalette.test.ts` cover the decisions this component makes.
 */
export default function PaperView({ document, onSelectCell, scheme }: PaperViewProps) {
  // Resolved once per document render, exactly as `ReportView` resolves its
  // print palette (R174's "one place that turns a `--chart-N` into a
  // colour"): every swatch, every border and every chart on this page is
  // fed this one value, so a chip and a line can never disagree.
  const palette = useMemo(() => buildPaperPalette(scheme, documentVars()), [scheme]);
  const paper = useMemo(() => toPaperDocument(document), [document]);

  /** One delegated handler for the whole page rather than a handler per
   *  block: the document is rebuilt on every settle, and a per-block
   *  closure would be a fresh function on each of those rebuilds for every
   *  block on screen. `closest` walks up from whatever inner element was
   *  actually touched (a table cell, a chart's `<svg>`) to its block
   *  wrapper. A tap landing between blocks matches nothing and is ignored. */
  function handleTap(event: MouseEvent<HTMLElement>): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const wrapper = target.closest("[data-cell-id]");
    const cellId = wrapper?.getAttribute("data-cell-id");
    if (cellId === null || cellId === undefined || cellId === "") return;
    onSelectCell(cellId);
  }

  return (
    <article className="paper-view" data-paper-theme={scheme} onClick={handleTap}>
      {paper.blocks.map((block, i) => {
        const cellId = blockCellId(block);
        return (
          <div key={i} className="paper-block" data-cell-id={cellId ?? undefined}>
            <ReportBlockView block={block} palette={palette} onChartSettled={() => {}} />
          </div>
        );
      })}
    </article>
  );
}
