import { describe, expect, it } from "vitest";

import { computeAutoLayoutPositions, GRAPH_LAYER_DX, GRAPH_ROW_DY } from "./graphAutoLayout";
import { EMPTY_GRAPH_LAYOUT, type GraphLayout } from "./graphLayout";
import type { GraphEdge, GraphModel, GraphNode } from "./graphModel";

function node(id: string, kind: GraphNode["kind"] = "definition"): GraphNode {
  return { id, kind, name: id.split(":")[1] ?? id, label: null, cellId: kind === "definition" ? "a1b2c3d4" : null, exprText: null };
}

function edge(source: string, target: string): GraphEdge {
  return { id: `${source}->${target}`, source, target };
}

describe("computeAutoLayoutPositions", () => {
  it("computeAutoLayoutPositions — a single node with no edges — is placed at depth 0", () => {
    // Arrange
    const model: GraphModel = { nodes: [node("def:a")], edges: [], groups: [] };

    // Act
    const positions = computeAutoLayoutPositions(model, EMPTY_GRAPH_LAYOUT);

    // Assert
    expect(positions["def:a"]).toEqual([0, 0]);
  });

  it("computeAutoLayoutPositions — a chain of three — each link one column deeper than its dependency", () => {
    // Arrange
    const model: GraphModel = {
      nodes: [node("channel:a", "channel"), node("def:b"), node("def:c")],
      edges: [edge("channel:a", "def:b"), edge("def:b", "def:c")],
      groups: [],
    };

    // Act
    const positions = computeAutoLayoutPositions(model, EMPTY_GRAPH_LAYOUT);

    // Assert
    expect(positions["channel:a"][0]).toBe(0);
    expect(positions["def:b"][0]).toBe(GRAPH_LAYER_DX);
    expect(positions["def:c"][0]).toBe(2 * GRAPH_LAYER_DX);
  });

  it("computeAutoLayoutPositions — a diamond dependency — the join node sits one column past its deepest input", () => {
    // Arrange: a -> b, a -> c, b -> d, c -> d
    const model: GraphModel = {
      nodes: [node("def:a"), node("def:b"), node("def:c"), node("def:d")],
      edges: [edge("def:a", "def:b"), edge("def:a", "def:c"), edge("def:b", "def:d"), edge("def:c", "def:d")],
      groups: [],
    };

    // Act
    const positions = computeAutoLayoutPositions(model, EMPTY_GRAPH_LAYOUT);

    // Assert
    expect(positions["def:a"][0]).toBe(0);
    expect(positions["def:b"][0]).toBe(GRAPH_LAYER_DX);
    expect(positions["def:c"][0]).toBe(GRAPH_LAYER_DX);
    expect(positions["def:d"][0]).toBe(2 * GRAPH_LAYER_DX);
  });

  it("computeAutoLayoutPositions — two nodes at the same depth — get distinct rows in document order", () => {
    // Arrange
    const model: GraphModel = { nodes: [node("def:a"), node("def:b")], edges: [], groups: [] };

    // Act
    const positions = computeAutoLayoutPositions(model, EMPTY_GRAPH_LAYOUT);

    // Assert
    expect(positions["def:a"]).toEqual([0, 0]);
    expect(positions["def:b"]).toEqual([0, GRAPH_ROW_DY]);
  });

  it("computeAutoLayoutPositions — a definition node with a stored position — keeps it, ignoring computed depth", () => {
    // Arrange
    const model: GraphModel = {
      nodes: [node("channel:a", "channel"), node("def:b")],
      edges: [edge("channel:a", "def:b")],
      groups: [],
    };
    const layout: GraphLayout = { nodes: { b: [999, 999] }, cells: {} };

    // Act
    const positions = computeAutoLayoutPositions(model, layout);

    // Assert
    expect(positions["def:b"]).toEqual([999, 999]);
    expect(positions["channel:a"]).toEqual([0, 0]); // unaffected — channel nodes have no stored-position home
  });

  it("computeAutoLayoutPositions — a channel node — is always auto-placed, never read from stored layout", () => {
    // Arrange — a stray entry under the same name in layout.nodes must not
    // leak onto a channel node: C2 §3.7.1's `nodes` key is definition-name
    // keyed, and this module must not accidentally match a channel by name.
    const model: GraphModel = { nodes: [node("channel:x", "channel")], edges: [], groups: [] };
    const layout: GraphLayout = { nodes: { x: [123, 456] }, cells: {} };

    // Act
    const positions = computeAutoLayoutPositions(model, layout);

    // Assert
    expect(positions["channel:x"]).toEqual([0, 0]);
  });

  it("computeAutoLayoutPositions — a dependency cycle — terminates and assigns a finite position to every node", () => {
    // Arrange — a -> b -> a, invalid per core's cycle-guarded resolver but
    // must never hang this rendering fallback.
    const model: GraphModel = {
      nodes: [node("def:a"), node("def:b")],
      edges: [edge("def:a", "def:b"), edge("def:b", "def:a")],
      groups: [],
    };

    // Act
    const positions = computeAutoLayoutPositions(model, EMPTY_GRAPH_LAYOUT);

    // Assert
    expect(positions["def:a"]).toBeDefined();
    expect(positions["def:b"]).toBeDefined();
    expect(Number.isFinite(positions["def:a"][0])).toBe(true);
    expect(Number.isFinite(positions["def:b"][0])).toBe(true);
  });

  it("computeAutoLayoutPositions — barycentre ordering — puts a node opposite its dependency, not in document order", () => {
    // Arrange: two sources in document order a, b; two dependants declared
    // in the *opposite* order — x depends on b, y depends on a. Pure
    // document order would cross both edges; the barycentre must not.
    const model: GraphModel = {
      nodes: [node("channel:a", "channel"), node("channel:b", "channel"), node("def:x"), node("def:y")],
      edges: [edge("channel:b", "def:x"), edge("channel:a", "def:y")],
      groups: [],
    };

    // Act
    const positions = computeAutoLayoutPositions(model, EMPTY_GRAPH_LAYOUT);

    // Assert — y (following a, row 0) is above x (following b, row 1).
    expect(positions["channel:a"]).toEqual([0, 0]);
    expect(positions["channel:b"]).toEqual([0, GRAPH_ROW_DY]);
    expect(positions["def:y"]).toEqual([GRAPH_LAYER_DX, 0]);
    expect(positions["def:x"]).toEqual([GRAPH_LAYER_DX, GRAPH_ROW_DY]);
  });

  it("computeAutoLayoutPositions — a node with two dependencies — sits between them", () => {
    // Arrange: three sources, and a join node fed by the first and third.
    const model: GraphModel = {
      nodes: [node("channel:a", "channel"), node("channel:b", "channel"), node("channel:c", "channel"), node("def:j"), node("def:k")],
      edges: [edge("channel:a", "def:j"), edge("channel:c", "def:j"), edge("channel:b", "def:k")],
      groups: [],
    };

    // Act
    const positions = computeAutoLayoutPositions(model, EMPTY_GRAPH_LAYOUT);

    // Assert — k's barycentre is 1, j's is (0 + 2) / 2 = 1; the tie breaks
    // on document order, so j (declared first) keeps the upper row.
    expect(positions["def:j"]).toEqual([GRAPH_LAYER_DX, 0]);
    expect(positions["def:k"]).toEqual([GRAPH_LAYER_DX, GRAPH_ROW_DY]);
  });

  it("computeAutoLayoutPositions — run twice on the same model — is byte-identical", () => {
    // Arrange
    const model: GraphModel = {
      nodes: [node("channel:a", "channel"), node("channel:b", "channel"), node("def:x"), node("def:y"), node("def:z")],
      edges: [edge("channel:b", "def:x"), edge("channel:a", "def:y"), edge("def:x", "def:z"), edge("def:y", "def:z")],
      groups: [],
    };

    // Act
    const first = computeAutoLayoutPositions(model, EMPTY_GRAPH_LAYOUT);
    const second = computeAutoLayoutPositions(model, EMPTY_GRAPH_LAYOUT);

    // Assert
    expect(second).toEqual(first);
  });

  it("computeAutoLayoutPositions — an empty model — returns an empty position map", () => {
    // Act
    const positions = computeAutoLayoutPositions({ nodes: [], edges: [], groups: [] }, EMPTY_GRAPH_LAYOUT);

    // Assert
    expect(positions).toEqual({});
  });
});
