/**
 * A cell's display name on the maths graph, and the one edit that changes
 * it (ruling R214 item 2).
 *
 * C2 §3.7.3 makes a cell's display name its `# label:` comment, falling
 * back to the cell id. The fallback is what Isaac saw — *"sub-blocks have
 * weird names 1a000006"* — a `hex8` that names nothing a reader knows. The
 * new fallback is **"Cell N" by document order**; the id survives as a
 * tooltip and in the properties pane, never as the frame title.
 *
 * Renaming writes `# label: <text>` as the cell's **first line** through
 * the ordinary cell-edit path (C2 §3.7.3: an ordinary body edit — it
 * touches no `graph` key and moves nothing). {@link setCellLabelLine} is
 * the pure half of that gesture; the caller hands its result to
 * `model/cells.ts`'s `replaceCellBody` like any other body edit.
 *
 * Math cells only. A `# label:` line is C2 §3.1 math-comment syntax, and
 * `#` is not a comment in a `js` or `table` cell body — those keep the
 * "Cell N" fallback and are not renameable here.
 */

import { scanCells } from "../model/cells";
import { tokenizeMath } from "../model/mathMode";

/** Splits a body into lines on either line ending, so a CRLF document is
 *  read the same as an LF one. */
const LINE_SPLIT_RE = /\r?\n/;

/** Strips the `# label:` prefix from a whole-line label comment's text. */
const LABEL_PREFIX_RE = /^#\s*label\s*:\s*/;

/** The minimum a caller must know about a cell to name it: its id and
 *  whatever `# label:` the document (or an evaluation) already states. */
export interface NameableCell {
  /** The cell's `hex8` id, or `null` for a fence with no valid one. */
  id: string | null;
  /** The cell's `# label:` display name, or `null` when it has none. */
  label: string | null;
}

/**
 * Each identified cell's display name, keyed by cell id: its `# label:`
 * when it has one, else `"Cell N"` where N is the cell's **1-based
 * position in document order** — counting every cell the document declares,
 * of every kind, so the number a reader sees matches the cell's place in
 * the file rather than its place within one kind.
 *
 * @param cells - Every scanned cell, in document order.
 */
export function cellDisplayNames(cells: readonly NameableCell[]): Map<string, string> {
  const names = new Map<string, string>();

  cells.forEach((cell, index) => {
    if (cell.id === null) return;
    const label = cell.label !== null && cell.label.trim().length > 0 ? cell.label.trim() : null;
    names.set(cell.id, label ?? `Cell ${index + 1}`);
  });

  return names;
}

/**
 * `cellId`'s display name, or the `"Cell ?"` placeholder when the document
 * has no such cell — an id from a stale selection names no position, and
 * inventing a number for it would read as a real one.
 *
 * @param names - {@link cellDisplayNames}' result.
 * @param cellId - The cell to name.
 */
export function displayNameFor(names: ReadonlyMap<string, string>, cellId: string): string {
  return names.get(cellId) ?? "Cell ?";
}

/** Whether `line` is a whole-line `# label: …` comment and nothing else
 *  (C2 §3.7.3's cell-level form), judged by the shared math tokenizer
 *  rather than a second regex over the same grammar. */
function isLabelLine(line: string): boolean {
  const tokens = tokenizeMath(line.replace(/\r$/, ""));
  return tokens.length === 1 && tokens[0].kind === "labelComment";
}

/**
 * A math cell's own cell-level display name (C2 §3.7.3): its first
 * non-blank line, when that line is a whole-line `# label: <text>` comment
 * and nothing else. `null` otherwise — including for a `js` or `table`
 * body, where `#` is not a comment at all.
 *
 * The single definition of that rule: `model/graphModel.ts` reads it for a
 * subgraph's label and {@link documentCellDisplayNames} reads it for every
 * cell's name, rather than each scanning the same first line its own way.
 *
 * @param body - The cell's body text.
 */
export function cellLabelFromBody(body: string): string | null {
  for (const line of body.split(LINE_SPLIT_RE)) {
    if (line.trim().length === 0) continue;
    if (!isLabelLine(line)) return null; // first non-blank line is something other than a label comment
    return tokenizeMath(line)[0].text.replace(LABEL_PREFIX_RE, "").trim();
  }
  return null;
}

/**
 * Every identified cell's display name in `markdown`, by cell id — the
 * whole of R214 item 2's naming rule in one call, so the graph's frames,
 * the properties pane's identity bar and anything else that names a cell
 * cannot disagree.
 *
 * @param markdown - The whole `.idl1wb` document.
 */
export function documentCellDisplayNames(markdown: string): Map<string, string> {
  const bytes = new TextEncoder().encode(markdown);
  const decoder = new TextDecoder();

  return cellDisplayNames(
    scanCells(markdown).cells.map((cell) => ({
      id: cell.id,
      label: cell.kind === "math" ? cellLabelFromBody(decoder.decode(bytes.subarray(cell.bodyRange[0], cell.bodyRange[1]))) : null,
    }))
  );
}

/**
 * `body` with its cell-level `# label:` line set to `label`: replacing the
 * existing one when the first non-blank line already is one, otherwise
 * inserting a new first line. A blank `label` **removes** an existing label
 * line instead (the only way back to the "Cell N" fallback) and is a no-op
 * when there was none.
 *
 * The body's own line ending is preserved — `\r\n` in, `\r\n` out — since
 * this text is written straight back into a document that may well use it
 * throughout, and a single reflowed line would be a spurious diff.
 *
 * @param body - The math cell's current body text.
 * @param label - The display name to write; blank clears it.
 */
export function setCellLabelLine(body: string, label: string): string {
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const trimmedLabel = label.trim();
  const lines = body.split(LINE_SPLIT_RE);

  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  const hasLabel = firstContentIndex !== -1 && isLabelLine(lines[firstContentIndex]);

  if (trimmedLabel.length === 0) {
    if (!hasLabel) return body;
    lines.splice(firstContentIndex, 1);
    return lines.join(eol);
  }

  const labelLine = `# label: ${trimmedLabel}`;
  if (hasLabel) {
    lines[firstContentIndex] = labelLine;
    return lines.join(eol);
  }

  return [labelLine, ...lines].join(eol);
}
