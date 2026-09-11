/**
 * The histogram arm of the Properties pane's pure state logic (ruling R215
 * item 2): its seed, its parameter patcher, and the chart-type switch's
 * behaviour across three chart kinds rather than two.
 */
import { describe, expect, it } from "vitest";

import { generate } from "../plotForm/generate";
import { parse } from "../plotForm/parse";
import type { HistogramPlotProps, PlotProps } from "../plotForm/types";
import { defaultHistogramPlotProps, setChartType, updateHistogramParams, updateXAxis, updateYAxis } from "./propertiesForm";

const CHANNELS = [
  { id: "fork_velocity", label: "fork_velocity", unit: "m/s" },
  { id: "rear_travel", label: "rear_travel", unit: "mm" },
];

function histogramProps(): HistogramPlotProps {
  return defaultHistogramPlotProps(CHANNELS);
}

describe("defaultHistogramPlotProps", () => {
  it("defaultHistogramPlotProps — carries C2 §5.3's documented histogram defaults", () => {
    // Act
    const props = defaultHistogramPlotProps(CHANNELS);

    // Assert
    expect(props.chart).toBe("histogram");
    expect(props.mark.channel).toBe("fork_velocity");
    expect(props.mark.histogram).toEqual({ binMode: "count", binValue: 64, symmetric: true, normalise: "fraction" });
  });

  it("defaultHistogramPlotProps — seeds the value-axis label from the channel's own unit (R65)", () => {
    // Act
    const props = defaultHistogramPlotProps(CHANNELS);

    // Assert — the bin-edge axis is in the channel's unit, so the seed
    // lands on x, not y (y is a count or a fraction, and dimensionless).
    expect(props.x?.label).toBe("fork_velocity (m/s)");
    expect(props.y).toBeUndefined();
  });

  it("defaultHistogramPlotProps — a channel with no recorded unit — offers no label suggestion", () => {
    // Act
    const props = defaultHistogramPlotProps([{ id: "x", label: "x" }]);

    // Assert
    expect(props.x).toBeUndefined();
  });

  it("defaultHistogramPlotProps — no channels at all — still generates valid code", () => {
    // Act
    const props = defaultHistogramPlotProps([]);

    // Assert
    expect(props.mark.channel).toBe("");
    expect(parse(generate(props))).toEqual(props);
  });
});

describe("updateHistogramParams", () => {
  it("updateHistogramParams — a patch — merges without forcing any other parameter", () => {
    // Act
    const next = updateHistogramParams(histogramProps(), { normalise: "counts" });

    // Assert — unlike updateFftParams' averaging rule, nothing is forced.
    expect(next.mark.histogram).toEqual({ binMode: "count", binValue: 64, symmetric: true, normalise: "counts" });
  });

  it("updateHistogramParams — a binMode change alone — leaves binValue exactly as it was, never converted", () => {
    // Act
    const next = updateHistogramParams(histogramProps(), { binMode: "width" });

    // Assert — a count and a width are different quantities; converting
    // would need the data's own range, which this module does not have.
    expect(next.mark.histogram.binMode).toBe("width");
    expect(next.mark.histogram.binValue).toBe(64);
  });

  it("updateHistogramParams — never mutates the input props", () => {
    // Arrange
    const props = histogramProps();

    // Act
    updateHistogramParams(props, { binValue: 8 });

    // Assert
    expect(props.mark.histogram.binValue).toBe(64);
  });
});

describe("setChartType — with the histogram kind", () => {
  it("setChartType — time → histogram — carries the first mark's channel across", () => {
    // Arrange
    const time: PlotProps = { chart: "time", marks: [{ channel: "rear_travel", mark: "lineY" }] };

    // Act
    const next = setChartType(time, "histogram", CHANNELS);

    // Assert
    expect(next.chart).toBe("histogram");
    if (next.chart === "histogram") {
      expect(next.mark.channel).toBe("rear_travel");
      expect(next.x?.label).toBe("rear_travel (mm)");
    }
  });

  it("setChartType — histogram → time — carries the single mark's channel across", () => {
    // Act
    const next = setChartType(histogramProps(), "time", CHANNELS);

    // Assert
    expect(next.chart).toBe("time");
    if (next.chart === "time") {
      expect(next.marks).toEqual([{ channel: "fork_velocity", mark: "lineY" }]);
    }
  });

  it("setChartType — histogram → fft — carries the channel and seeds the FFT defaults", () => {
    // Act
    const next = setChartType(histogramProps(), "fft", CHANNELS);

    // Assert
    expect(next.chart).toBe("fft");
    if (next.chart === "fft") {
      expect(next.mark.channel).toBe("fork_velocity");
      expect(next.mark.fft.windowSize).toBe(2048);
    }
  });

  it("setChartType — fft → histogram — carries the spectrum's channel across", () => {
    // Arrange
    const fft = setChartType(histogramProps(), "fft", CHANNELS);

    // Act
    const next = setChartType(fft, "histogram", CHANNELS);

    // Assert
    if (next.chart === "histogram") {
      expect(next.mark.channel).toBe("fork_velocity");
    }
  });

  it("setChartType — switching to the kind it already is — returns the same object, a no-op", () => {
    // Arrange
    const props = histogramProps();

    // Act / Assert
    expect(setChartType(props, "histogram", CHANNELS)).toBe(props);
  });

  it("setChartType — every switch — produces props that generate and parse back", () => {
    // Arrange
    const kinds: PlotProps["chart"][] = ["time", "fft", "histogram"];
    let props: PlotProps = histogramProps();

    // Act / Assert
    for (const from of kinds) {
      props = setChartType(props, from, CHANNELS);
      for (const to of kinds) {
        const next = setChartType(props, to, CHANNELS);
        expect(parse(generate(next))).not.toBeNull();
      }
    }
  });
});

describe("updateXAxis / updateYAxis — histogram cell", () => {
  it("updateXAxis — clearing every field — drops the x key entirely, never leaves x: {}", () => {
    // Arrange
    const props = histogramProps();

    // Act
    const next = updateXAxis(props, { label: undefined });

    // Assert
    expect(next.x).toBeUndefined();
    expect(generate(next)).not.toContain("x: {");
  });

  it("updateYAxis — a scale type — round-trips through the grammar", () => {
    // Act
    const next = updateYAxis(histogramProps(), { type: "log" });

    // Assert
    expect(parse(generate(next))).toEqual(next);
  });
});
