/**
 * Decides which workbook the Notebook opens, and which chrome it shows
 * (empty state, no picker, or a picker), from `list_workbooks`' own result
 * (L6 Task 21, R66 item 3). Pure: no IPC, no React — `Notebook/index.tsx`
 * renders what this returns and never re-decides which workbook to open or
 * whether an empty/picker state applies.
 */

/** The minimum of `WorkbookSummary` this module reads (structural, so a
 *  caller passes the real `ipc/catalog.ts` type unchanged). */
export interface WorkbookChoice {
  workbook_id: string;
  name: string;
  file_name: string;
}

/** What the Notebook shows for the current workbook list. */
export type WorkbookEntry =
  /** No indexed workbooks, and the rescan-on-open has already run (or is
   *  not applicable) — show the empty state: New workbook + Rescan. */
  | { kind: "empty" }
  /** Exactly one — open it, show no picker. */
  | { kind: "single"; workbookId: string }
  /** More than one — open `workbookId` and show the picker over `choices`. */
  | { kind: "choice"; workbookId: string; choices: readonly WorkbookChoice[] };

/**
 * Decides what to show and what to open. `rememberedId` is the last
 * workbook this machine opened (`model/notebookPrefs.ts`); it wins when it
 * is still in `workbooks`, otherwise the first entry does — a workbook
 * deleted or renamed away must not leave the Notebook unable to open
 * anything. `workbooks` order is `list_workbooks`' own; this function
 * never sorts.
 */
export function chooseWorkbookEntry(workbooks: readonly WorkbookChoice[], rememberedId: string | null): WorkbookEntry {
  if (workbooks.length === 0) {
    return { kind: "empty" };
  }

  const remembered = rememberedId !== null ? workbooks.find((w) => w.workbook_id === rememberedId) : undefined;
  const chosen = remembered ?? workbooks[0];

  if (workbooks.length === 1) {
    return { kind: "single", workbookId: chosen.workbook_id };
  }

  return { kind: "choice", workbookId: chosen.workbook_id, choices: workbooks };
}
