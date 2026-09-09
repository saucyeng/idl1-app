import { describe, expect, it } from "vitest";

import type { SessionDetail } from "../../../../ipc/catalog";
import type { CellDefResult, CellOutput, Window as SelectedWindow } from "../../../../ipc/workbook";
import { bannerWindows, computeNodeStatuses, type GraphStatusInputs } from "./graphStatus";
import type { GraphEdge, GraphModel, GraphNode } from "./graphModel";
import { wireWindowKey, type WindowEvalState } from "./workbookState";

function node(id: string, kind: GraphNode["kind"], cellId: string | null = "a1b2c3d4"): GraphNode {
  const name = id.split(":")[1] ?? id;
  return { id, kind, name, label: null, cellId: kind === "definition" ? cellId : null, exprText: null };
}

function edge(source: string, target: string): GraphEdge {
  return { id: `${source}->${target}`, source, target };
}

function window(sessionId: string): SelectedWindow {
  return { session_id: sessionId, span: { kind: "session" }, colour: "--chart-1" };
}

function session(sessionId: string, channelIds: string[]): SessionDetail {
  return {
    session_id: sessionId,
    device_id: null,
    timestamp_utc_ms: 0,
    config_checksum: null,
    source_format: "idl0",
    blob_sha256: "0".repeat(64),
    channels: channelIds.map((id) => ({ channel_id: id, nominal_rate_hz: 100, unit: "", source_kind: "imu0", channel_kind: "fixed-rate", sample_count: 0 })),
    rider: "",
    bike: "",
    track: "",
    conditions: "",
    notes: "",
    laps: [],
  } as unknown as SessionDetail;
}

function defResult(name: string, error: CellDefResult["error"] = null): CellDefResult {
  return { name, label: null, value: error === null ? { length: 10, has_t: true } : null, error, sample_rate_hz: error === null ? 10 : null, unit: { state: "dimensionless" }, unit_notes: [] };
}

function cellOutput(cellId: string, defs: CellDefResult[]): CellOutput {
  return { cell_id: cellId, kind: "math", value: null, defs, errors: [], prose_before_html: null, prose_after_html: null, prose_spans: [] };
}

function okWindow(outputs: CellOutput[]): WindowEvalState {
  return { kind: "ok", outputs: new Map(outputs.map((o) => [o.cell_id, o])), generation: 0 };
}

describe("computeNodeStatuses", () => {
  it("computeNodeStatuses — a definition not yet evaluated in the only selected window — is pending", () => {
    // Arrange
    const model: GraphModel = { nodes: [node("def:x", "definition")], edges: [], groups: [] };
    const w = window("s1");
    const inputs: GraphStatusInputs = { model, selectedWindows: [w], windows: new Map(), sessionDetails: new Map() };

    // Act
    const statuses = computeNodeStatuses(inputs);

    // Assert
    expect(statuses.get("def:x")).toEqual({ status: "pending", split: null });
  });

  it("computeNodeStatuses — a completed window whose output has no defs entry for this node — is error, never a permanent pending", () => {
    // Arrange — a structural problem keeps the definition out of `defs`
    // entirely (CellDefResult's own doc comment); the window has still
    // finished evaluating, so this must not read as "still running".
    const model: GraphModel = { nodes: [node("def:x", "definition")], edges: [], groups: [] };
    const w = window("s1");
    const windows = new Map([[wireWindowKey(w), okWindow([cellOutput("a1b2c3d4", [])])]]); // no "x" entry in defs
    const inputs: GraphStatusInputs = { model, selectedWindows: [w], windows, sessionDetails: new Map() };

    // Act
    const statuses = computeNodeStatuses(inputs);

    // Assert
    expect(statuses.get("def:x")).toEqual({ status: "error", split: null });
  });

  it("computeNodeStatuses — a definition that evaluated with no error — is ok", () => {
    // Arrange
    const model: GraphModel = { nodes: [node("def:x", "definition")], edges: [], groups: [] };
    const w = window("s1");
    const windows = new Map([[wireWindowKey(w), okWindow([cellOutput("a1b2c3d4", [defResult("x")])])]]);
    const inputs: GraphStatusInputs = { model, selectedWindows: [w], windows, sessionDetails: new Map() };

    // Act
    const statuses = computeNodeStatuses(inputs);

    // Assert
    expect(statuses.get("def:x")).toEqual({ status: "ok", split: null });
  });

  it("computeNodeStatuses — a definition whose CellDefResult carries an error — is error", () => {
    // Arrange
    const model: GraphModel = { nodes: [node("def:x", "definition")], edges: [], groups: [] };
    const w = window("s1");
    const windows = new Map([[wireWindowKey(w), okWindow([cellOutput("a1b2c3d4", [defResult("x", { kind: "DivisionByZero", message: "boom" })])])]]);
    const inputs: GraphStatusInputs = { model, selectedWindows: [w], windows, sessionDetails: new Map() };

    // Act
    const statuses = computeNodeStatuses(inputs);

    // Assert
    expect(statuses.get("def:x")).toEqual({ status: "error", split: null });
  });

  it("computeNodeStatuses — a channel referenced but present in no selected session — is a red error (typo)", () => {
    // Arrange
    const model: GraphModel = { nodes: [node("channel:ghost", "channel")], edges: [], groups: [] };
    const w = window("s1");
    const inputs: GraphStatusInputs = { model, selectedWindows: [w], windows: new Map(), sessionDetails: new Map([["s1", session("s1", ["real_channel"])]]) };

    // Act
    const statuses = computeNodeStatuses(inputs);

    // Assert
    expect(statuses.get("channel:ghost")).toEqual({ status: "error", split: null });
  });

  it("computeNodeStatuses — a channel present in one selected session but not another — is grey in the window lacking it", () => {
    // Arrange
    const model: GraphModel = { nodes: [node("channel:speed", "channel")], edges: [], groups: [] };
    const w1 = window("s1");
    const w2 = window("s2");
    const sessionDetails = new Map([
      ["s1", session("s1", ["speed"])],
      ["s2", session("s2", [])],
    ]);
    const inputs: GraphStatusInputs = { model, selectedWindows: [w1, w2], windows: new Map(), sessionDetails };

    // Act
    const statuses = computeNodeStatuses(inputs);

    // Assert — worst-wins picks grey over ok, and the split names the fraction
    expect(statuses.get("channel:speed")).toEqual({ status: "grey", split: "1 of 2 windows" });
  });

  it("computeNodeStatuses — a definition downstream of a grey channel root — greys instead of showing the real UnknownChannel error", () => {
    // Arrange
    const model: GraphModel = {
      nodes: [node("channel:speed", "channel"), node("def:accel", "definition")],
      edges: [edge("channel:speed", "def:accel")],
      groups: [],
    };
    const w1 = window("s1");
    const w2 = window("s2");
    const sessionDetails = new Map([
      ["s1", session("s1", ["speed"])],
      ["s2", session("s2", [])],
    ]);
    const windows = new Map([
      [wireWindowKey(w1), okWindow([cellOutput("a1b2c3d4", [defResult("accel")])])],
      [wireWindowKey(w2), okWindow([cellOutput("a1b2c3d4", [defResult("accel", { kind: "UnknownChannel", message: "no speed" })])])],
    ]);
    const inputs: GraphStatusInputs = { model, selectedWindows: [w1, w2], windows, sessionDetails };

    // Act
    const statuses = computeNodeStatuses(inputs);

    // Assert
    expect(statuses.get("def:accel")).toEqual({ status: "grey", split: "1 of 2 windows" });
  });

  it("computeNodeStatuses — a definition downstream of a red (typo) channel — still shows the real error, not grey", () => {
    // Arrange
    const model: GraphModel = {
      nodes: [node("channel:ghost", "channel"), node("def:accel", "definition")],
      edges: [edge("channel:ghost", "def:accel")],
      groups: [],
    };
    const w = window("s1");
    const windows = new Map([[wireWindowKey(w), okWindow([cellOutput("a1b2c3d4", [defResult("accel", { kind: "UnknownChannel", message: "no ghost" })])])]]);
    const inputs: GraphStatusInputs = { model, selectedWindows: [w], windows, sessionDetails: new Map([["s1", session("s1", [])]]) };

    // Act
    const statuses = computeNodeStatuses(inputs);

    // Assert
    expect(statuses.get("def:accel")).toEqual({ status: "error", split: null });
  });

  it("computeNodeStatuses — a whole-window failure — excludes that window from the node's aggregation entirely", () => {
    // Arrange
    const model: GraphModel = { nodes: [node("def:x", "definition")], edges: [], groups: [] };
    const w1 = window("s1");
    const w2 = window("s2");
    const windows = new Map<string, WindowEvalState>([
      [wireWindowKey(w1), okWindow([cellOutput("a1b2c3d4", [defResult("x")])])],
      [wireWindowKey(w2), { kind: "error", error: { kind: "InternalError", message: "eval crashed" }, generation: 0 }],
    ]);
    const inputs: GraphStatusInputs = { model, selectedWindows: [w1, w2], windows, sessionDetails: new Map() };

    // Act
    const statuses = computeNodeStatuses(inputs);

    // Assert — the failed window contributes no per-window entry at all, so the node reads as a clean ok, not a mixed split
    expect(statuses.get("def:x")).toEqual({ status: "ok", split: null });
  });

  it("bannerWindows — names the selected windows whose whole evaluation call failed", () => {
    // Arrange
    const w1 = window("s1");
    const w2 = window("s2");
    const windows = new Map<string, WindowEvalState>([
      [wireWindowKey(w1), okWindow([])],
      [wireWindowKey(w2), { kind: "error", error: { kind: "InternalError", message: "eval crashed" }, generation: 0 }],
    ]);

    // Act
    const banner = bannerWindows({ selectedWindows: [w1, w2], windows });

    // Assert
    expect(banner).toEqual([w2]);
  });
});
