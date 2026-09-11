/**
 * One cell's displayed title, and the precedence between the two things
 * that can name it (C2 §5.3's `title` option, added 2026-09-11; R216's
 * centred title row, `components/CellFrame.tsx`'s `title` prop).
 *
 * Before this module, a chart could only be titled by the cell's
 * `# label:` line — which a `js` body cannot even carry, since `#` is not a
 * comment there (`graph/cellDisplayName.ts`'s `cellLabelFromBody` returns
 * `null` for one). C2 §5.3 now has a `title` field, so a chart cell can
 * name itself in the one place the rest of its picture is already stated.
 *
 * Pure: no React, no DOM, no IPC. The rule lives here rather than inline at
 * `Notebook/index.tsx`'s call site so the graph card, the report and the
 * notebook cannot disagree about what a cell is called.
 */
import { parse } from "../plotForm/parse";
import { cellLabelFromBody } from "../graph/cellDisplayName";

/**
 * The title to show above `code`'s plot, or `null` for none.
 *
 * **An explicit `title` wins.** When `code` parses as C2 §5.3's `plotForm`
 * subset *and* states a `title`, that is the answer — the document said it,
 * in the same object that states the rest of the picture.
 *
 * **Otherwise the `# label:` line still applies**, unchanged: a `math`
 * cell's label names its chart exactly as it did before this field existed
 * (R216), and a `js` cell with custom code outside the grammar keeps
 * whatever that rule gives it. Nothing that had a title loses one.
 *
 * A cell whose code is outside the grammar simply has no `title` to find,
 * so it takes the fallback — `parse` returning `null` is not an error here,
 * it is the ordinary custom-code case.
 *
 * @param code - The cell's body text, exactly as authored inside its fence.
 */
export function chartTitleFor(code: string): string | null {
  const props = parse(code);
  if (props !== null && props.title !== undefined) return props.title;
  return cellLabelFromBody(code);
}
