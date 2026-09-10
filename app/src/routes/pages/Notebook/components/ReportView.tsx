import { useEffect, useMemo, useRef, useState } from "react";
import type { ReportBlock, ReportDocument } from "../model/report/document";
import { buildPrintPalette, type PrintPalette } from "../model/report/printPalette";
import { renderChart } from "../model/report/renderChart";

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

/** One `defTable` block's rows (`document.ts`'s `DefTableRow`) as a plain
 *  table — value, unit, rate as their own columns, so a reader compares
 *  across rows without parsing a combined string. A def whose unit state
 *  is `unknown` gets a `*` marker next to its value; the reason lives in
 *  the appendix (R166 item 7's "never a silent gap", applied to units). */
function DefTable({ block }: { block: Extract<ReportBlock, { kind: "defTable" }> }) {
  return (
    <table className="report-def-table">
      <tbody>
        {block.rows.map((row, i) => (
          <tr key={i}>
            <td className="report-def-name">{row.label ?? row.name}</td>
            <td className="report-def-value">
              {row.valueText}
              {row.unit.unknownReason !== null && <sup>*</sup>}
            </td>
            <td className="report-def-unit">{row.unit.text}</td>
            <td className="report-def-rate">{row.rateText ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Table({ block }: { block: Extract<ReportBlock, { kind: "table" }> }) {
  return (
    <table className="report-grid-table">
      <tbody>
        {block.rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td key={c} className={cell.isError ? "report-grid-error" : undefined}>
                {cell.text}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Renders one `chartSlot` block's real chart (task R6): calls
 *  `renderChart` (this module's one DOM-touching call besides `prose`'s
 *  `dangerouslySetInnerHTML`, and the *only* one that runs asynchronously)
 *  with `palette`'s `theme`/`seriesColours` — the report's own static print
 *  palette (`model/report/printPalette.ts`, ruling R174), resolved once by
 *  `ReportView` and passed down, never read fresh here. `onSettled` (a
 *  `ReportView`-owned counter) always fires exactly once, success or
 *  failure, so the parent can tell when every `chartSlot` in the document
 *  has finished attempting to render (see {@link ReportViewProps.onReady}'s
 *  doc comment). Not unit-tested (CLAUDE.md §4) — `renderChart.test.ts`
 *  covers the data-shaping half this merely calls. */
function ChartSlotView({
  block,
  palette,
  onSettled,
}: {
  block: Extract<ReportBlock, { kind: "chartSlot" }>;
  palette: PrintPalette;
  onSettled: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    setFailed(false);
    renderChart(block.props, block.channelData, palette.theme, palette.seriesColours)
      .then((svg) => {
        if (disposed) return;
        containerRef.current?.replaceChildren(svg);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      })
      .finally(() => {
        if (!disposed) onSettled();
      });
    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `onSettled` is a stable per-render counter callback from `ReportView`, not chart-render input; re-running this effect on its identity would double-count a settle.
  }, [block, palette]);

  return (
    <figure className="report-chart">
      <div ref={containerRef} className="report-chart-svg" />
      {failed && <p className="report-absence">{`Chart \`${block.cellId}\` could not be rendered.`}</p>}
      <figcaption className="report-chart-caption">{block.caption}</figcaption>
    </figure>
  );
}

/** Renders one {@link ReportBlock} — the report's per-kind dispatch, same
 *  shape as `CellList.tsx`'s per-cell-kind dispatch. `onChartSettled` is
 *  only ever read by the `chartSlot` case; every other kind ignores it.
 *  `palette` (`ReportView`'s one `buildPrintPalette()` call, ruling R174)
 *  is what every `--chart-N` swatch/border below resolves through — the
 *  same value the `chartSlot` case's chart is drawn with, so a chip and a
 *  line can never disagree about what `--chart-N` means on this page. */
function Block({ block, palette, onChartSettled }: { block: ReportBlock; palette: PrintPalette; onChartSettled: () => void }) {
  switch (block.kind) {
    case "cover":
      return (
        <section className="report-cover">
          <h1>{block.title}</h1>
          <p className="report-cover-meta">
            Generated {new Date(block.generatedAtMs).toISOString()} · app {block.appVersion} · engine {block.engineVersion} · importer{" "}
            {block.importerVersion}
          </p>
        </section>
      );
    case "session":
      return (
        <section className="report-session">
          <h2>Session</h2>
          <dl>
            <dt>Rider</dt>
            <dd>{block.rider}</dd>
            <dt>Bike</dt>
            <dd>{block.bike}</dd>
            <dt>Venue</dt>
            <dd>{block.venueName}</dd>
            <dt>Event</dt>
            <dd>{block.eventName}</dd>
            <dt>Recorded</dt>
            <dd>{block.timestampText}</dd>
            <dt>Source</dt>
            <dd>{block.sourceFormat}</dd>
            <dt>Device</dt>
            <dd>{block.deviceId}</dd>
          </dl>
        </section>
      );
    case "selection":
      return (
        <section className="report-selection">
          <h2>Selection</h2>
          <ul>
            {block.windows.map((w, i) => (
              <li key={i}>
                <span className="report-selection-swatch" style={{ backgroundColor: palette.resolve(w.colour) }} />
                {w.label}
              </li>
            ))}
          </ul>
        </section>
      );
    case "windowSection":
      return (
        <h2 className="report-window-section" style={{ borderColor: palette.resolve(block.colour) }}>
          {block.label}
        </h2>
      );
    case "windowFailure":
      return (
        <section className="report-window-failure" style={{ borderColor: palette.resolve(block.colour) }}>
          <h2>{block.label}</h2>
          <p className="report-error">
            {block.error.kind}: {block.error.message}
          </p>
        </section>
      );
    case "prose":
      return "html" in block ? (
        // SAFETY: `block.html` is core's own rendered prose HTML, the same
        // string `ProseBlock.tsx` renders with `dangerouslySetInnerHTML` —
        // see that component's doc comment; this is not sandbox output.
        <div className="report-prose" dangerouslySetInnerHTML={{ __html: block.html }} />
      ) : (
        <div className="report-prose">{block.text}</div>
      );
    case "defTable":
      return <DefTable block={block} />;
    case "table":
      return <Table block={block} />;
    case "absence":
      return <p className="report-absence">{block.reason}</p>;
    case "chartSlot":
      return <ChartSlotView block={block} palette={palette} onSettled={onChartSettled} />;
    case "comparison":
      return (
        <section className="report-comparison">
          <h2>Comparison</h2>
          <table className="report-comparison-table">
            <thead>
              <tr>
                <th>Definition</th>
                {block.columns.map((col, i) => (
                  <th key={i}>
                    <span className="report-selection-swatch" style={{ backgroundColor: palette.resolve(col.colour) }} />
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  <td>{row.label ?? row.name}</td>
                  {row.cells.map((cell, c) => (
                    <td key={c}>{cell ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      );
    case "appendix":
      return block.entries.length === 0 ? null : (
        <section className="report-appendix">
          <h2>Omissions &amp; diagnostics</h2>
          <ul>
            {block.entries.map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ul>
        </section>
      );
  }
}

/**
 * Renders a {@link ReportDocument} (`model/report/document.ts`, task R1) as
 * a purpose-built HTML document — not the notebook column, which cannot be
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
  // `PrintPalette`, never a fresh lookup of its own; see `Block`'s doc
  // comment for why that is the point, not an optimisation.
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
        <Block key={i} block={block} palette={palette} onChartSettled={handleChartSettled} />
      ))}
    </article>
  );
}
