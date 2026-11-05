import { describe, expect, it } from "vitest";

import type { SessionDetail } from "../../../../ipc/catalog";
import { appendMathCell, appendNote, appendTableCell, applyFunction, FUNCTION_TEMPLATES, starterChartChannel, type FunctionTemplate } from "./canvasBuild";
import { MATH_FUNCTIONS } from "./functionCatalog";
import { buildGraphModel } from "./graphModel";
import { scanCells } from "./cells";

const FRONT = "---\nid: 9f3c1e2d-4b6a-4f1c-9c3d-2a7e8f9b0c1d\nname: Test\n---\n";
const DOC = FRONT + "```math id=a1b2c3d4\nfork_v = differentiate([fork_travel])\n```\n" + "```math id=b2c3d4e5\nshock_v = differentiate([shock_travel])\n```\n";

function template(fn: string, suffix?: string): FunctionTemplate {
  const found = FUNCTION_TEMPLATES.find((t) => t.fn === fn && (suffix === undefined || t.suffix === suffix));
  if (found === undefined) throw new Error(`no template ${fn}`);
  return found;
}

function detail(channels: string[]): SessionDetail {
  return { channels: channels.map((channel_id) => ({ channel_id })) } as unknown as SessionDetail;
}

describe("FUNCTION_TEMPLATES", () => {
  it("FUNCTION_TEMPLATES — every entry — names an implemented builtin in the generated catalog", () => {
    // Arrange
    const implemented = new Set(MATH_FUNCTIONS.filter((f) => f.status === "implemented").map((f) => f.name));

    // Act
    const missing = FUNCTION_TEMPLATES.filter((t) => !implemented.has(t.fn)).map((t) => t.fn);

    // Assert
    expect(missing).toEqual([]);
  });

  it("FUNCTION_TEMPLATES — suffixes — unique, so two templates never mint the same name", () => {
    // Act
    const suffixes = FUNCTION_TEMPLATES.map((t) => t.suffix);

    // Assert
    expect(new Set(suffixes).size).toBe(suffixes.length);
  });
});

describe("applyFunction", () => {
  it("applyFunction — a channel input — lands in the last math cell", () => {
    // Act
    const result = applyFunction(DOC, buildGraphModel(DOC, []), "IMU1_AccelZ", template("abs"), "0badf00d");

    // Assert
    expect(result.newDefName).toBe("IMU1_AccelZ_abs");
    expect(result.cellId).toBe("b2c3d4e5");
    expect(result.markdown).toContain("shock_v = differentiate([shock_travel])\nIMU1_AccelZ_abs = abs([IMU1_AccelZ])\n");
  });

  it("applyFunction — a definition input — lands in that definition's own cell", () => {
    // Act
    const result = applyFunction(DOC, buildGraphModel(DOC, []), "fork_v", template("butter", "lowpass"), "0badf00d");

    // Assert
    expect(result.cellId).toBe("a1b2c3d4");
    expect(result.markdown).toContain('fork_v = differentiate([fork_travel])\nfork_v_lowpass = butter(4, 10, "low", [fork_v])\n');
  });

  it("applyFunction — no math cell yet — creates one with the given id", () => {
    // Act
    const result = applyFunction(FRONT, buildGraphModel(FRONT, []), "GPS_SpeedKmh", template("rms", "rms100"), "0badf00d");

    // Assert
    expect(result.cellId).toBe("0badf00d");
    expect(result.markdown).toBe(FRONT + "\n```math id=0badf00d\nGPS_SpeedKmh_rms100 = rms([GPS_SpeedKmh], 100)\n```\n");
  });

  it("applyFunction — name already taken — deduplicated", () => {
    // Arrange
    const doc = applyFunction(DOC, buildGraphModel(DOC, []), "x", template("abs"), "0badf00d").markdown;

    // Act
    const result = applyFunction(doc, buildGraphModel(doc, []), "x", template("abs"), "0badf00d");

    // Assert
    expect(result.newDefName).toBe("x_abs_2");
  });
});

describe("cell appends", () => {
  it("appendMathCell / appendTableCell — appended — scanned back as cells with their ids", () => {
    // Act
    const doc = appendTableCell(appendMathCell(FRONT + "prose", "11111111", "a = [b]"), "22222222");

    // Assert
    expect(scanCells(doc).cells.map((c) => [c.kind, c.id])).toEqual([
      ["math", "11111111"],
      ["table", "22222222"],
    ]);
  });

  it("appendNote — after a cell — a separate paragraph", () => {
    // Act
    const doc = appendNote(DOC);

    // Assert
    expect(doc.endsWith("```\n\nNew note.\n")).toBe(true);
  });
});

describe("starterChartChannel", () => {
  it("starterChartChannel — a session with GPS speed — GPS_SpeedKmh", () => {
    // Act
    const result = starterChartChannel(new Map([["s1", detail(["IMU0_AccelX", "GPS_SpeedKmh"])]]));

    // Assert
    expect(result).toBe("GPS_SpeedKmh");
  });

  it("starterChartChannel — no GPS speed — the first channel", () => {
    // Act
    const result = starterChartChannel(new Map([["s1", detail(["IMU0_AccelX", "IMU0_AccelY"])]]));

    // Assert
    expect(result).toBe("IMU0_AccelX");
  });

  it("starterChartChannel — no session selected — null", () => {
    // Act
    const result = starterChartChannel(new Map());

    // Assert
    expect(result).toBeNull();
  });
});
