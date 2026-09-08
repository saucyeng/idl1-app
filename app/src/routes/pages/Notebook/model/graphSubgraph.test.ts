import { describe, expect, it } from "vitest";

import { buildGraphModel } from "./graphModel";
import { searchNodeIds, subgraphsFor, visibleNodeIds } from "./graphSubgraph";

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

describe("subgraphsFor", () => {
  it("subgraphsFor — a definition only referenced inside its own cell — is internal", () => {
    // Act
    const model = buildGraphModel(DOC, []);
    const subgraphs = subgraphsFor(model);
    const forkCell = subgraphs.find((s) => s.cellId === "a1b2c3d4")!;

    // Assert
    expect(forkCell.internalIds).toContain("def:fork_velocity");
    expect(forkCell.outputIds).not.toContain("def:fork_velocity");
  });

  it("subgraphsFor — a definition referenced by another cell — is an output of its own cell and an input of the referencing one", () => {
    // Act
    const model = buildGraphModel(DOC, []);
    const subgraphs = subgraphsFor(model);
    const forkCell = subgraphs.find((s) => s.cellId === "a1b2c3d4")!;
    const bottomOutCell = subgraphs.find((s) => s.cellId === "b2c3d4e5")!;

    // Assert
    expect(forkCell.outputIds).toEqual(["def:fork_smoothed"]);
    expect(bottomOutCell.inputIds).toEqual(["def:fork_smoothed"]);
  });

  it("subgraphsFor — a channel root feeding a definition — is an input, and is not counted as anyone's output", () => {
    // Act
    const model = buildGraphModel(DOC, []);
    const subgraphs = subgraphsFor(model);
    const forkCell = subgraphs.find((s) => s.cellId === "a1b2c3d4")!;

    // Assert
    expect(forkCell.inputIds).toEqual(["channel:fork_travel"]);
    expect(subgraphs.every((s) => !s.outputIds.includes("channel:fork_travel"))).toBe(true);
  });

  it("subgraphsFor — carries each cell's # label: display name through", () => {
    // Act
    const model = buildGraphModel(DOC, []);
    const subgraphs = subgraphsFor(model);

    // Assert
    expect(subgraphs.find((s) => s.cellId === "a1b2c3d4")?.label).toBe("Fork");
    expect(subgraphs.find((s) => s.cellId === "b2c3d4e5")?.label).toBe("Bottom-out");
  });
});

describe("visibleNodeIds", () => {
  it("visibleNodeIds — no cell collapsed — every node is visible", () => {
    // Act
    const model = buildGraphModel(DOC, []);
    const visible = visibleNodeIds(model, subgraphsFor(model), new Set());

    // Assert
    expect(visible.has("def:fork_velocity")).toBe(true);
    expect(visible.has("def:fork_smoothed")).toBe(true);
    expect(visible.has("def:fork_bottom_out")).toBe(true);
  });

  it("visibleNodeIds — a collapsed cell — hides its internal node but keeps its input/output visible", () => {
    // Act
    const model = buildGraphModel(DOC, []);
    const visible = visibleNodeIds(model, subgraphsFor(model), new Set(["a1b2c3d4"]));

    // Assert
    expect(visible.has("def:fork_velocity")).toBe(false); // internal to the collapsed cell
    expect(visible.has("def:fork_smoothed")).toBe(true); // this cell's output — referenced elsewhere
    expect(visible.has("channel:fork_travel")).toBe(true); // a root, never hidden
    expect(visible.has("def:fork_bottom_out")).toBe(true); // a different (expanded) cell
  });
});

describe("searchNodeIds", () => {
  it("searchNodeIds — a query matching a definition's own identifier — finds it", () => {
    // Act
    const model = buildGraphModel(DOC, []);
    const found = searchNodeIds(model, "smoothed");

    // Assert
    expect(found).toEqual(["def:fork_smoothed"]);
  });

  it("searchNodeIds — a query matching a # label: display name rather than the identifier — still finds it", () => {
    // Act
    const model = buildGraphModel(DOC, []);
    const found = searchNodeIds(model, "bottom out");

    // Assert
    expect(found).toEqual(["def:fork_bottom_out"]);
  });

  it("searchNodeIds — case-insensitive", () => {
    // Act
    const model = buildGraphModel(DOC, []);
    const found = searchNodeIds(model, "FORK_VELOCITY");

    // Assert
    expect(found).toContain("def:fork_velocity");
  });

  it("searchNodeIds — a blank query — finds nothing, not everything", () => {
    // Act
    const model = buildGraphModel(DOC, []);
    const found = searchNodeIds(model, "   ");

    // Assert
    expect(found).toEqual([]);
  });
});
