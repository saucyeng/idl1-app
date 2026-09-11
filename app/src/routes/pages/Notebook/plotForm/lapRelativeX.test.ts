/**
 * The time cell's lap-relative x binding (C2 §5.3's `x_field_binding`,
 * ruling R215 items 4-5) — the grammar half of the lap-pair overlay and the
 * lap variance trace.
 */
import { describe, expect, it } from "vitest";

import { generate } from "./generate";
import { parse } from "./parse";
import type { MarkProps, TimePlotProps } from "./types";

function timeProps(marks: MarkProps[], overrides: Partial<TimePlotProps> = {}): TimePlotProps {
  return { chart: "time", marks, ...overrides };
}

describe("generate — lap-relative x binding", () => {
  it("generate — a mark with no xField — emits x: \"t\", byte-identical to before this field existed", () => {
    // Act
    const code = generate(timeProps([{ channel: "fork_velocity", mark: "lineY" }]));

    // Assert
    expect(code).toBe('Plot.plot({\n  marks: [\n    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })\n  ]\n})');
  });

  it("generate — a mark with xField: \"tr\" — emits x: \"tr\" in the same slot", () => {
    // Act
    const code = generate(timeProps([{ channel: "fork_velocity", mark: "lineY", xField: "tr" }]));

    // Assert
    expect(code).toContain('{ x: "tr", y: "v" }');
  });

  it("generate — xField with stroke and strokeWidth — keeps the grammar's field order", () => {
    // Act
    const code = generate(timeProps([{ channel: "x", mark: "lineY", xField: "tr", stroke: "#abc", strokeWidth: 2 }]));

    // Assert
    expect(code).toContain('{ x: "tr", y: "v", stroke: "#abc", strokeWidth: 2 }');
  });
});

describe("parse — lap-relative x binding", () => {
  it("parse — x: \"tr\" — reads back xField: \"tr\"", () => {
    // Act
    const parsed = parse('Plot.plot({\n  marks: [\n    Plot.lineY(channel("x"), { x: "tr", y: "v" })\n  ]\n})');

    // Assert
    expect(parsed?.chart).toBe("time");
    if (parsed?.chart === "time") {
      expect(parsed.marks[0].xField).toBe("tr");
    }
  });

  it("parse — x: \"t\" — normalises to an absent xField, so a landed document is unchanged", () => {
    // Act
    const parsed = parse('Plot.plot({\n  marks: [\n    Plot.lineY(channel("x"), { x: "t", y: "v" })\n  ]\n})');

    // Assert
    if (parsed?.chart === "time") {
      expect(parsed.marks[0]).toEqual({ channel: "x", mark: "lineY", lap: null });
      expect("xField" in parsed.marks[0]).toBe(false);
    } else {
      expect.fail("expected a time cell");
    }
  });

  it("parse — any other x literal — is custom code, never a third silently-accepted axis", () => {
    // Assert — `"distance"` in particular has no grammar slot (R136).
    expect(parse('Plot.plot({\n  marks: [\n    Plot.lineY(channel("x"), { x: "distance", y: "v" })\n  ]\n})')).toBeNull();
    expect(parse('Plot.plot({\n  marks: [\n    Plot.lineY(channel("x"), { x: "d", y: "v" })\n  ]\n})')).toBeNull();
  });

  it("parse — y still admits only \"v\" — an x widening did not widen y", () => {
    // Assert
    expect(parse('Plot.plot({\n  marks: [\n    Plot.lineY(channel("x"), { x: "tr", y: "tr" })\n  ]\n})')).toBeNull();
  });

  it("parse — a mixed cell (one mark on each column) — still parses; the form reports it as session time", () => {
    // Arrange — a hand edit, not something the form produces. The grammar
    // is per mark, so this is representable; `timeXFieldOf` is what refuses
    // to describe it as lap-relative.
    const code =
      'Plot.plot({\n  marks: [\n    Plot.lineY(channel("a"), { x: "t", y: "v" }),\n    Plot.lineY(channel("b"), { x: "tr", y: "v" })\n  ]\n})';

    // Act
    const parsed = parse(code);

    // Assert
    if (parsed?.chart === "time") {
      expect(parsed.marks[0].xField).toBeUndefined();
      expect(parsed.marks[1].xField).toBe("tr");
    } else {
      expect.fail("expected a time cell");
    }
  });
});

describe("plotForm round trip — lap-relative x binding", () => {
  it("round trip — both x bindings crossed with the optional mark fields — generate(parse(code)) === code", () => {
    // Arrange / Act / Assert
    let cases = 0;
    for (const xField of [undefined, "tr"] as const) {
      for (const lap of [null, 3]) {
        for (const stroke of [undefined, "#123456"]) {
          for (const strokeWidth of [undefined, 2]) {
            const mark: MarkProps = { channel: "fork_velocity", mark: "lineY", lap };
            if (xField !== undefined) mark.xField = xField;
            if (stroke !== undefined) mark.stroke = stroke;
            if (strokeWidth !== undefined) mark.strokeWidth = strokeWidth;
            const p = timeProps([mark]);
            const code = generate(p);
            expect(parse(code)).toEqual(p);
            expect(generate(parse(code) as TimePlotProps)).toBe(code);
            cases++;
          }
        }
      }
    }
    expect(cases).toBe(16);
  });
});
