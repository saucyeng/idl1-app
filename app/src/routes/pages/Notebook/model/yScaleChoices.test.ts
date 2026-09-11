/**
 * The y-axis scale picker's own tokens and the zero-line setter (ruling
 * R215 item 5) — the pure half of the two controls the port had dropped.
 */
import { describe, expect, it } from "vitest";

import { generate } from "../plotForm/generate";
import { parse } from "../plotForm/parse";
import type { TimePlotProps, YAxisProps } from "../plotForm/types";
import { setZeroLine, updateYAxis, yScaleChoiceOf, yScaleChoicesFor, yScaleSelectOptions, Y_SCALE_CHOICES, Y_SCALE_DEFAULT } from "./propertiesForm";

function timeProps(overrides: Partial<TimePlotProps> = {}): TimePlotProps {
  // `lap: null` is the canonical form `parse` always produces, so a
  // generate/parse round trip in these tests compares deep-equal.
  return { chart: "time", marks: [{ channel: "x", mark: "lineY", lap: null }], ...overrides };
}

describe("Y_SCALE_CHOICES", () => {
  it("Y_SCALE_CHOICES — every entry's patch round-trips back to its own token", () => {
    // Assert — the picker's token and its patch are inverses, so a commit
    // followed by a re-render shows the same choice the user picked.
    for (const choice of Y_SCALE_CHOICES) {
      const y: YAxisProps = { ...choice.patch };
      expect(yScaleChoiceOf(choice.value === Y_SCALE_DEFAULT ? undefined : y)).toBe(choice.value);
    }
  });

  it("Y_SCALE_CHOICES — the two signed scales — are pow scales differing only by exponent", () => {
    // Assert — which is exactly why the picker cannot be keyed on `type`.
    const signed = Y_SCALE_CHOICES.filter((c) => c.signedOnly === true);
    expect(signed).toHaveLength(2);
    expect(signed.every((c) => c.patch.type === "pow")).toBe(true);
    expect(new Set(signed.map((c) => c.patch.exponent))).toEqual(new Set([0.5, 2]));
  });

  it("Y_SCALE_CHOICES — every entry has a non-empty label and a distinct value", () => {
    // Assert
    expect(new Set(Y_SCALE_CHOICES.map((c) => c.value)).size).toBe(Y_SCALE_CHOICES.length);
    for (const choice of Y_SCALE_CHOICES) expect(choice.label.length).toBeGreaterThan(0);
  });

  it("Y_SCALE_CHOICES — \"pow\" is never offered raw — it is meaningless without an exponent", () => {
    // Assert
    expect(Y_SCALE_CHOICES.some((c) => c.value === "pow")).toBe(false);
  });
});

describe("yScaleChoicesFor", () => {
  it("yScaleChoicesFor — a signed axis — offers the signed scales", () => {
    // Assert
    expect(yScaleChoicesFor("signed").some((c) => c.value === "signed-sqrt")).toBe(true);
  });

  it("yScaleChoicesFor — a non-negative axis — offers neither signed scale", () => {
    // Assert — a count, a fraction or a spectrum magnitude cannot go below
    // zero, so a symmetric-about-zero scale there is noise.
    expect(yScaleChoicesFor("non-negative").some((c) => c.signedOnly === true)).toBe(false);
  });

  it("yScaleChoicesFor — both kinds — still offer the default and the three unsigned types", () => {
    // Assert
    for (const axis of ["signed", "non-negative"] as const) {
      const values = yScaleChoicesFor(axis).map((c) => c.value);
      expect(values).toEqual(expect.arrayContaining([Y_SCALE_DEFAULT, "linear", "log", "sqrt"]));
    }
  });
});

describe("yScaleChoiceOf", () => {
  it("yScaleChoiceOf — no y at all — is the default token", () => {
    // Assert
    expect(yScaleChoiceOf(undefined)).toBe(Y_SCALE_DEFAULT);
  });

  it("yScaleChoiceOf — a y with a label but no type — is still the default token", () => {
    // Assert
    expect(yScaleChoiceOf({ label: "Velocity" })).toBe(Y_SCALE_DEFAULT);
  });

  it("yScaleChoiceOf — pow 0.5 and pow 2 — are the two named signed tokens", () => {
    // Assert
    expect(yScaleChoiceOf({ type: "pow", exponent: 0.5 })).toBe("signed-sqrt");
    expect(yScaleChoiceOf({ type: "pow", exponent: 2 })).toBe("signed-square");
  });

  it("yScaleChoiceOf — a hand-edited exponent — reports its own token, never a named scale it is not", () => {
    // Assert — without this, the select would display "Signed √" and the
    // next unrelated edit would write that lie back.
    expect(yScaleChoiceOf({ type: "pow", exponent: 0.25 })).toBe("pow:0.25");
  });
});

describe("yScaleSelectOptions", () => {
  it("yScaleSelectOptions — a named scale — renders exactly the offered list", () => {
    // Assert
    expect(yScaleSelectOptions({ type: "pow", exponent: 2 }, "signed")).toEqual(yScaleChoicesFor("signed"));
  });

  it("yScaleSelectOptions — a hand-edited exponent — appends an option for it, for this render only", () => {
    // Act
    const options = yScaleSelectOptions({ type: "pow", exponent: 0.25 }, "signed");

    // Assert
    expect(options).toHaveLength(yScaleChoicesFor("signed").length + 1);
    expect(options[options.length - 1]).toMatchObject({ value: "pow:0.25", patch: { type: "pow", exponent: 0.25 } });
  });

  it("yScaleSelectOptions — committing the appended option — writes the same exponent back unchanged", () => {
    // Arrange
    const options = yScaleSelectOptions({ type: "pow", exponent: 0.25 }, "signed");
    const appended = options[options.length - 1];

    // Act
    const next = updateYAxis(timeProps({ y: { type: "pow", exponent: 0.25 } }), appended.patch);

    // Assert
    expect(next.y).toEqual({ type: "pow", exponent: 0.25 });
  });
});

describe("updateYAxis — with the scale patches", () => {
  it("updateYAxis — a signed scale patch — sets type and exponent together, and round-trips", () => {
    // Arrange
    const choice = Y_SCALE_CHOICES.find((c) => c.value === "signed-sqrt")!;

    // Act
    const next = updateYAxis(timeProps(), choice.patch);

    // Assert
    expect(next.y).toEqual({ type: "pow", exponent: 0.5 });
    expect(parse(generate(next))).toEqual(next);
  });

  it("updateYAxis — switching from a signed scale to linear — clears the exponent", () => {
    // Arrange
    const signed = updateYAxis(timeProps(), { type: "pow", exponent: 2 });
    const linear = Y_SCALE_CHOICES.find((c) => c.value === "linear")!;

    // Act
    const next = updateYAxis(signed, linear.patch);

    // Assert — a stale exponent would make the cell unparseable.
    expect(next.y).toEqual({ type: "linear" });
    expect(parse(generate(next))).toEqual(next);
  });

  it("updateYAxis — switching from a signed scale back to the default — drops the y key entirely", () => {
    // Arrange
    const signed = updateYAxis(timeProps(), { type: "pow", exponent: 2 });
    const fallback = Y_SCALE_CHOICES.find((c) => c.value === Y_SCALE_DEFAULT)!;

    // Act
    const next = updateYAxis(signed, fallback.patch);

    // Assert
    expect(next.y).toBeUndefined();
  });
});

describe("setZeroLine", () => {
  it("setZeroLine — true — sets zeroLine and generates the leading rule", () => {
    // Act
    const next = setZeroLine(timeProps(), true);

    // Assert
    expect(next.zeroLine).toBe(true);
    expect(generate(next)).toContain("Plot.ruleY([0]),");
  });

  it("setZeroLine — false — removes the key entirely rather than writing false", () => {
    // Act
    const next = setZeroLine(setZeroLine(timeProps(), true), false);

    // Assert
    expect("zeroLine" in next).toBe(false);
    expect(generate(next)).toBe(generate(timeProps()));
  });

  it("setZeroLine — never mutates the input props", () => {
    // Arrange
    const props = timeProps();

    // Act
    setZeroLine(props, true);

    // Assert
    expect(props.zeroLine).toBeUndefined();
  });
});
