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

const NEW_ID = "0badf00d";

function channelRow(name: string): PaletteChannelRow {
  return { kind: "channel", name, rateHz: 100, partial: false, unit: { state: "known", text: "mm" } };
}

function constantRow(name: string): PaletteConstantRow {
  return { kind: "constant", name, value: 9.8 };
}

function definitionRow(name: string): PaletteDefinitionRow {
  return { kind: "definition", name, cellId: "a1b2c3d4", sampleRateHz: null, unit: { state: "unknown", reason: "not evaluated yet" } };
}

describe("dropPaletteSource — channels are placed", () => {
  it("dropPaletteSource — a channel dropped — placed as a channel node, document unchanged", () => {
    // Act
    const result = dropPaletteSource(DOC, buildGraphModel(DOC, []), channelRow("IMU1_AccelZ"), NEW_ID);

    // Assert
    expect(result.placed).toEqual({ kind: "channel", name: "IMU1_AccelZ" });
    expect(result.markdown).toBe(DOC);
  });

  it("dropPaletteSource — a channel on a document with no math cell — still placed", () => {
    // Act
    const result = dropPaletteSource(NO_MATH_DOC, buildGraphModel(NO_MATH_DOC, []), channelRow("GPS_SpeedKmh"), NEW_ID);

    // Assert
    expect(result.placed).toEqual({ kind: "channel", name: "GPS_SpeedKmh" });
  });
});

describe("dropPaletteSource — definitions and constants", () => {
  it("dropPaletteSource — a declared definition — new definition in the last math cell, deduplicated", () => {
    // Act
    const result = dropPaletteSource(DOC, buildGraphModel(DOC, []), definitionRow("fork_velocity"), NEW_ID);

    // Assert
    expect(result.placed).toEqual({ kind: "node", name: "fork_velocity_2" });
    expect(result.markdown).toContain("shock_velocity = differentiate([shock_travel])\nfork_velocity_2 = [fork_velocity]");
  });

  it("dropPaletteSource — a constant — bare reference, never bracketed", () => {
    // Act
    const result = dropPaletteSource(DOC, buildGraphModel(DOC, []), constantRow("g"), NEW_ID);

    // Assert
    expect(result.markdown).toContain("g = g");
    expect(result.markdown).not.toContain("[g]");
  });

  it("dropPaletteSource — a spaced constant name — sanitised", () => {
    // Act
    const result = dropPaletteSource(DOC, buildGraphModel(DOC, []), constantRow("rider mass"), NEW_ID);

    // Assert
    expect(result.placed).toEqual({ kind: "node", name: "rider_mass" });
    expect(result.markdown).toContain("rider_mass = rider mass");
  });

  it("dropPaletteSource — a constant on a document with no math cell — creates the cell", () => {
    // Act
    const result = dropPaletteSource(NO_MATH_DOC, buildGraphModel(NO_MATH_DOC, []), constantRow("rider mass"), NEW_ID);

    // Assert
    expect(result.placed).toEqual({ kind: "node", name: "rider_mass" });
    expect(result.markdown).toContain("```math id=0badf00d\nrider_mass = rider mass\n```\n");
  });

  it("dropPaletteSource — a definition on a document with no math cell — a no-op", () => {
    // Act
    const result = dropPaletteSource(NO_MATH_DOC, buildGraphModel(NO_MATH_DOC, []), definitionRow("x"), NEW_ID);

    // Assert
    expect(result.placed).toBeNull();
    expect(result.markdown).toBe(NO_MATH_DOC);
  });
});
