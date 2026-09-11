import { describe, expect, it } from "vitest";

import { filterBlocks, inlineText, outline, parseDocsMarkdown, parseInlines, slugify, type Block } from "./docsMarkdown";

describe("slugify", () => {
  it("slugify — a heading with spaces and punctuation — lowercased, spaces hyphenated, punctuation dropped", () => {
    // Arrange / Act
    const slug = slugify("Estimator (diagnostic)");

    // Assert
    expect(slug).toBe("estimator-diagnostic");
  });

  it("slugify — a builtin name — underscores and hyphens survive unchanged", () => {
    // Arrange / Act / Assert — this is the half that has to agree with
    // `idl_rs::docs::slugify`, since the wire carries `doc_anchor` from Rust.
    expect(slugify("lap_delta_time")).toBe("lap_delta_time");
    expect(slugify("a-b")).toBe("a-b");
  });
});

describe("parseInlines", () => {
  it("parseInlines — a code span containing brackets and asterisks — the span wins and its contents are literal", () => {
    // Arrange
    const line = "call `f(a, **b**)[0]` here";

    // Act
    const inlines = parseInlines(line);

    // Assert
    expect(inlines).toEqual([
      { kind: "text", text: "call " },
      { kind: "code", text: "f(a, **b**)[0]" },
      { kind: "text", text: " here" },
    ]);
  });

  it("parseInlines — a link and a strong run — each becomes its own inline", () => {
    // Arrange
    const line = "see [welch](#welch) which is **not implemented**";

    // Act
    const inlines = parseInlines(line);

    // Assert
    expect(inlines).toEqual([
      { kind: "text", text: "see " },
      { kind: "link", text: "welch", href: "#welch" },
      { kind: "text", text: " which is " },
      { kind: "strong", text: "not implemented" },
    ]);
  });

  it("parseInlines — a bare line — one text run", () => {
    // Arrange / Act
    const inlines = parseInlines("plain words");

    // Assert
    expect(inlines).toEqual([{ kind: "text", text: "plain words" }]);
  });
});

describe("parseDocsMarkdown", () => {
  it("parseDocsMarkdown — a heading — carries its level and the anchor its backticks are stripped from", () => {
    // Arrange / Act
    const blocks = parseDocsMarkdown("#### `welch`\n");

    // Assert
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 4, anchor: "welch" });
  });

  it("parseDocsMarkdown — a hard-wrapped paragraph — the source lines join with a space, not a break", () => {
    // Arrange
    const markdown = "one line\nwrapped here\n\nnext\n";

    // Act
    const blocks = parseDocsMarkdown(markdown);

    // Assert
    expect(blocks[0]).toEqual({ kind: "paragraph", inlines: [{ kind: "text", text: "one line wrapped here" }] });
    expect(blocks).toHaveLength(2);
  });

  it("parseDocsMarkdown — a fenced block — its body is kept verbatim, including blank lines", () => {
    // Arrange
    const markdown = "```\nresult = welch(x)\n\ndone\n```\n";

    // Act
    const blocks = parseDocsMarkdown(markdown);

    // Assert
    expect(blocks).toEqual([{ kind: "code", text: "result = welch(x)\n\ndone" }]);
  });

  it("parseDocsMarkdown — a fence containing a heading marker — it stays code, not a heading", () => {
    // Arrange
    const markdown = "```\n# label: speed\n```\n";

    // Act
    const blocks = parseDocsMarkdown(markdown);

    // Assert
    expect(blocks).toEqual([{ kind: "code", text: "# label: speed" }]);
  });

  it("parseDocsMarkdown — a pipe table with a blank header cell — the empty cell is kept", () => {
    // Arrange
    const markdown = "| | |\n|---|---|\n| Shape | `scalar` |\n";

    // Act
    const blocks = parseDocsMarkdown(markdown);

    // Assert
    expect(blocks).toHaveLength(1);
    const table = blocks[0] as Extract<Block, { kind: "table" }>;
    expect(table.header).toHaveLength(2);
    expect(table.header[0]).toEqual([]);
    expect(inlineText(table.rows[0][0])).toBe("Shape");
    expect(inlineText(table.rows[0][1])).toBe("scalar");
  });

  it("parseDocsMarkdown — consecutive bullets — one list block, not one block each", () => {
    // Arrange
    const markdown = "- alpha\n- beta\n- gamma\n";

    // Act
    const blocks = parseDocsMarkdown(markdown);

    // Assert
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as Extract<Block, { kind: "list" }>).items).toHaveLength(3);
  });

  it("parseDocsMarkdown — CRLF line endings — parsed the same as LF", () => {
    // Arrange
    const crlf = parseDocsMarkdown("# Title\r\n\r\nbody\r\n");

    // Act
    const lf = parseDocsMarkdown("# Title\n\nbody\n");

    // Assert
    expect(crlf).toEqual(lf);
  });
});

describe("outline", () => {
  it("outline — a document with headings and prose — only headings, in document order", () => {
    // Arrange
    const blocks = parseDocsMarkdown("# A\n\nwords\n\n## B\n\n#### c_d\n");

    // Act
    const entries = outline(blocks);

    // Assert
    expect(entries).toEqual([
      { level: 1, text: "A", anchor: "a" },
      { level: 2, text: "B", anchor: "b" },
      { level: 4, text: "c_d", anchor: "c_d" },
    ]);
  });
});

describe("filterBlocks", () => {
  it("filterBlocks — an empty query — every block is returned unchanged", () => {
    // Arrange
    const blocks = parseDocsMarkdown("# A\n\nwords\n");

    // Act
    const shown = filterBlocks(blocks, "   ");

    // Assert
    expect(shown).toEqual(blocks);
  });

  it("filterBlocks — a query matching a paragraph — its enclosing headings come with it", () => {
    // Arrange
    const blocks = parseDocsMarkdown("# Top\n\n## Section\n\nthe needle is here\n\n## Other\n\nnothing\n");

    // Act
    const shown = filterBlocks(blocks, "needle");

    // Assert
    expect(shown.map((b) => (b.kind === "heading" ? b.text : "para"))).toEqual(["Top", "Section", "para"]);
  });

  it("filterBlocks — a heading emitted once for two matches beneath it — no duplicate heading", () => {
    // Arrange
    const blocks = parseDocsMarkdown("## Section\n\nneedle one\n\nneedle two\n");

    // Act
    const shown = filterBlocks(blocks, "needle");

    // Assert
    expect(shown.filter((b) => b.kind === "heading")).toHaveLength(1);
    expect(shown).toHaveLength(3);
  });

  it("filterBlocks — a query matching nothing — an empty result, not the whole document", () => {
    // Arrange
    const blocks = parseDocsMarkdown("# A\n\nwords\n");

    // Act
    const shown = filterBlocks(blocks, "zzz");

    // Assert
    expect(shown).toEqual([]);
  });

  it("filterBlocks — a query matching a code span and a table cell — both blocks are kept", () => {
    // Arrange
    const blocks = parseDocsMarkdown("```\nwelch(x)\n```\n\n| a | b |\n|---|---|\n| welch | yes |\n");

    // Act
    const shown = filterBlocks(blocks, "welch");

    // Assert
    expect(shown.map((b) => b.kind)).toEqual(["code", "table"]);
  });
});
