import type { CellDefResult, CellOutput, IpcError } from "../../../../ipc/workbook";

/** Renders one `IpcError` as plain text — `kind: message`, never a raw stack (CLAUDE.md §5). */
function ErrorText({ error }: { error: IpcError }) {
  return <span className="cell-error-text">{error.kind}: {error.message}</span>;
}

/** One `math`-cell definition's row: its name/label, and either its `HostChannelRef` summary or its own error (ledger R21/R22). */
function DefRow({ def }: { def: CellDefResult }) {
  return (
    <div className="math-cell-def">
      <span className="math-cell-def-name">{def.label ?? def.name}</span>
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
    </div>
  );
}

/** Renders one `math`-kind `CellOutput` (C3 §3.4): every definition's
 *  `HostChannelRef` summary or per-definition error, plus the cell's own
 *  `errors` (structural problems that never made it into `defs` at all —
 *  ledger R22). A cell with errors still renders its definitions, if any —
 *  a per-cell failure never blanks the cell (CLAUDE.md §5, C3 §3.4). */
export default function MathCell({ output }: { output: CellOutput }) {
  return (
    <div className="math-cell">
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
