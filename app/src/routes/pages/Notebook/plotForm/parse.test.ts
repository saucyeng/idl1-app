import { describe, expect, it } from "vitest";
import { parse } from "./parse";
import type { FftPlotProps, PlotProps } from "./types";

describe("parse", () => {
  it("parse — C2 §5.3 example 1 — returns props deep-equal to the original", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  x: { label: "Time (s)" },',
      '  y: { label: "Velocity (m/s)" },',
      "  marks: [",
      '    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })',
      "  ]",
      "})",
    ].join("\n");
    const original: PlotProps = {
      chart: "time",
      marks: [{ channel: "fork_velocity", lap: null, mark: "lineY" }],
      x: { label: "Time (s)" },
      y: { label: "Velocity (m/s)" },
    };

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toEqual(original);
  });

  it("parse — C2 §5.3 example 2 — returns props deep-equal to the original", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  y: { domain: [-2, 2], type: "log" },',
      "  color: { legend: true },",
      "  marks: [",
      '    Plot.lineY(channel("IMU1_AccelX"), { x: "t", y: "v", stroke: "#2196F3" }),',
      '    Plot.lineY(channel("IMU2_AccelY"), { x: "t", y: "v", stroke: "#4CAF50" })',
      "  ]",
      "})",
    ].join("\n");
    // brief-task2.md's example 2 props literal omits `lap` on each mark
    // (session scope). `channel(...)` with no `{lap: ...}` object cannot be
    // distinguished from an explicit `lap: null`, so parse always reports
    // `lap: null` for session scope (matches MarkProps.lap's doc comment) —
    // this "original" includes it explicitly for that reason.
    const original: PlotProps = {
      chart: "time",
      marks: [
        { channel: "IMU1_AccelX", mark: "lineY", stroke: "#2196F3", lap: null },
        { channel: "IMU2_AccelY", mark: "lineY", stroke: "#4CAF50", lap: null },
      ],
      y: { domain: [-2, 2], type: "log" },
      color: { legend: true },
    };

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toEqual(original);
  });

  it("parse — C2 §5.3 example 3 — returns props deep-equal to the original", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  y: { label: "Bottom-out event" },',
      "  marks: [",
      '    Plot.dot(channel("fork_bottom_out", { lap: 3 }), { x: "t", y: "v", strokeWidth: 2 })',
      "  ]",
      "})",
    ].join("\n");
    const original: PlotProps = {
      chart: "time",
      marks: [{ channel: "fork_bottom_out", lap: 3, mark: "dot", strokeWidth: 2 }],
      y: { label: "Bottom-out event" },
    };

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toEqual(original);
  });

  it("parse — C2 §5.3 example 4 — returns props deep-equal to the original", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  x: { label: "Session time (s)", domain: [120, 180] },',
      '  y: { label: "Travel (mm)" },',
      "  marks: [",
      '    Plot.areaY(channel("fork_travel"), { x: "t", y: "v", stroke: "#9C27B0" })',
      "  ]",
      "})",
    ].join("\n");
    // See example 2's note: session-scope lap is always reported explicitly.
    const original: PlotProps = {
      chart: "time",
      marks: [{ channel: "fork_travel", mark: "areaY", stroke: "#9C27B0", lap: null }],
      x: { label: "Session time (s)", domain: [120, 180] },
      y: { label: "Travel (mm)" },
    };

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toEqual(original);
  });

  it("parse — code with a statement before the Plot.plot call — returns null (custom)", () => {
    // Arrange
    const code = [
      'channel("fork_velocity")',
      "Plot.plot({",
      "  marks: []",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — an unrecognised plot option key such as facet — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      "  facet: { data: [] },",
      "  marks: []",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — y.type outside the linear|log|sqrt enum — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  y: { type: "symlog" },',
      "  marks: []",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — a mark name outside the five in the grammar — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      "  marks: [",
      '    Plot.barY(channel("fork_velocity"), { x: "t", y: "v" })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — mark options carrying a key beyond x/y/stroke/strokeWidth — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      "  marks: [",
      '    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v", opacity: 0.5 })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — mark x or y not the literal strings t and v — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      "  marks: [",
      '    Plot.lineY(channel("fork_velocity"), { x: "time", y: "v" })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — a channel call with a session key — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      "  marks: [",
      '    Plot.lineY(channel("fork_velocity", { session: "current" }), { x: "t", y: "v" })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — a computed stroke read from a variable — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      "  marks: [",
      '    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v", stroke: color })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — two top-level Plot.plot calls — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({ marks: [] })",
      "Plot.plot({ marks: [] })",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — recognised keys in a hand-reordered order — parses successfully", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      "  marks: [",
      '    Plot.lineY(channel("fork_velocity"), { strokeWidth: 2, y: "v", x: "t", stroke: "#2196F3" })',
      "  ],",
      '  y: { type: "log", label: "Velocity (m/s)" },',
      '  x: { domain: [0, 100], label: "Time (s)" }',
      "})",
    ].join("\n");
    const expected: PlotProps = {
      chart: "time",
      marks: [{ channel: "fork_velocity", lap: null, mark: "lineY", stroke: "#2196F3", strokeWidth: 2 }],
      x: { label: "Time (s)", domain: [0, 100] },
      y: { label: "Velocity (m/s)", type: "log" },
    };

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toEqual(expected);
  });

  it("parse — an axis object with no populated fields — normalizes to the axis key being absent", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      "  x: {},",
      "  y: {},",
      "  marks: [",
      '    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })',
      "  ]",
      "})",
    ].join("\n");
    const expected: PlotProps = {
      chart: "time",
      marks: [{ channel: "fork_velocity", lap: null, mark: "lineY" }],
    };

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toEqual(expected);
    expect(parsed).not.toHaveProperty("x");
    expect(parsed).not.toHaveProperty("y");
  });
});

describe("parse — FFT chart (C2 §5.3, added 2026-09-06)", () => {
  it("parse — C2 §5.3 example 5, defaults — returns props deep-equal to the original", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  x: { label: "Frequency (Hz)", type: "log" },',
      '  y: { label: "Magnitude (m/s)" },',
      "  marks: [",
      '    Plot.lineY(spectrum("fork_velocity", { windowSize: 2048, hopSize: 1024, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" }), { x: "f", y: "m" })',
      "  ]",
      "})",
    ].join("\n");
    const original: FftPlotProps = {
      chart: "fft",
      mark: {
        channel: "fork_velocity",
        mark: "lineY",
        fft: { windowSize: 2048, hopSize: 1024, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" },
      },
      x: { label: "Frequency (Hz)", type: "log" },
      y: { label: "Magnitude (m/s)" },
    };

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toEqual(original);
  });

  it("parse — C2 §5.3 example 5, whole-record single-segment form with a colour — returns props deep-equal to the original", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  x: { label: "Frequency (Hz)", type: "log" },',
      '  y: { label: "Magnitude (m/s)", type: "log" },',
      "  marks: [",
      '    Plot.lineY(spectrum("fork_velocity", { windowSize: "all", hopSize: "all", window: "hann", detrend: "mean", scaling: "magnitude", averaging: "none" }), { x: "f", y: "m", stroke: "#2196F3" })',
      "  ]",
      "})",
    ].join("\n");
    const original: FftPlotProps = {
      chart: "fft",
      mark: {
        channel: "fork_velocity",
        mark: "lineY",
        fft: { windowSize: "all", hopSize: "all", window: "hann", detrend: "mean", scaling: "magnitude", averaging: "none" },
        stroke: "#2196F3",
      },
      x: { label: "Frequency (Hz)", type: "log" },
      y: { label: "Magnitude (m/s)", type: "log" },
    };

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toEqual(original);
  });

  it("parse — a marks array mixing a channel_call mark with a spectrum_call mark — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  x: { type: "log" },',
      "  marks: [",
      '    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" }),',
      '    Plot.lineY(spectrum("fork_velocity", { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" }), { x: "f", y: "m" })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — a marks array mixing a spectrum_call mark first, then a channel_call mark — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  x: { type: "log" },',
      "  marks: [",
      '    Plot.lineY(spectrum("fork_velocity", { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" }), { x: "f", y: "m" }),',
      '    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — two spectrum marks — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  x: { type: "log" },',
      "  marks: [",
      '    Plot.lineY(spectrum("a", { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" }), { x: "f", y: "m" }),',
      '    Plot.dot(spectrum("b", { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" }), { x: "f", y: "m" })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — a spectrum_call missing an fft_params key — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  x: { type: "log" },',
      "  marks: [",
      '    Plot.lineY(spectrum("a", { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "magnitude" }), { x: "f", y: "m" })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — a spectrum_call carrying an extra fft_params key — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  x: { type: "log" },',
      "  marks: [",
      '    Plot.lineY(spectrum("a", { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean", extra: 1 }), { x: "f", y: "m" })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — a spectrum_call's windowSize as a computed value — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  x: { type: "log" },',
      "  marks: [",
      '    Plot.lineY(spectrum("a", { windowSize: windowSize, hopSize: 512, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" }), { x: "f", y: "m" })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — a spectrum_mark's x/y not the literal strings f and m — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  x: { type: "log" },',
      "  marks: [",
      '    Plot.lineY(spectrum("a", { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" }), { x: "t", y: "v" })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — x.type: log on a time cell — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  x: { type: "log" },',
      "  marks: [",
      '    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — an FFT cell whose x is absent — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      "  marks: [",
      '    Plot.lineY(spectrum("a", { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" }), { x: "f", y: "m" })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — an FFT cell whose x is present without type — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  x: { label: "Frequency (Hz)" },',
      "  marks: [",
      '    Plot.lineY(spectrum("a", { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" }), { x: "f", y: "m" })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — spectrum_mark_name outside lineY|dot|areaY — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  x: { type: "log" },',
      "  marks: [",
      '    Plot.rectY(spectrum("a", { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" }), { x: "f", y: "m" })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — a spectrum_call with a third {lap} argument — returns null (custom)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  x: { type: "log" },',
      "  marks: [",
      '    Plot.lineY(spectrum("a", { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" }, { lap: 1 }), { x: "f", y: "m" })',
      "  ]",
      "})",
    ].join("\n");

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toBeNull();
  });

  it("parse — a hand-reordered fft_params object — parses successfully (order-insensitive)", () => {
    // Arrange
    const code = [
      "Plot.plot({",
      '  x: { type: "log" },',
      "  marks: [",
      '    Plot.lineY(spectrum("a", { averaging: "mean", scaling: "magnitude", detrend: "mean", window: "hann", hopSize: 512, windowSize: 1024 }), { y: "m", x: "f" })',
      "  ]",
      "})",
    ].join("\n");
    const expected: FftPlotProps = {
      chart: "fft",
      mark: { channel: "a", mark: "lineY", fft: { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" } },
      x: { type: "log" },
    };

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toEqual(expected);
  });
});
