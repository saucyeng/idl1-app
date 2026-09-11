import { describe, expect, it } from "vitest";

import { generate } from "../plotForm/generate";
import { parse } from "../plotForm/parse";
import type { PlotProps } from "../plotForm/types";
import { CHART_TYPE_IDS } from "./chartTypeCatalog";
import { chartEligibilityFor, insertChartCell, plotPropsForChartType } from "./graphToChart";

describe("chartEligibilityFor", () => {
  it("chartEligibilityFor — a rank-≤1 shape ([t]) — is chartable", () => {
    expect(chartEligibilityFor("[t]", null)).toBe("chart");
  });

  it("chartEligibilityFor — a rank-≤1 shape ([]) — is chartable", () => {
    expect(chartEligibilityFor("[]", null)).toBe("chart");
  });

  it("chartEligibilityFor — a literal spectrogram(...) call — is the raster exception, even with an unknown shape", () => {
    expect(chartEligibilityFor("unknown", { name: "spectrogram", args: ["[x]"] })).toBe("spectrogram");
  });

  it("chartEligibilityFor — an unknown shape with no spectrogram call — is unknown, not reduce-first", () => {
    expect(chartEligibilityFor("unknown", null)).toBe("unknown");
  });

  it("chartEligibilityFor — an unknown shape with a non-spectrogram call — is unknown", () => {
    expect(chartEligibilityFor("unknown", { name: "butter", args: ["2", "3"] })).toBe("unknown");
  });
});

describe("insertChartCell", () => {
  it("insertChartCell — appends a new js cell whose code parses back to the same mark and channel", () => {
    // Act
    const markdown = insertChartCell("```math id=a1b2c3d4\nx = 1\n```\n", "fork_velocity", "lineY");

    // Assert
    expect(markdown).toContain("```js\n");
    const fence = markdown.slice(markdown.lastIndexOf("```js\n") + "```js\n".length, markdown.lastIndexOf("```"));
    const props = parse(fence);
    expect(props).not.toBeNull();
    expect(props?.chart).toBe("time");
    if (props?.chart === "time") {
      expect(props.marks).toEqual([{ channel: "fork_velocity", mark: "lineY", lap: null }]);
    }
  });

  it("insertChartCell — no id= attribute on the new fence — left for Rust to assign (C2 §2.2)", () => {
    // Act
    const markdown = insertChartCell("```math id=a1b2c3d4\nx = 1\n```\n", "x", "dot");

    // Assert
    expect(markdown).toContain("```js\n");
    expect(markdown).not.toContain("```js id=");
  });

  it("insertChartCell — every other byte of the document — is untouched", () => {
    // Arrange
    const original = "---\nid: x\nname: y\n---\n```math id=a1b2c3d4\nx = 1\n```\n";

    // Act
    const markdown = insertChartCell(original, "x", "lineY");

    // Assert
    expect(markdown.startsWith(original)).toBe(true);
  });

  it("insertChartCell — an empty document — still produces a valid fence", () => {
    // Act
    const markdown = insertChartCell("", "x", "lineY");

    // Assert
    expect(markdown.startsWith("```js\n")).toBe(true);
    expect(markdown.endsWith("```\n")).toBe(true);
  });

  it("insertChartCell — chart type \"fft\" — appends an FFT cell bound to the node (R215 item 1)", () => {
    // Act
    const markdown = insertChartCell("", "fork_velocity", "fft");

    // Assert
    const fence = markdown.slice("```js\n".length, markdown.lastIndexOf("```"));
    const props = parse(fence);
    expect(props?.chart).toBe("fft");
    if (props?.chart === "fft") {
      expect(props.mark.channel).toBe("fork_velocity");
    }
  });
});

describe("plotPropsForChartType", () => {
  it("plotPropsForChartType — every CHART_TYPE_IDS value — inserts a cell that parses back in the same chart type", () => {
    // Assert — `parse` normalises a time mark's omitted `lap` to `null`,
    // so the round trip is compared on the generated code, not on a deep
    // equality of the seed props themselves.
    for (const id of CHART_TYPE_IDS) {
      const props = plotPropsForChartType(id, "x");
      const fence = insertChartCell("", "x", id).slice("```js\n".length).replace(/```\n$/, "");
      const parsed = parse(fence);
      expect(parsed).not.toBeNull();
      expect(parsed?.chart).toBe(props.chart);
      expect(generate(parsed as PlotProps)).toBe(generate(props));
    }
  });

  it("plotPropsForChartType — \"fft\" — carries C2 §5.3's parameter-table defaults", () => {
    // Act
    const props = plotPropsForChartType("fft", "x");

    // Assert
    expect(props.chart).toBe("fft");
    if (props.chart === "fft") {
      expect(props.mark.fft).toEqual({
        windowSize: 2048,
        hopSize: 1024,
        window: "hann",
        detrend: "mean",
        scaling: "raw_magnitude",
        averaging: "mean",
      });
      expect(props.x.type).toBe("log");
    }
  });
});
