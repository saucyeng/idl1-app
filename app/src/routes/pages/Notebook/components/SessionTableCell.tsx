import type { SessionTableView } from "../model/sessionTable";

/**
 * Renders one session-row table (C2 §4 `rowSource: "sessions"`): the
 * workbook's session set, one row per member under a header per group, each
 * row's status chip beside its label, and the Q3 warnings (ruling of
 * 2026-10-28) above the grid with an offer to fetch the sessions they name.
 *
 * Clicking a row makes that member the primary window (session-sets spec
 * §2.3), so the per-session cells show it. `onFetch` is the hook for the
 * library tiers' "Get" (tiers phase 2); omitted, no button is drawn.
 *
 * What to draw is `model/sessionTable.ts`'s; this component only lays it out.
 */
export default function SessionTableCell({
  view,
  dense = false,
  focusedSessionId = null,
  onFocusSession,
  onFetch,
}: {
  view: SessionTableView;
  dense?: boolean;
  focusedSessionId?: string | null;
  onFocusSession?: (sessionId: string) => void;
  onFetch?: (sessionIds: string[]) => void;
}) {
  const cellPadding = dense ? "px-2 py-0.5" : "px-3 py-1.5";
  const columnCount = view.headers.length + 1;

  return (
    <div className="session-table-cell table-cell text-sm">
      {view.warnings.length > 0 && (
        <div className="session-table-warnings text-xs text-amber-600 dark:text-amber-400">
          {view.warnings.map((w, i) => (
            <div key={i}>{w.message}</div>
          ))}
          {onFetch !== undefined && view.missing.length > 0 && (
            <button type="button" className="session-table-fetch underline" onClick={() => onFetch(view.missing)}>
              Get {view.missing.length === 1 ? "this session" : `these ${view.missing.length} sessions`}
            </button>
          )}
        </div>
      )}
      <div className="table-cell-scroll overflow-x-auto">
        <table className="table-cell-grid w-full border-collapse tabular-nums">
          <thead>
            <tr className="border-b border-border">
              <th className={`table-cell-row-head text-left font-medium text-muted-foreground ${cellPadding}`} scope="col">
                Session
              </th>
              {view.headers.map((header) => (
                <th key={header.key} className={`text-right font-medium ${cellPadding}`} scope="col">
                  {header.label}
                  {header.unit !== null && <span className="table-cell-unit ml-1 font-normal text-muted-foreground">({header.unit})</span>}
                </th>
              ))}
            </tr>
          </thead>
          {view.groups.map((group, g) => (
            <tbody key={`${group.name ?? ""}-${g}`}>
              {group.name !== null && (
                <tr className="session-table-group border-b border-border">
                  <th colSpan={columnCount} className={`text-left font-semibold ${cellPadding}`} scope="rowgroup">
                    {group.name}
                  </th>
                </tr>
              )}
              {group.rows.map((row) => (
                <tr
                  key={row.sessionId}
                  className={
                    row.sessionId === focusedSessionId
                      ? "table-cell-row session-table-row border-b border-border bg-accent/40 font-medium"
                      : "table-cell-row session-table-row border-b border-border/50 cursor-pointer hover:bg-accent/20"
                  }
                  onClick={onFocusSession === undefined ? undefined : () => onFocusSession(row.sessionId)}
                >
                  <th className={`table-cell-row-head text-left font-normal ${cellPadding}`} scope="row">
                    {row.label}
                    {row.chip !== null && (
                      <span className="session-table-chip ml-2 rounded bg-muted px-1 text-xs text-muted-foreground">{row.chip}</span>
                    )}
                  </th>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.key}
                      className={
                        cell.status === "error"
                          ? `table-cell-grid-error text-right text-destructive ${cellPadding}`
                          : `text-right ${cellPadding}`
                      }
                      title={cell.error ?? undefined}
                    >
                      {cell.status === "error" ? "✕" : cell.text}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
