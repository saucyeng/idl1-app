/**
 * Where each cell lives in the **whole** `.idl1wb` document, as character
 * offsets (ruling R214 item 3: "the code column is the whole workbook").
 *
 * The Properties/Code column now shows the entire document in one
 * CodeMirror instance rather than one cell body per open cell, so the
 * column needs the inverse of what `model/cells.ts` gives every other
 * caller: not "this cell's body text" but "where in the document is this
 * cell, and which cell is the caret in". Both directions come from
 * `scanCells` — **never a second parser** (R214 item 3); this module only
 * re-expresses that one scan's byte ranges in the units CodeMirror counts
 * in.
 *
 * **Bytes in, characters out.** `model/cells.ts` reports UTF-8 byte offsets
 * (Rust's convention, so the two scans can be compared). CodeMirror's
 * `EditorState.doc` is indexed in **JS string units** (UTF-16 code units),
 * which diverge from UTF-8 bytes the moment a non-ASCII character appears
 * earlier in the document. Every offset this module returns is a JS string
 * index, converted through {@link buildByteToChar} — a caller may pass them
 * straight to `EditorView.dispatch`/`doc.lineAt` without further arithmetic.
 */

import { scanCells, type CellKindToken } from "./cells";

/** One cell's place in the document, in JS string (UTF-16 code unit)
 *  offsets over the same `markdown` the ranges were computed from. */
export interface DocumentCellRange {
  /** The cell's `hex8` id (C2 §2.2). A cell whose fence carries no valid
   *  id has no entry at all — there is nothing for a selection to name. */
  cellId: string;
  /** The fence-language token (C2 §2.1). */
  kind: CellKindToken;
  /** Offset of the fence-open line's first character (the first backtick).
   *  What a fold marker and a "scroll to this cell" both want: the cell's
   *  visible top, not its body's. */
  fenceFrom: number;
  /** Offset of the body's first character — just past the fence-open
   *  line's newline. Equal to {@link to} for an empty body. */
  from: number;
  /** Offset just past the body's last character — the start of the
   *  fence-close line. */
  to: number;
}

/**
 * A lookup table from UTF-8 byte offset to JS string index over
 * `markdown`. Entry `i` holds the string index of the character whose
 * encoding contains byte `i`; the entry one past the end holds
 * `markdown.length`, so an exclusive end offset converts like any other.
 *
 * @param markdown - The document the offsets are over.
 */
function buildByteToChar(markdown: string): Int32Array {
  const byteLength = new TextEncoder().encode(markdown).length;
  const map = new Int32Array(byteLength + 1);

  let byte = 0;
  let i = 0;
  while (i < markdown.length) {
    const codePoint = markdown.codePointAt(i);
    if (codePoint === undefined) break;
    const encodedBytes = codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
    for (let k = 0; k < encodedBytes; k++) map[byte + k] = i;
    byte += encodedBytes;
    i += codePoint >= 0x10000 ? 2 : 1;
  }
  map[byteLength] = markdown.length;

  return map;
}

/** The character offset of the start of the line containing `bodyFrom - 1`
 *  — i.e. the fence-open line, since `bodyFrom` points just past that
 *  line's newline. `0` when the fence opens the document. */
function fenceLineStart(markdown: string, bodyFrom: number): number {
  if (bodyFrom <= 0) return 0;
  return markdown.lastIndexOf("\n", bodyFrom - 2) + 1;
}

/**
 * Every identified cell's place in `markdown`, in document order.
 *
 * @param markdown - The whole `.idl1wb` document.
 */
export function documentCellRanges(markdown: string): DocumentCellRange[] {
  const byteToChar = buildByteToChar(markdown);
  const ranges: DocumentCellRange[] = [];

  for (const cell of scanCells(markdown).cells) {
    if (cell.id === null) continue;
    const from = byteToChar[cell.bodyRange[0]] ?? markdown.length;
    const to = byteToChar[cell.bodyRange[1]] ?? markdown.length;
    ranges.push({ cellId: cell.id, kind: cell.kind, fenceFrom: fenceLineStart(markdown, from), from, to });
  }

  return ranges;
}

/**
 * The cell whose extent covers `offset` — fence-open line through body
 * end, inclusive of both edges so a caret parked on the fence line or at
 * the very end of the body still names the cell it belongs to. `null` for
 * an offset in prose, in front matter, or on a fence-close line.
 *
 * @param ranges - {@link documentCellRanges}' result for the same document.
 * @param offset - A JS string index into that document.
 */
export function cellIdAtOffset(ranges: readonly DocumentCellRange[], offset: number): string | null {
  for (const range of ranges) {
    if (offset >= range.fenceFrom && offset <= range.to) return range.cellId;
  }
  return null;
}

/**
 * `cellId`'s range, or `null` when the document has no such identified
 * cell (a stale selection after an edit removed it, say).
 *
 * @param ranges - {@link documentCellRanges}' result.
 * @param cellId - The cell to find.
 */
export function rangeForCell(ranges: readonly DocumentCellRange[], cellId: string): DocumentCellRange | null {
  return ranges.find((range) => range.cellId === cellId) ?? null;
}

/** One cell's body text, decoded from `markdown`'s UTF-8 encoding by the
 *  byte range `scanCells` reports (the same decode `graphModel.ts` does). */
function bodyTextsByCellId(markdown: string): Map<string, string> {
  const bytes = new TextEncoder().encode(markdown);
  const decoder = new TextDecoder();

  const bodies = new Map<string, string>();
  for (const cell of scanCells(markdown).cells) {
    if (cell.id === null) continue;
    bodies.set(cell.id, decoder.decode(bytes.subarray(cell.bodyRange[0], cell.bodyRange[1])));
  }
  return bodies;
}

/**
 * Which cells' bodies differ between two revisions of the same document —
 * what a whole-document edit has to mark dirty, since one such edit may
 * touch any number of cells (or none, when only prose or front matter
 * changed). A cell present in only one of the two revisions counts as
 * changed: it was added or removed, and either way its evaluation is no
 * longer current.
 *
 * @param before - The document before the edit.
 * @param after - The document after the edit.
 */
export function changedCellIds(before: string, after: string): string[] {
  const beforeBodies = bodyTextsByCellId(before);
  const afterBodies = bodyTextsByCellId(after);

  const changed: string[] = [];
  for (const [cellId, body] of afterBodies) {
    if (beforeBodies.get(cellId) !== body) changed.push(cellId);
  }
  for (const cellId of beforeBodies.keys()) {
    if (!afterBodies.has(cellId)) changed.push(cellId);
  }

  return changed;
}
