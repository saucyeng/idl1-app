import { describe, expect, it } from "vitest";

import type { CellOutput } from "../../../../ipc/workbook";
import { buildGraphModel, declaredDefinitionNames } from "./graphModel";

/** A minimal, otherwise-empty `CellOutput` for `defs`/`cell_id` fixtures — the
 *  fields `graphModel.ts` never reads are filled with harmless placeholders. */
function cellOutput(cellId: string, defs: CellOutput["defs"]): CellOutput {
  return {
    cell_id: cellId,
    kind: "math",
    value: null,
    defs,
    errors: [],
    prose_before_html: null,
    prose_after_html: null,
    prose_spans: [],
  };
}

describe("buildGraphModel", () => {
  it("buildGraphModel — one def_line in one cell — one definition node, no edges", () => {
    // Arrange
    const markdown = "```math id=a1b2c3d4\nfork_velocity = differentiate([fork_travel])\n```\n";

    // Act
    const model = buildGraphModel(markdown, []);

    // Assert
    expect(model.nodes.map((n) => n.name).sort()).toEqual(["fork_travel", "fork_velocity"]);
    const def = model.nodes.find((n) => n.name === "fork_velocity")!;
    expect(def.kind).toBe("definition");
    expect(def.cellId).toBe("a1b2c3d4");
    expect(def.exprText).toBe("differentiate([fork_travel])");
    const channel = model.nodes.find((n) => n.name === "fork_travel")!;
    expect(channel.kind).toBe("channel");
    expect(channel.cellId).toBeNull();
    expect(model.edges).toEqual([{ id: "channel:fork_travel->def:fork_velocity", source: "channel:fork_travel", target: "def:fork_velocity" }]);
  });

  it("buildGraphModel — a reference to another cell's definition — is a definition node, not a channel node", () => {
    // Arrange
    const markdown =
      "```math id=a1b2c3d4\n" +
      "fork_velocity = differentiate([fork_travel])\n" +
      "```\n" +
      "```math id=b2c3d4e5\n" +
      "fork_bottom_out = [fork_velocity] > 5\n" +
      "```\n";

    // Act
    const model = buildGraphModel(markdown, []);

    // Assert
    const source = model.nodes.find((n) => n.name === "fork_velocity")!;
    expect(source.kind).toBe("definition");
    expect(model.edges).toContainEqual({ id: "def:fork_velocity->def:fork_bottom_out", source: "def:fork_velocity", target: "def:fork_bottom_out" });
  });

  it("buildGraphModel — const lines and comments — produce no node", () => {
    // Arrange
    const markdown = "```math id=a1b2c3d4\nconst k = 9.81\n# just a comment\nx = k * 2\n```\n";

    // Act
    const model = buildGraphModel(markdown, []);

    // Assert
    expect(model.nodes.map((n) => n.name)).toEqual(["x"]);
  });

  it("buildGraphModel — one group per math cell, in document order, with its def_line node ids", () => {
    // Arrange
    const markdown =
      "```math id=a1b2c3d4\n" +
      "a = 1\n" +
      "b = [a]\n" +
      "```\n" +
      "```math id=b2c3d4e5\n" +
      "c = [b]\n" +
      "```\n";

    // Act
    const model = buildGraphModel(markdown, []);

    // Assert
    expect(model.groups).toEqual([
      { id: "a1b2c3d4", label: null, nodeIds: ["def:a", "def:b"] },
      { id: "b2c3d4e5", label: null, nodeIds: ["def:c"] },
    ]);
  });

  it("buildGraphModel — a cell whose first non-blank line is a # label: comment — names the group", () => {
    // Arrange
    const markdown = "```math id=a1b2c3d4\n# label: iEKF\nroll = [IMU1_Gyro]\n```\n";

    // Act
    const model = buildGraphModel(markdown, []);

    // Assert
    expect(model.groups).toEqual([{ id: "a1b2c3d4", label: "iEKF", nodeIds: ["def:roll"] }]);
  });

  it("buildGraphModel — a def_line's own # label: comment — is the node's fallback label with no evaluation yet", () => {
    // Arrange
    const markdown = "```math id=a1b2c3d4\nroll_deg = [IMU1_Gyro] # label: Roll (deg)\n```\n";

    // Act
    const model = buildGraphModel(markdown, []);

    // Assert
    expect(model.nodes.find((n) => n.name === "roll_deg")!.label).toBe("Roll (deg)");
  });

  it("buildGraphModel — a completed evaluation's CellDefResult.label — takes priority over the markdown scan's own label", () => {
    // Arrange
    const markdown = "```math id=a1b2c3d4\nroll_deg = [IMU1_Gyro] # label: Roll (deg)\n```\n";
    const outputs = [cellOutput("a1b2c3d4", [{ name: "roll_deg", label: "Roll — from evaluation", value: null, error: null }])];

    // Act
    const model = buildGraphModel(markdown, outputs);

    // Assert
    expect(model.nodes.find((n) => n.name === "roll_deg")!.label).toBe("Roll — from evaluation");
  });

  it("buildGraphModel — the same channel referenced from two definitions — produces one channel node and two edges", () => {
    // Arrange
    const markdown = "```math id=a1b2c3d4\na = [x]\nb = [x]\n```\n";

    // Act
    const model = buildGraphModel(markdown, []);

    // Assert
    expect(model.nodes.filter((n) => n.name === "x")).toHaveLength(1);
    expect(model.edges).toHaveLength(2);
  });

  it("buildGraphModel — an empty document — produces an empty model, not a crash", () => {
    // Act
    const model = buildGraphModel("", []);

    // Assert
    expect(model).toEqual({ nodes: [], edges: [], groups: [] });
  });

  it("buildGraphModel — a table/js cell — contributes no nodes or groups", () => {
    // Arrange
    const markdown = "```math id=a1b2c3d4\nx = 1\n```\n```js id=e5f6a7b8\nPlot.plot({})\n```\n";

    // Act
    const model = buildGraphModel(markdown, []);

    // Assert
    expect(model.groups).toEqual([{ id: "a1b2c3d4", label: null, nodeIds: ["def:x"] }]);
  });
});

describe("declaredDefinitionNames", () => {
  it("declaredDefinitionNames — one def_line — names it, with no evaluation needed", () => {
    // Arrange
    const markdown = "```math id=a1b2c3d4\naccel_mag = [fork_accel]\n```\n";

    // Act
    const names = declaredDefinitionNames(markdown);

    // Assert
    expect(names.has("accel_mag")).toBe(true);
  });

  it("declaredDefinitionNames — a name never declared anywhere — is absent", () => {
    // Arrange
    const markdown = "```math id=a1b2c3d4\naccel_mag = [fork_accel]\n```\n";

    // Act
    const names = declaredDefinitionNames(markdown);

    // Assert
    expect(names.has("front_shock")).toBe(false);
  });

  it("declaredDefinitionNames — an empty document — is empty, not a crash", () => {
    expect(declaredDefinitionNames("").size).toBe(0);
  });
});
