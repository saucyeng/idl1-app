/**
 * Click-to-edit prose (ruling R226): opening one rendered prose block as
 * its own Markdown source, and folding the edited source back into the
 * whole document.
 *
 * Pure — no React, no DOM, no IPC. `Notebook/components/ProseEditor.tsx`
 * renders the mini-editor this module decides the contents of, and
 * `Notebook/index.tsx` writes a commit through the same `editCell` action
 * every other cell edit uses (R214's range map keeps the whole-workbook
 * code column in step, because there is only ever one document string).
 *
 * **Not WYSIWYG** (R226 item 1). The editor holds the block's Markdown
 * verbatim, inline `${…}` spans included; a rich-text layer would have to
 * round-trip Markdown through HTML and back, which is lossy, and the file
 * is the truth.
 *
 * **Bytes in, characters out.** `model/cells.ts` reports UTF-8 byte
 * offsets; every offset this module returns is a JS string index over the
 * same document, so a caller may slice with it directly. The same
 * convention `model/documentRanges.ts` follows.
 */

import { scanCells, type ScannedCell } from "./cells";

/** Which side of its cell a prose block sits on (C2 §2.4). */
export type ProsePosition = "before" | "after";

/** One prose block's place in the document and its current source text. */
export interface ProseEditTarget {
  /** `model/proseBlocks.ts`'s `"{cellId}::before"` / `"{cellId}::after"`. */
  blockId: string;
  /** The C2 fence-string id of the cell this block is attached to — the
   *  cell a commit marks dirty through `editCell`. */
  cellId: string;
  position: ProsePosition;
  /** Offset of the block's first character, as a JS string index. */
  from: number;
  /** Offset just past the block's last character, as a JS string index. */
  to: number;
  /** `markdown.slice(from, to)` — the Markdown the editor opens with. */
  source: string;
}

/** An open prose mini-editor: what it was opened over, what the user has
 *  typed so far, and the message under it after a rejected commit. */
export interface ProseEditSession {
  target: ProseEditTarget;
  /** The editor's current text. Equal to `target.source` at open. */
  draft: string;
  /** The last commit's rejection message, or `null` while the draft has
   *  not been rejected (R226 item 3: a failed commit keeps the editor open
   *  with the error under it). */
  error: string | null;
}

/** The outcome of {@link commitProseEdit}. */
export type ProseCommit =
  | { status: "committed"; markdown: string; cellId: string }
  | { status: "unchanged"; cellId: string }
  | { status: "rejected"; session: ProseEditSession };

/** A line that opens or closes a C2 fence: up to three leading spaces then
 *  three or more backticks. Prose containing one would split the document
 *  into different cells, which is a cell edit, not a prose edit. */
const FENCE_LINE_RE = /^ {0,3}```/m;

/** The JS string index of UTF-8 byte offset `byteOffset` in `markdown`.
 *  Only ever called with a boundary `scanCells` reported, so the prefix
 *  always decodes cleanly. */
function byteToChar(markdown: string, byteOffset: number): number {
  const bytes = new TextEncoder().encode(markdown);
  return new TextDecoder().decode(bytes.subarray(0, byteOffset)).length;
}

/** Splits `"{cellId}::before"` into its two halves, or `null` when the id
 *  is not one this module minted. */
function splitBlockId(blockId: string): { cellId: string; position: ProsePosition } | null {
  const at = blockId.lastIndexOf("::");
  if (at <= 0) return null;

  const cellId = blockId.slice(0, at);
  const suffix = blockId.slice(at + 2);
  if (suffix !== "before" && suffix !== "after") return null;

  return { cellId, position: suffix };
}

/**
 * Where `blockId`'s prose lives in `markdown`, or `null` when this document
 * has no such block (a stale click after a watch event replaced the
 * document, say).
 *
 * @param markdown - The whole `.idl1wb` document.
 * @param cells - `scanCells(markdown).cells` for that same document.
 * @param blockId - `model/proseBlocks.ts`'s `ProseBlock.blockId`.
 */
export function proseEditTarget(markdown: string, cells: readonly ScannedCell[], blockId: string): ProseEditTarget | null {
  const split = splitBlockId(blockId);
  if (split === null) return null;

  const cell = cells.find((candidate) => candidate.id === split.cellId);
  if (cell === undefined) return null;

  const range = split.position === "before" ? cell.proseBeforeRange : cell.proseAfterRange;
  if (range === null) return null;

  const from = byteToChar(markdown, range[0]);
  const to = byteToChar(markdown, range[1]);

  return { blockId, cellId: split.cellId, position: split.position, from, to, source: markdown.slice(from, to) };
}

/**
 * Opens `blockId`'s prose in a mini-editor, or `null` when it no longer
 * exists — the caller leaves the block rendered rather than opening an
 * editor over nothing.
 *
 * @param markdown - The whole document.
 * @param cells - That document's fence scan.
 * @param blockId - The block that was clicked.
 */
export function openProseEdit(markdown: string, cells: readonly ScannedCell[], blockId: string): ProseEditSession | null {
  const target = proseEditTarget(markdown, cells, blockId);
  if (target === null) return null;

  return { target, draft: target.source, error: null };
}

/**
 * The session with `draft` as its text and any previous rejection cleared —
 * the message under a rejected editor names what the *last commit* was, not
 * what the user is typing now.
 *
 * @param session - The open session.
 * @param draft - The editor's new text.
 */
export function draftProseEdit(session: ProseEditSession, draft: string): ProseEditSession {
  if (draft === session.draft && session.error === null) return session;

  return { ...session, draft, error: null };
}

/**
 * Why `draft` cannot be this block's prose, or `null` when it can. The one
 * rule prose has to obey is that it stays prose: a ``` line would open or
 * close a fence, which is a change to the document's cell structure and
 * belongs in the code column, not in a prose block.
 *
 * @param draft - The editor's text.
 */
export function proseSourceError(draft: string): string | null {
  if (FENCE_LINE_RE.test(draft)) {
    return "Prose cannot contain a ``` fence — a new cell is added from the code column.";
  }
  return null;
}

/**
 * The document with `session.draft` in place of the block's old source, or
 * a rejection that keeps the editor open with a message under it.
 *
 * The range is re-resolved from the document handed in rather than trusted
 * from open time, so a watch event or a code-column edit that landed while
 * the editor was open cannot make a commit splice over the wrong text. The
 * result is re-scanned before it is accepted: a prose edit that changed any
 * cell's body changed something it had no business changing, and is
 * refused rather than written.
 *
 * The block's trailing newline is restored when the draft drops it —
 * without it the following fence-open line would be glued onto the last
 * line of prose, which is a fence-structure change made by deleting one
 * invisible character.
 *
 * @param markdown - The document as it stands now.
 * @param cells - That document's fence scan.
 * @param session - The open session.
 */
export function commitProseEdit(markdown: string, cells: readonly ScannedCell[], session: ProseEditSession): ProseCommit {
  const reject = (message: string): ProseCommit => ({ status: "rejected", session: { ...session, error: message } });

  const sourceError = proseSourceError(session.draft);
  if (sourceError !== null) return reject(sourceError);

  const target = proseEditTarget(markdown, cells, session.target.blockId);
  if (target === null) return reject("This prose block is no longer in the document.");

  const draft = target.source.endsWith("\n") && !session.draft.endsWith("\n") ? `${session.draft}\n` : session.draft;
  if (draft === target.source) return { status: "unchanged", cellId: target.cellId };

  const next = `${markdown.slice(0, target.from)}${draft}${markdown.slice(target.to)}`;
  if (cellBodiesChanged(markdown, next)) return reject("That edit would change the document's cells, not just its prose.");

  return { status: "committed", markdown: next, cellId: target.cellId };
}

/** Whether the two revisions disagree about any cell's id or body — the
 *  structural safety net a prose commit has to pass. */
function cellBodiesChanged(before: string, after: string): boolean {
  const key = (markdown: string): string =>
    scanCells(markdown)
      .cells.map((cell) => `${cell.id ?? "?"} ${cell.infoLine} ${cell.bodyRange[1] - cell.bodyRange[0]}`)
      .join("");

  if (key(before) !== key(after)) return true;

  const bytesBefore = new TextEncoder().encode(before);
  const bytesAfter = new TextEncoder().encode(after);
  const decoder = new TextDecoder();
  const cellsBefore = scanCells(before).cells;
  const cellsAfter = scanCells(after).cells;

  return cellsBefore.some((cell, index) => {
    const other = cellsAfter[index];
    if (other === undefined) return true;
    return decoder.decode(bytesBefore.subarray(cell.bodyRange[0], cell.bodyRange[1])) !== decoder.decode(bytesAfter.subarray(other.bodyRange[0], other.bodyRange[1]));
  });
}
