import { describe, expect, it } from "vitest";

import type { BlockedBy, FailingNode } from "./blockedCells";
import type { CellStatus } from "./cellStatus";
import { computeNodeEvalViews, describeNodeEval, isNodeWorking, type NodeEvalState, type NodeEvalView } from "./graphEvalView";
import type { GraphModel, GraphNode } from "./graphModel";
import type { NodeStatusResult } from "./graphStatus";

function node(id: string, cellId: string | null, kind: GraphNode["kind"] = "definition"): GraphNode {
  return { id, kind, name: id, label: null, cellId, exprText: null, mark: null };
}

function statuses(byId: Record<string, NodeStatusResult["status"]>): Map<string, NodeStatusResult> {
  return new Map(Object.entries(byId).map(([id, status]) => [id, { status, split: null }]));
}

/** Inputs with nothing live and nothing blocked — each test changes one. */
function inputs(over: {
  model?: GraphModel;
  statuses?: Map<string, NodeStatusResult>;
  blocked?: Map<string, BlockedBy>;
  failing?: Map<string, FailingNode>;
  cellStatus?: CellStatus | null;
  fraction?: number | null;
}) {
  return {
    model: over.model ?? { nodes: [node("a", "c1")], edges: [], groups: [] },
    statuses: over.statuses ?? statuses({ a: "ok" }),
    blocked: over.blocked ?? new Map<string, BlockedBy>(),
    failing: over.failing ?? new Map<string, FailingNode>(),
    cellStatusOf: () => over.cellStatus ?? null,
    cellFractionOf: () => over.fraction ?? null,
  };
}

const CAUSE: BlockedBy = { cellId: "c9", cellLabel: "Cell 3", message: "unknown channel" };

describe("computeNodeEvalViews", () => {
  it("computeNodeEvalViews — a blocked node — blocked, outranking its own status and its cell's", () => {
    const views = computeNodeEvalViews(inputs({ blocked: new Map([["a", CAUSE]]), statuses: statuses({ a: "ok" }), cellStatus: "fetching" }));

    expect(views.get("a")).toEqual({ state: "blocked", fraction: null, blockedBy: CAUSE, error: null, split: null });
  });

  it("computeNodeEvalViews — a failing node — error, carrying its message", () => {
    const failing = new Map([["a", { nodeId: "a", cellId: "c1", cellLabel: "Cell 1", message: "bad unit" }]]);

    const views = computeNodeEvalViews(inputs({ statuses: statuses({ a: "error" }), failing }));

    expect(views.get("a")).toMatchObject({ state: "error", error: "bad unit" });
  });

  it("computeNodeEvalViews — a session gap — stays grey, whatever the cell is doing", () => {
    const views = computeNodeEvalViews(inputs({ statuses: statuses({ a: "grey" }), cellStatus: "evaluating" }));

    expect(views.get("a")?.state).toBe("grey");
  });

  it("computeNodeEvalViews — a node whose cell is decoding — fetching, with the fraction", () => {
    const views = computeNodeEvalViews(inputs({ statuses: statuses({ a: "ok" }), cellStatus: "fetching", fraction: 0.3 }));

    expect(views.get("a")).toMatchObject({ state: "fetching", fraction: 0.3 });
  });

  it("computeNodeEvalViews — a node whose cell is re-running — working, not the last run's ok", () => {
    const views = computeNodeEvalViews(inputs({ statuses: statuses({ a: "ok" }), cellStatus: "evaluating" }));

    expect(views.get("a")?.state).toBe("evaluating");
  });

  it("computeNodeEvalViews — a node whose cell is done — its own per-window status", () => {
    const views = computeNodeEvalViews(inputs({ statuses: statuses({ a: "pending" }), cellStatus: "done" }));

    expect(views.get("a")?.state).toBe("pending");
  });

  it("computeNodeEvalViews — a source node with no cell — its status, since it has no cell to be live", () => {
    const model: GraphModel = { nodes: [node("s", null, "channel")], edges: [], groups: [] };

    const views = computeNodeEvalViews(inputs({ model, statuses: statuses({ s: "ok" }), cellStatus: "evaluating" }));

    expect(views.get("s")?.state).toBe("ok");
  });

  it("computeNodeEvalViews — a node with no status entry at all — pending, never absent", () => {
    const views = computeNodeEvalViews(inputs({ statuses: new Map() }));

    expect(views.get("a")?.state).toBe("pending");
  });

  it("computeNodeEvalViews — R132's split — carried through unchanged", () => {
    const withSplit = new Map([["a", { status: "ok" as const, split: "2 of 3 windows" }]]);

    const views = computeNodeEvalViews(inputs({ statuses: withSplit }));

    expect(views.get("a")?.split).toBe("2 of 3 windows");
  });
});

describe("isNodeWorking", () => {
  it("isNodeWorking — each state — true only for the three that are running", () => {
    const states: NodeEvalState[] = ["pending", "fetching", "evaluating", "rendering", "ok", "error", "grey", "blocked"];

    const working = states.filter(isNodeWorking);

    expect(working).toEqual(["fetching", "evaluating", "rendering"]);
  });
});

/** A view with nothing set — each test changes what it is about. */
const OK_VIEW: NodeEvalView = { state: "ok", fraction: null, blockedBy: null, error: null, split: null };

describe("describeNodeEval", () => {
  it("describeNodeEval — a blocked node — names the cell and the error", () => {
    const text = describeNodeEval({ ...OK_VIEW, state: "blocked", blockedBy: CAUSE }, null);

    expect(text).toBe("Blocked by Cell 3: unknown channel");
  });

  it("describeNodeEval — a fetching node — its percentage, floored", () => {
    const text = describeNodeEval({ ...OK_VIEW, state: "fetching", fraction: 0.999 }, null);

    expect(text).toBe("Fetching channels · 99 %");
  });

  it("describeNodeEval — a failed node — its own message", () => {
    const text = describeNodeEval({ ...OK_VIEW, state: "error", error: "bad unit" }, null);

    expect(text).toBe("Failed: bad unit");
  });

  it("describeNodeEval — a split and a duration — one line each, after the state", () => {
    const text = describeNodeEval({ ...OK_VIEW, split: "2 of 3 windows" }, 4200);

    expect(text).toBe("Evaluated\n2 of 3 windows\n4 s");
  });

  it("describeNodeEval — no duration — no stray line", () => {
    const text = describeNodeEval(OK_VIEW, null);

    expect(text).toBe("Evaluated");
  });
});
