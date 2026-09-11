import { describe, expect, it } from "vitest";

import { cellIdAtOffset, changedCellIds, documentCellRanges, rangeForCell } from "./documentRanges";

const DOC = [
  "---",
  "title: demo",
  "---",
  "",
  "Some prose.",
  "",
  "```math id=1a000006",
  "speed = channel([Speed])",
  "```",
  "",
  "```js id=1a000007",
  "Plot.plot({})",
  "```",
  "",
].join("\n");

describe("documentCellRanges", () => {
  it("cell ranges — a two-cell document — each range covers its own fence and body", () => {
    const ranges = documentCellRanges(DOC);

    expect(ranges.map((r) => r.cellId)).toEqual(["1a000006", "1a000007"]);
    expect(DOC.slice(ranges[0].fenceFrom, ranges[0].from)).toBe("```math id=1a000006\n");
    expect(DOC.slice(ranges[0].from, ranges[0].to)).toBe("speed = channel([Speed])\n");
    expect(DOC.slice(ranges[1].from, ranges[1].to)).toBe("Plot.plot({})\n");
  });

  it("cell ranges — non-ASCII prose before a cell — offsets are characters, not UTF-8 bytes", () => {
    const doc = "Über — µ\n\n```math id=1a000006\nx = 1\n```\n";

    const ranges = documentCellRanges(doc);

    expect(doc.slice(ranges[0].from, ranges[0].to)).toBe("x = 1\n");
  });

  it("cell ranges — a fence with no id — is omitted", () => {
    const doc = "```math\nx = 1\n```\n";

    const ranges = documentCellRanges(doc);

    expect(ranges).toEqual([]);
  });
});

describe("cellIdAtOffset", () => {
  it("caret lookup — an offset inside the first cell's body — names that cell", () => {
    const ranges = documentCellRanges(DOC);

    const found = cellIdAtOffset(ranges, ranges[0].from + 2);

    expect(found).toBe("1a000006");
  });

  it("caret lookup — an offset on the fence-open line — names that cell", () => {
    const ranges = documentCellRanges(DOC);

    const found = cellIdAtOffset(ranges, ranges[1].fenceFrom + 1);

    expect(found).toBe("1a000007");
  });

  it("caret lookup — an offset in the leading prose — names no cell", () => {
    const ranges = documentCellRanges(DOC);

    const found = cellIdAtOffset(ranges, DOC.indexOf("Some prose"));

    expect(found).toBeNull();
  });
});

describe("rangeForCell", () => {
  it("range lookup — an id the document no longer carries — is null", () => {
    const ranges = documentCellRanges(DOC);

    const found = rangeForCell(ranges, "deadbeef");

    expect(found).toBeNull();
  });
});

describe("changedCellIds", () => {
  it("dirty cells — one body edited — reports only that cell", () => {
    const after = DOC.replace("speed = channel([Speed])", "speed = channel([Speed]) * 2");

    const changed = changedCellIds(DOC, after);

    expect(changed).toEqual(["1a000006"]);
  });

  it("dirty cells — only prose edited — reports nothing", () => {
    const after = DOC.replace("Some prose.", "Other prose.");

    const changed = changedCellIds(DOC, after);

    expect(changed).toEqual([]);
  });

  it("dirty cells — a cell deleted — reports the removed cell", () => {
    const after = DOC.replace("```js id=1a000007\nPlot.plot({})\n```\n", "");

    const changed = changedCellIds(DOC, after);

    expect(changed).toEqual(["1a000007"]);
  });
});
