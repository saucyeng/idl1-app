/**
 * The time-series options the port had dropped (C2 §5.3, ruling R215 item
 * 5): the zero line and the two signed y scales.
 */
import { describe, expect, it } from "vitest";

import { generate } from "./generate";
import { parse } from "./parse";
import type { TimePlotProps } from "./types";

function props(overrides: Partial<TimePlotProps> = {}): TimePlotProps {
  return { chart: "time", marks: [{ channel: "fork_velocity", mark: "lineY" }], ...overrides };
}

describe("generate — zero line (C2 §5.3's zero_rule)", () => {
  it("generate — no zeroLine — emits nothing extra, byte-identical to before this option existed", () => {
    // Act
    const code = generate(props());

    // Assert
    expect(code).toBe('Plot.plot({\n  marks: [\n    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })\n  ]\n})');
  });

  it("generate — zeroLine: true — emits Plot.ruleY([0]) first, so it draws under the data", () => {
    // Act
    const code = generate(props({ zeroLine: true }));

    // Assert
    expect(code).toBe(
      'Plot.plot({\n  marks: [\n    Plot.ruleY([0]),\n    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })\n  ]\n})'
    );
  });

  it("generate — zeroLine with no data marks — emits the rule alone, not an empty array", () => {
    // Act
    const code = generate(props({ marks: [], zeroLine: true }));

    // Assert
    expect(code).toBe("Plot.plot({\n  marks: [\n    Plot.ruleY([0])\n  ]\n})");
  });
});

describe("parse — zero line", () => {
  it("parse — a leading Plot.ruleY([0]) — reads back as zeroLine, not as a mark the form cannot edit", () => {
    // Act
    const parsed = parse(generate(props({ zeroLine: true })));

    // Assert
    expect(parsed?.chart).toBe("time");
    if (parsed?.chart === "time") {
      expect(parsed.zeroLine).toBe(true);
      expect(parsed.marks).toHaveLength(1);
    }
  });

  it("parse — no zero rule — leaves zeroLine absent, never false", () => {
    // Act
    const parsed = parse(generate(props()));

    // Assert
    if (parsed?.chart === "time") {
      expect("zeroLine" in parsed).toBe(false);
    } else {
      expect.fail("expected a time cell");
    }
  });

  it("parse — a ruleY channel mark — is still a mark, not a mis-read zero line", () => {
    // Arrange — the two productions differ by `[` vs `channel(`.
    const code = 'Plot.plot({\n  marks: [\n    Plot.ruleY(channel("x"), { x: "t", y: "v" })\n  ]\n})';

    // Act
    const parsed = parse(code);

    // Assert
    if (parsed?.chart === "time") {
      expect(parsed.zeroLine).toBeUndefined();
      expect(parsed.marks[0].mark).toBe("ruleY");
    } else {
      expect.fail("expected a time cell");
    }
  });

  it("parse — a rule at a value other than zero — is custom code, never silently a zero line", () => {
    // Assert
    expect(parse('Plot.plot({\n  marks: [\n    Plot.ruleY([1]),\n    Plot.lineY(channel("x"), { x: "t", y: "v" })\n  ]\n})')).toBeNull();
  });

  it("parse — a zero rule after a data mark — is custom code (the production is a leading one)", () => {
    // Assert
    expect(parse('Plot.plot({\n  marks: [\n    Plot.lineY(channel("x"), { x: "t", y: "v" }),\n    Plot.ruleY([0])\n  ]\n})')).toBeNull();
  });

  it("parse — the zero rule alone — is a legal time cell with no data marks", () => {
    // Act
    const parsed = parse("Plot.plot({\n  marks: [\n    Plot.ruleY([0])\n  ]\n})");

    // Assert
    if (parsed?.chart === "time") {
      expect(parsed.zeroLine).toBe(true);
      expect(parsed.marks).toEqual([]);
    } else {
      expect.fail("expected a time cell");
    }
  });
});

describe("generate / parse — signed y scales (C2 §5.3's pow scale)", () => {
  it("generate — type pow with an exponent — emits exponent after type", () => {
    // Act
    const code = generate(props({ y: { type: "pow", exponent: 0.5 } }));

    // Assert
    expect(code).toContain('y: { type: "pow", exponent: 0.5 }');
  });

  it("generate — the signed square — is pow with exponent 2", () => {
    // Act
    const code = generate(props({ y: { type: "pow", exponent: 2 } }));

    // Assert
    expect(code).toContain('y: { type: "pow", exponent: 2 }');
  });

  it("parse — pow with an exponent — reads both back", () => {
    // Act
    const parsed = parse(generate(props({ y: { label: "Velocity (m/s)", type: "pow", exponent: 0.5 } })));

    // Assert
    expect(parsed?.y).toEqual({ label: "Velocity (m/s)", type: "pow", exponent: 0.5 });
  });

  it("parse — pow with no exponent — is custom code, never a defaulted exponent", () => {
    // Assert
    expect(parse('Plot.plot({\n  y: { type: "pow" },\n  marks: [\n    Plot.lineY(channel("x"), { x: "t", y: "v" })\n  ]\n})')).toBeNull();
  });

  it("parse — an exponent on a non-pow scale — is custom code, never a silently dropped field", () => {
    // Assert
    expect(
      parse('Plot.plot({\n  y: { type: "linear", exponent: 2 },\n  marks: [\n    Plot.lineY(channel("x"), { x: "t", y: "v" })\n  ]\n})')
    ).toBeNull();
  });

  it("parse — an exponent with no type at all — is custom code", () => {
    // Assert
    expect(parse('Plot.plot({\n  y: { exponent: 2 },\n  marks: [\n    Plot.lineY(channel("x"), { x: "t", y: "v" })\n  ]\n})')).toBeNull();
  });

  it("parse — the three unsigned scale types — are unaffected", () => {
    // Assert
    for (const type of ["linear", "log", "sqrt"] as const) {
      const parsed = parse(generate(props({ y: { type } })));
      expect(parsed?.y).toEqual({ type });
    }
  });
});

describe("plotForm round trip — zero line and signed scales", () => {
  it("round trip — the zero line crossed with every y scale — generate(parse(code)) === code", () => {
    // Arrange / Act / Assert
    let cases = 0;
    const scales: TimePlotProps["y"][] = [
      undefined,
      { type: "linear" },
      { type: "log" },
      { type: "sqrt" },
      { type: "pow", exponent: 0.5 },
      { type: "pow", exponent: 2 },
      { label: "V", domain: [-2, 2], type: "pow", exponent: 0.5 },
    ];
    for (const y of scales) {
      for (const zeroLine of [undefined, true] as const) {
        const p: TimePlotProps = { chart: "time", marks: [{ channel: "x", mark: "lineY", lap: null }] };
        if (y !== undefined) p.y = y;
        if (zeroLine !== undefined) p.zeroLine = zeroLine;
        const code = generate(p);
        expect(parse(code)).toEqual(p);
        expect(generate(parse(code) as TimePlotProps)).toBe(code);
        cases++;
      }
    }
    expect(cases).toBe(14);
  });

  it("round trip — a hand-edited exponent the pane does not name — still round-trips byte-identically", () => {
    // Arrange — the grammar admits any number; the picker offers two.
    const p: TimePlotProps = { chart: "time", marks: [{ channel: "x", mark: "lineY", lap: null }], y: { type: "pow", exponent: 0.25 } };

    // Act
    const code = generate(p);

    // Assert
    expect(parse(code)).toEqual(p);
    expect(generate(parse(code) as TimePlotProps)).toBe(code);
  });
});
