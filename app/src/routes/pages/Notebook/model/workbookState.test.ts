import { describe, expect, it } from "vitest";

import type { CellOutput } from "../../../../ipc/workbook";
import { initialWorkbookState, workbookReducer } from "./workbookState";

/** Builds a minimal, otherwise-empty `CellOutput` for one cell id. */
function output(cellId: string, overrides: Partial<CellOutput> = {}): CellOutput {
  return {
    cell_id: cellId,
    kind: "math",
    value: null,
    defs: [],
    errors: [],
    prose_before_html: null,
    prose_after_html: null,
    prose_spans: [],
    ...overrides,
  };
}

describe("workbookReducer", () => {
  it("workbookReducer — an eval result for a cell — replaces that cell's output and leaves others untouched", () => {
    const seeded = workbookReducer(initialWorkbookState, {
      type: "evalResult",
      outputs: [output("cell-a", { value: "old" }), output("cell-b", { value: "kept" })],
    });

    const next = workbookReducer(seeded, { type: "evalResult", outputs: [output("cell-a", { value: "new" })] });

    expect(next.outputs.get("cell-a")?.value).toBe("new");
    expect(next.outputs.get("cell-b")?.value).toBe("kept");
  });

  it("workbookReducer — a cell carrying errors — keeps the cell and stores its errors (never drops it)", () => {
    const errored = output("cell-a", { errors: [{ kind: "math_unknown_channel", message: "no such channel" }] });

    const next = workbookReducer(initialWorkbookState, { type: "evalResult", outputs: [errored] });

    expect(next.outputs.has("cell-a")).toBe(true);
    expect(next.outputs.get("cell-a")?.errors).toEqual([{ kind: "math_unknown_channel", message: "no such channel" }]);
  });

  it("workbookReducer — a definition-level error — attaches to that definition, not to the cell", () => {
    const withDefError = output("cell-a", {
      kind: "math",
      errors: [],
      defs: [
        { name: "speed", label: null, value: null, error: { kind: "math_reserved_name", message: "reserved" } },
      ],
    });

    const next = workbookReducer(initialWorkbookState, { type: "evalResult", outputs: [withDefError] });

    const stored = next.outputs.get("cell-a");
    expect(stored?.errors).toEqual([]);
    expect(stored?.defs[0].error).toEqual({ kind: "math_reserved_name", message: "reserved" });
  });

  it("workbookReducer — an edit to one cell body — marks only that cell dirty", () => {
    const next = workbookReducer(initialWorkbookState, { type: "editCell", cellId: "cell-a" });

    expect(Array.from(next.dirtyCellIds)).toEqual(["cell-a"]);
  });

  it("workbookReducer — a save result — clears dirty and stores the new hash", () => {
    const dirty = workbookReducer(initialWorkbookState, { type: "editCell", cellId: "cell-a" });

    const next = workbookReducer(dirty, { type: "saveResult", hash: "abc123" });

    expect(next.dirtyCellIds.size).toBe(0);
    expect(next.hash).toBe("abc123");
  });

  it("workbookReducer — a watch event naming two cells — marks exactly those two stale", () => {
    const next = workbookReducer(initialWorkbookState, {
      type: "watchEvent",
      event: { kind: "changed", cell_ids: ["cell-a", "cell-b"], hash: "h9" },
    });

    expect(Array.from(next.dirtyCellIds).sort()).toEqual(["cell-a", "cell-b"]);
  });

  it("workbookReducer — an opened handle — is stored", () => {
    const handle = { id: "wb-1", name: "Notebook", path: "/p", cell_count: 1 };

    const next = workbookReducer(initialWorkbookState, { type: "handleOpened", handle });

    expect(next.handle).toEqual(handle);
  });

  it("workbookReducer — markdown loads successfully — becomes ready and scans its cells", () => {
    const markdown = "prose\n```js id=aaaaaaaa\n1\n```\n";

    const next = workbookReducer(initialWorkbookState, { type: "markdownReady", markdown, hash: "h1" });

    expect(next.markdownStatus).toBe("ready");
    expect(next.markdown).toBe(markdown);
    expect(next.hash).toBe("h1");
    expect(next.cells).toHaveLength(1);
  });

  it("workbookReducer — a markdown read error — stores the error status and message", () => {
    const next = workbookReducer(initialWorkbookState, { type: "markdownError", message: "boom" });

    expect(next.markdownStatus).toBe("error");
    expect(next.markdownError).toBe("boom");
  });

  it("workbookReducer — a whole-command eval error — stores it, typed", () => {
    const next = workbookReducer(initialWorkbookState, {
      type: "evalError",
      error: { kind: "invalid_argument", message: "lap context not supported yet" },
    });

    expect(next.evalError).toEqual({ kind: "invalid_argument", message: "lap context not supported yet" });
  });

  it("workbookReducer — a successful eval result after an eval error — clears the eval error", () => {
    const errored = workbookReducer(initialWorkbookState, {
      type: "evalError",
      error: { kind: "internal", message: "boom" },
    });

    const next = workbookReducer(errored, { type: "evalResult", outputs: [] });

    expect(next.evalError).toBeNull();
  });
});
