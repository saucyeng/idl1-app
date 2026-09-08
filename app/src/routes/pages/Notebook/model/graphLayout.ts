/**
 * Pure read/write of the C2 §3.7.1 `graph` front-matter key — the maths
 * graph view's canvas positions. Operates on the same non-authoritative
 * byte-range scan `cells.ts` uses (`scanCells`'s `frontMatterRange`); it
 * never touches a cell body and never parses the rest of front matter —
 * `constants`/`id`/`name`/`units`/`version` are Rust's (C2 §1). See that
 * section's `graph` row and §3.7.1/§3.7.2 for the full contract this module
 * implements.
 *
 * **Strict, not lenient.** `readGraphLayout` recognises exactly the
 * canonical shape §3.7.1's EBNF defines — two-space `nodes:`/`cells:`
 * sub-keys, four-space `<key>: [x, y]` entries, in that order. Anything
 * else under a top-level `graph:` key (a hand edit, a future contract's
 * richer shape, a stray comment) is "malformed YAML" per §3.7.1: the whole
 * key reads as absent, and `writeGraphLayout` replaces it wholesale rather
 * than merging into it — never a partial rewrite of a shape this module
 * doesn't understand.
 *
 * **Advisory only.** Nothing here is read by the parser or the evaluator
 * (§3.7.1's advisory guarantee) — a bug in this module can misplace a node
 * on screen, never change a value, a wire, or an error.
 */

import { scanCells } from "./cells";

/** One workbook's stored canvas positions (C2 §3.7.1). Both maps default to
 *  `{}` — an empty map means "no position stored", not "positioned at the
 *  origin"; every reader must treat a missing entry as "auto-place this
 *  node", never as `[0, 0]`. */
export interface GraphLayout {
  /** Math-cell definition name → `[x, y]` integer canvas position. */
  nodes: Record<string, [number, number]>;
  /** Math cell `hex8` id → `[x, y]` integer canvas position for that cell's
   *  subgraph frame (§3.7.3). */
  cells: Record<string, [number, number]>;
}

/** The layout of a document with no stored `graph` key — see the module
 *  doc comment's "empty means auto-place", not "positioned at the origin". */
export const EMPTY_GRAPH_LAYOUT: GraphLayout = { nodes: {}, cells: {} };

const IDENTIFIER_RE = "[A-Za-z_][A-Za-z0-9_]*";
const HEX8_RE = "[0-9a-f]{8}";
const KEY_RE = new RegExp(`^(?:${IDENTIFIER_RE}|${HEX8_RE})$`);
const ENTRY_LINE_RE = new RegExp(`^ {4}(${IDENTIFIER_RE}|${HEX8_RE}): \\[(-?\\d+), (-?\\d+)\\]$`);

/** A front-matter block, split into its opening `---` line, its body lines
 *  (newline-stripped, `---` delimiters excluded), and its closing `---`
 *  line — the shared shape both {@link readGraphLayout} and
 *  {@link writeGraphLayout} walk, so the two can never disagree about where
 *  a line boundary falls. */
interface SplitFrontMatter {
  openLine: string;
  body: string[];
  closeLine: string;
  /** Whether the original text ended with a trailing newline after the
   *  closing `---` — always true for a document `scanCells` recognises
   *  (its range ends at the closing line's own newline), kept explicit
   *  rather than assumed so a reassembled document never gains or loses a
   *  byte this module didn't intend to change. */
  trailingNewline: boolean;
}

/** Splits `frontMatterText` — the full `---`-delimited block, delimiters
 *  included — into {@link SplitFrontMatter}. */
function splitFrontMatter(frontMatterText: string): SplitFrontMatter {
  const trailingNewline = frontMatterText.endsWith("\n");
  const withoutTrailing = trailingNewline ? frontMatterText.slice(0, -1) : frontMatterText;
  const lines = withoutTrailing.split("\n").map(stripNewline);
  return {
    openLine: lines[0],
    body: lines.slice(1, -1),
    closeLine: lines[lines.length - 1],
    trailingNewline,
  };
}

/** Strips a trailing `\r`, matching `cells.ts`'s own newline convention
 *  (this module already works on `\n`-split lines, so only `\r` remains). */
function stripNewline(line: string): string {
  return line.replace(/\r$/, "");
}

/** Indent width (leading space count) of a line already stripped of its newline. */
function indentOf(line: string): number {
  const match = /^ */.exec(line);
  return match ? match[0].length : 0;
}

/** The `[start, end)` line-index span, into a body-line array, of a
 *  top-level `graph:` key, if one is present — found regardless of whether
 *  its interior parses (so a malformed block can still be located and
 *  replaced wholesale, per the module doc comment). `null` when no
 *  top-level `graph:` line exists. */
function findGraphBlockLines(body: string[]): { start: number; end: number } | null {
  const start = body.findIndex((line) => line === "graph:");
  if (start === -1) return null;

  let end = body.length;
  for (let i = start + 1; i < body.length; i++) {
    if (body[i].trim().length === 0) continue; // blank lines belong to no key; keep scanning
    if (indentOf(body[i]) === 0) {
      end = i;
      break;
    }
  }
  return { start, end };
}

/** Parses zero or more `position_entry` lines (§3.7.1's EBNF) starting at
 *  `body[from]`, stopping at the first line that doesn't match or at
 *  `until`. Returns the parsed entries and the index of the first
 *  unconsumed line. */
function parseEntries(body: string[], from: number, until: number): { entries: Record<string, [number, number]>; next: number } {
  const entries: Record<string, [number, number]> = {};
  let i = from;
  while (i < until) {
    const match = ENTRY_LINE_RE.exec(body[i]);
    if (match === null) break;
    entries[match[1]] = [Number(match[2]), Number(match[3])];
    i += 1;
  }
  return { entries, next: i };
}

/**
 * Reads the `graph` front-matter key (C2 §3.7.1), or {@link EMPTY_GRAPH_LAYOUT}
 * when the key is absent or malformed. Never throws; never reads a cell body.
 */
export function readGraphLayout(markdown: string): GraphLayout {
  const { frontMatterRange } = scanCells(markdown);
  if (frontMatterRange === null) return EMPTY_GRAPH_LAYOUT;

  const bytes = new TextEncoder().encode(markdown);
  const frontMatterText = new TextDecoder().decode(bytes.subarray(frontMatterRange[0], frontMatterRange[1]));
  const { body } = splitFrontMatter(frontMatterText);

  const block = findGraphBlockLines(body);
  if (block === null) return EMPTY_GRAPH_LAYOUT;

  let cursor = block.start + 1;
  let nodes: Record<string, [number, number]> = {};
  let cells: Record<string, [number, number]> = {};

  if (cursor < block.end && body[cursor] === "  nodes:") {
    const parsed = parseEntries(body, cursor + 1, block.end);
    nodes = parsed.entries;
    cursor = parsed.next;
  }

  if (cursor < block.end && body[cursor] === "  cells:") {
    const parsed = parseEntries(body, cursor + 1, block.end);
    cells = parsed.entries;
    cursor = parsed.next;
  }

  // Anything left over inside the block's span that isn't blank is content
  // this module's strict grammar doesn't recognise — §3.7.1's "malformed
  // YAML" case: the whole key reads as absent.
  for (let i = cursor; i < block.end; i++) {
    if (body[i].trim().length !== 0) return EMPTY_GRAPH_LAYOUT;
  }

  return { nodes, cells };
}

/** Serialises `layout` in the one canonical ASCII shape §3.7.1 specifies —
 *  identifier/`hex8` keys, `[x, y]` flow-sequence integers, `nodes:` before
 *  `cells:`, entries sorted by key for a stable, diffable byte order. Keys
 *  failing {@link KEY_RE} (a name that is neither a valid `identifier` nor
 *  a `hex8`) are silently dropped — this module never writes a byte range
 *  the reader above wouldn't itself recognise back. Returns `[]` (no
 *  `graph:` key at all) when both maps are empty. */
function serialiseGraphLayout(layout: GraphLayout): string[] {
  const nodeKeys = Object.keys(layout.nodes).filter((k) => KEY_RE.test(k)).sort();
  const cellKeys = Object.keys(layout.cells).filter((k) => KEY_RE.test(k)).sort();
  if (nodeKeys.length === 0 && cellKeys.length === 0) return [];

  const lines: string[] = ["graph:"];
  if (nodeKeys.length > 0) {
    lines.push("  nodes:");
    for (const key of nodeKeys) {
      const [x, y] = layout.nodes[key];
      lines.push(`    ${key}: [${x}, ${y}]`);
    }
  }
  if (cellKeys.length > 0) {
    lines.push("  cells:");
    for (const key of cellKeys) {
      const [x, y] = layout.cells[key];
      lines.push(`    ${key}: [${x}, ${y}]`);
    }
  }
  return lines;
}

/**
 * Writes `layout` as the `graph` front-matter key (C2 §3.7.1), replacing
 * only that key's own byte range — every other front-matter byte, and
 * every cell, is untouched. An existing block (well-formed or not, per
 * {@link findGraphBlockLines}) is replaced wholesale; an empty `layout`
 * removes the key entirely (a no-op when it was already absent); a
 * document with no front matter is returned unchanged — there is nowhere
 * to write the key (front matter is always present on a real workbook
 * document, C2 §1), so this is a defensive no-op, not a supported
 * authoring path.
 */
export function writeGraphLayout(markdown: string, layout: GraphLayout): string {
  const { frontMatterRange } = scanCells(markdown);
  if (frontMatterRange === null) return markdown;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(markdown);
  const frontMatterText = decoder.decode(bytes.subarray(frontMatterRange[0], frontMatterRange[1]));
  const { openLine, body, closeLine, trailingNewline } = splitFrontMatter(frontMatterText);

  const block = findGraphBlockLines(body);
  const newBlockLines = serialiseGraphLayout(layout);

  let newBody: string[];
  if (block !== null) {
    newBody = [...body.slice(0, block.start), ...newBlockLines, ...body.slice(block.end)];
  } else if (newBlockLines.length > 0) {
    newBody = [...body, ...newBlockLines];
  } else {
    return markdown; // nothing stored, nothing to remove — no-op
  }

  const newFrontMatterText = [openLine, ...newBody, closeLine].join("\n") + (trailingNewline ? "\n" : "");
  const newFrontMatterBytes = encoder.encode(newFrontMatterText);

  const result = new Uint8Array(frontMatterRange[0] + newFrontMatterBytes.length + (bytes.length - frontMatterRange[1]));
  result.set(bytes.subarray(0, frontMatterRange[0]), 0);
  result.set(newFrontMatterBytes, frontMatterRange[0]);
  result.set(bytes.subarray(frontMatterRange[1]), frontMatterRange[0] + newFrontMatterBytes.length);

  return decoder.decode(result);
}
