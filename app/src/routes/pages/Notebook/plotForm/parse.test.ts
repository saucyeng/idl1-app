import { describe, expect, it } from "vitest";
import { parse } from "./parse";
import type { PlotProps } from "./types";

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
      marks: [{ channel: "fork_velocity", lap: null, mark: "lineY", stroke: "#2196F3", strokeWidth: 2 }],
      x: { label: "Time (s)", domain: [0, 100] },
      y: { label: "Velocity (m/s)", type: "log" },
    };

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed).toEqual(expected);
  });
});
