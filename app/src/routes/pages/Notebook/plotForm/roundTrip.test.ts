import { describe, expect, it } from "vitest";
import { generate } from "./generate";
import { parse } from "./parse";
import type { FftParams, FftPlotProps, FftXAxisProps, MarkProps, PlotProps, SpectrumMarkProps, XAxisProps, YAxisProps } from "./types";

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
  const p: PlotProps = { chart: "time", marks: [mark] };
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

// ---------------------------------------------------------------------------
// FFT enumeration (C2 §5.3, added 2026-09-06). Every value of every FFT
// parameter, crossed with the two windowSize/hopSize forms a sample count
// takes ("all" is always available; a bare sample count is only ever
// produced by the form alongside a non-"none" averaging — `updateFftParams`
// forces window/hop to "all" whenever averaging is "none", R76 — so the
// enumeration below only pairs "none" with the "all" form, the pairing the
// form can actually produce), the three spectrum mark names, both x.type
// values, and stroke/strokeWidth present/absent.
// ---------------------------------------------------------------------------

const FFT_WINDOW_FUNCTIONS: FftParams["window"][] = ["rectangular", "hann", "hamming"];
const FFT_DETRENDS: FftParams["detrend"][] = ["none", "mean", "linear"];
// The three offered scalings (R167/R168) — the retired "magnitude" spelling
// gets its own dedicated back-compat case below instead, since it is never
// newly-generated.
const FFT_SCALINGS: FftParams["scaling"][] = ["density", "spectrum", "raw_magnitude"];
const FFT_AVERAGINGS: FftParams["averaging"][] = ["none", "mean", "median", "max"];
const FFT_MARK_NAMES: SpectrumMarkProps["mark"][] = ["lineY", "dot", "areaY"];
const FFT_X_TYPES: FftXAxisProps["type"][] = ["linear", "log"];

/** The two `windowSize`/`hopSize` forms the form can produce for a given
 *  `averaging`: `"all"` always; a representative sample count too, except
 *  under `averaging: "none"`, which the form always forces to `"all"`. */
function windowOrHopFormsFor(averaging: FftParams["averaging"]): ("sampleCount" | "all")[] {
  return averaging === "none" ? ["all"] : ["sampleCount", "all"];
}

function fftParamsFor(
  window: FftParams["window"],
  detrend: FftParams["detrend"],
  scaling: FftParams["scaling"],
  averaging: FftParams["averaging"],
  form: "sampleCount" | "all",
): FftParams {
  return {
    windowSize: form === "all" ? "all" : 2048,
    hopSize: form === "all" ? "all" : 1024,
    window,
    detrend,
    scaling,
    averaging,
  };
}

function buildSpectrumMark(
  fft: FftParams,
  mark: SpectrumMarkProps["mark"],
  stroke: string | undefined,
  strokeWidth: number | undefined,
): SpectrumMarkProps {
  const m: SpectrumMarkProps = { channel: "fork_velocity", mark, fft };
  if (stroke !== undefined) m.stroke = stroke;
  if (strokeWidth !== undefined) m.strokeWidth = strokeWidth;
  return m;
}

function buildFftProps(mark: SpectrumMarkProps, xType: FftXAxisProps["type"]): FftPlotProps {
  return { chart: "fft", mark, x: { type: xType } };
}

/** 3 window functions × 3 detrends × 3 scalings = 27 parameter base
 *  combinations; each crossed with its available windowSize/hopSize forms
 *  (1 for `"none"`, 2 otherwise — 4 averaging modes give 1+2+2+2 = 7 per
 *  base combination, so 27 × 7 = 189 parameter+form combinations), crossed
 *  with 3 spectrum mark names × 2 `x.type` values × 2 stroke states × 2
 *  strokeWidth states = 24, for 189 × 24 = 4536 total cases. */
function enumerateFftCases(): FftPlotProps[] {
  const cases: FftPlotProps[] = [];
  for (const window of FFT_WINDOW_FUNCTIONS) {
    for (const detrend of FFT_DETRENDS) {
      for (const scaling of FFT_SCALINGS) {
        for (const averaging of FFT_AVERAGINGS) {
          for (const form of windowOrHopFormsFor(averaging)) {
            const fft = fftParamsFor(window, detrend, scaling, averaging, form);
            for (const markName of FFT_MARK_NAMES) {
              for (const xType of FFT_X_TYPES) {
                for (const stroke of STROKES) {
                  for (const strokeWidth of STROKE_WIDTHS) {
                    cases.push(buildFftProps(buildSpectrumMark(fft, markName, stroke, strokeWidth), xType));
                  }
                }
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
  it("generate then parse — every combination of the time-cell props grammar — returns props deep-equal to the input", () => {
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

  it("generate then parse — every combination of the FFT-cell props grammar — returns props deep-equal to the input", () => {
    // Arrange
    const cases = enumerateFftCases();
    expect(cases.length).toBe(4536);

    // Act & Assert
    for (const props of cases) {
      const code = generate(props);
      const parsed = parse(code);
      expect(parsed).toEqual(props);
    }
  });

  it("generate then parse — a stored cell on the retired \"magnitude\" scaling spelling (R168 back-compat) — returns props deep-equal to the input", () => {
    // Arrange
    const props: FftPlotProps = {
      chart: "fft",
      mark: {
        channel: "fork_velocity",
        mark: "lineY",
        fft: { windowSize: 2048, hopSize: 1024, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" },
      },
      x: { type: "log" },
    };

    // Act
    const code = generate(props);
    const parsed = parse(code);

    // Assert
    expect(parsed).toEqual(props);
  });

  it("parse then generate — code the form itself produced — returns byte-identical code", () => {
    // Arrange
    const samples: PlotProps[] = [
      {
        chart: "time",
        marks: [{ channel: "fork_velocity", lap: null, mark: "lineY" }],
        x: { label: "Time (s)" },
        y: { label: "Velocity (m/s)" },
      },
      {
        chart: "time",
        marks: [
          { channel: "IMU1_AccelX", mark: "lineY", stroke: "#2196F3", lap: null },
          { channel: "IMU2_AccelY", mark: "lineY", stroke: "#4CAF50", lap: null },
        ],
        y: { domain: [-2, 2], type: "log" },
        color: { legend: true },
      },
      { chart: "time", marks: [{ channel: "fork_bottom_out", lap: 3, mark: "dot", strokeWidth: 2 }], y: { label: "Bottom-out event" } },
      { chart: "time", marks: [], x: { label: "Session time (s)", domain: [120, 180] } },
      {
        chart: "fft",
        mark: {
          channel: "fork_velocity",
          mark: "lineY",
          fft: { windowSize: 2048, hopSize: 1024, window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "mean" },
        },
        x: { label: "Frequency (Hz)", type: "log" },
        y: { label: "Magnitude (m/s)" },
      },
      {
        chart: "fft",
        mark: {
          channel: "fork_velocity",
          mark: "lineY",
          fft: { windowSize: "all", hopSize: "all", window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "none" },
          stroke: "#2196F3",
        },
        x: { label: "Frequency (Hz)", type: "log" },
        y: { label: "Magnitude (m/s)", type: "log" },
      },
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
