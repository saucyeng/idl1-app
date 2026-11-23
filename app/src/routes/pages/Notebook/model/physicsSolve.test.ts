import { describe, expect, it } from "vitest";

import { coveredFraction, lapSolveSpans, needsSolve, readsSolverChannels, solveBarText, solvedText } from "./physicsSolve";

describe("readsSolverChannels", () => {
  it("readsSolverChannels — builtins and plain channel names — true", () => {
    expect(readsSolverChannels('t = wheel_travel("front")')).toBe(true);
    expect(readsSolverChannels('s = attitude("steer")')).toBe(true);
    expect(readsSolverChannels("x = [Rear travel (mm)] * 2")).toBe(true);
    expect(readsSolverChannels('Readout.number("Front travel (mm)", {})')).toBe(true);
    expect(readsSolverChannels("b = [Fork bend lateral (deg)]")).toBe(true);
  });

  it("readsSolverChannels — other channels and the old filter's — false", () => {
    expect(readsSolverChannels('r = attitude("roll")')).toBe(false);
    expect(readsSolverChannels("x = [IEKF front travel (mm)]")).toBe(false);
    expect(readsSolverChannels("x = [GPS_SpeedKmh]")).toBe(false);
    expect(readsSolverChannels(null)).toBe(false);
  });
});

describe("solveBarText", () => {
  it("solveBarText — solving with and without a window count — the count when known", () => {
    expect(solveBarText({ kind: "solving", done: 3, total: 10 })).toBe("Solving: 3 of 10 windows");
    expect(solveBarText({ kind: "solving", done: 0, total: null })).toBe("Solving…");
    expect(solveBarText({ kind: "idle" })).toBeNull();
  });
});

describe("solvedText", () => {
  it("solvedText — a solve with a failed window — says so with the medians", () => {
    const text = solvedText({ solved_s: 96, windows: 10, failed_windows: 1, front_median_mm: 42.4, rear_median_mm: 50, fitted_geometry: false, seconds: 178 });

    expect(text).toBe("Solved 96 s in 178 s, 1 of 10 windows failed. Median travel front 42 mm, rear 50 mm.");
  });
});

describe("coveredFraction / needsSolve", () => {
  it("coveredFraction — a lap half solved, fully solved, not solved — 0.5, 1, 0", () => {
    expect(coveredFraction([[0, 50]], 0, 100)).toBeCloseTo(0.5);
    expect(coveredFraction([[-10, 40], [40, 200]], 0, 100)).toBeCloseTo(1);
    expect(coveredFraction([], 0, 100)).toBe(0);
  });

  it("needsSolve — 85 % and 95 % covered — solve, then leave", () => {
    expect(needsSolve(0.85)).toBe(true);
    expect(needsSolve(0.95)).toBe(false);
  });
});

describe("lapSolveSpans", () => {
  it("lapSolveSpans — two touching laps and one apart, 5 s pad — two spans, none before the ride", () => {
    const laps = [
      { start_time_secs: 2, end_time_secs: 60 },
      { start_time_secs: 62, end_time_secs: 120 },
      { start_time_secs: 300, end_time_secs: 400 },
    ];

    const spans = lapSolveSpans(laps);

    expect(spans).toEqual([
      [0, 125e6],
      [295e6, 405e6],
    ]);
  });
});
