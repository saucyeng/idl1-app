import { describe, expect, it } from "vitest";

import {
  actionFor,
  BASIC_MOUSE_PRESET,
  findInputMapPreset,
  INPUT_MAP_PRESETS,
  TRACKPAD_PRESET,
  TWO_WHEEL_MOUSE_PRESET,
} from "./inputMap";

describe("INPUT_MAP_PRESETS", () => {
  it("INPUT_MAP_PRESETS — ships at least the three R137 presets, each with a unique id", () => {
    expect(INPUT_MAP_PRESETS.length).toBeGreaterThanOrEqual(3);
    const ids = INPUT_MAP_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every shipped preset — drag stays decision 56's zoom-to-region default", () => {
    for (const preset of INPUT_MAP_PRESETS) {
      expect(preset.map.drag).toBe("zoom-region");
    }
  });
});

describe("TRACKPAD_PRESET", () => {
  it("TRACKPAD_PRESET — pinch zooms, two-finger drag pans, per R137", () => {
    expect(actionFor(TRACKPAD_PRESET, "pinch")).toBe("zoom-x");
    expect(actionFor(TRACKPAD_PRESET, "twoFingerPan")).toBe("pan-x");
  });
});

describe("TWO_WHEEL_MOUSE_PRESET", () => {
  it("TWO_WHEEL_MOUSE_PRESET — vertical wheel zooms, horizontal wheel pans, per R137", () => {
    expect(actionFor(TWO_WHEEL_MOUSE_PRESET, "wheel")).toBe("zoom-x");
    expect(actionFor(TWO_WHEEL_MOUSE_PRESET, "horizontalWheel")).toBe("pan-x");
  });
});

describe("BASIC_MOUSE_PRESET", () => {
  it("BASIC_MOUSE_PRESET — shift-drag pans, wheel zooms, per R137", () => {
    expect(actionFor(BASIC_MOUSE_PRESET, "shiftDrag")).toBe("pan-x");
    expect(actionFor(BASIC_MOUSE_PRESET, "wheel")).toBe("zoom-x");
  });
});

describe("findInputMapPreset", () => {
  it("findInputMapPreset — a known id — the matching preset", () => {
    expect(findInputMapPreset("basic-mouse")).toBe(BASIC_MOUSE_PRESET);
  });

  it("findInputMapPreset — an unknown id — null, never a guessed fallback preset", () => {
    expect(findInputMapPreset("nonexistent")).toBeNull();
  });
});
