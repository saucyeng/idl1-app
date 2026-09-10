/**
 * The report's per-block renderer, shared by the two views that draw a
 * {@link ReportDocument}: `ReportView` (the print document mounted into
 * `#report-print-root`) and `PaperView` (ruling R184's on-screen mobile
 * paper). Extracted from `ReportView.tsx` unchanged — one dispatch, so a
 * block kind can never render one way on paper and another in print.
 *
 * What stays in each view rather than here: the palette to draw with
 * (print's static black-on-white, R174, versus paper's inherited app
 * theme), which blocks to include (`model/report/paperDocument.ts` drops
 * print furniture on screen), and print's own chart-settle counter.
 *
 * Rendering only — not unit-tested (CLAUDE.md §4); `document.test.ts` and
 * `renderChart.test.ts` cover the model these components merely walk.
 */
import { useEffect, useRef, useState } from "react";
import type { ReportBlock } from "../model/report/document";
import type { PrintPalette } from "../model/report/printPalette";
import { renderChart } from "../model/report/renderChart";

/** What a view must supply to draw blocks: a plot theme and series colours
 *  for `renderChart`, and a `--chart-N` resolver for every swatch and
 *  border. Named for the renderer's requirement rather than for print, but
 *  deliberately the *same type* `printPalette.ts` already defines rather
 *  than a second structural copy of it — one definition of "what a report
 *  palette is", so print's and paper's can never drift into disagreeing
 *  about what a `--chart-N` means (R174's "one place that turns a token
 *  into a colour", extended to the second view). */
export type ReportBlockPalette = PrintPalette;

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
 *  with `palette`'s `theme`/`seriesColours` — print's static black-on-white
 *  palette (`model/report/printPalette.ts`, ruling R174) or paper's
 *  app-theme one, resolved once by the view and passed down, never read
 *  fresh here. `onSettled` always fires exactly once, success or failure,
 *  so a view that needs to know when every `chartSlot` in the document has
 *  finished attempting to render can count settles (`ReportView` does, to
 *  decide when printing may start; `PaperView` ignores it). Not unit-tested (CLAUDE.md §4) — `renderChart.test.ts`
 *  covers the data-shaping half this merely calls. */
function ChartSlotView({
  block,
  palette,
  onSettled,
}: {
  block: Extract<ReportBlock, { kind: "chartSlot" }>;
  palette: ReportBlockPalette;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `onSettled` is a stable per-render callback from the owning view, not chart-render input; re-running this effect on its identity would double-count a settle.
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
 *  `palette` (the owning view's single palette value, ruling R174) is
 *  what every `--chart-N` swatch/border below resolves through — the
 *  same value the `chartSlot` case's chart is drawn with, so a chip and a
 *  line can never disagree about what `--chart-N` means on this page. */
export function ReportBlockView({ block, palette, onChartSettled }: { block: ReportBlock; palette: ReportBlockPalette; onChartSettled: () => void }) {
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

