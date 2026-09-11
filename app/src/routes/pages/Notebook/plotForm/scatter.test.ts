/**
 * The scatter cell's own grammar arm (C2 §5.3, ruling R215 item 3) —
 * generator, parser, and the byte-exact round trip between them.
 */
import { describe, expect, it } from "vitest";

import { generate } from "./generate";
import { parse } from "./parse";
import { scatterKey } from "./scatterKey";
import type { ScatterParams, ScatterPlotProps } from "./types";

const PARAMS: ScatterParams = { pointBudget: 4096, equalAspect: true };

function props(overrides: Partial<ScatterPlotProps> = {}): ScatterPlotProps {
  return { chart: "scatter", mark: { xChannel: "AccelX", yChannel: "AccelY", scatter: PARAMS }, ...overrides };
}

describe("generate — scatter chart (C2 §5.3, ruling R215 item 3)", () => {
  it("generate — a minimal scatter cell — emits one Plot.dot over a two-channel scatter(...) call", () => {
    // Act
    const code = generate(props());

    // Assert
    expect(code).toBe(
      'Plot.plot({\n' +
        '  marks: [\n' +
        '    Plot.dot(scatter("AccelX", "AccelY", { pointBudget: 4096, equalAspect: true }), { x: "x", y: "y" })\n' +
        '  ]\n' +
        '})'
    );
  });

  it("generate — equalAspect: false — is emitted as the bare literal false, not omitted", () => {
    // Act
    const code = generate(props({ mark: { xChannel: "a", yChannel: "b", scatter: { ...PARAMS, equalAspect: false } } }));

    // Assert
    expect(code).toContain("equalAspect: false");
  });

  it("generate — fill and r — follow the fixed x/y pair, in that order", () => {
    // Act
    const code = generate(props({ mark: { xChannel: "a", yChannel: "b", scatter: PARAMS, fill: "#abcdef", r: 1.5 } }));

    // Assert
    expect(code).toContain('{ x: "x", y: "y", fill: "#abcdef", r: 1.5 }');
  });

  it("generate — x, y and color — are emitted above marks, in the grammar's top-level order", () => {
    // Act
    const code = generate(props({ x: { label: "Lateral (g)" }, y: { label: "Longitudinal (g)" }, color: { legend: true } }));

    // Assert
    expect(code.indexOf("x: {")).toBeLessThan(code.indexOf("y: {"));
    expect(code.indexOf("y: {")).toBeLessThan(code.indexOf("color: {"));
    expect(code.indexOf("color: {")).toBeLessThan(code.indexOf("marks: ["));
  });
});

describe("parse — scatter chart (C2 §5.3, ruling R215 item 3)", () => {
  it("parse — generated scatter code — reads back both channels and the params", () => {
    // Act
    const parsed = parse(generate(props()));

    // Assert
    expect(parsed?.chart).toBe("scatter");
    if (parsed?.chart === "scatter") {
      expect(parsed.mark.xChannel).toBe("AccelX");
      expect(parsed.mark.yChannel).toBe("AccelY");
      expect(parsed.mark.scatter).toEqual(PARAMS);
    }
  });

  it("parse — a missing scatter_params key — is custom code, not a defaulted value", () => {
    // Arrange — `equalAspect` dropped.
    const code = 'Plot.plot({\n  marks: [\n    Plot.dot(scatter("a", "b", { pointBudget: 100 }), { x: "x", y: "y" })\n  ]\n})';

    // Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — a one-argument scatter(...) call — is custom code (a scatter names two channels)", () => {
    // Arrange
    const code = 'Plot.plot({\n  marks: [\n    Plot.dot(scatter("a", { pointBudget: 100, equalAspect: true }), { x: "x", y: "y" })\n  ]\n})';

    // Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — a mark name other than dot over a scatter(...) call — is custom code", () => {
    // Arrange — a cloud has no ordering, so a line mark would draw a scribble.
    const code = 'Plot.plot({\n  marks: [\n    Plot.lineY(scatter("a", "b", { pointBudget: 100, equalAspect: true }), { x: "x", y: "y" })\n  ]\n})';

    // Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — two scatter marks in one cell — is custom code (exactly one mark)", () => {
    // Arrange
    const one = 'Plot.dot(scatter("a", "b", { pointBudget: 100, equalAspect: true }), { x: "x", y: "y" })';
    const code = `Plot.plot({\n  marks: [\n    ${one},\n    ${one}\n  ]\n})`;

    // Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — a scatter mark mixed with a channel mark — is custom code (one chart kind per cell)", () => {
    // Arrange
    const scatterMark = 'Plot.dot(scatter("a", "b", { pointBudget: 100, equalAspect: true }), { x: "x", y: "y" })';
    const code = `Plot.plot({\n  marks: [\n    ${scatterMark},\n    Plot.lineY(channel("a"), { x: "t", y: "v" })\n  ]\n})`;

    // Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — scatter options bound to \"t\"/\"v\" instead of \"x\"/\"y\" — is custom code", () => {
    // Arrange
    const code = 'Plot.plot({\n  marks: [\n    Plot.dot(scatter("a", "b", { pointBudget: 100, equalAspect: true }), { x: "t", y: "v" })\n  ]\n})';

    // Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — hand-reordered scatter_params keys — still parses (the reader is order-insensitive)", () => {
    // Arrange
    const code = 'Plot.plot({\n  marks: [\n    Plot.dot(scatter("a", "b", { equalAspect: false, pointBudget: 512 }), { x: "x", y: "y" })\n  ]\n})';

    // Act
    const parsed = parse(code);

    // Assert
    if (parsed?.chart === "scatter") {
      expect(parsed.mark.scatter).toEqual({ pointBudget: 512, equalAspect: false });
    } else {
      expect.fail("expected a scatter cell");
    }
  });

  it("parse — a time cell — is still a time cell, unaffected by the scatter production", () => {
    // Arrange
    const code = 'Plot.plot({\n  marks: [\n    Plot.lineY(channel("x"), { x: "t", y: "v" })\n  ]\n})';

    // Assert
    expect(parse(code)?.chart).toBe("time");
  });
});

describe("plotForm round trip — scatter chart", () => {
  it("round trip — every scatter_params combination and both optional mark fields — generate(parse(code)) === code", () => {
    // Arrange / Act / Assert
    let cases = 0;
    for (const equalAspect of [true, false]) {
      for (const fill of [undefined, "#112233"]) {
        for (const r of [undefined, 1.5]) {
          const p: ScatterPlotProps = {
            chart: "scatter",
            mark: {
              xChannel: "AccelX",
              yChannel: "AccelY",
              scatter: { pointBudget: 4096, equalAspect },
              ...(fill === undefined ? {} : { fill }),
              ...(r === undefined ? {} : { r }),
            },
          };
          const code = generate(p);
          expect(parse(code)).toEqual(p);
          expect(generate(parse(code) as ScatterPlotProps)).toBe(code);
          cases++;
        }
      }
    }
    expect(cases).toBe(8);
  });

  it("round trip — with both axes and the colour legend — is byte-identical", () => {
    // Arrange
    const p = props({ x: { label: "Lateral (g)", domain: [-2, 2] }, y: { label: "Longitudinal (g)", type: "linear" }, color: { legend: true } });

    // Act
    const code = generate(p);

    // Assert
    expect(parse(code)).toEqual(p);
    expect(generate(parse(code) as ScatterPlotProps)).toBe(code);
  });
});

describe("scatterKey", () => {
  it("scatterKey — swapping the two channels — is a different key (a G-G cloud is not symmetric)", () => {
    // Assert
    expect(scatterKey("a", "b", PARAMS)).not.toBe(scatterKey("b", "a", PARAMS));
  });

  it("scatterKey — two different point budgets — are different clouds, so different keys", () => {
    // Assert
    expect(scatterKey("a", "b", PARAMS)).not.toBe(scatterKey("a", "b", { ...PARAMS, pointBudget: 512 }));
  });

  it("scatterKey — differing only by equalAspect — are different keys", () => {
    // Assert
    expect(scatterKey("a", "b", PARAMS)).not.toBe(scatterKey("a", "b", { ...PARAMS, equalAspect: false }));
  });

  it("scatterKey — is tagged, so it can never collide with a spectrum or histogram key", () => {
    // Assert
    expect(scatterKey("a", "b", PARAMS).startsWith("scatter | ")).toBe(true);
  });
});
