/**
 * The plot's own `title` option (C2 §5.3, added 2026-09-11) — one field
 * shared by every chart kind, so this file crosses it with all four rather
 * than testing it once on the time cell.
 */
import { describe, expect, it } from "vitest";

import { generate } from "./generate";
import { parse } from "./parse";
import type { PlotProps, TimePlotProps } from "./types";

/** One minimal cell of each chart kind, with no title. */
const CELLS: Record<PlotProps["chart"], PlotProps> = {
  time: { chart: "time", marks: [{ channel: "x", mark: "lineY", lap: null }] },
  fft: {
    chart: "fft",
    mark: {
      channel: "x",
      mark: "lineY",
      fft: { windowSize: 2048, hopSize: 1024, window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "mean" },
    },
    x: { type: "log" },
  },
  histogram: { chart: "histogram", mark: { channel: "x", histogram: { binMode: "count", binValue: 64, symmetric: true, normalise: "fraction" } } },
  scatter: { chart: "scatter", mark: { xChannel: "a", yChannel: "b", scatter: { pointBudget: 4096, equalAspect: true } } },
};

const KINDS = Object.keys(CELLS) as PlotProps["chart"][];

describe("generate — the plot title", () => {
  it("generate — no title — emits nothing extra, byte-identical to before the field existed", () => {
    // Assert
    expect(generate(CELLS.time)).toBe('Plot.plot({\n  marks: [\n    Plot.lineY(channel("x"), { x: "t", y: "v" })\n  ]\n})');
  });

  it("generate — a title — emits it first, above every other option, for every chart kind", () => {
    // Assert
    for (const kind of KINDS) {
      const code = generate({ ...CELLS[kind], title: "Fork velocity" });
      expect(code.startsWith('Plot.plot({\n  title: "Fork velocity",')).toBe(true);
    }
  });

  it("generate — a title containing a quote — is escaped, never producing invalid code", () => {
    // Act
    const code = generate({ ...CELLS.time, title: 'Rider "A" — lap 3' });

    // Assert
    expect(code).toContain('title: "Rider \\"A\\" — lap 3"');
  });
});

describe("parse — the plot title", () => {
  it("parse — a titled cell of every chart kind — reads the title back", () => {
    // Assert
    for (const kind of KINDS) {
      const parsed = parse(generate({ ...CELLS[kind], title: "Fork velocity" }));
      expect(parsed?.title).toBe("Fork velocity");
      expect(parsed?.chart).toBe(kind);
    }
  });

  it("parse — no title — leaves the key absent, never an empty string", () => {
    // Assert
    for (const kind of KINDS) {
      const parsed = parse(generate(CELLS[kind]));
      expect(parsed).not.toBeNull();
      expect("title" in (parsed as PlotProps)).toBe(false);
    }
  });

  it("parse — a non-string title — is custom code", () => {
    // Assert
    expect(parse('Plot.plot({\n  title: 3,\n  marks: [\n    Plot.lineY(channel("x"), { x: "t", y: "v" })\n  ]\n})')).toBeNull();
  });

  it("parse — a hand-reordered title (after marks) — still parses; the reader is order-insensitive", () => {
    // Arrange
    const code = 'Plot.plot({\n  marks: [\n    Plot.lineY(channel("x"), { x: "t", y: "v" })\n  ],\n  title: "Late"\n})';

    // Act / Assert
    expect(parse(code)?.title).toBe("Late");
  });
});

describe("plotForm round trip — the plot title", () => {
  it("round trip — every chart kind, titled and untitled — generate(parse(code)) === code", () => {
    // Arrange / Act / Assert
    let cases = 0;
    for (const kind of KINDS) {
      for (const title of [undefined, "Fork velocity"]) {
        const p: PlotProps = title === undefined ? CELLS[kind] : { ...CELLS[kind], title };
        const code = generate(p);
        expect(parse(code)).toEqual(p);
        expect(generate(parse(code) as PlotProps)).toBe(code);
        cases++;
      }
    }
    expect(cases).toBe(8);
  });

  it("round trip — a title alongside every other top-level option — stays byte-identical", () => {
    // Arrange
    const p: TimePlotProps = {
      ...(CELLS.time as TimePlotProps),
      title: "Fork velocity",
      x: { label: "Time (s)", domain: [0, 100] },
      y: { label: "mm", type: "pow", exponent: 0.5 },
      color: { legend: true },
      zeroLine: true,
    };

    // Act
    const code = generate(p);

    // Assert
    expect(parse(code)).toEqual(p);
    expect(generate(parse(code) as TimePlotProps)).toBe(code);
  });
});
