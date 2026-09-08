import { describe, expect, it } from "vitest";

import { BASIC_MOUSE_PRESET, TRACKPAD_PRESET, TWO_WHEEL_MOUSE_PRESET } from "./inputMap";
import { classifyPointerDown, classifyWheelEvent, dragActionFor, horizontalWheelActionFor, wheelActionFor } from "./gestureVerbs";

describe("classifyPointerDown", () => {
  it("classifyPointerDown — no Shift — drag", () => {
    expect(classifyPointerDown(false)).toBe("drag");
  });

  it("classifyPointerDown — Shift held — shiftDrag", () => {
    expect(classifyPointerDown(true)).toBe("shiftDrag");
  });
});

describe("dragActionFor", () => {
  it("dragActionFor — every shipped preset, plain drag — zoom-region (decision 56's default)", () => {
    for (const preset of [TRACKPAD_PRESET, TWO_WHEEL_MOUSE_PRESET, BASIC_MOUSE_PRESET]) {
      expect(dragActionFor(preset, false)).toBe("zoom-region");
    }
  });

  it("dragActionFor — basic mouse, Shift-drag — pan-x", () => {
    expect(dragActionFor(BASIC_MOUSE_PRESET, true)).toBe("pan-x");
  });

  it("dragActionFor — trackpad, Shift-drag — none (its pan is two-finger, not Shift)", () => {
    expect(dragActionFor(TRACKPAD_PRESET, true)).toBe("none");
  });
});

describe("classifyWheelEvent", () => {
  it("classifyWheelEvent — ctrlKey set — pinch, regardless of deltas", () => {
    expect(classifyWheelEvent(50, 0, true)).toBe("pinch");
  });

  it("classifyWheelEvent — deltaX dominates deltaY, no ctrlKey — horizontalWheel", () => {
    expect(classifyWheelEvent(30, 2, false)).toBe("horizontalWheel");
  });

  it("classifyWheelEvent — deltaY dominates deltaX, no ctrlKey — wheel", () => {
    expect(classifyWheelEvent(2, 30, false)).toBe("wheel");
  });

  it("classifyWheelEvent — deltaX zero — wheel, never horizontalWheel", () => {
    expect(classifyWheelEvent(0, 30, false)).toBe("wheel");
  });
});

describe("horizontalWheelActionFor", () => {
  it("horizontalWheelActionFor — two-wheel mouse — pan-x, from its own horizontalWheel binding", () => {
    expect(horizontalWheelActionFor(TWO_WHEEL_MOUSE_PRESET)).toBe("pan-x");
  });

  it("horizontalWheelActionFor — trackpad — pan-x, falling back to its twoFingerPan binding", () => {
    expect(horizontalWheelActionFor(TRACKPAD_PRESET)).toBe("pan-x");
  });

  it("horizontalWheelActionFor — basic mouse — none, since neither key is bound", () => {
    expect(horizontalWheelActionFor(BASIC_MOUSE_PRESET)).toBe("none");
  });
});

describe("wheelActionFor", () => {
  it("wheelActionFor — horizontalWheel — routes through the two-key fallback", () => {
    expect(wheelActionFor(TRACKPAD_PRESET, "horizontalWheel")).toBe("pan-x");
  });

  it("wheelActionFor — wheel — plain lookup, matching actionFor directly", () => {
    expect(wheelActionFor(TWO_WHEEL_MOUSE_PRESET, "wheel")).toBe("zoom-x");
  });

  it("wheelActionFor — pinch — plain lookup, matching actionFor directly", () => {
    expect(wheelActionFor(TRACKPAD_PRESET, "pinch")).toBe("zoom-x");
  });
});
