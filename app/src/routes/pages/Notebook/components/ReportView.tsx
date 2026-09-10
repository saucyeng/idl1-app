import { useEffect, useMemo, useRef } from "react";
import type { ReportDocument } from "../model/report/document";
import { buildPrintPalette } from "../model/report/printPalette";
import { ReportBlockView } from "./reportBlocks";

/** Props for {@link ReportView}. `onReady`, when supplied, fires exactly
 *  once per `document` — immediately for a chart-free report, or once
 *  every `chartSlot` block has settled (rendered or failed) for one that
 *  has charts (task R6). `Notebook/index.tsx`'s print effect waits for
 *  this rather than firing on a fixed next frame, since `renderChart`'s
 *  dynamic `import()` makes chart rendering asynchronous — "the DOM has
 *  committed" is no longer the same moment as "every chart has painted". */
export interface ReportViewProps {
  document: ReportDocument;
  onReady?: () => void;
}

/**
 * Renders a {@link ReportDocument} (`model/report/document.ts`, task R1) as
 * the **printed** document — not the notebook column, which cannot be
 * printed (`report-plan.md` §1.2: every chart container is `position:
 * fixed` in viewport pixels in a different document). `styles/report-
 * print.css` paginates this output when `window.print()` runs; this
 * component makes no layout decisions of its own beyond block order,
 * matching `CellList.tsx`'s own "iterate, dispatch by kind" shape.
 *
 * Rendering only — not unit-tested (CLAUDE.md §4); `document.test.ts`
 * covers the block list this component merely walks.
 *
 * Task R6: counts this `document`'s own `chartSlot` blocks once (a fresh
 * count per `document` identity, `useMemo`'s dependency) and fires
 * `onReady` once every one of them has settled — immediately, on mount,
 * when there are none. `settledCountRef`/`firedRef` are plain refs rather
 * than state: a settle count is bookkeeping for one `onReady` call, not
 * something this component itself ever renders.
 */
export default function ReportView({ document, onReady }: ReportViewProps) {
  // Resolved once per report render (ruling R174) — every `--chart-N`
  // swatch/border and every `chartSlot` chart below is fed this one
  // `PrintPalette`, never a fresh lookup of its own; see
  // `reportBlocks.tsx`'s `ReportBlockView` doc comment for why that is the
  // point, not an optimisation.
  const palette = useMemo(() => buildPrintPalette(), []);
  const chartSlotCount = useMemo(() => document.blocks.filter((b) => b.kind === "chartSlot").length, [document]);
  const settledCountRef = useRef(0);
  const firedRef = useRef(false);

  useEffect(() => {
    settledCountRef.current = 0;
    firedRef.current = false;
    if (chartSlotCount === 0) onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `onReady` is the caller's own event handler, not report content; keying this reset off `document`/`chartSlotCount` alone (not the handler's identity) is what makes "one count per document" hold.
  }, [document, chartSlotCount]);

  function handleChartSettled(): void {
    settledCountRef.current += 1;
    if (!firedRef.current && settledCountRef.current >= chartSlotCount) {
      firedRef.current = true;
      onReady?.();
    }
  }

  return (
    <article className="report-view">
      {document.blocks.map((block, i) => (
        <ReportBlockView key={i} block={block} palette={palette} onChartSettled={handleChartSettled} />
      ))}
    </article>
  );
}
