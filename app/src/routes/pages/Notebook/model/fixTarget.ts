/**
 * Decides which cell a chart's "Fix" button (decision 58,
 * `runs/2026-09-07/ui/UI-DIRECTION-2.md` §D) opens. R150's binding failures
 * already name *which* channel or definition failed to resolve — this
 * module is the one place that turns that name into a cell to select
 * (`Notebook/index.tsx`'s existing `selectedCellId` mechanism, which already
 * opens the properties column via R109's portal). Pure: no React, no DOM.
 *
 * Two cases exist. A cell whose *own* code failed (a sandbox `cellError`, a
 * malformed cell) is fixed by opening that same cell — there is nothing
 * else to point at. A cell whose *chart* is empty because it references a
 * definition whose own math cell errored (R150's amendment — a bare
 * identifier, a missing FFT key) is fixed by opening the definition's own
 * declaring cell, not the chart referencing it: that is where the actual
 * mistake lives.
 */

/** Resolves the cell id "Fix" should open. */
export function fixTargetCellId(input: {
  /** This chart's own cell id. */
  cellId: string;
  /** The name of the definition this chart's binding could not resolve, or
   *  `null` when the failure is the cell's own code (a sandbox error, or no
   *  specific unresolved name at all). */
  failedDefinitionName: string | null;
  /** `model/graphModel.ts`'s `definitionCellIds` — every declared
   *  definition's own cell, by name. */
  definitionCellIds: ReadonlyMap<string, string>;
}): string {
  if (input.failedDefinitionName !== null) {
    const declaringCellId = input.definitionCellIds.get(input.failedDefinitionName);
    if (declaringCellId !== undefined) return declaringCellId;
  }
  return input.cellId;
}
