/**
 * Which cells have their code revealed (UI-DIRECTION decision 30: code is
 * collapsed at rest, output only, with a per-cell toggle). The revealed set
 * is UI state, not workbook content — it never reaches the file and is not
 * persisted (it is not written through `model/notebookPrefs.ts` or any
 * other storage).
 */

/**
 * Toggles `cellId`'s membership in `revealed`, returning a new set —
 * `revealed` is never mutated, matching every other immutable-state helper
 * in this lane (`model/cellLayout.ts`'s `recordCellHeight`), since this is
 * consumed directly as a `useState` setter argument.
 *
 * @param revealed - The cell ids currently showing their code.
 * @param cellId - The cell whose toggle was clicked.
 */
export function toggleCode(revealed: ReadonlySet<string>, cellId: string): ReadonlySet<string> {
  const next = new Set(revealed);
  if (next.has(cellId)) {
    next.delete(cellId);
  } else {
    next.add(cellId);
  }
  return next;
}

/**
 * Whether `cellId`'s code is currently revealed — `false` for any id not in
 * `revealed`, including one this notebook has never seen.
 *
 * @param revealed - The cell ids currently showing their code.
 * @param cellId - The cell to check.
 */
export function isCodeVisible(revealed: ReadonlySet<string>, cellId: string): boolean {
  return revealed.has(cellId);
}
