import type { ReportBlock, ReportDocument } from "../model/report/document";

/** Props for {@link ReportView}. */
export interface ReportViewProps {
  document: ReportDocument;
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

/** Renders one {@link ReportBlock} — the report's per-kind dispatch, same
 *  shape as `CellList.tsx`'s per-cell-kind dispatch. */
function Block({ block }: { block: ReportBlock }) {
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
                <span className="report-selection-swatch" style={{ backgroundColor: `var(${w.colour})` }} />
                {w.label}
              </li>
            ))}
          </ul>
        </section>
      );
    case "windowSection":
      return (
        <h2 className="report-window-section" style={{ borderColor: `var(${block.colour})` }}>
          {block.label}
        </h2>
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
 */
export default function ReportView({ document }: ReportViewProps) {
  return (
    <article className="report-view">
      {document.blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </article>
  );
}
