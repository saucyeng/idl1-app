/**
 * The histogram cell's own grammar arm (C2 §5.3, ruling R215 item 2) —
 * generator, parser, and the byte-exact round trip between them. Kept
 * beside `generate.test.ts`/`parse.test.ts`/`roundTrip.test.ts` rather than
 * appended to all three: one chart kind's arm reads as one file.
 */
import { describe, expect, it } from "vitest";

import { generate } from "./generate";
import { histogramKey } from "./histogramKey";
import { parse } from "./parse";
import type { HistogramParams, HistogramPlotProps } from "./types";

const PARAMS: HistogramParams = { binMode: "count", binValue: 64, symmetric: true, normalise: "fraction" };

function props(overrides: Partial<HistogramPlotProps> = {}): HistogramPlotProps {
  return { chart: "histogram", mark: { channel: "fork_velocity", histogram: PARAMS }, ...overrides };
}

describe("generate — histogram chart (C2 §5.3, ruling R215 item 2)", () => {
  it("generate — a minimal histogram cell — emits one Plot.rectY over a histogram(...) call", () => {
    // Act
    const code = generate(props());

    // Assert
    expect(code).toBe(
      'Plot.plot({\n' +
        '  marks: [\n' +
        '    Plot.rectY(histogram("fork_velocity", { binMode: "count", binValue: 64, symmetric: true, normalise: "fraction" }), { x1: "v0", x2: "v1", y: "n" })\n' +
        '  ]\n' +
        '})'
    );
  });

  it("generate — all four histogram_params keys — are emitted in the grammar's fixed order", () => {
    // Act
    const code = generate(props());

    // Assert
    expect(code.indexOf("binMode")).toBeLessThan(code.indexOf("binValue"));
    expect(code.indexOf("binValue")).toBeLessThan(code.indexOf("symmetric"));
    expect(code.indexOf("symmetric")).toBeLessThan(code.indexOf("normalise"));
  });

  it("generate — symmetric: false — is emitted as the bare literal false, not omitted", () => {
    // Act
    const code = generate(props({ mark: { channel: "x", histogram: { ...PARAMS, symmetric: false } } }));

    // Assert
    expect(code).toContain("symmetric: false");
  });

  it("generate — fill and fillOpacity — follow the fixed x1/x2/y triple, in that order", () => {
    // Act
    const code = generate(props({ mark: { channel: "x", histogram: PARAMS, fill: "#abcdef", fillOpacity: 0.5 } }));

    // Assert
    expect(code).toContain('{ x1: "v0", x2: "v1", y: "n", fill: "#abcdef", fillOpacity: 0.5 }');
  });

  it("generate — x, y and color — are emitted above marks, in the grammar's top-level order", () => {
    // Act
    const code = generate(props({ x: { label: "Velocity (m/s)" }, y: { label: "Share" }, color: { legend: true } }));

    // Assert
    expect(code.indexOf("x: {")).toBeLessThan(code.indexOf("y: {"));
    expect(code.indexOf("y: {")).toBeLessThan(code.indexOf("color: {"));
    expect(code.indexOf("color: {")).toBeLessThan(code.indexOf("marks: ["));
  });
});

describe("parse — histogram chart (C2 §5.3, ruling R215 item 2)", () => {
  it("parse — generated histogram code — reads back the histogram chart kind and its params", () => {
    // Act
    const parsed = parse(generate(props()));

    // Assert
    expect(parsed?.chart).toBe("histogram");
    if (parsed?.chart === "histogram") {
      expect(parsed.mark.channel).toBe("fork_velocity");
      expect(parsed.mark.histogram).toEqual(PARAMS);
    }
  });

  it("parse — a missing histogram_params key — is custom code, not a defaulted value", () => {
    // Arrange — `normalise` dropped.
    const code = 'Plot.plot({\n  marks: [\n    Plot.rectY(histogram("x", { binMode: "count", binValue: 8, symmetric: false }), { x1: "v0", x2: "v1", y: "n" })\n  ]\n})';

    // Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — an unrecognised bin mode — is custom code", () => {
    // Arrange
    const code = 'Plot.plot({\n  marks: [\n    Plot.rectY(histogram("x", { binMode: "quantile", binValue: 8, symmetric: false, normalise: "counts" }), { x1: "v0", x2: "v1", y: "n" })\n  ]\n})';

    // Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — a mark name other than rectY over a histogram(...) call — is custom code", () => {
    // Arrange — `lineY` has no `x2` channel to bind a bin's far edge to.
    const code = 'Plot.plot({\n  marks: [\n    Plot.lineY(histogram("x", { binMode: "count", binValue: 8, symmetric: false, normalise: "counts" }), { x1: "v0", x2: "v1", y: "n" })\n  ]\n})';

    // Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — two histogram marks in one cell — is custom code (exactly one mark)", () => {
    // Arrange
    const one = 'Plot.rectY(histogram("x", { binMode: "count", binValue: 8, symmetric: false, normalise: "counts" }), { x1: "v0", x2: "v1", y: "n" })';
    const code = `Plot.plot({\n  marks: [\n    ${one},\n    ${one}\n  ]\n})`;

    // Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — a histogram mark mixed with a channel mark — is custom code (one chart kind per cell)", () => {
    // Arrange
    const histogramMark = 'Plot.rectY(histogram("x", { binMode: "count", binValue: 8, symmetric: false, normalise: "counts" }), { x1: "v0", x2: "v1", y: "n" })';
    const code = `Plot.plot({\n  marks: [\n    ${histogramMark},\n    Plot.lineY(channel("x"), { x: "t", y: "v" })\n  ]\n})`;

    // Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — histogram options bound to \"t\"/\"v\" instead of the bin triple — is custom code", () => {
    // Arrange
    const code = 'Plot.plot({\n  marks: [\n    Plot.rectY(histogram("x", { binMode: "count", binValue: 8, symmetric: false, normalise: "counts" }), { x: "t", y: "v" })\n  ]\n})';

    // Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — hand-reordered histogram_params keys — still parses (the reader is order-insensitive)", () => {
    // Arrange
    const code = 'Plot.plot({\n  marks: [\n    Plot.rectY(histogram("x", { normalise: "counts", symmetric: true, binValue: 8, binMode: "width" }), { x1: "v0", x2: "v1", y: "n" })\n  ]\n})';

    // Act
    const parsed = parse(code);

    // Assert
    expect(parsed?.chart).toBe("histogram");
    if (parsed?.chart === "histogram") {
      expect(parsed.mark.histogram).toEqual({ binMode: "width", binValue: 8, symmetric: true, normalise: "counts" });
    }
  });
});

describe("plotForm round trip — histogram chart", () => {
  const BIN_MODES: HistogramParams["binMode"][] = ["count", "width"];
  const NORMALISATIONS: HistogramParams["normalise"][] = ["counts", "fraction"];
  const SYMMETRIES = [true, false];
  const FILLS: (string | undefined)[] = [undefined, "#112233"];
  const OPACITIES: (number | undefined)[] = [undefined, 0.4];

  it("round trip — every histogram_params combination and both optional mark fields — generate(parse(code)) === code", () => {
    // Arrange / Act / Assert
    let cases = 0;
    for (const binMode of BIN_MODES) {
      for (const normalise of NORMALISATIONS) {
        for (const symmetric of SYMMETRIES) {
          for (const fill of FILLS) {
            for (const fillOpacity of OPACITIES) {
              const p: HistogramPlotProps = {
                chart: "histogram",
                mark: {
                  channel: "fork_velocity",
                  histogram: { binMode, binValue: binMode === "count" ? 64 : 0.25, symmetric, normalise },
                  ...(fill === undefined ? {} : { fill }),
                  ...(fillOpacity === undefined ? {} : { fillOpacity }),
                },
              };
              const code = generate(p);
              expect(parse(code)).toEqual(p);
              expect(generate(parse(code) as HistogramPlotProps)).toBe(code);
              cases++;
            }
          }
        }
      }
    }
    expect(cases).toBe(32);
  });

  it("round trip — with x, y and colour legend — is byte-identical", () => {
    // Arrange
    const p = props({ x: { label: "Velocity (m/s)", domain: [-2, 2] }, y: { label: "Share", type: "log" }, color: { legend: true } });

    // Act
    const code = generate(p);

    // Assert
    expect(parse(code)).toEqual(p);
    expect(generate(parse(code) as HistogramPlotProps)).toBe(code);
  });
});

describe("histogramKey", () => {
  it("histogramKey — two different binnings of one channel — are different keys", () => {
    // Assert
    expect(histogramKey("x", PARAMS)).not.toBe(histogramKey("x", { ...PARAMS, binValue: 32 }));
    expect(histogramKey("x", PARAMS)).not.toBe(histogramKey("x", { ...PARAMS, symmetric: false }));
    expect(histogramKey("x", PARAMS)).not.toBe(histogramKey("x", { ...PARAMS, normalise: "counts" }));
    expect(histogramKey("x", PARAMS)).not.toBe(histogramKey("x", { ...PARAMS, binMode: "width" }));
  });

  it("histogramKey — the same channel and params — is stable across calls", () => {
    // Assert
    expect(histogramKey("x", PARAMS)).toBe(histogramKey("x", { ...PARAMS }));
  });

  it("histogramKey — is tagged, so it can never collide with a spectrumKey", () => {
    // Assert
    expect(histogramKey("x", PARAMS).startsWith("histogram | ")).toBe(true);
  });
});
