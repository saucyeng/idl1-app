import { describe, expect, it } from "vitest";
import { generate } from "./generate";
import type { FftPlotProps, PlotProps, SpectrumMarkProps } from "./types";

describe("generate", () => {
  it("generate — C2 §5.3 example 1, single channel with axis labels — emits the contract's exact code", () => {
    // Arrange
    const props: PlotProps = {
      chart: "time",
      marks: [{ channel: "fork_velocity", lap: null, mark: "lineY" }],
      x: { label: "Time (s)" },
      y: { label: "Velocity (m/s)" },
    };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toBe(
      [
        "Plot.plot({",
        '  x: { label: "Time (s)" },',
        '  y: { label: "Velocity (m/s)" },',
        "  marks: [",
        '    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })',
        "  ]",
        "})",
      ].join("\n"),
    );
  });

  it("generate — C2 §5.3 example 2, two marks with strokes, log y domain and legend — emits the contract's exact code", () => {
    // Arrange
    const props: PlotProps = {
      chart: "time",
      marks: [
        { channel: "IMU1_AccelX", mark: "lineY", stroke: "#2196F3" },
        { channel: "IMU2_AccelY", mark: "lineY", stroke: "#4CAF50" },
      ],
      y: { domain: [-2, 2], type: "log" },
      color: { legend: true },
    };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toBe(
      [
        "Plot.plot({",
        '  y: { domain: [-2, 2], type: "log" },',
        "  color: { legend: true },",
        "  marks: [",
        '    Plot.lineY(channel("IMU1_AccelX"), { x: "t", y: "v", stroke: "#2196F3" }),',
        '    Plot.lineY(channel("IMU2_AccelY"), { x: "t", y: "v", stroke: "#4CAF50" })',
        "  ]",
        "})",
      ].join("\n"),
    );
  });

  it("generate — C2 §5.3 example 3, lap-scoped dot mark with strokeWidth — emits the contract's exact code", () => {
    // Arrange
    const props: PlotProps = {
      chart: "time",
      marks: [{ channel: "fork_bottom_out", lap: 3, mark: "dot", strokeWidth: 2 }],
      y: { label: "Bottom-out event" },
    };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toBe(
      [
        "Plot.plot({",
        '  y: { label: "Bottom-out event" },',
        "  marks: [",
        '    Plot.dot(channel("fork_bottom_out", { lap: 3 }), { x: "t", y: "v", strokeWidth: 2 })',
        "  ]",
        "})",
      ].join("\n"),
    );
  });

  it("generate — C2 §5.3 example 4, areaY with an explicit x window — emits the contract's exact code", () => {
    // Arrange
    const props: PlotProps = {
      chart: "time",
      marks: [{ channel: "fork_travel", mark: "areaY", stroke: "#9C27B0" }],
      x: { label: "Session time (s)", domain: [120, 180] },
      y: { label: "Travel (mm)" },
    };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toBe(
      [
        "Plot.plot({",
        '  x: { label: "Session time (s)", domain: [120, 180] },',
        '  y: { label: "Travel (mm)" },',
        "  marks: [",
        '    Plot.areaY(channel("fork_travel"), { x: "t", y: "v", stroke: "#9C27B0" })',
        "  ]",
        "})",
      ].join("\n"),
    );
  });

  it("generate — a props with no x, y or color — emits marks only", () => {
    // Arrange
    const props: PlotProps = {
      chart: "time",
      marks: [{ channel: "fork_velocity", mark: "lineY" }],
    };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toBe(
      [
        "Plot.plot({",
        "  marks: [",
        '    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })',
        "  ]",
        "})",
      ].join("\n"),
    );
  });

  it("generate — an empty marks array — emits marks: [] without throwing", () => {
    // Arrange
    const props: PlotProps = { chart: "time", marks: [] };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toBe(["Plot.plot({", "  marks: []", "})"].join("\n"));
  });

  it("generate — a mark with lap null — omits the lap options object entirely", () => {
    // Arrange
    const props: PlotProps = {
      chart: "time",
      marks: [{ channel: "fork_velocity", mark: "lineY", lap: null }],
    };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toContain('channel("fork_velocity")');
    expect(code).not.toContain("lap");
  });

  it("generate — five mark names in turn — each emits Plot.<name>(channel(...), ...)", () => {
    // Arrange
    const markNames = ["lineY", "dot", "areaY", "rectY", "ruleY"] as const;

    // Act
    const codes = markNames.map((mark) => generate({ chart: "time", marks: [{ channel: "c", mark }] }));

    // Assert
    markNames.forEach((mark, i) => {
      expect(codes[i]).toContain(`Plot.${mark}(channel("c"), { x: "t", y: "v" })`);
    });
  });

  it("generate — x axis object with no populated fields — omits the x key", () => {
    // Arrange
    const props: PlotProps = {
      chart: "time",
      marks: [{ channel: "fork_velocity", mark: "lineY" }],
      x: {},
    };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toBe(
      [
        "Plot.plot({",
        "  marks: [",
        '    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })',
        "  ]",
        "})",
      ].join("\n"),
    );
  });

  it("generate — y axis object with no populated fields — omits the y key", () => {
    // Arrange
    const props: PlotProps = {
      chart: "time",
      marks: [{ channel: "fork_velocity", mark: "lineY" }],
      y: {},
    };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toBe(
      [
        "Plot.plot({",
        "  marks: [",
        '    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })',
        "  ]",
        "})",
      ].join("\n"),
    );
  });
});

describe("generate — FFT chart (C2 §5.3, added 2026-09-06)", () => {
  it("generate — C2 §5.3 example 5, defaults — emits the contract's exact code", () => {
    // Arrange
    const props: FftPlotProps = {
      chart: "fft",
      mark: {
        channel: "fork_velocity",
        mark: "lineY",
        fft: { windowSize: 2048, hopSize: 1024, window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "mean" },
      },
      x: { label: "Frequency (Hz)", type: "log" },
      y: { label: "Magnitude (m/s)" },
    };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toBe(
      [
        "Plot.plot({",
        '  x: { label: "Frequency (Hz)", type: "log" },',
        '  y: { label: "Magnitude (m/s)" },',
        "  marks: [",
        '    Plot.lineY(spectrum("fork_velocity", { windowSize: 2048, hopSize: 1024, window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "mean" }), { x: "f", y: "m" })',
        "  ]",
        "})",
      ].join("\n"),
    );
  });

  it("generate — C2 §5.3 example 5, whole-record single-segment form with an explicit colour — emits the contract's exact code", () => {
    // Arrange
    const props: FftPlotProps = {
      chart: "fft",
      mark: {
        channel: "fork_velocity",
        mark: "lineY",
        fft: { windowSize: "all", hopSize: "all", window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "none" },
        stroke: "#2196F3",
      },
      x: { label: "Frequency (Hz)", type: "log" },
      y: { label: "Magnitude (m/s)", type: "log" },
    };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toBe(
      [
        "Plot.plot({",
        '  x: { label: "Frequency (Hz)", type: "log" },',
        '  y: { label: "Magnitude (m/s)", type: "log" },',
        "  marks: [",
        '    Plot.lineY(spectrum("fork_velocity", { windowSize: "all", hopSize: "all", window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "none" }), { x: "f", y: "m", stroke: "#2196F3" })',
        "  ]",
        "})",
      ].join("\n"),
    );
  });

  it("generate — an FFT cell with no y or color — still always emits x.type", () => {
    // Arrange
    const props: FftPlotProps = {
      chart: "fft",
      mark: { channel: "c", mark: "lineY", fft: { windowSize: 1024, hopSize: 512, window: "rectangular", detrend: "none", scaling: "density", averaging: "max" } },
      x: { type: "linear" },
    };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toContain('x: { type: "linear" }');
  });

  it("generate — three spectrum_mark_name values in turn — each emits Plot.<name>(spectrum(...), ...)", () => {
    // Arrange
    const markNames: SpectrumMarkProps["mark"][] = ["lineY", "dot", "areaY"];

    // Act
    const codes = markNames.map((mark) =>
      generate({
        chart: "fft",
        mark: { channel: "c", mark, fft: { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "mean" } },
        x: { type: "log" },
      })
    );

    // Assert
    markNames.forEach((mark, i) => {
      expect(codes[i]).toContain(`Plot.${mark}(spectrum("c", `);
    });
  });

  it("generate — windowSize/hopSize of \"all\" — emits the quoted string literal", () => {
    // Arrange
    const props: FftPlotProps = {
      chart: "fft",
      mark: { channel: "c", mark: "lineY", fft: { windowSize: "all", hopSize: "all", window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "none" } },
      x: { type: "log" },
    };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toContain('windowSize: "all"');
    expect(code).toContain('hopSize: "all"');
  });

  it("generate — windowSize/hopSize as sample counts — emits bare integers, never quoted", () => {
    // Arrange
    const props: FftPlotProps = {
      chart: "fft",
      mark: { channel: "c", mark: "lineY", fft: { windowSize: 4096, hopSize: 2048, window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "mean" } },
      x: { type: "log" },
    };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toContain("windowSize: 4096");
    expect(code).toContain("hopSize: 2048");
    expect(code).not.toContain('"4096"');
    expect(code).not.toContain('"2048"');
  });

  it("generate — a spectrum mark with stroke and strokeWidth — emits both in spectrum_options", () => {
    // Arrange
    const props: FftPlotProps = {
      chart: "fft",
      mark: {
        channel: "c",
        mark: "lineY",
        fft: { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "mean" },
        stroke: "#000000",
        strokeWidth: 3,
      },
      x: { type: "log" },
    };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toContain('x: "f", y: "m", stroke: "#000000", strokeWidth: 3');
  });

  it("generate — a spectrum mark with no stroke or strokeWidth — omits both from spectrum_options", () => {
    // Arrange
    const props: FftPlotProps = {
      chart: "fft",
      mark: { channel: "c", mark: "lineY", fft: { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "mean" } },
      x: { type: "log" },
    };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toContain('x: "f", y: "m" }');
    expect(code).not.toContain("stroke");
  });

  it("generate — a time cell — is unaffected by the FFT branch's existence (byte-identical to before)", () => {
    // Arrange
    const props: PlotProps = {
      chart: "time",
      marks: [{ channel: "fork_velocity", mark: "lineY" }],
      x: { label: "Time (s)" },
    };

    // Act
    const code = generate(props);

    // Assert
    expect(code).toBe(
      ["Plot.plot({", '  x: { label: "Time (s)" },', "  marks: [", '    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })', "  ]", "})"].join("\n"),
    );
  });
});
