/**
 * A narrow, **non-authoritative** fence scan over the `.idl1wb` cell grammar
 * (C2 §2.2–§2.4: `fence_open ::= "```" cell_kind (" " attr)* "\n"`). Gives
 * the Notebook's Code/Properties panes byte ranges per cell without a round
 * trip to Rust on every keystroke (ruling R52 Q3(a), CLAUDE.md §2: "pixels
 * or clicks → app/src"). Rust's `eval_workbook`
 * (`rust/core/src/workbook/v3/`) is the sole authority on cell ids, kinds,
 * and errors (C3 §3.4) — if this scan and Rust's `scan_cells` ever disagree
 * about where a cell starts or ends, Rust wins; this module only has to be
 * fast and good-enough to click into before the next evaluation confirms it.
 * This module does not parse math expressions, YAML front matter content,
 * or table JSON bodies.
 *
 * All ranges are **byte offsets over the document's UTF-8 encoding**,
 * matching Rust's `scan_cells` convention — never JS string indices (a JS
 * string index counts UTF-16 code units, which diverges from UTF-8 byte
 * offsets the moment a multi-byte character — an emoji, an em dash, a
 * non-ASCII letter — appears before the point being indexed). Every
 * function here encodes the document once with `TextEncoder` and computes
 * offsets over the resulting `Uint8Array`; nothing in this file calls
 * `.indexOf`/`.slice` on the raw JS string to produce a range.
 *
 * Mirrors `rust/core/src/workbook/v3/cell.rs`'s `scan_cells`, with three
 * deliberate differences:
 * - Rust walks `pulldown-cmark`'s full CommonMark event stream, so its
 *   inert-fence handling (an outer fence of N backticks is only closed by a
 *   line of ≥N backticks; a shorter backtick run inside it is inert
 *   content, not a nested fence-open) falls out of the general parser. This
 *   scan is a simpler line-oriented state machine that tracks only the open
 *   fence's backtick count and applies the same "close needs ≥N backticks
 *   and nothing else on the line" rule by hand — it does not otherwise
 *   implement CommonMark (no indented fences, no tilde fences, no fence
 *   language beyond exact `math`/`table`/`js`). That subset is what C2 §2.2
 *   defines and all this app authors or generates.
 * - Rust generates a fresh id for a fence with no `id=` attribute (C2
 *   §2.2's "Assignment", a write-path concern for whichever writer saves
 *   next). This scan never mutates the source and never mints an id; a
 *   missing or invalid id comes back as `id: null` (with `idRaw` set when
 *   something invalid was present, per ruling R21) so the UI can render
 *   C2's `InvalidCellId` instead of a value nothing has actually assigned.
 * - Rust collects `DuplicateCellId` as a `WorkbookError` (C2 §2.2's
 *   "Uniqueness"). This scan performs no such validation — errors are
 *   Rust's authority (C3 §3.4) — and simply returns every fence it finds,
 *   duplicates included.
 */

/** A cell's fence-language token (C2 §2.1). */
export type CellKindToken = "math" | "table" | "js";

/**
 * One fenced cell as this scan sees it (C2 §2.2/§2.4). Non-authoritative —
 * see the module doc comment.
 */
export interface ScannedCell {
  /** The captured `id=` attribute value, or `null` if absent or not a well-formed hex8 (C2 §2.2, ruling R21). */
  id: string | null;
  /** The raw `id=` attribute value verbatim, even when invalid — `null` only when no `id=` attribute was present at all (ruling R21). */
  idRaw: string | null;
  /** `math` / `table` / `js` (C2 §2.1). */
  kind: CellKindToken;
  /** The fence-open line's info string verbatim (everything after the opening backticks, up to the line's newline) — round-tripped, not interpreted (C2 §2.2's "reserved attribute namespace"). */
  infoLine: string;
  /** `[start, end)` UTF-8 byte offsets of the fence body — from just after the fence-open line's newline to just before the fence-close line. */
  bodyRange: [number, number];
  /** `[start, end)` UTF-8 byte offsets of the prose span immediately preceding this cell (C2 §2.4), or `null` when there is none. */
  proseBeforeRange: [number, number] | null;
  /** `[start, end)` UTF-8 byte offsets of trailing prose after this cell's fence-close, up to the next cell or end of document. Only ever set on the last cell in document order (C2 §2.4). */
  proseAfterRange: [number, number] | null;
}

/** A document's fence scan result (C2 §2). Non-authoritative — see the module doc comment. */
export interface ScannedDoc {
  /** `[start, end)` UTF-8 byte offsets of the leading `---`-delimited front-matter block, or `null` when the document has none. The YAML content itself is not parsed here — that is Rust's job. */
  frontMatterRange: [number, number] | null;
  /** Fenced cells in document order. Empty for a document with no fenced cells (C2 §2.4 — legal, e.g. a pure-prose note); in that case the whole body is prose with no `ScannedCell` to attach it to. */
  cells: ScannedCell[];
}

const HEX8_RE = /^[0-9a-f]{8}$/;

/** One line of the source document, with its `[start, end)` UTF-8 byte offsets (including its trailing newline, if any). */
interface ByteLine {
  text: string;
  start: number;
  end: number;
}

/** Strips a trailing `\r\n` or `\n` from a line's text, for content comparisons. */
function stripNewline(text: string): string {
  return text.replace(/\r?\n$/, "");
}

/** Splits `markdown` into lines (each keeping its trailing newline) tagged with cumulative UTF-8 byte offsets. */
function splitIntoByteLines(markdown: string): ByteLine[] {
  const encoder = new TextEncoder();
  const lines: ByteLine[] = [];
  let offset = 0;

  for (const raw of markdown.split(/(?<=\n)/)) {
    if (raw.length === 0) continue;
    const byteLength = encoder.encode(raw).length;
    lines.push({ text: raw, start: offset, end: offset + byteLength });
    offset += byteLength;
  }

  return lines;
}

/** A parsed fence marker line: its backtick run length and everything after it (the info string, for an opener; expected empty for a closer). */
interface FenceMarker {
  tickCount: number;
  info: string;
}

const FENCE_LINE_RE = /^(`{3,})(.*)$/;

/** Matches a line (without its trailing newline) against the fence-marker shape `` `{3,}<info> ``, or returns `null` if it is not a fence line at all. */
function matchFenceLine(lineNoNewline: string): FenceMarker | null {
  const match = FENCE_LINE_RE.exec(lineNoNewline);
  if (match === null) return null;
  return { tickCount: match[1].length, info: match[2] };
}

/** True when `marker` is a valid *closing* fence for an opener of `openTickCount` backticks: at least as many backticks, and nothing else on the line. */
function isFenceClose(marker: FenceMarker, openTickCount: number): boolean {
  return marker.tickCount >= openTickCount && marker.info.trim().length === 0;
}

/** The result of recognising a fence-open line's info string as a cell (C2 §2.2), or `null` when the fence is inert (C2 §2.1). */
interface ParsedCellOpen {
  kind: CellKindToken;
  id: string | null;
  idRaw: string | null;
}

/** Parses a fence-open line's info string against C2 §2.2's grammar: `cell_kind (" " attr)*`, `attr ::= "id=" hex8`. Returns `null` when `info`'s first token is not `math`/`table`/`js` — that fence is inert (C2 §2.1) and must not be reported as a cell. */
function parseCellOpen(info: string): ParsedCellOpen | null {
  const trimmed = info.trim();
  if (trimmed.length === 0) return null;

  const tokens = trimmed.split(/\s+/);
  const kind = tokens[0];
  if (kind !== "math" && kind !== "table" && kind !== "js") return null;

  let id: string | null = null;
  let idRaw: string | null = null;
  for (const attr of tokens.slice(1)) {
    if (attr.startsWith("id=")) {
      const value = attr.slice("id=".length);
      idRaw = value;
      if (HEX8_RE.test(value)) id = value;
    }
  }

  return { kind, id, idRaw };
}

/** Finds the leading `---`-delimited front-matter block, if any. Returns its byte range and the index of the first line after it (0 when there is no front matter). */
function scanFrontMatter(lines: ByteLine[]): { range: [number, number] | null; bodyStart: number } {
  if (lines.length === 0 || stripNewline(lines[0].text) !== "---") {
    return { range: null, bodyStart: 0 };
  }

  for (let i = 1; i < lines.length; i++) {
    if (stripNewline(lines[i].text) === "---") {
      return { range: [0, lines[i].end], bodyStart: i + 1 };
    }
  }

  return { range: null, bodyStart: 0 };
}

/** An in-progress cell between its fence-open and fence-close lines. */
interface OpenCell {
  kind: CellKindToken;
  id: string | null;
  idRaw: string | null;
  infoLine: string;
  tickCount: number;
  bodyStart: number;
  proseBeforeRange: [number, number] | null;
}

function finishCell(open: OpenCell, bodyEnd: number): ScannedCell {
  return {
    id: open.id,
    idRaw: open.idRaw,
    kind: open.kind,
    infoLine: open.infoLine,
    bodyRange: [open.bodyStart, bodyEnd],
    proseBeforeRange: open.proseBeforeRange,
    proseAfterRange: null,
  };
}

/**
 * Fence-scans `markdown` into its front-matter span and cells (C2 §2),
 * attaching prose spans per C2 §2.4. Non-authoritative — see the module doc
 * comment. Pure: makes no assumption about the document beyond its text.
 */
export function scanCells(markdown: string): ScannedDoc {
  const lines = splitIntoByteLines(markdown);
  const totalBytes = new TextEncoder().encode(markdown).length;
  const { range: frontMatterRange, bodyStart } = scanFrontMatter(lines);

  const cells: ScannedCell[] = [];
  let segmentStart = frontMatterRange !== null ? frontMatterRange[1] : 0;
  let open: OpenCell | null = null;
  let insideInert = false;
  let inertTickCount = 0;

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i];
    const content = stripNewline(line.text);

    if (open !== null) {
      const marker = matchFenceLine(content);
      if (marker !== null && isFenceClose(marker, open.tickCount)) {
        cells.push(finishCell(open, line.start));
        segmentStart = line.end;
        open = null;
      }
      continue;
    }

    if (insideInert) {
      const marker = matchFenceLine(content);
      if (marker !== null && isFenceClose(marker, inertTickCount)) {
        insideInert = false;
      }
      continue;
    }

    const marker = matchFenceLine(content);
    if (marker === null) continue;

    const parsed = parseCellOpen(marker.info);
    if (parsed === null) {
      insideInert = true;
      inertTickCount = marker.tickCount;
      continue;
    }

    open = {
      kind: parsed.kind,
      id: parsed.id,
      idRaw: parsed.idRaw,
      infoLine: marker.info,
      tickCount: marker.tickCount,
      bodyStart: line.end,
      proseBeforeRange: segmentStart < line.start ? [segmentStart, line.start] : null,
    };
  }

  // An unterminated fence at end of file is closed at the document's end
  // rather than dropped, so no source text silently disappears from the
  // scan (this is not exercised by the current test suite — no fixture
  // leaves a fence open — but is the safer default for hand-edited files).
  if (open !== null) {
    cells.push(finishCell(open, totalBytes));
    segmentStart = totalBytes;
  }

  if (cells.length > 0 && segmentStart < totalBytes) {
    const last = cells[cells.length - 1];
    cells[cells.length - 1] = { ...last, proseAfterRange: [segmentStart, totalBytes] };
  }

  return { frontMatterRange, cells };
}

/**
 * Replaces the body of the cell with id `cellId` with `newBody`, leaving
 * every other byte of `markdown` untouched. Operates on the UTF-8 byte
 * encoding throughout, so a `newBody` of a different byte length than the
 * original (including one containing multi-byte characters) does not
 * corrupt surrounding offsets. Returns `markdown` unchanged when no cell
 * with `cellId` is found (per the brief: this is the correct outcome, not
 * an error — the caller is expected to have just read `cellId` from this
 * same document's `scanCells` result).
 */
export function replaceCellBody(markdown: string, cellId: string, newBody: string): string {
  const target = scanCells(markdown).cells.find((cell) => cell.id === cellId);
  if (target === undefined) return markdown;

  const encoder = new TextEncoder();
  const bytes = encoder.encode(markdown);
  const newBodyBytes = encoder.encode(newBody);
  const [start, end] = target.bodyRange;

  const result = new Uint8Array(start + newBodyBytes.length + (bytes.length - end));
  result.set(bytes.subarray(0, start), 0);
  result.set(newBodyBytes, start);
  result.set(bytes.subarray(end), start + newBodyBytes.length);

  return new TextDecoder().decode(result);
}
