import { describe, expect, it } from "vitest";

import { buildGraphModel } from "./graphModel";
import { dropPaletteSource } from "./graphPaletteDrop";
import type { PaletteChannelRow, PaletteConstantRow, PaletteDefinitionRow } from "./sourcePalette";

const DOC =
  "---\n" +
  "id: 9f3c1e2d-4b6a-4f1c-9c3d-2a7e8f9b0c1d\n" +
  "name: Fork tuning\n" +
  "---\n" +
  "```math id=a1b2c3d4\n" +
  "fork_velocity = differentiate([fork_travel])\n" +
  "```\n" +
  "```math id=b2c3d4e5\n" +
  "shock_velocity = differentiate([shock_travel])\n" +
  "```\n";

const NO_MATH_DOC = "---\nid: 9f3c1e2d-4b6a-4f1c-9c3d-2a7e8f9b0c1d\nname: Empty\n---\n" + "some prose, no cells at all\n";

function channelRow(name: string): PaletteChannelRow {
  return { kind: "channel", name, rateHz: 100, partial: false };
}

function constantRow(name: string): PaletteConstantRow {
  return { kind: "constant", name, value: 9.8 };
}

function definitionRow(name: string): PaletteDefinitionRow {
  return { kind: "definition", name, cellId: "a1b2c3d4", sampleRateHz: null };
}

describe("dropPaletteSource — target cell", () => {
  it("dropPaletteSource — a channel dropped — lands in the last math cell in document order", () => {
    // Act
    const result = dropPaletteSource(DOC, buildGraphModel(DOC, []), channelRow("IMU1_AccelZ"));

    // Assert
    expect(result.newDefName).toBe("IMU1_AccelZ");
    expect(result.markdown).toContain("shock_velocity = differentiate([shock_travel])\nIMU1_AccelZ = [IMU1_AccelZ]");
  });

  it("dropPaletteSource — no math cell in the document — a no-op, newDefName null", () => {
    // Act
    const result = dropPaletteSource(NO_MATH_DOC, buildGraphModel(NO_MATH_DOC, []), channelRow("IMU1_AccelZ"));

    // Assert
    expect(result.markdown).toBe(NO_MATH_DOC);
    expect(result.newDefName).toBeNull();
  });
});

describe("dropPaletteSource — reference syntax by source kind", () => {
  it("dropPaletteSource — a channel — bracket reference", () => {
    // Act
    const result = dropPaletteSource(DOC, buildGraphModel(DOC, []), channelRow("IMU1_AccelZ"));

    // Assert
    expect(result.markdown).toContain("IMU1_AccelZ = [IMU1_AccelZ]");
  });

  it("dropPaletteSource — a declared definition — bracket reference, same path as a channel", () => {
    // Act
    const result = dropPaletteSource(DOC, buildGraphModel(DOC, []), definitionRow("fork_velocity"));

    // Assert
    expect(result.newDefName).toBe("fork_velocity_2"); // collides with the existing definition of the same name
    expect(result.markdown).toContain("fork_velocity_2 = [fork_velocity]");
  });

  it("dropPaletteSource — a constant — bare reference, never bracketed", () => {
    // Act
    const result = dropPaletteSource(DOC, buildGraphModel(DOC, []), constantRow("g"));

    // Assert
    expect(result.markdown).toContain("g = g");
    expect(result.markdown).not.toContain("[g]");
  });
});

describe("dropPaletteSource — new definition name", () => {
  it("dropPaletteSource — a name with invalid identifier characters (a spaced constant name) — sanitised", () => {
    // Act
    const result = dropPaletteSource(DOC, buildGraphModel(DOC, []), constantRow("rider mass"));

    // Assert
    expect(result.newDefName).toBe("rider_mass");
    expect(result.markdown).toContain("rider_mass = rider mass");
  });

  it("dropPaletteSource — name collides with an existing definition — deduplicated with a numeric suffix", () => {
    // Act
    const result = dropPaletteSource(DOC, buildGraphModel(DOC, []), definitionRow("shock_velocity"));

    // Assert
    expect(result.newDefName).toBe("shock_velocity_2");
  });

  it("dropPaletteSource — name matches a raw channel reference already on the canvas — not deduplicated (relabel is the intended shape)", () => {
    // Arrange — `fork_travel` is a "channel" node (referenced, never defined) in DOC.

    // Act
    const result = dropPaletteSource(DOC, buildGraphModel(DOC, []), channelRow("fork_travel"));

    // Assert
    expect(result.newDefName).toBe("fork_travel");
    expect(result.markdown).toContain("fork_travel = [fork_travel]");
  });
});
