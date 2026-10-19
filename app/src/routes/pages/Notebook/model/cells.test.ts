import { describe, expect, it } from "vitest";

import { hex8FromBytes, insertVideoCell, replaceCellBody, scanCells } from "./cells";

describe("video cells", () => {
  it("scanCells — a video fence with an id — reported as a video cell with its {} body", () => {
    // Arrange
    const markdown = "Footage:\n\n```video id=0a0b0c0d\n{}\n```\n";

    // Act
    const doc = scanCells(markdown);

    // Assert
    expect(doc.cells).toHaveLength(1);
    expect(doc.cells[0].kind).toBe("video");
    expect(doc.cells[0].id).toBe("0a0b0c0d");
    expect(new TextDecoder().decode(new TextEncoder().encode(markdown).subarray(...doc.cells[0].bodyRange))).toBe("{}\n");
  });

  it("insertVideoCell — a document ending in text without a newline — appends a blank line then a video fence with the given id", () => {
    // Arrange
    const markdown = "Intro";

    // Act
    const updated = insertVideoCell(markdown, "0a0b0c0d");

    // Assert
    expect(updated).toBe("Intro\n\n```video id=0a0b0c0d\n{}\n```\n");
    expect(scanCells(updated).cells.map((c) => [c.kind, c.id])).toEqual([["video", "0a0b0c0d"]]);
  });

  it("insertVideoCell — empty and newline-terminated documents — no stray separator", () => {
    // Arrange
    const inputs = ["", "x\n", "x\n\n"];

    // Act
    const outputs = inputs.map((m) => insertVideoCell(m, "00000001"));

    // Assert
    expect(outputs).toEqual(["```video id=00000001\n{}\n```\n", "x\n\n```video id=00000001\n{}\n```\n", "x\n\n```video id=00000001\n{}\n```\n"]);
  });

  it("hex8FromBytes — four bytes including small ones — 8 lowercase hex characters, zero-padded", () => {
    // Arrange
    const bytes = new Uint8Array([0x0a, 0xff, 0x00, 0x7b]);

    // Act
    const id = hex8FromBytes(bytes);

    // Assert
    expect(id).toBe("0aff007b");
  });
});

/** Decodes a `[start, end)` UTF-8 byte range of `markdown` back to text, for assertions. */
function sliceBytes(markdown: string, range: [number, number]): string {
  const bytes = new TextEncoder().encode(markdown);
  return new TextDecoder().decode(bytes.subarray(range[0], range[1]));
}

describe("scanCells", () => {
  it("scanCells — the C2 §2.5 worked example — finds one math cell and one js cell with their ids", () => {
    // Arrange
    const markdown =
      "---\n" +
      "id: 9f3c1e2d-4b6a-4f1c-9c3d-2a7e8f9b0c1d\n" +
      "name: Fork tuning\n" +
      "constants: { rider_mass_kg: 82 }\n" +
      "---\n" +
      "# Fork tuning — Whistler, 2026-08-30\n" +
      "\n" +
      "```math id=a1b2c3d4\n" +
      "fork_velocity = differentiate([fork_travel])\n" +
      "fork_bottom_out = [fork_travel] > 195\n" +
      "```\n" +
      "\n" +
      "```js id=e5f6a7b8\n" +
      'Plot.plot({ marks: [Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })] })\n' +
      "```\n" +
      "\n" +
      "Bottom-outs this lap: ${fork_bottom_out.v.filter(Boolean).length}\n";

    // Act
    const doc = scanCells(markdown);

    // Assert
    expect(doc.frontMatterRange).not.toBeNull();
    expect(doc.cells).toHaveLength(2);
    expect(doc.cells[0].kind).toBe("math");
    expect(doc.cells[0].id).toBe("a1b2c3d4");
    expect(doc.cells[1].kind).toBe("js");
    expect(doc.cells[1].id).toBe("e5f6a7b8");
    expect(sliceBytes(markdown, doc.cells[1].proseAfterRange!)).toContain("Bottom-outs this lap");
  });

  it("scanCells — a fence with no id attribute — reports the cell with id null", () => {
    // Arrange
    const markdown = "```math\nx = 1\n```\n";

    // Act
    const doc = scanCells(markdown);

    // Assert
    expect(doc.cells).toHaveLength(1);
    expect(doc.cells[0].id).toBeNull();
    expect(doc.cells[0].idRaw).toBeNull();
  });

  it("scanCells — an inert fence (json, bash, no info string) — is not reported as a cell", () => {
    // Arrange
    const markdown = "```json\n{}\n```\n\n```bash\necho hi\n```\n\n```\nplain\n```\n\n```math id=aaaaaaaa\nx = 1\n```\n";

    // Act
    const doc = scanCells(markdown);

    // Assert
    expect(doc.cells).toHaveLength(1);
    expect(doc.cells[0].kind).toBe("math");
    expect(doc.cells[0].id).toBe("aaaaaaaa");
  });

  it("scanCells — a fence-like line inside an inert code block — is not reported as a cell", () => {
    // Arrange
    const markdown = "````markdown\n```js id=deadbeef\nfoo\n```\n````\n";

    // Act
    const doc = scanCells(markdown);

    // Assert
    expect(doc.cells).toHaveLength(0);
  });

  it("scanCells — prose between two cells — attaches to the following cell as proseBefore (C2 §2.4)", () => {
    // Arrange
    const markdown = "```math id=aaaaaaaa\nx = 1\n```\n\nSome prose here.\n\n```js id=bbbbbbbb\ny\n```\n";

    // Act
    const doc = scanCells(markdown);

    // Assert
    expect(doc.cells).toHaveLength(2);
    expect(doc.cells[0].proseBeforeRange).toBeNull();
    expect(doc.cells[1].proseBeforeRange).not.toBeNull();
    expect(sliceBytes(markdown, doc.cells[1].proseBeforeRange!)).toBe("\nSome prose here.\n\n");
  });

  it("scanCells — trailing prose after the last cell — attaches to that cell as proseAfter", () => {
    // Arrange
    const markdown = "```math id=aaaaaaaa\nx = 1\n```\n\nBottom-outs: 3\n";

    // Act
    const doc = scanCells(markdown);

    // Assert
    expect(doc.cells).toHaveLength(1);
    expect(sliceBytes(markdown, doc.cells[0].proseAfterRange!)).toBe("\nBottom-outs: 3\n");
  });

  it("scanCells — a document with zero fenced cells — returns no cells and the whole body as prose", () => {
    // Arrange
    const markdown = "Just a written note, no cells here.\n";

    // Act
    const doc = scanCells(markdown);

    // Assert
    expect(doc.cells).toEqual([]);
  });

  it("scanCells — an unrecognised key=value fence attribute — is preserved verbatim in infoLine", () => {
    // Arrange
    const markdown = "```js id=cafebabe foo=bar\ncode\n```\n";

    // Act
    const doc = scanCells(markdown);

    // Assert
    expect(doc.cells).toHaveLength(1);
    expect(doc.cells[0].infoLine).toBe("js id=cafebabe foo=bar");
    expect(doc.cells[0].id).toBe("cafebabe");
  });

  it("scanCells — an unterminated fence at end of file — closes at document end", () => {
    // Arrange
    const markdown = "```js id=aaaaaaaa\nx\n";

    // Act
    const doc = scanCells(markdown);

    // Assert
    expect(doc.cells).toHaveLength(1);
    expect(doc.cells[0].bodyRange[1]).toBe(new TextEncoder().encode(markdown).length);
  });

  it("scanCells — an invalid id= value — reports idRaw set and id null", () => {
    // Arrange
    const markdown = "```js id=nothex\ncode\n```\n";

    // Act
    const doc = scanCells(markdown);

    // Assert
    expect(doc.cells).toHaveLength(1);
    expect(doc.cells[0].id).toBeNull();
    expect(doc.cells[0].idRaw).toBe("nothex");
  });
});

describe("replaceCellBody", () => {
  it("replaceCellBody — a js cell's body replaced — every other byte of the document is unchanged", () => {
    // Arrange
    const markdown =
      "# Notes — a fork log\n\n```js id=cafebabe\nold body\n```\n\nAfter — ünïcode tail.\n";

    // Act
    const updated = replaceCellBody(markdown, "cafebabe", "new body — ünïcode\n");

    // Assert
    const doc = scanCells(updated);
    expect(doc.cells).toHaveLength(1);
    expect(sliceBytes(updated, doc.cells[0].bodyRange)).toBe("new body — ünïcode\n");
    expect(updated.startsWith("# Notes — a fork log\n\n```js id=cafebabe\n")).toBe(true);
    expect(updated.endsWith("\n```\n\nAfter — ünïcode tail.\n")).toBe(true);
  });

  it("replaceCellBody — an unknown cell id — returns the document unchanged", () => {
    // Arrange
    const markdown = "```js id=cafebabe\nold body\n```\n";

    // Act
    const updated = replaceCellBody(markdown, "00000000", "new body");

    // Assert
    expect(updated).toBe(markdown);
  });
});
