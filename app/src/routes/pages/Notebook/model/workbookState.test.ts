import { describe, expect, it } from "vitest";

import type { CellOutput, Window as SelectedWindow } from "../../../../ipc/workbook";
import { initialWorkbookState, isWindowStale, NO_WINDOW_KEY, workbookReducer, wireWindowKey } from "./workbookState";

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
      generation: 0,
    });

    const next = workbookReducer(seeded, {
      type: "evalWindowResult",
      window: w,
      outputs: [output("cell-a", { value: "new" })],
      generation: 0,
    });

    const entry = next.windows.get(wireWindowKey(w));
    expect(entry?.kind).toBe("ok");
    expect(entry?.kind === "ok" && entry.outputs.get("cell-a")?.value).toBe("new");
    expect(entry?.kind === "ok" && entry.outputs.has("cell-b")).toBe(false);
  });

  it("workbookReducer — a cell carrying errors — keeps the cell and stores its errors (never drops it)", () => {
    const w = window({ kind: "session" });
    const errored = output("cell-a", { errors: [{ kind: "math_unknown_channel", message: "no such channel" }] });

    const next = workbookReducer(initialWorkbookState, { type: "evalWindowResult", window: w, outputs: [errored], generation: 0 });

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
      defs: [{ name: "speed", label: null, value: null, error: { kind: "math_reserved_name", message: "reserved" }, sample_rate_hz: null }],
    });

    const next = workbookReducer(initialWorkbookState, { type: "evalWindowResult", window: w, outputs: [withDefError], generation: 0 });

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
      generation: 0,
    });

    const next = workbookReducer(seeded, {
      type: "evalWindowError",
      window: bad,
      error: { kind: "invalid_argument", message: "t0_us >= t1_us" },
      generation: 0,
    });

    expect(next.windows.get(wireWindowKey(ok))).toEqual({
      kind: "ok",
      outputs: new Map([["cell-a", output("cell-a", { value: "fine" })]]),
      generation: 0,
    });
    expect(next.windows.get(wireWindowKey(bad))).toEqual({
      kind: "error",
      error: { kind: "invalid_argument", message: "t0_us >= t1_us" },
      generation: 0,
    });
  });

  it("workbookReducer — a whole-call rejection (window: null) — stores under NO_WINDOW_KEY", () => {
    const next = workbookReducer(initialWorkbookState, {
      type: "evalWindowError",
      window: null,
      error: { kind: "internal", message: "unknown workbook id" },
      generation: 0,
    });

    expect(next.windows.get(NO_WINDOW_KEY)).toEqual({ kind: "error", error: { kind: "internal", message: "unknown workbook id" }, generation: 0 });
  });

  it("workbookReducer — pruneWindows with a non-empty keep set — drops every window not in it, including NO_WINDOW_KEY", () => {
    const kept = window({ kind: "lap", lap_number: 1 });
    const dropped = window({ kind: "lap", lap_number: 2 });
    let state = workbookReducer(initialWorkbookState, { type: "evalWindowResult", window: kept, outputs: [], generation: 0 });
    state = workbookReducer(state, { type: "evalWindowResult", window: dropped, outputs: [], generation: 0 });
    state = workbookReducer(state, { type: "evalWindowError", window: null, error: { kind: "internal", message: "boom" }, generation: 0 });

    const next = workbookReducer(state, { type: "pruneWindows", keep: new Set([wireWindowKey(kept)]) });

    expect(next.windows.has(wireWindowKey(kept))).toBe(true);
    expect(next.windows.has(wireWindowKey(dropped))).toBe(false);
    expect(next.windows.has(NO_WINDOW_KEY)).toBe(false);
  });

  it("workbookReducer — pruneWindows with an empty keep set — keeps NO_WINDOW_KEY (the legitimate 'nothing selected' result)", () => {
    const state = workbookReducer(initialWorkbookState, { type: "evalWindowResult", window: null, outputs: [], generation: 0 });

    const next = workbookReducer(state, { type: "pruneWindows", keep: new Set() });

    expect(next.windows.has(NO_WINDOW_KEY)).toBe(true);
  });

  it("workbookReducer — pruneWindows that changes nothing — returns the same windows map identity", () => {
    const w = window({ kind: "session" });
    const state = workbookReducer(initialWorkbookState, { type: "evalWindowResult", window: w, outputs: [], generation: 0 });

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

  it("workbookReducer — a front-matter-only edit — updates the markdown/cells and sets frontMatterDirty, touching no dirtyCellIds", () => {
    const markdown = "---\nid: x\nname: y\ngraph:\n  nodes:\n    a: [1, 2]\n---\n```js id=aaaaaaaa\n1\n```\n";

    const next = workbookReducer(initialWorkbookState, { type: "editFrontMatter", markdown });

    expect(next.markdown).toBe(markdown);
    expect(next.cells).toHaveLength(1);
    expect(next.frontMatterDirty).toBe(true);
    expect(next.dirtyCellIds.size).toBe(0);
  });

  it("workbookReducer — a save result after a front-matter-only edit — clears frontMatterDirty too", () => {
    const dirty = workbookReducer(initialWorkbookState, { type: "editFrontMatter", markdown: "---\nid: x\nname: y\n---\n" });

    const next = workbookReducer(dirty, { type: "saveResult", hash: "abc123" });

    expect(next.frontMatterDirty).toBe(false);
  });

  it("workbookReducer — a fresh markdownReady read — clears a pending frontMatterDirty", () => {
    const dirty = workbookReducer(initialWorkbookState, { type: "editFrontMatter", markdown: "---\nid: x\nname: y\n---\n" });

    const next = workbookReducer(dirty, { type: "markdownReady", markdown: "---\nid: x\nname: y\n---\n", hash: "h1" });

    expect(next.frontMatterDirty).toBe(false);
  });

  it("workbookReducer — a markdownReady read reporting a retired name — stores it as pendingMigrations (R151 item 9)", () => {
    const pendingMigrations = [{ cell_id: "aaaaaaaa", line: 2, old: "variance_time", new: "lap_delta_time" }];

    const next = workbookReducer(initialWorkbookState, { type: "markdownReady", markdown: "prose\n", hash: "h1", pendingMigrations });

    expect(next.pendingMigrations).toEqual(pendingMigrations);
  });

  it("workbookReducer — a save result reporting a migration — clears pendingMigrations and stores appliedMigrations", () => {
    const withPending = workbookReducer(initialWorkbookState, {
      type: "markdownReady",
      markdown: "prose\n",
      hash: "h1",
      pendingMigrations: [{ cell_id: "aaaaaaaa", line: 2, old: "variance_time", new: "lap_delta_time" }],
    });
    const migrations = [{ cell_id: "aaaaaaaa", line: 2, old: "variance_time", new: "lap_delta_time" }];

    const next = workbookReducer(withPending, { type: "saveResult", hash: "h2", migrations });

    expect(next.pendingMigrations).toEqual([]);
    expect(next.appliedMigrations).toEqual(migrations);
  });

  it("workbookReducer — a save result carrying no migrations — leaves appliedMigrations empty", () => {
    const next = workbookReducer(initialWorkbookState, { type: "saveResult", hash: "h2" });

    expect(next.appliedMigrations).toEqual([]);
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

  it("workbookReducer — an edit that changes text — bumps evalRequestGeneration (decision 59)", () => {
    const next = workbookReducer(initialWorkbookState, { type: "editCell", cellId: "cell-a", markdown: "```js id=aaaaaaaa\n1\n```\n" });

    expect(next.evalRequestGeneration).toBe(1);
  });

  it("workbookReducer — an editCell with no markdown (dirty-marking only) — does not bump the generation", () => {
    const next = workbookReducer(initialWorkbookState, { type: "editCell", cellId: "cell-a" });

    expect(next.evalRequestGeneration).toBe(0);
  });

  it("workbookReducer — a watch event naming cells — bumps the generation; one naming none does not", () => {
    const withCells = workbookReducer(initialWorkbookState, {
      type: "watchEvent",
      event: { kind: "changed", cell_ids: ["cell-a"], hash: "h9" },
    });
    expect(withCells.evalRequestGeneration).toBe(1);

    const empty = workbookReducer(initialWorkbookState, { type: "watchEvent", event: { kind: "changed", cell_ids: [], hash: "h9" } });
    expect(empty.evalRequestGeneration).toBe(0);
  });

  it("workbookReducer — saveResult never touches evalRequestGeneration (staleness is not a save concept)", () => {
    const edited = workbookReducer(initialWorkbookState, { type: "editCell", cellId: "cell-a", markdown: "```js id=aaaaaaaa\n1\n```\n" });

    const saved = workbookReducer(edited, { type: "saveResult", hash: "abc" });

    expect(saved.evalRequestGeneration).toBe(1);
  });
});

describe("isWindowStale", () => {
  it("no entry yet (never evaluated) — not stale, that is 'pending', a different state", () => {
    expect(isWindowStale(undefined, 3)).toBe(false);
  });

  it("an entry from an older generation than the current request — stale", () => {
    expect(isWindowStale({ kind: "ok", outputs: new Map(), generation: 1 }, 2)).toBe(true);
  });

  it("an entry from the current generation — fresh, not stale", () => {
    expect(isWindowStale({ kind: "ok", outputs: new Map(), generation: 2 }, 2)).toBe(false);
  });

  it("an error entry from an older generation — also stale (staleness is orthogonal to ok/error)", () => {
    expect(isWindowStale({ kind: "error", error: { kind: "internal", message: "x" }, generation: 0 }, 1)).toBe(true);
  });
});
