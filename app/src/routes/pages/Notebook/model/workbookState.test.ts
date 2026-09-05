import { describe, expect, it } from "vitest";

import type { CellOutput } from "../../../../ipc/workbook";
import { initialWorkbookState, workbookReducer } from "./workbookState";

/** Builds a minimal, otherwise-empty `CellOutput` for one cell id. */
function output(cellId: string, overrides: Partial<CellOutput> = {}): CellOutput {
  return { cell_id: cellId, kind: "math", value: null, defs: [], errors: [], ...overrides };
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
      event: { kind: "changed", cell_ids: ["cell-a", "cell-b"] },
    });

    expect(Array.from(next.dirtyCellIds).sort()).toEqual(["cell-a", "cell-b"]);
  });
});
