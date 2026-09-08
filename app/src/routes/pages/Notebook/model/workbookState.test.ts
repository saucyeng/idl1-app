import { describe, expect, it } from "vitest";

import type { CellOutput, Window as SelectedWindow } from "../../../../ipc/workbook";
import { initialWorkbookState, NO_WINDOW_KEY, workbookReducer, wireWindowKey } from "./workbookState";

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

function window(span: SelectedWindow["span"], sessionId = "session-a"): SelectedWindow {
  return { session_id: sessionId, span, colour: "--chart-1" };
}

describe("workbookReducer", () => {
  it("workbookReducer — an eval result for a window — replaces that window's whole outputs map", () => {
    const w = window({ kind: "lap", lap_number: 1 });
    const seeded = workbookReducer(initialWorkbookState, {
      type: "evalWindowResult",
      window: w,
      outputs: [output("cell-a", { value: "old" }), output("cell-b", { value: "kept" })],
    });

    const next = workbookReducer(seeded, { type: "evalWindowResult", window: w, outputs: [output("cell-a", { value: "new" })] });

    const entry = next.windows.get(wireWindowKey(w));
    expect(entry?.kind).toBe("ok");
    expect(entry?.kind === "ok" && entry.outputs.get("cell-a")?.value).toBe("new");
    expect(entry?.kind === "ok" && entry.outputs.has("cell-b")).toBe(false);
  });

  it("workbookReducer — a cell carrying errors — keeps the cell and stores its errors (never drops it)", () => {
    const w = window({ kind: "session" });
    const errored = output("cell-a", { errors: [{ kind: "math_unknown_channel", message: "no such channel" }] });

    const next = workbookReducer(initialWorkbookState, { type: "evalWindowResult", window: w, outputs: [errored] });

    const entry = next.windows.get(wireWindowKey(w));
    expect(entry?.kind === "ok" && entry.outputs.get("cell-a")?.errors).toEqual([
      { kind: "math_unknown_channel", message: "no such channel" },
    ]);
  });

  it("workbookReducer — a definition-level error — attaches to that definition, not to the cell", () => {
    const w = window({ kind: "session" });
    const withDefError = output("cell-a", {
      kind: "math",
      errors: [],
      defs: [{ name: "speed", label: null, value: null, error: { kind: "math_reserved_name", message: "reserved" } }],
    });

    const next = workbookReducer(initialWorkbookState, { type: "evalWindowResult", window: w, outputs: [withDefError] });

    const entry = next.windows.get(wireWindowKey(w));
    const stored = entry?.kind === "ok" ? entry.outputs.get("cell-a") : undefined;
    expect(stored?.errors).toEqual([]);
    expect(stored?.defs[0].error).toEqual({ kind: "math_reserved_name", message: "reserved" });
  });

  it("workbookReducer — one window's failure — does not disturb a sibling window's own successful result (ruling R121)", () => {
    const ok = window({ kind: "lap", lap_number: 1 });
    const bad = window({ kind: "range", t0_us: 5, t1_us: 3 });
    const seeded = workbookReducer(initialWorkbookState, {
      type: "evalWindowResult",
      window: ok,
      outputs: [output("cell-a", { value: "fine" })],
    });

    const next = workbookReducer(seeded, {
      type: "evalWindowError",
      window: bad,
      error: { kind: "invalid_argument", message: "t0_us >= t1_us" },
    });

    expect(next.windows.get(wireWindowKey(ok))).toEqual({ kind: "ok", outputs: new Map([["cell-a", output("cell-a", { value: "fine" })]]) });
    expect(next.windows.get(wireWindowKey(bad))).toEqual({ kind: "error", error: { kind: "invalid_argument", message: "t0_us >= t1_us" } });
  });

  it("workbookReducer — a whole-call rejection (window: null) — stores under NO_WINDOW_KEY", () => {
    const next = workbookReducer(initialWorkbookState, {
      type: "evalWindowError",
      window: null,
      error: { kind: "internal", message: "unknown workbook id" },
    });

    expect(next.windows.get(NO_WINDOW_KEY)).toEqual({ kind: "error", error: { kind: "internal", message: "unknown workbook id" } });
  });

  it("workbookReducer — pruneWindows with a non-empty keep set — drops every window not in it, including NO_WINDOW_KEY", () => {
    const kept = window({ kind: "lap", lap_number: 1 });
    const dropped = window({ kind: "lap", lap_number: 2 });
    let state = workbookReducer(initialWorkbookState, { type: "evalWindowResult", window: kept, outputs: [] });
    state = workbookReducer(state, { type: "evalWindowResult", window: dropped, outputs: [] });
    state = workbookReducer(state, { type: "evalWindowError", window: null, error: { kind: "internal", message: "boom" } });

    const next = workbookReducer(state, { type: "pruneWindows", keep: new Set([wireWindowKey(kept)]) });

    expect(next.windows.has(wireWindowKey(kept))).toBe(true);
    expect(next.windows.has(wireWindowKey(dropped))).toBe(false);
    expect(next.windows.has(NO_WINDOW_KEY)).toBe(false);
  });

  it("workbookReducer — pruneWindows with an empty keep set — keeps NO_WINDOW_KEY (the legitimate 'nothing selected' result)", () => {
    const state = workbookReducer(initialWorkbookState, { type: "evalWindowResult", window: null, outputs: [] });

    const next = workbookReducer(state, { type: "pruneWindows", keep: new Set() });

    expect(next.windows.has(NO_WINDOW_KEY)).toBe(true);
  });

  it("workbookReducer — pruneWindows that changes nothing — returns the same windows map identity", () => {
    const w = window({ kind: "session" });
    const state = workbookReducer(initialWorkbookState, { type: "evalWindowResult", window: w, outputs: [] });

    const next = workbookReducer(state, { type: "pruneWindows", keep: new Set([wireWindowKey(w)]) });

    expect(next.windows).toBe(state.windows);
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
});
