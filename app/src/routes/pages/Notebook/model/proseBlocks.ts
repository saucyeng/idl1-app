/**
 * Decides which prose blocks a document shows and what each one shows right
 * now (ledger R70, revised for host-side rendering by ledger R78,
 * `runs/2026-09-03/decisions.md`). Pure: no React, no DOM, no IPC import —
 * `Notebook/components/ProseBlock.tsx` renders what this module decides,
 * `Notebook/index.tsx` drives `evalInline` from {@link spansToEvaluate}.
 *
 * A cell's prose (C2 §2.4's `prose_before`/`prose_after`) has two possible
 * states here: **raw**, the document's own text verbatim, shown before that
 * cell's first `eval_workbook` result ever arrives; and **html**, Rust's
 * rendered `prose_before_html`/`prose_after_html` (C3 §3.4) once an output
 * entry exists. Rust is the sole parser (SPEC §26.1) — an output entry is
 * authoritative even when it says there is no prose the TS fence scan
 * (`model/cells.ts`) thought it saw.
 */
import type { CellOutput } from "../../../../ipc/workbook";
import type { ScannedCell } from "./cells";

/** One `${…}` span a prose block's HTML contains, to be evaluated and its
 *  result spliced into that span's `<span data-span-id>` placeholder. */
export interface ProseSpanRef {
  /** Matches a placeholder's `data-span-id` attribute exactly (C3 §3.4's `ProseSpan.id`). */
  id: string;
  /** The JavaScript expression text between `${` and `}`, verbatim (C2 §5.2). */
  expr: string;
}

/** What one prose block shows right now. */
export type ProseBlockContent =
  | { kind: "html"; html: string; spans: ProseSpanRef[] }
  | { kind: "raw"; text: string };

/** One prose block: a cell's `prose_before` or `prose_after` (C2 §2.4). */
export interface ProseBlock {
  /** Stable id, `"{cellId}::before"` / `"{cellId}::after"` — a lookup key
   *  for `Notebook/components/CellList.tsx`, never a C2 fence id and never
   *  a `data-span-id`. */
  blockId: string;
  /** The C2 fence-string id of the cell this block is attached to. */
  cellId: string;
  /** Which side of the cell this block sits on. */
  position: "before" | "after";
  content: ProseBlockContent;
}

/** Decodes a `[start, end)` **UTF-8 byte** range (`model/cells.ts`'s convention) back into text. */
function decodeByteRange(markdown: string, range: [number, number]): string {
  const bytes = new TextEncoder().encode(markdown);
  return new TextDecoder().decode(bytes.subarray(range[0], range[1]));
}

/** The subset of `spans` whose id actually appears as a `data-span-id` inside `html` — matched on the literal substring, never by parsing the HTML or inventing an id-naming convention (C3 §3.4's example id is illustrative only). */
function spansIn(html: string, spans: readonly ProseSpanRef[]): ProseSpanRef[] {
  return spans.filter((span) => html.includes(`data-span-id="${span.id}"`));
}

/** Builds one block for one side of one cell, or `null` when there is none. */
function blockFor(
  cellId: string,
  position: "before" | "after",
  range: [number, number] | null,
  markdown: string,
  output: CellOutput | undefined,
  allSpans: readonly ProseSpanRef[]
): ProseBlock | null {
  const html = output === undefined ? undefined : position === "before" ? output.prose_before_html : output.prose_after_html;

  if (output !== undefined) {
    // An evaluated cell is authoritative: `html === null` means no such
    // block exists, even if the TS fence scan found a byte range for it.
    if (html === null || html === undefined) return null;
    return { blockId: `${cellId}::${position}`, cellId, position, content: { kind: "html", html, spans: spansIn(html, allSpans) } };
  }

  if (range === null) return null;
  return { blockId: `${cellId}::${position}`, cellId, position, content: { kind: "raw", text: decodeByteRange(markdown, range) } };
}

/**
 * Every prose block in `cells`, in document order (before then after, per
 * cell). A cell with no `id` (an unresolved or malformed fence, ruling R21)
 * can never have a `CellOutput` and never yields a block — the pending
 * placeholder `Notebook/components/CellList.tsx` already renders for it
 * covers its prose too, once the fence is corrected.
 */
export function proseBlocksFor(
  cells: readonly ScannedCell[],
  markdown: string,
  outputs: ReadonlyMap<string, CellOutput>
): ProseBlock[] {
  const blocks: ProseBlock[] = [];

  for (const cell of cells) {
    if (cell.id === null) continue;
    const output = outputs.get(cell.id);
    const allSpans: readonly ProseSpanRef[] = output?.prose_spans ?? [];

    const before = blockFor(cell.id, "before", cell.proseBeforeRange, markdown, output, allSpans);
    if (before !== null) blocks.push(before);

    const after = blockFor(cell.id, "after", cell.proseAfterRange, markdown, output, allSpans);
    if (after !== null) blocks.push(after);
  }

  return blocks;
}

/** Every span across every `html` block, in block order then within-block order — the exact list `Notebook/index.tsx` issues `evalInline` for. */
export function spansToEvaluate(blocks: readonly ProseBlock[]): ProseSpanRef[] {
  const spans: ProseSpanRef[] = [];
  for (const block of blocks) {
    if (block.content.kind === "html") spans.push(...block.content.spans);
  }
  return spans;
}
