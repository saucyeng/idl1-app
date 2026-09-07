import { COLUMN_IDS, type ColumnId } from "./columnPrefs";

/** Which of `COLUMN_IDS`, in reference order, have content to render. A
 *  column whose content is `undefined` (R107: `ColumnFrame`'s `library`
 *  prop omitted by the caller) is left out entirely — no empty panel, no
 *  stray divider handle next to it. Kept in its own dependency-free module
 *  (no `react` import) so it is unit-testable without pulling in
 *  `ColumnFrame.tsx`'s `@/components/ui/resizable` import, which vitest's
 *  `node` environment does not resolve. */
export function visibleColumnIds<T>(content: Partial<Record<ColumnId, T>>): ColumnId[] {
  return COLUMN_IDS.filter((id) => content[id] !== undefined);
}
