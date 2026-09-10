/**
 * Which editor content a cell kind gets: the Properties form (with the
 * code editor beside it) for a `js` cell, the code editor alone for every
 * other kind — because the Properties form only covers the `js` Plot-chart
 * subset (C2 §5.3).
 *
 * The decision alone, so it can be read and tested without mounting
 * anything, and so there is exactly **one** answer to it. Both consumers
 * ask this module rather than re-testing `kind` themselves:
 * `components/EditorPanes.tsx` renders the result, and
 * `Notebook/index.tsx` titles the narrow sheet from it.
 *
 * That sheet is where this matters most (ruling R185 item 1). R184 item 4
 * originally made tapping a `math` or `table` block on the paper view a
 * no-op, since there was no form to open; R185 amended it — every cell
 * kind is editable on a phone, and the kinds with no form get the code
 * editor, in the same `EditorPanes` every other placement mounts, never a
 * second editor built for the phone.
 */
import type { CellKindToken } from "./cells";

/** What an open cell's editor holds.
 *
 *  - `properties` — the Properties form (and the code editor beside it, as
 *    `EditorPanes` tabs): a `js` cell, the only kind `plotForm` covers.
 *  - `code` — the code editor alone. */
export type EditorContent = "properties" | "code";

/**
 * Which editor content `kind` gets.
 *
 * @param kind - The open cell's fence-language token (C2 §2.1).
 */
export function editorContentFor(kind: CellKindToken): EditorContent {
  return kind === "js" ? "properties" : "code";
}

/**
 * The narrow sheet's title for `content` — what the sheet actually holds,
 * rather than one fixed word that would be wrong for two of the three
 * kinds now that every kind opens it (R185 item 1).
 *
 * @param content - The decision from {@link editorContentFor}.
 */
export function sheetTitleFor(content: EditorContent): string {
  return content === "properties" ? "Cell properties" : "Cell code";
}
