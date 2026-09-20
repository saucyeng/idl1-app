import { describe, expect, it } from "vitest";

import { blockedCells, blockedEdgeIds, blockedNodes, failingNodes, type FailingNode } from "./blockedCells";
import type { GraphEdge, GraphModel, GraphNode } from "./graphModel";
import type { NodeStatusResult } from "./graphStatus";
import type { CellOutput } from "../../../../ipc/workbook";

/** A node, with only the fields these functions read spelled out. */
function node(id: string, cellId: string | null, kind: GraphNode["kind"] = "definition", name = id): GraphNode {
  return { id, kind, name, label: null, cellId, exprText: null, mark: null };
}

/** `a -> b`, the id shape `graphModel.ts` builds. */
function edge(source: string, target: string): GraphEdge {
  return { id: `${source}->${target}`, source, target };
}

/** A failure on `nodeId`, owned by `cellId`. */
function failure(nodeId: string, cellId: string | null, message = "boom"): FailingNode {
  return { nodeId, cellId, cellLabel: cellId === null ? nodeId : `Cell ${cellId}`, message };
}

describe("blockedNodes", () => {
  it("blockedNodes — a chain below one failure — every descendant is blocked", () => {
    const nodes = [node("a", "c1"), node("b", "c2"), node("c", "c3")];
    const edges = [edge("a", "b"), edge("b", "c")];

    const blocked = blockedNodes({ nodes, edges, failing: [failure("a", "c1")] });

    expect([...blocked.keys()].sort()).toEqual(["b", "c"]);
  });

  it("blockedNodes — a branch with no failing ancestor — untouched", () => {
    const nodes = [node("a", "c1"), node("b", "c2"), node("x", "c9")];
    const edges = [edge("a", "b")];

    const blocked = blockedNodes({ nodes, edges, failing: [failure("a", "c1")] });

    expect(blocked.has("x")).toBe(false);
  });

  it("blockedNodes — a failing node downstream of another failure — reports its own error, not blocked", () => {
    const nodes = [node("a", "c1"), node("b", "c2"), node("c", "c3")];
    const edges = [edge("a", "b"), edge("b", "c")];

    const blocked = blockedNodes({ nodes, edges, failing: [failure("a", "c1"), failure("b", "c2")] });

    expect(blocked.has("b")).toBe(false);
  });

  it("blockedNodes — two failures upstream — names the nearest one", () => {
    const nodes = [node("far", "c1"), node("mid", "c2"), node("near", "c3"), node("leaf", "c4")];
    const edges = [edge("far", "mid"), edge("mid", "leaf"), edge("near", "leaf")];

    const blocked = blockedNodes({ nodes, edges, failing: [failure("far", "c1"), failure("near", "c3")] });

    expect(blocked.get("leaf")?.cellLabel).toBe("Cell c3");
  });

  it("blockedNodes — two equidistant failures — names the same one whichever order they arrive in", () => {
    const nodes = [node("zz", "c1"), node("aa", "c2"), node("leaf", "c3")];
    const edges = [edge("zz", "leaf"), edge("aa", "leaf")];

    const oneWay = blockedNodes({ nodes, edges, failing: [failure("zz", "c1"), failure("aa", "c2")] });
    const other = blockedNodes({ nodes, edges, failing: [failure("aa", "c2"), failure("zz", "c1")] });

    expect(oneWay.get("leaf")).toEqual(other.get("leaf"));
    expect(oneWay.get("leaf")?.cellLabel).toBe("Cell c2");
  });

  it("blockedNodes — a cycle in the graph — terminates and blocks each node once", () => {
    const nodes = [node("a", "c1"), node("b", "c2"), node("c", "c3")];
    const edges = [edge("a", "b"), edge("b", "c"), edge("c", "b")];

    const blocked = blockedNodes({ nodes, edges, failing: [failure("a", "c1")] });

    expect([...blocked.keys()].sort()).toEqual(["b", "c"]);
  });

  it("blockedNodes — no failures at all — nothing is blocked", () => {
    const nodes = [node("a", "c1"), node("b", "c2")];

    const blocked = blockedNodes({ nodes, edges: [edge("a", "b")], failing: [] });

    expect(blocked.size).toBe(0);
  });
});

describe("blockedCells", () => {
  it("blockedCells — a cell whose only node is blocked — blocked, naming the cause", () => {
    const nodes = [node("a", "c1"), node("b", "c2")];
    const blocked = blockedNodes({ nodes, edges: [edge("a", "b")], failing: [failure("a", "c1")] });

    const cells = blockedCells(nodes, blocked, new Set(["a"]));

    expect(cells.get("c2")?.message).toBe("boom");
  });

  it("blockedCells — a cell with one blocked and one working definition — not blocked", () => {
    const nodes = [node("a", "c1"), node("b", "c2"), node("fine", "c2")];
    const blocked = blockedNodes({ nodes, edges: [edge("a", "b")], failing: [failure("a", "c1")] });

    const cells = blockedCells(nodes, blocked, new Set(["a"]));

    expect(cells.has("c2")).toBe(false);
  });

  it("blockedCells — the failing cell itself — not blocked, since it is the cause", () => {
    const nodes = [node("a", "c1"), node("b", "c2")];
    const blocked = blockedNodes({ nodes, edges: [edge("a", "b")], failing: [failure("a", "c1")] });

    const cells = blockedCells(nodes, blocked, new Set(["a"]));

    expect(cells.has("c1")).toBe(false);
  });

  it("blockedCells — a cell holding one failing and one blocked node — blocked, since nothing in it can run", () => {
    const nodes = [node("a", "c1"), node("bad", "c2"), node("b", "c2")];
    const blocked = blockedNodes({ nodes, edges: [edge("a", "b")], failing: [failure("a", "c1"), failure("bad", "c2")] });

    const cells = blockedCells(nodes, blocked, new Set(["a", "bad"]));

    expect(cells.has("c2")).toBe(true);
  });

  it("blockedCells — a node belonging to no cell — contributes nothing", () => {
    const nodes = [node("src", null, "channel"), node("b", "c2")];
    const blocked = blockedNodes({ nodes, edges: [edge("src", "b")], failing: [failure("src", null)] });

    const cells = blockedCells(nodes, blocked, new Set(["src"]));

    expect([...cells.keys()]).toEqual(["c2"]);
  });
});

describe("blockedEdgeIds", () => {
  it("blockedEdgeIds — a chain below a failure — dashes from the failing node down", () => {
    const nodes = [node("a", "c1"), node("b", "c2"), node("c", "c3")];
    const edges = [edge("a", "b"), edge("b", "c")];
    const blocked = blockedNodes({ nodes, edges, failing: [failure("a", "c1")] });

    const dashed = blockedEdgeIds(edges, blocked);

    expect([...dashed].sort()).toEqual(["a->b", "b->c"]);
  });

  it("blockedEdgeIds — an edge into a healthy node — not dashed", () => {
    const nodes = [node("a", "c1"), node("b", "c2"), node("x", "c9"), node("y", "c8")];
    const edges = [edge("a", "b"), edge("x", "y")];
    const blocked = blockedNodes({ nodes, edges, failing: [failure("a", "c1")] });

    const dashed = blockedEdgeIds(edges, blocked);

    expect(dashed.has("x->y")).toBe(false);
  });
});

/** A `CellOutput` with only the fields `failingNodes` reads. */
function output(cellId: string, over: Partial<CellOutput> = {}): CellOutput {
  return {
    cell_id: cellId,
    kind: "math",
    value: null,
    defs: [],
    errors: [],
    prose_before_html: null,
    prose_after_html: null,
    prose_spans: [],
    ...over,
  } as CellOutput;
}

/** A status map from a plain record. */
function statuses(byId: Record<string, NodeStatusResult["status"]>): Map<string, NodeStatusResult> {
  return new Map(Object.entries(byId).map(([id, status]) => [id, { status, split: null }]));
}

describe("failingNodes", () => {
  it("failingNodes — an errored definition — carries its own error text", () => {
    const model: GraphModel = { nodes: [node("d", "c1", "definition", "speed")], edges: [], groups: [] };
    const outputs = new Map([["c1", output("c1", { defs: [{ name: "speed", error: { kind: "math_unknown_channel", message: "unknown channel" } }] as never })]]);

    const failing = failingNodes(model, statuses({ d: "error" }), outputs, (id) => `Cell ${id}`);

    expect(failing).toEqual([{ nodeId: "d", cellId: "c1", cellLabel: "Cell c1", message: "unknown channel" }]);
  });

  it("failingNodes — a grey node — not a failure, since a session gap has no upstream cause", () => {
    const model: GraphModel = { nodes: [node("d", "c1")], edges: [], groups: [] };

    const failing = failingNodes(model, statuses({ d: "grey" }), new Map(), (id) => id);

    expect(failing).toEqual([]);
  });

  it("failingNodes — a pending node — not a failure, so opening a workbook dims nothing", () => {
    const model: GraphModel = { nodes: [node("d", "c1")], edges: [], groups: [] };

    const failing = failingNodes(model, statuses({ d: "pending" }), new Map(), (id) => id);

    expect(failing).toEqual([]);
  });

  it("failingNodes — an unresolved source node — names the channel as the reason", () => {
    const model: GraphModel = { nodes: [node("s", null, "channel", "speeed")], edges: [], groups: [] };

    const failing = failingNodes(model, statuses({ s: "error" }), new Map(), (id) => id);

    expect(failing[0]?.message).toBe('unknown channel "speeed"');
  });

  it("failingNodes — a definition missing from defs entirely — falls back to the cell's own errors", () => {
    const model: GraphModel = { nodes: [node("d", "c1", "definition", "speed")], edges: [], groups: [] };
    const outputs = new Map([["c1", output("c1", { errors: [{ kind: "workbook_parse", message: "bad def line" }] as never })]]);

    const failing = failingNodes(model, statuses({ d: "error" }), outputs, (id) => id);

    expect(failing[0]?.message).toBe("bad def line");
  });
});
