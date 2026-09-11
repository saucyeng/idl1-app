import { describe, expect, it } from "vitest";

import { parseInline, parseReleaseNotes } from "./releaseNotesMarkdown";

describe("parseInline", () => {
  it("plain text — one text node", () => {
    expect(parseInline("hello world")).toEqual([{ kind: "text", text: "hello world" }]);
  });

  it("bold span — text/bold/text", () => {
    expect(parseInline("a **b** c")).toEqual([
      { kind: "text", text: "a " },
      { kind: "bold", text: "b" },
      { kind: "text", text: " c" },
    ]);
  });

  it("code span — text/code/text", () => {
    expect(parseInline("run `npm ci` first")).toEqual([
      { kind: "text", text: "run " },
      { kind: "code", text: "npm ci" },
      { kind: "text", text: " first" },
    ]);
  });

  it("unterminated ** — left as literal text", () => {
    expect(parseInline("a **b")).toEqual([{ kind: "text", text: "a **b" }]);
  });

  it("empty string — no nodes", () => {
    expect(parseInline("")).toEqual([]);
  });
});

describe("parseReleaseNotes", () => {
  it("a heading — one heading block at its level", () => {
    expect(parseReleaseNotes("## Added")).toEqual([
      { kind: "heading", level: 2, inline: [{ kind: "text", text: "Added" }] },
    ]);
    expect(parseReleaseNotes("### Fixed")).toEqual([
      { kind: "heading", level: 3, inline: [{ kind: "text", text: "Fixed" }] },
    ]);
  });

  it("a bullet list — one list block with one entry per bullet", () => {
    expect(parseReleaseNotes("- one\n- two\n* three")).toEqual([
      {
        kind: "list",
        items: [
          [{ kind: "text", text: "one" }],
          [{ kind: "text", text: "two" }],
          [{ kind: "text", text: "three" }],
        ],
      },
    ]);
  });

  it("a paragraph split over two lines — folded into one block with a space", () => {
    expect(parseReleaseNotes("first line\nsecond line")).toEqual([
      { kind: "paragraph", inline: [{ kind: "text", text: "first line second line" }] },
    ]);
  });

  it("a heading, a paragraph and a list — three separate blocks in order", () => {
    const md = "## Added\nSome context.\n\n- item one\n- item two";
    expect(parseReleaseNotes(md)).toEqual([
      { kind: "heading", level: 2, inline: [{ kind: "text", text: "Added" }] },
      { kind: "paragraph", inline: [{ kind: "text", text: "Some context." }] },
      {
        kind: "list",
        items: [
          [{ kind: "text", text: "item one" }],
          [{ kind: "text", text: "item two" }],
        ],
      },
    ]);
  });

  it("blank input — no blocks", () => {
    expect(parseReleaseNotes("\n\n  \n")).toEqual([]);
  });

  it("a list immediately followed by a heading with no blank line — still two blocks", () => {
    expect(parseReleaseNotes("- item\n## Next")).toEqual([
      { kind: "list", items: [[{ kind: "text", text: "item" }]] },
      { kind: "heading", level: 2, inline: [{ kind: "text", text: "Next" }] },
    ]);
  });
});
