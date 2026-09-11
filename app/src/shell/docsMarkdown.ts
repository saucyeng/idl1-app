/**
 * A Markdown parser for exactly the subset `docs/WORKBOOK-REFERENCE.md`
 * uses (ruling R222 items 1–2).
 *
 * **Why not a library.** The app bundles everything and ships no CDN, and
 * the document being rendered is one this repository generates: headings,
 * paragraphs, fenced code, pipe tables, bullet lists, and four inline
 * marks. A general Markdown engine would be a new dependency, a new
 * sanitising problem (every one of them emits HTML strings), and far more
 * surface than the four constructs actually present. This module emits
 * *data*, which `DocsPanel.tsx` renders as React elements — so no HTML is
 * ever injected and there is nothing to sanitise.
 *
 * Pure: text in, blocks out. No DOM, no React, no IPC.
 */

/** One inline run inside a block's text. */
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "link"; text: string; href: string };

/** One block of the rendered document. */
export type Block =
  | { kind: "heading"; level: number; text: string; anchor: string; inlines: Inline[] }
  | { kind: "paragraph"; inlines: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "list"; items: Inline[][] }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] };

/** The anchor a heading gets, matching `idl_rs::docs::slugify` exactly:
 *  lowercased, spaces to hyphens, `-` and `_` kept, everything else
 *  dropped. The Rust side puts the same slug on the wire as a builtin's
 *  `doc_anchor`, so the two must agree character for character. */
export function slugify(heading: string): string {
  let out = "";
  for (const ch of heading) {
    if (/[a-zA-Z0-9]/.test(ch)) out += ch.toLowerCase();
    else if (ch === "_" || ch === "-") out += ch;
    else if (ch === " ") out += "-";
  }
  return out;
}

/** Splits one line of Markdown into inline runs.
 *
 *  Handled, in this precedence: `` `code` ``, `[text](href)`, `**strong**`.
 *  Code wins over everything, so a backtick span containing brackets or
 *  asterisks is left alone — which matters, because half this document's
 *  code spans are function signatures full of both. */
export function parseInlines(line: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text.length > 0) {
      out.push({ kind: "text", text });
      text = "";
    }
  };

  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);

    const code = /^`([^`]+)`/.exec(rest);
    if (code !== null) {
      flush();
      out.push({ kind: "code", text: code[1] });
      i += code[0].length;
      continue;
    }

    const link = /^\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest);
    if (link !== null) {
      flush();
      out.push({ kind: "link", text: link[1], href: link[2] });
      i += link[0].length;
      continue;
    }

    const strong = /^\*\*([^*]+)\*\*/.exec(rest);
    if (strong !== null) {
      flush();
      out.push({ kind: "strong", text: strong[1] });
      i += strong[0].length;
      continue;
    }

    text += line[i];
    i += 1;
  }
  flush();
  return out;
}

/** Splits a pipe-table row into its cells, dropping the leading and
 *  trailing pipes. Empty cells are kept — the reference's own two-column
 *  fact tables open with a blank header cell. */
function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

/** True for a table's `|---|---|` separator row. */
function isTableDivider(line: string): boolean {
  return /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes("-");
}

/** Parses the document into blocks. Anything the subset does not cover
 *  becomes a paragraph rather than being dropped, so an unexpected
 *  construct degrades to readable text instead of disappearing. */
export function parseDocsMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Fenced code: everything up to the closing fence, verbatim.
    if (line.startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // the closing fence
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading !== null) {
      const text = heading[2].trim();
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        text,
        // The slug is computed from the heading's plain text, so a heading
        // wrapping its name in backticks still anchors on the name.
        anchor: slugify(text.replace(/`/g, "")),
        inlines: parseInlines(text),
      });
      i += 1;
      continue;
    }

    // A pipe table: a header row, a divider, then rows until a blank line.
    if (line.includes("|") && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const header = tableCells(line).map(parseInlines);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
        rows.push(tableCells(lines[i]).map(parseInlines));
        i += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(parseInlines(lines[i].replace(/^[-*]\s+/, "")));
        i += 1;
      }
      blocks.push({ kind: "list", items });
      continue;
    }

    // A paragraph runs to the next blank line, and its wrapped source
    // lines are joined with a space — the generated file hard-wraps at
    // about 76 columns, which must not become a hard break on screen.
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ kind: "paragraph", inlines: parseInlines(paragraph.join(" ")) });
  }

  return blocks;
}

/** The plain text of a run of inlines — what a search matches against. */
export function inlineText(inlines: Inline[]): string {
  return inlines.map((inline) => inline.text).join("");
}

/** Every heading in the document, in order, as `{ level, text, anchor }`.
 *  The Docs panel's contents list. */
export function outline(blocks: Block[]): { level: number; text: string; anchor: string }[] {
  return blocks
    .filter((block): block is Extract<Block, { kind: "heading" }> => block.kind === "heading")
    .map(({ level, text, anchor }) => ({ level, text, anchor }));
}

/** Narrows `blocks` to those matching `query`, keeping each matching
 *  block's own enclosing headings so a hit never appears without the
 *  section it came from. An empty query returns everything. */
export function filterBlocks(blocks: Block[], query: string): Block[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return blocks;

  const matches = (block: Block): boolean => {
    switch (block.kind) {
      case "code":
        return block.text.toLowerCase().includes(needle);
      case "heading":
      case "paragraph":
        return inlineText(block.inlines).toLowerCase().includes(needle);
      case "list":
        return block.items.some((item) => inlineText(item).toLowerCase().includes(needle));
      case "table":
        return block.rows.some((row) => row.some((cell) => inlineText(cell).toLowerCase().includes(needle)));
    }
  };

  const out: Block[] = [];
  // Headings seen since the last emitted block, newest last — emitted only
  // when something under them matches.
  let pending: Block[] = [];
  for (const block of blocks) {
    if (block.kind === "heading") {
      pending = pending.filter((held) => held.kind === "heading" && held.level < block.level);
      pending.push(block);
      if (matches(block)) {
        out.push(...pending);
        pending = [];
      }
      continue;
    }
    if (matches(block)) {
      out.push(...pending, block);
      pending = [];
    }
  }
  return out;
}
