import { describe, expect, it } from "vitest";

import { addNodeFromChannel, deleteNode, editLiteralArg, renameDefinition, rewireInput } from "./graphEdits";
import { readGraphLayout, writeGraphLayout } from "./graphLayout";

const DOC =
  "---\n" +
  "id: 9f3c1e2d-4b6a-4f1c-9c3d-2a7e8f9b0c1d\n" +
  "name: Fork tuning\n" +
  "---\n" +
  "```math id=a1b2c3d4\n" +
  "fork_velocity = differentiate([fork_travel])\n" +
  "fork_bottom_out = [fork_velocity] > 5\n" +
  "```\n" +
  "```math id=b2c3d4e5\n" +
  "shock_velocity = differentiate([shock_travel]) # label: Shock velocity\n" +
  "```\n";

describe("renameDefinition", () => {
  it("renameDefinition — the def_line's own identifier and every [OldName] reference — all become the new name", () => {
    // Act
    const renamed = renameDefinition(DOC, "fork_velocity", "fork_v");

    // Assert
    expect(renamed).toContain("fork_v = differentiate([fork_travel])");
    expect(renamed).toContain("fork_bottom_out = [fork_v] > 5");
    expect(renamed).not.toContain("[fork_velocity]");
  });

  it("renameDefinition — a name with no [Name] occurrences elsewhere in the document — leaves other cells untouched", () => {
    // Act
    const renamed = renameDefinition(DOC, "shock_velocity", "shock_v");

    // Assert
    expect(renamed).toContain("shock_v = differentiate([shock_travel]) # label: Shock velocity");
    expect(renamed).toContain("fork_velocity = differentiate([fork_travel])"); // unrelated cell untouched
  });

  it("renameDefinition — a stored graph.nodes position — moves to the new key in the same edit", () => {
    // Arrange
    const withPosition = writeGraphLayout(DOC, { nodes: { fork_velocity: [120, 80] }, cells: {} });

    // Act
    const renamed = renameDefinition(withPosition, "fork_velocity", "fork_v");

    // Assert
    expect(readGraphLayout(renamed)).toEqual({ nodes: { fork_v: [120, 80] }, cells: {} });
  });

  it("renameDefinition — no stored position for the renamed name — leaves graph.nodes untouched", () => {
    // Arrange
    const withOther = writeGraphLayout(DOC, { nodes: { shock_velocity: [1, 2] }, cells: {} });

    // Act
    const renamed = renameDefinition(withOther, "fork_velocity", "fork_v");

    // Assert
    expect(readGraphLayout(renamed)).toEqual({ nodes: { shock_velocity: [1, 2] }, cells: {} });
  });

  it("renameDefinition — a substring collision (fork_velocity vs a hypothetical fork_velocity_2) — renames only the exact reference", () => {
    // Arrange
    const doc = "```math id=a1b2c3d4\nfork_velocity = 1\nfork_velocity_2 = [fork_velocity] + [fork_velocity_2]\n```\n";

    // Act
    const renamed = renameDefinition(doc, "fork_velocity", "fv");

    // Assert
    expect(renamed).toContain("fv = 1");
    expect(renamed).toContain("fork_velocity_2 = [fv] + [fork_velocity_2]");
  });
});

describe("rewireInput", () => {
  it("rewireInput — the target definition's own reference — becomes the new reference", () => {
    // Act
    const rewired = rewireInput(DOC, "a1b2c3d4", "fork_bottom_out", "fork_velocity", "fork_v_filtered");

    // Assert
    expect(rewired).toContain("fork_bottom_out = [fork_v_filtered] > 5");
    expect(rewired).toContain("fork_velocity = differentiate([fork_travel])"); // a different definition's own reference untouched
  });

  it("rewireInput — a definition that doesn't reference the old name — is a no-op", () => {
    // Act
    const rewired = rewireInput(DOC, "a1b2c3d4", "fork_velocity", "not_referenced", "whatever");

    // Assert
    expect(rewired).toBe(DOC);
  });

  it("rewireInput — an unknown cellId — is a no-op", () => {
    // Act
    const rewired = rewireInput(DOC, "deadbeef", "fork_velocity", "fork_travel", "x");

    // Assert
    expect(rewired).toBe(DOC);
  });
});

describe("editLiteralArg", () => {
  it("editLiteralArg — a call's argument — is replaced by index, leaving other arguments intact", () => {
    // Arrange
    const doc = '```math id=a1b2c3d4\nfiltered = butter(2, 3, "low", [x])\n```\n';

    // Act
    const edited = editLiteralArg(doc, "a1b2c3d4", "filtered", 1, "5");

    // Assert
    expect(edited).toContain('filtered = butter(2, 5, "low", [x])');
  });

  it("editLiteralArg — preserves a trailing # label: comment", () => {
    // Arrange
    const doc = '```math id=a1b2c3d4\nfiltered = butter(2, 3, "low", [x]) # label: Filtered\n```\n';

    // Act
    const edited = editLiteralArg(doc, "a1b2c3d4", "filtered", 0, "4");

    // Assert
    expect(edited).toContain('filtered = butter(4, 3, "low", [x])  # label: Filtered');
  });

  it("editLiteralArg — an expression that is not a single outer call — is a no-op", () => {
    // Act
    const edited = editLiteralArg(DOC, "a1b2c3d4", "fork_bottom_out", 0, "10");

    // Assert
    expect(edited).toBe(DOC);
  });

  it("editLiteralArg — an out-of-range index — is a no-op", () => {
    // Arrange
    const doc = "```math id=a1b2c3d4\nfiltered = butter(2, 3)\n```\n";

    // Act
    const edited = editLiteralArg(doc, "a1b2c3d4", "filtered", 5, "9");

    // Assert
    expect(edited).toBe(doc);
  });
});

describe("addNodeFromChannel", () => {
  it("addNodeFromChannel — appends a new def_line referencing the channel", () => {
    // Act
    const added = addNodeFromChannel(DOC, "a1b2c3d4", "IMU1_AccelZ", "accel_z");

    // Assert
    expect(added).toContain("accel_z = [IMU1_AccelZ]");
    expect(added).toContain("fork_bottom_out = [fork_velocity] > 5\naccel_z = [IMU1_AccelZ]");
  });

  it("addNodeFromChannel — an unknown cellId — is a no-op", () => {
    // Act
    const added = addNodeFromChannel(DOC, "deadbeef", "IMU1_AccelZ", "accel_z");

    // Assert
    expect(added).toBe(DOC);
  });
});

describe("deleteNode", () => {
  it("deleteNode — removes the whole def_line, leaving the rest of the cell intact", () => {
    // Act
    const deleted = deleteNode(DOC, "a1b2c3d4", "fork_bottom_out");

    // Assert
    expect(deleted).not.toContain("fork_bottom_out");
    expect(deleted).toContain("fork_velocity = differentiate([fork_travel])");
  });

  it("deleteNode — does not touch a stored graph.nodes entry for the deleted name (orphan, not pruned)", () => {
    // Arrange
    const withPosition = writeGraphLayout(DOC, { nodes: { fork_bottom_out: [10, 20] }, cells: {} });

    // Act
    const deleted = deleteNode(withPosition, "a1b2c3d4", "fork_bottom_out");

    // Assert
    expect(readGraphLayout(deleted)).toEqual({ nodes: { fork_bottom_out: [10, 20] }, cells: {} });
  });

  it("deleteNode — an unknown defName — is a no-op", () => {
    // Act
    const deleted = deleteNode(DOC, "a1b2c3d4", "does_not_exist");

    // Assert
    expect(deleted).toBe(DOC);
  });
});
