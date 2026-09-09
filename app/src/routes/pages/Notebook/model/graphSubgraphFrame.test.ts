import { describe, expect, it } from "vitest";

import { buildGraphModel } from "./graphModel";
import { subgraphsFor } from "./graphSubgraph";
import { collapsedNodePosition, collapsedSubgraphNodesFor, subgraphFrameFor, subgraphFramesFor, FRAME_MARGIN, FRAME_NODE_HEIGHT, FRAME_NODE_WIDTH } from "./graphSubgraphFrame";

const DOC =
  "```math id=a1b2c3d4\n" +
  "# label: Fork\n" +
  "fork_velocity = differentiate([fork_travel])\n" +
  "fork_smoothed = butter(2, 3, \"low\", [fork_velocity])\n" +
  "```\n" +
  "```math id=b2c3d4e5\n" +
  "# label: Bottom-out\n" +
  "fork_bottom_out = [fork_smoothed] > 5 # label: Bottom out\n" +
  "```\n";

describe("subgraphFrameFor", () => {
  it("subgraphFrameFor — a cell's two member nodes — a box covering both plus the margin", () => {
    // Arrange
    const model = buildGraphModel(DOC, []);
    const forkCell = subgraphsFor(model).find((s) => s.cellId === "a1b2c3d4")!;
    const positions = { "def:fork_velocity": [0, 0] as [number, number], "def:fork_smoothed": [100, 50] as [number, number] };

    // Act
    const frame = subgraphFrameFor(forkCell, positions);

    // Assert
    expect(frame).not.toBeNull();
    expect(frame!.x).toBe(0 - FRAME_MARGIN);
    expect(frame!.y).toBe(0 - FRAME_MARGIN);
    expect(frame!.width).toBe(100 + FRAME_NODE_WIDTH + FRAME_MARGIN * 2);
    expect(frame!.height).toBe(50 + FRAME_NODE_HEIGHT + FRAME_MARGIN * 2);
    expect(frame!.label).toBe("Fork");
  });

  it("subgraphFrameFor — none of the cell's members have a position — null, not a box at the origin", () => {
    // Arrange
    const model = buildGraphModel(DOC, []);
    const forkCell = subgraphsFor(model).find((s) => s.cellId === "a1b2c3d4")!;

    // Act
    const frame = subgraphFrameFor(forkCell, {});

    // Assert
    expect(frame).toBeNull();
  });

  it("subgraphFrameFor — an input node's position never widens the box (it is not this cell's own node)", () => {
    // Arrange
    const model = buildGraphModel(DOC, []);
    const bottomOutCell = subgraphsFor(model).find((s) => s.cellId === "b2c3d4e5")!;
    const positions = {
      "def:fork_smoothed": [-500, -500] as [number, number], // input — far away, must not affect this cell's frame
      "def:fork_bottom_out": [0, 0] as [number, number],
    };

    // Act
    const frame = subgraphFrameFor(bottomOutCell, positions);

    // Assert
    expect(frame!.x).toBe(0 - FRAME_MARGIN);
    expect(frame!.y).toBe(0 - FRAME_MARGIN);
  });
});

describe("subgraphFramesFor", () => {
  it("subgraphFramesFor — a collapsed cell is excluded — only the expanded cell's frame is returned", () => {
    // Arrange
    const model = buildGraphModel(DOC, []);
    const subgraphs = subgraphsFor(model);
    const positions = {
      "def:fork_velocity": [0, 0] as [number, number],
      "def:fork_smoothed": [100, 0] as [number, number],
      "def:fork_bottom_out": [300, 0] as [number, number],
    };

    // Act
    const frames = subgraphFramesFor(subgraphs, positions, new Set(["a1b2c3d4"]));

    // Assert
    expect(frames.map((f) => f.cellId)).toEqual(["b2c3d4e5"]);
  });
});

describe("collapsedSubgraphNodesFor", () => {
  it("collapsedSubgraphNodesFor — a collapsed cell — names its input and output ports by display name, not raw id", () => {
    // Arrange
    const model = buildGraphModel(DOC, []);
    const subgraphs = subgraphsFor(model);

    // Act
    const collapsed = collapsedSubgraphNodesFor(subgraphs, model, new Set(["a1b2c3d4"]));

    // Assert
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].cellId).toBe("a1b2c3d4");
    expect(collapsed[0].label).toBe("Fork");
    expect(collapsed[0].inputs).toEqual([{ id: "channel:fork_travel", name: "fork_travel" }]);
    expect(collapsed[0].outputs).toEqual([{ id: "def:fork_smoothed", name: "fork_smoothed" }]);
  });

  it("collapsedSubgraphNodesFor — an expanded cell is excluded", () => {
    // Arrange
    const model = buildGraphModel(DOC, []);
    const subgraphs = subgraphsFor(model);

    // Act
    const collapsed = collapsedSubgraphNodesFor(subgraphs, model, new Set());

    // Assert
    expect(collapsed).toEqual([]);
  });
});

describe("collapsedNodePosition", () => {
  it("collapsedNodePosition — two member nodes — the centroid of their positions", () => {
    // Arrange
    const model = buildGraphModel(DOC, []);
    const forkCell = subgraphsFor(model).find((s) => s.cellId === "a1b2c3d4")!;
    const positions = { "def:fork_velocity": [0, 0] as [number, number], "def:fork_smoothed": [100, 50] as [number, number] };

    // Act
    const position = collapsedNodePosition(forkCell, positions);

    // Assert
    expect(position).toEqual([50, 25]);
  });

  it("collapsedNodePosition — no positioned member — falls back to the origin", () => {
    // Arrange
    const model = buildGraphModel(DOC, []);
    const forkCell = subgraphsFor(model).find((s) => s.cellId === "a1b2c3d4")!;

    // Act
    const position = collapsedNodePosition(forkCell, {});

    // Assert
    expect(position).toEqual([0, 0]);
  });
});
