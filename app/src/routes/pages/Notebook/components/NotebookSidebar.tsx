import { cn } from "@/lib/utils";
import type { ScannedCell } from "../model/cells";
import type { WorkbookEntry } from "../model/workbookEntry";

/** Props for {@link NotebookSidebar}. */
export interface NotebookSidebarProps {
  /** The workbook list and which one is open (`model/workbookEntry.ts`). */
  entry: WorkbookEntry | null;
  /** Opens a workbook by id — the page's existing `handleSelect`. */
  onSelectWorkbook: (workbookId: string) => void;
  /** This document's cells, in document order. */
  cells: readonly ScannedCell[];
  /** A cell's display name, by cell id (`graph/cellDisplayName.ts`). */
  displayName: (cellId: string) => string;
  /** The cell whose properties and code the editor is showing, or `null`. */
  selectedCellId: string | null;
  onSelectCell: (cellId: string) => void;
}

/** A cell with no `id=` attribute cannot be selected or named, so the
 *  outline shows its kind and position instead of pretending it has a
 *  name. Rare — a well-formed document gives every cell an id — but a
 *  document being hand-edited passes through this state on the way. */
function unnamedLabel(cell: ScannedCell, index: number): string {
  return `${cell.kind} cell ${index + 1}`;
}

/**
 * The Notebook activity's sidebar content (ruling R220 item 1): the
 * workbook picker and the cells list.
 *
 * There are no worksheet tabs. R220 item 1 names them, but this document
 * model has no worksheet — a workbook is one markdown file of cells, and
 * "worksheet" appears in the code only as prose for that one document. An
 * empty tab strip over a concept that does not exist would be furniture.
 *
 * The cells list is an outline, not a second copy of the notebook: one line
 * per cell, its display name, click to select. It is how you get to a cell
 * in a long document without scrolling for it, which is the job a sidebar
 * list does.
 */
export default function NotebookSidebar({
  entry,
  onSelectWorkbook,
  cells,
  displayName,
  selectedCellId,
  onSelectCell,
}: NotebookSidebarProps) {
  const choices = entry !== null && entry.kind === "choice" ? entry.choices : [];
  const openWorkbookId = entry !== null && entry.kind !== "empty" ? entry.workbookId : null;

  return (
    <div className="flex flex-col gap-3 py-2 font-mono text-sm">
      {choices.length > 0 && (
        <section className="flex flex-col gap-0.5">
          <h3 className="px-3 text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase">Workbooks</h3>
          {choices.map((choice) => (
            <button
              key={choice.workbook_id}
              type="button"
              aria-current={choice.workbook_id === openWorkbookId ? "true" : undefined}
              onClick={() => onSelectWorkbook(choice.workbook_id)}
              title={choice.file_name}
              className={cn(
                "truncate px-3 py-1 text-left hover:bg-control",
                choice.workbook_id === openWorkbookId ? "bg-control-active text-fg" : "text-fg-dim",
              )}
            >
              {choice.name}
            </button>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-0.5">
        <h3 className="px-3 text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase">Cells</h3>
        {cells.length === 0 ? (
          <p className="px-3 py-1 text-xs text-fg-dim">
            {openWorkbookId === null ? "Open a workbook to see its cells." : "This workbook has no cells yet."}
          </p>
        ) : (
          cells.map((cell, index) => {
            const id = cell.id;
            const label = id === null ? unnamedLabel(cell, index) : displayName(id);
            return (
              <button
                key={id ?? `unnamed-${index}`}
                type="button"
                disabled={id === null}
                aria-current={id !== null && id === selectedCellId ? "true" : undefined}
                onClick={() => id !== null && onSelectCell(id)}
                className={cn(
                  "flex items-baseline gap-2 px-3 py-1 text-left hover:bg-control disabled:cursor-default disabled:hover:bg-transparent",
                  id !== null && id === selectedCellId ? "bg-control-active text-fg" : "text-fg-dim",
                )}
              >
                <span className="w-8 shrink-0 text-label-2 text-fg-faint">{cell.kind}</span>
                <span className="min-w-0 flex-1 truncate">{label}</span>
              </button>
            );
          })
        )}
      </section>
    </div>
  );
}
