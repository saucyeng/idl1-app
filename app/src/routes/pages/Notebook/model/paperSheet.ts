/**
 * What the narrow sheet shows for a tapped paper block (ruling R185 item
 * 1). Paper and the editor alternate on a phone: tapping a block opens
 * this sheet over the paper, and what is inside it depends only on the
 * tapped cell's kind.
 *
 * R184 item 4 originally made a `math` or `table` tap a no-op, because the
 * Properties form only exists for the `js` Plot-chart subset (C2 §5.3).
 * R185 amended that: every cell kind is editable on a phone, and the kinds
 * with no form get the code editor instead — the same `EditorPanes` every
 * other placement mounts, never a second editor built for the phone.
 *
 * This module is the decision alone, so it can be read and tested without
 * mounting anything. `components/EditorPanes.tsx` is what renders the
 * result: it mounts `PropertiesForm` beside `CodePane` for a `js` cell and
 * `CodePane` alone for every other kind — the same split this function
 * returns, which is what `paperSheet.test.ts` pins.
 */
import type { CellKindToken } from "./cells";

/** What the sheet holds for one tapped cell.
 *
 *  - `properties` — the Properties form (and the code editor beside it, as
 *    `EditorPanes` tabs): a `js` cell, the only kind `plotForm` covers.
 *  - `code` — the code editor alone. */
export type PaperSheetContent = "properties" | "code";

/**
 * Which editor content the sheet opens for a tapped block's cell.
 *
 * @param kind - The tapped cell's fence-language token (C2 §2.1).
 */
export function paperSheetContent(kind: CellKindToken): PaperSheetContent {
  return kind === "js" ? "properties" : "code";
}

/**
 * The sheet's own title for `content` — what the sheet actually holds,
 * rather than one fixed word that would be wrong for two of the three
 * kinds now that every kind opens it.
 *
 * @param content - The decision from {@link paperSheetContent}.
 */
export function paperSheetTitle(content: PaperSheetContent): string {
  return content === "properties" ? "Cell properties" : "Cell code";
}
