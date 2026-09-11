import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_GRAPH_LAYOUT, type GraphLayout } from "./graphLayout";
import {
  effectiveGraphLayout,
  readGraphPositions,
  sanitizeGraphLayout,
  sanitizeStoredGraphPositions,
  setCellPosition,
  setNodePosition,
  tidiedLayout,
  writeGraphPositions,
} from "./graphPositions";

/** A minimal in-memory `localStorage`, installed on `globalThis.window` —
 *  the suite runs in vitest's `node` environment, where there is none. */
function installStorage(): Map<string, string> {
  const backing = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => void backing.set(key, value),
    },
  });
  return backing;
}

describe("sanitizeGraphLayout — a stale or hand-edited value — keeps what it can read", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("drops entries that are not a finite [x, y] pair and keeps the rest", () => {
    // Arrange
    const raw = {
      nodes: { good: [1, 2], short: [3], nan: [Number.NaN, 4], text: "nope", nested: [[1], 2] },
      cells: { frame: [5, 6] },
    };

    // Act
    const layout = sanitizeGraphLayout(raw);

    // Assert
    expect(layout).toEqual({ nodes: { good: [1, 2] }, cells: { frame: [5, 6] } });
  });

  it("anything that is not an object at all reads as the empty layout", () => {
    // Act
    const results = [sanitizeGraphLayout(null), sanitizeGraphLayout("x"), sanitizeGraphLayout([1, 2])];

    // Assert
    expect(results).toEqual([EMPTY_GRAPH_LAYOUT, EMPTY_GRAPH_LAYOUT, EMPTY_GRAPH_LAYOUT]);
  });

  it("the whole stored document sanitizes per workbook", () => {
    // Arrange
    const raw = { wb1: { nodes: { a: [1, 2] } }, wb2: "junk" };

    // Act
    const stored = sanitizeStoredGraphPositions(raw);

    // Assert
    expect(stored).toEqual({ wb1: { nodes: { a: [1, 2] }, cells: {} }, wb2: EMPTY_GRAPH_LAYOUT });
  });
});

describe("readGraphPositions / writeGraphPositions — per machine, per workbook — round-trip", () => {
  beforeEach(() => {
    installStorage();
  });

  it("a written arrangement reads back for its own workbook and not for another", () => {
    // Arrange
    const layout: GraphLayout = { nodes: { fork_velocity: [120, 80] }, cells: {} };

    // Act
    writeGraphPositions("wb1", layout);

    // Assert
    expect(readGraphPositions("wb1")).toEqual(layout);
    expect(readGraphPositions("wb2")).toEqual(EMPTY_GRAPH_LAYOUT);
  });

  it("writing one workbook leaves another workbook's arrangement untouched", () => {
    // Arrange
    writeGraphPositions("wb1", { nodes: { a: [1, 1] }, cells: {} });

    // Act
    writeGraphPositions("wb2", { nodes: { b: [2, 2] }, cells: {} });

    // Assert
    expect(readGraphPositions("wb1")).toEqual({ nodes: { a: [1, 1] }, cells: {} });
    expect(readGraphPositions("wb2")).toEqual({ nodes: { b: [2, 2] }, cells: {} });
  });

  it("no workbook open reads empty and writes nothing", () => {
    // Act
    writeGraphPositions(null, { nodes: { a: [1, 1] }, cells: {} });

    // Assert
    expect(readGraphPositions(null)).toEqual(EMPTY_GRAPH_LAYOUT);
    expect(readGraphPositions("wb1")).toEqual(EMPTY_GRAPH_LAYOUT);
  });

  it("storage that refuses every call yields the empty layout instead of throwing", () => {
    // Arrange
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("storage disabled");
        },
        setItem: () => {
          throw new Error("storage disabled");
        },
      },
    });

    // Act
    const read = readGraphPositions("wb1");

    // Assert
    expect(read).toEqual(EMPTY_GRAPH_LAYOUT);
    expect(() => writeGraphPositions("wb1", { nodes: { a: [1, 1] }, cells: {} })).not.toThrow();
  });
});

describe("setNodePosition / setCellPosition — a drag — rounds and replaces only its own entry", () => {
  it("a fractional drop rounds to whole canvas units", () => {
    // Arrange
    const layout: GraphLayout = { nodes: {}, cells: {} };

    // Act
    const moved = setNodePosition(layout, "fork_velocity", 120.6, 79.4);

    // Assert
    expect(moved.nodes).toEqual({ fork_velocity: [121, 79] });
  });

  it("moving a node again overwrites its own entry and leaves a sibling alone", () => {
    // Arrange
    const once = setNodePosition({ nodes: { other: [5, 5] }, cells: {} }, "a", 100, 100);

    // Act
    const twice = setNodePosition(once, "a", 200, 200);

    // Assert
    expect(twice.nodes).toEqual({ other: [5, 5], a: [200, 200] });
  });

  it("a frame drag writes under cells, not nodes", () => {
    // Act
    const moved = setCellPosition({ nodes: { a: [1, 1] }, cells: {} }, "a1b2c3d4", 40, 60);

    // Assert
    expect(moved).toEqual({ nodes: { a: [1, 1] }, cells: { a1b2c3d4: [40, 60] } });
  });
});

describe("effectiveGraphLayout — the file's positions and this machine's — merge per entry", () => {
  it("a stored entry wins over the file's for the same node, and the file's others survive", () => {
    // Arrange
    const fromFile: GraphLayout = { nodes: { a: [0, 0], b: [10, 10] }, cells: { c1: [1, 1] } };
    const stored: GraphLayout = { nodes: { b: [99, 99] }, cells: {} };

    // Act
    const effective = effectiveGraphLayout(fromFile, stored);

    // Assert
    expect(effective).toEqual({ nodes: { a: [0, 0], b: [99, 99] }, cells: { c1: [1, 1] } });
  });

  it("nothing stored yet leaves the file's layout exactly as it was", () => {
    // Arrange
    const fromFile: GraphLayout = { nodes: { a: [3, 4] }, cells: {} };

    // Act
    const effective = effectiveGraphLayout(fromFile, EMPTY_GRAPH_LAYOUT);

    // Assert
    expect(effective).toEqual(fromFile);
  });
});

describe("tidiedLayout — Tidy — records every definition's fresh place and clears stale frames", () => {
  it("definition nodes are stored by name and channel nodes are skipped", () => {
    // Arrange
    const positions = { "def:a": [0, 0] as [number, number], "def:b": [256, 96] as [number, number], "channel:x": [0, 96] as [number, number] };
    const names = new Map([
      ["def:a", "a"],
      ["def:b", "b"],
    ]);

    // Act
    const layout = tidiedLayout(positions, names);

    // Assert
    expect(layout).toEqual({ nodes: { a: [0, 0], b: [256, 96] }, cells: {} });
  });

  it("Tidy overwrites: nothing of a previous arrangement survives in its result", () => {
    // Arrange
    const positions = { "def:a": [10, 20] as [number, number] };
    const names = new Map([["def:a", "a"]]);

    // Act
    const layout = tidiedLayout(positions, names);

    // Assert
    expect(Object.keys(layout.nodes)).toEqual(["a"]);
    expect(layout.cells).toEqual({});
  });
});
