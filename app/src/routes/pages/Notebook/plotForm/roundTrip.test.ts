import { describe, expect, it } from "vitest";
import { generate } from "./generate";
import { parse } from "./parse";
import type { MarkProps, PlotProps, XAxisProps, YAxisProps } from "./types";

const MARK_NAMES: MarkProps["mark"][] = ["lineY", "dot", "areaY", "rectY", "ruleY"];
const LAPS: (number | null)[] = [null, 3];
const STROKES: (string | undefined)[] = [undefined, "#123456"];
const STROKE_WIDTHS: (number | undefined)[] = [undefined, 2];

// {no x, x: {label}, x: {label, domain}} — three cases (C2 §5.3's x_scale).
const X_OPTIONS: (XAxisProps | undefined)[] = [
  undefined,
  { label: "Time (s)" },
  { label: "Time (s)", domain: [0, 100] },
];

// {no y, y: {label}, y: {domain}, y: {type: linear}, y: {type: log}, y: {type: sqrt}} — six cases.
const Y_OPTIONS: (YAxisProps | undefined)[] = [
  undefined,
  { label: "Velocity (m/s)" },
  { domain: [-2, 2] },
  { type: "linear" },
  { type: "log" },
  { type: "sqrt" },
];

const COLOR_OPTIONS: ({ legend: true } | undefined)[] = [undefined, { legend: true }];

/** Builds one mark for a round-trip case, including only the optional
 *  fields that are defined for this combination. */
function buildMark(
  mark: MarkProps["mark"],
  lap: number | null,
  stroke: string | undefined,
  strokeWidth: number | undefined,
): MarkProps {
  const m: MarkProps = { channel: "fork_velocity", mark, lap };
  if (stroke !== undefined) m.stroke = stroke;
  if (strokeWidth !== undefined) m.strokeWidth = strokeWidth;
  return m;
}

/** Builds one round-trip case's full `PlotProps`, including only the
 *  top-level optional fields that are defined for this combination. */
function buildProps(
  mark: MarkProps,
  x: XAxisProps | undefined,
  y: YAxisProps | undefined,
  color: { legend: true } | undefined,
): PlotProps {
  const p: PlotProps = { marks: [mark] };
  if (x !== undefined) p.x = x;
  if (y !== undefined) p.y = y;
  if (color !== undefined) p.color = color;
  return p;
}

/** The exhaustive enumeration over the closed grammar named in the brief:
 *  5 mark names × 2 lap states × 2 stroke states × 2 strokeWidth states ×
 *  3 x states × 6 y states × 2 color states = 1440 cases, hand-enumerated
 *  with nested loops (no randomisation). */
function enumerateCases(): PlotProps[] {
  const cases: PlotProps[] = [];
  for (const mark of MARK_NAMES) {
    for (const lap of LAPS) {
      for (const stroke of STROKES) {
        for (const strokeWidth of STROKE_WIDTHS) {
          for (const x of X_OPTIONS) {
            for (const y of Y_OPTIONS) {
              for (const color of COLOR_OPTIONS) {
                cases.push(buildProps(buildMark(mark, lap, stroke, strokeWidth), x, y, color));
              }
            }
          }
        }
      }
    }
  }
  return cases;
}

describe("plotForm round trip", () => {
  it("generate then parse — every combination of the props grammar — returns props deep-equal to the input", () => {
    // Arrange
    const cases = enumerateCases();
    expect(cases.length).toBe(1440);

    // Act & Assert
    for (const props of cases) {
      const code = generate(props);
      const parsed = parse(code);
      expect(parsed).toEqual(props);
    }
  });

  it("parse then generate — code the form itself produced — returns byte-identical code", () => {
    // Arrange
    const samples: PlotProps[] = [
      { marks: [{ channel: "fork_velocity", lap: null, mark: "lineY" }], x: { label: "Time (s)" }, y: { label: "Velocity (m/s)" } },
      {
        marks: [
          { channel: "IMU1_AccelX", mark: "lineY", stroke: "#2196F3", lap: null },
          { channel: "IMU2_AccelY", mark: "lineY", stroke: "#4CAF50", lap: null },
        ],
        y: { domain: [-2, 2], type: "log" },
        color: { legend: true },
      },
      { marks: [{ channel: "fork_bottom_out", lap: 3, mark: "dot", strokeWidth: 2 }], y: { label: "Bottom-out event" } },
      { marks: [], x: { label: "Session time (s)", domain: [120, 180] } },
    ];

    for (const props of samples) {
      // Act
      const firstCode = generate(props);
      const parsed = parse(firstCode);
      const secondCode = parsed === null ? null : generate(parsed);

      // Assert
      expect(secondCode).toBe(firstCode);
    }
  });
});
