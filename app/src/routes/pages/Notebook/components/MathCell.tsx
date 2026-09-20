import type { CellDefResult, CellOutput, IpcError } from "../../../../ipc/workbook";
import { formatRate, formatUnit } from "../model/unitText";

/** Renders one `IpcError` as plain text — `kind: message`, never a raw stack (CLAUDE.md §5). */
function ErrorText({ error }: { error: IpcError }) {
  return <span className="cell-error-text">{error.kind}: {error.message}</span>;
}

/** One `math`-cell definition's row: its name/label, its `HostChannelRef`
 *  summary or its own error (ledger R21/R22), and — since task R3 — its
 *  unit and sample rate, the gap this component used to leave blank even
 *  though `CellDefResult.unit`/`.sample_rate_hz` were already on the wire
 *  (ruling R166). Uses `model/unitText.ts`'s `formatUnit`/`formatRate` so
 *  this exact text can never disagree with what the report prints for the
 *  same definition. */
function DefRow({ def }: { def: CellDefResult }) {
  const unit = formatUnit(def.unit);
  const rate = formatRate(def.sample_rate_hz);
  return (
    <div className="math-cell-def">
      <span className="math-cell-def-name">{def.label ?? def.name}</span>
      {/* Ruling R247 item 2: everything that is not the label goes in one
          element, so `styles/notebook.css` can lay the row out as two
          columns — label, then detail — instead of five inline siblings
          that concatenate (`km/hmath_unknown_channel: …`). The grouping is
          what makes a long label push its error down *within* the detail
          column rather than orphan it at the row's left edge; it is also
          the reading order a screen reader gets, unchanged. */}
      <span className="math-cell-def-detail">
        {def.error !== null ? (
          <ErrorText error={def.error} />
        ) : def.value !== null ? (
          <span className="math-cell-def-value">
            {def.value.length} sample{def.value.length === 1 ? "" : "s"}
            {def.value.has_t ? " (t)" : ""}
            {/* IPC need N3 (runs/2026-09-05/lanes/l6/IPC-NEEDS.md) — this
                `HostChannelRef` is a length/has_t marker only; the actual
                samples never cross today, so a JS cell that would consume
                this definition's values (not just see that it succeeded)
                cannot bind to it yet. Rendering only the marker here, never
                fabricating sample values from `length` alone. */}
          </span>
        ) : (
          <span className="math-cell-def-empty">—</span>
        )}
        {unit.text !== "" && <span className="math-cell-def-unit">{unit.text}</span>}
        {unit.unknownReason !== null && (
          <span className="math-cell-def-unit-unknown" title={unit.unknownReason}>
            unit unknown
          </span>
        )}
        {rate !== null && <span className="math-cell-def-rate">{rate}</span>}
      </span>
    </div>
  );
}

/** Renders one `math`-kind `CellOutput` (C3 §3.4): every definition's
 *  `HostChannelRef` summary or per-definition error, plus the cell's own
 *  `errors` (structural problems that never made it into `defs` at all —
 *  ledger R22). A cell with errors still renders its definitions, if any —
 *  a per-cell failure never blanks the cell (CLAUDE.md §5, C3 §3.4).
 *
 *  `windowNote` is `model/jsCellNote.ts`'s `primaryWindowNote` result —
 *  `null` with zero or one window selected (no marker, byte-identical to
 *  today), otherwise the primary window's label. Every value below is that
 *  window's own `eval_workbook_v2` result (ruling R131 Q1: this component
 *  has never read any other window's), so ruling R132 requires saying
 *  which window when more than one is selected — the reading stays, the
 *  silence does not. */
export default function MathCell({ output, windowNote = null }: { output: CellOutput; windowNote?: string | null }) {
  return (
    <div className="math-cell">
      {windowNote !== null && <div className="math-cell-window-note">Showing {windowNote}</div>}
      {output.errors.length > 0 && (
        <ul className="math-cell-errors">
          {output.errors.map((error, i) => (
            <li key={i}>
              <ErrorText error={error} />
            </li>
          ))}
        </ul>
      )}
      {output.defs.map((def, i) => (
        <DefRow key={`${def.name}-${i}`} def={def} />
      ))}
    </div>
  );
}
