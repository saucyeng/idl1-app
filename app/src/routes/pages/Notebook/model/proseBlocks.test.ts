import { describe, expect, it } from "vitest";

import type { CellOutput } from "../../../../ipc/workbook";
import type { ScannedCell } from "./cells";
import { proseBlocksFor, spansToEvaluate } from "./proseBlocks";

/** Builds a minimal `ScannedCell` with every field defaulted, overridden by `partial`. */
function cell(partial: Partial<ScannedCell>): ScannedCell {
  return {
    id: null,
    idRaw: null,
    kind: "js",
    infoLine: "js id=aaaaaaaa",
    bodyRange: [0, 0],
    proseBeforeRange: null,
    proseAfterRange: null,
    ...partial,
  };
}

/** Builds a minimal `CellOutput` with every field defaulted, overridden by `partial`. */
function output(partial: Partial<CellOutput>): CellOutput {
  return {
    cell_id: "aaaaaaaa",
    kind: "js",
    value: null,
    defs: [],
    errors: [],
    prose_before_html: null,
    prose_after_html: null,
    prose_spans: [],
    ...partial,
  };
}

describe("proseBlocksFor", () => {
  it("proseBlocksFor — a cell with no output entry — yields a raw block with the exact decoded prose text", () => {
    const markdown = "before text\n```js id=aaaaaaaa\n1\n```\n";
    const beforeBytes = new TextEncoder().encode("before text\n").length;
    const cells = [cell({ id: "aaaaaaaa", proseBeforeRange: [0, beforeBytes] })];

    const blocks = proseBlocksFor(cells, markdown, new Map());

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      blockId: "aaaaaaaa::before",
      cellId: "aaaaaaaa",
      position: "before",
      content: { kind: "raw", text: "before text\n" },
    });
  });

  it("proseBlocksFor — an output with prose_before_html — yields an html block", () => {
    const markdown = "before text\n```js id=aaaaaaaa\n1\n```\n";
    const beforeBytes = new TextEncoder().encode("before text\n").length;
    const cells = [cell({ id: "aaaaaaaa", proseBeforeRange: [0, beforeBytes] })];
    const outputs = new Map([
      ["aaaaaaaa", output({ prose_before_html: "<p>before text</p>" })],
    ]);

    const blocks = proseBlocksFor(cells, markdown, outputs);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toEqual({ kind: "html", html: "<p>before text</p>", spans: [] });
  });

  it("proseBlocksFor — output present with prose_before_html null and a non-null scan range — yields no before block", () => {
    const markdown = "before text\n```js id=aaaaaaaa\n1\n```\n";
    const beforeBytes = new TextEncoder().encode("before text\n").length;
    const cells = [cell({ id: "aaaaaaaa", proseBeforeRange: [0, beforeBytes] })];
    const outputs = new Map([["aaaaaaaa", output({ prose_before_html: null })]]);

    const blocks = proseBlocksFor(cells, markdown, outputs);

    expect(blocks).toHaveLength(0);
  });

  it("proseBlocksFor — prose_spans split across a before and an after block — each block keeps only the ids its own HTML contains", () => {
    const markdown = "b\n```js id=aaaaaaaa\n1\n```\na\n";
    const bBytes = new TextEncoder().encode("b\n").length;
    const totalBytes = new TextEncoder().encode(markdown).length;
    const cells = [
      cell({
        id: "aaaaaaaa",
        proseBeforeRange: [0, bBytes],
        proseAfterRange: [totalBytes - new TextEncoder().encode("a\n").length, totalBytes],
      }),
    ];
    const outputs = new Map([
      [
        "aaaaaaaa",
        output({
          prose_before_html: '<p><span data-span-id="aaaaaaaa-before:0"></span></p>',
          prose_after_html: '<p><span data-span-id="aaaaaaaa-after:0"></span></p>',
          prose_spans: [
            { id: "aaaaaaaa-before:0", expr: "1 + 1" },
            { id: "aaaaaaaa-after:0", expr: "2 + 2" },
          ],
        }),
      ],
    ]);

    const blocks = proseBlocksFor(cells, markdown, outputs);

    const before = blocks.find((b) => b.position === "before");
    const after = blocks.find((b) => b.position === "after");
    expect(before?.content).toMatchObject({ spans: [{ id: "aaaaaaaa-before:0", expr: "1 + 1" }] });
    expect(after?.content).toMatchObject({ spans: [{ id: "aaaaaaaa-after:0", expr: "2 + 2" }] });
  });

  it("proseBlocksFor — a span id present in prose_spans but in neither block's HTML — is dropped from both", () => {
    const markdown = "b\n```js id=aaaaaaaa\n1\n```\n";
    const bBytes = new TextEncoder().encode("b\n").length;
    const cells = [cell({ id: "aaaaaaaa", proseBeforeRange: [0, bBytes] })];
    const outputs = new Map([
      [
        "aaaaaaaa",
        output({
          prose_before_html: "<p>no spans here</p>",
          prose_spans: [{ id: "aaaaaaaa-before:0", expr: "1 + 1" }],
        }),
      ],
    ]);

    const blocks = proseBlocksFor(cells, markdown, outputs);

    expect(blocks[0].content).toMatchObject({ spans: [] });
  });

  it("proseBlocksFor — a cell whose scan found id === null — yields no blocks", () => {
    const markdown = "before text\n```js\n1\n```\n";
    const beforeBytes = new TextEncoder().encode("before text\n").length;
    const cells = [cell({ id: null, proseBeforeRange: [0, beforeBytes] })];

    const blocks = proseBlocksFor(cells, markdown, new Map());

    expect(blocks).toHaveLength(0);
  });

  it("proseBlocksFor — two cells each with before and after prose — returns blocks in document order", () => {
    const markdown = "b1\n```js id=aaaaaaaa\n1\n```\na1\n```js id=bbbbbbbb\n2\n```\na2\n";
    const enc = new TextEncoder();
    const b1End = enc.encode("b1\n").length;
    const cellAEnd = b1End + enc.encode("```js id=aaaaaaaa\n1\n```\n").length;
    const a1End = cellAEnd + enc.encode("a1\n").length;
    const cellBEnd = a1End + enc.encode("```js id=bbbbbbbb\n2\n```\n").length;
    const total = enc.encode(markdown).length;
    const cells = [
      cell({ id: "aaaaaaaa", proseBeforeRange: [0, b1End], proseAfterRange: [cellAEnd, a1End] }),
      cell({ id: "bbbbbbbb", proseBeforeRange: null, proseAfterRange: [cellBEnd, total] }),
    ];

    const blocks = proseBlocksFor(cells, markdown, new Map());

    expect(blocks.map((b) => b.blockId)).toEqual(["aaaaaaaa::before", "aaaaaaaa::after", "bbbbbbbb::after"]);
  });
});

describe("spansToEvaluate", () => {
  it("spansToEvaluate — blocks with html spans in document order — returns every span across every block, in block order", () => {
    const blocks = [
      {
        blockId: "a::before",
        cellId: "a",
        position: "before" as const,
        content: { kind: "html" as const, html: "<p></p>", spans: [{ id: "a-before:0", expr: "1" }] },
      },
      {
        blockId: "a::after",
        cellId: "a",
        position: "after" as const,
        content: { kind: "html" as const, html: "<p></p>", spans: [{ id: "a-after:0", expr: "2" }] },
      },
    ];

    const spans = spansToEvaluate(blocks);

    expect(spans).toEqual([
      { id: "a-before:0", expr: "1" },
      { id: "a-after:0", expr: "2" },
    ]);
  });

  it("spansToEvaluate — a raw block — contributes no spans", () => {
    const blocks = [
      { blockId: "a::before", cellId: "a", position: "before" as const, content: { kind: "raw" as const, text: "hi" } },
    ];

    const spans = spansToEvaluate(blocks);

    expect(spans).toEqual([]);
  });
});
