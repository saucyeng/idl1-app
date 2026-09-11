/**
 * A minimal Markdown-to-blocks parser for release bodies (ruling R231's
 * "Markdown render of the release body"). The release body is `release.yml`'s
 * own CHANGELOG-section extract, which is always Keep-a-Changelog shaped —
 * `##`/`###` headings, `-`/`*` bullet lists, plain paragraphs, `**bold**`,
 * `` `code` `` — so a full CommonMark implementation is not worth a new
 * dependency (CLAUDE.md's offline-first rule already rules out a CDN one).
 *
 * Parses to a small block tree rather than an HTML string: `UpdatePanel.tsx`
 * renders it as JSX, so nothing here needs `dangerouslySetInnerHTML` for
 * content that ultimately came from a GitHub release body.
 */

/** One inline run within a paragraph or list item. */
export type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "code"; text: string };

/** One block-level element. */
export type ReleaseNotesBlock =
  | { kind: "heading"; level: 2 | 3; inline: InlineNode[] }
  | { kind: "paragraph"; inline: InlineNode[] }
  | { kind: "list"; items: InlineNode[][] };

/** Splits `text` into {@link InlineNode}s on `**bold**` and `` `code` ``
 *  spans. An unterminated `**` or `` ` `` is left as literal text rather
 *  than swallowing the rest of the line — release notes are not validated
 *  Markdown, so a stray marker must degrade, not eat content. */
export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push({ kind: "text", text: text.slice(last, match.index) });
    if (match[1] !== undefined) nodes.push({ kind: "bold", text: match[1] });
    else if (match[2] !== undefined) nodes.push({ kind: "code", text: match[2] });
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push({ kind: "text", text: text.slice(last) });
  return nodes;
}

/** Parses `markdown` into a flat list of blocks: consecutive `-`/`*` bullet
 *  lines become one `list` block, a `##`/`###` line becomes a `heading`,
 *  and any other non-blank run of lines becomes one `paragraph` (soft line
 *  breaks folded to spaces, as Markdown itself does). Blank lines separate
 *  blocks and are otherwise dropped. */
export function parseReleaseNotes(markdown: string): ReleaseNotesBlock[] {
  const blocks: ReleaseNotesBlock[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let paragraphLines: string[] = [];
  let listItems: InlineNode[][] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push({ kind: "paragraph", inline: parseInline(paragraphLines.join(" ")) });
    paragraphLines = [];
  };
  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({ kind: "list", items: listItems });
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);

    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
    } else if (heading !== null) {
      flushParagraph();
      flushList();
      const level = heading[1].length === 2 ? 2 : 3;
      blocks.push({ kind: "heading", level, inline: parseInline(heading[2]) });
    } else if (bullet !== null) {
      flushParagraph();
      listItems.push(parseInline(bullet[1]));
    } else {
      flushList();
      paragraphLines.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
