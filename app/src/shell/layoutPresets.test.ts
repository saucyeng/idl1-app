import { describe, expect, it } from "vitest";

import { ASPECT_CLASSES } from "./aspectClass";
import {
  asActivePreset,
  DEFAULT_PRESET_BY_CLASS,
  isLayoutPresetId,
  LAYOUT_PRESET_CYCLE,
  LAYOUT_PRESETS,
  nextPreset,
} from "./layoutPresets";

describe("LAYOUT_PRESETS — the table itself", () => {
  it("LAYOUT_PRESETS — the four ids — in cycle order, one entry each", () => {
    const ids = LAYOUT_PRESETS.map((spec) => spec.id);

    expect(ids).toEqual([...LAYOUT_PRESET_CYCLE]);
  });

  it("LAYOUT_PRESETS — every preset — says only what it is called, never what it arranges", () => {
    // Ruling R239 moved the arrangement to `dockLayout.ts`'s
    // `namedDockLayout`. A `columns`/`mathsOrientation`/`outputWidthPx`
    // back on this table would be the duplicate source of truth the
    // reviewer caught on 2026-09-20.
    const fields = LAYOUT_PRESETS.flatMap((spec) => Object.keys(spec));

    expect(new Set(fields)).toEqual(new Set(["id", "label", "glyph", "title"]));
  });

  it("LAYOUT_PRESETS — every preset — carries a label and a one-character glyph", () => {
    const shapes = LAYOUT_PRESETS.map((spec) => ({ labelled: spec.label.length > 0, glyphs: [...spec.glyph].length }));

    expect(shapes).toEqual([
      { labelled: true, glyphs: 1 },
      { labelled: true, glyphs: 1 },
      { labelled: true, glyphs: 1 },
      { labelled: true, glyphs: 1 },
    ]);
  });
});

describe("DEFAULT_PRESET_BY_CLASS", () => {
  it("DEFAULT_PRESET_BY_CLASS — the three classes — split, stacked, output", () => {
    const defaults = ASPECT_CLASSES.map((cls) => DEFAULT_PRESET_BY_CLASS[cls]);

    expect(defaults).toEqual(["split", "stacked", "output"]);
  });
});

describe("nextPreset — the Ctrl+Shift+L cycle", () => {
  it("nextPreset — walked four times from output — returns to output", () => {
    const walk = [nextPreset("output"), nextPreset("maths"), nextPreset("split"), nextPreset("stacked")];

    expect(walk).toEqual(["maths", "split", "stacked", "output"]);
  });

  it("nextPreset — from custom — restarts at the first preset", () => {
    const next = nextPreset("custom");

    expect(next).toBe("output");
  });
});

describe("isLayoutPresetId / asActivePreset — values off a storage boundary", () => {
  it("isLayoutPresetId — the four ids and a stale one — true four times, then false", () => {
    const results = [...LAYOUT_PRESET_CYCLE.map((id) => isLayoutPresetId(id)), isLayoutPresetId("studio")];

    expect(results).toEqual([true, true, true, true, false]);
  });

  it("asActivePreset — the literal custom — custom", () => {
    const active = asActivePreset("custom", "split");

    expect(active).toBe("custom");
  });

  it("asActivePreset — an unrecognised value — the fallback", () => {
    const active = asActivePreset({ id: "split" }, "stacked");

    expect(active).toBe("stacked");
  });
});
