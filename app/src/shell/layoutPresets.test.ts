import { describe, expect, it } from "vitest";

import { ASPECT_CLASSES } from "./aspectClass";
import {
  asActivePreset,
  DEFAULT_PRESET_BY_CLASS,
  isLayoutPresetId,
  LAYOUT_PRESET_CYCLE,
  LAYOUT_PRESETS,
  nextPreset,
  OUTPUT_COLUMN_MIN_WIDTH_PX,
  presetLayout,
} from "./layoutPresets";

describe("LAYOUT_PRESETS — the table itself", () => {
  it("LAYOUT_PRESETS — the four ids — in cycle order, one entry each", () => {
    const ids = LAYOUT_PRESETS.map((spec) => spec.id);

    expect(ids).toEqual([...LAYOUT_PRESET_CYCLE]);
  });

  it("LAYOUT_PRESETS — every preset — keeps the cell list on, since it is the output", () => {
    const cells = LAYOUT_PRESETS.map((spec) => spec.columns.cells);

    expect(cells).toEqual([true, true, true, true]);
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

describe("presetLayout — what each preset writes", () => {
  it("presetLayout — output — the notebook alone, graph and properties off", () => {
    const layout = presetLayout("output");

    expect(layout).toEqual({ columns: { graph: false, properties: false, cells: true }, mathsOrientation: "column", outputWidthPx: null });
  });

  it("presetLayout — maths — every pane on, output pinned to its minimum width", () => {
    const layout = presetLayout("maths");

    expect(layout).toEqual({ columns: { graph: true, properties: true, cells: true }, mathsOrientation: "column", outputWidthPx: OUTPUT_COLUMN_MIN_WIDTH_PX });
  });

  it("presetLayout — split — every pane on, side by side, width left to the user", () => {
    const layout = presetLayout("split");

    expect(layout).toEqual({ columns: { graph: true, properties: true, cells: true }, mathsOrientation: "column", outputWidthPx: null });
  });

  it("presetLayout — stacked — the maths panel as a row above the output", () => {
    const layout = presetLayout("stacked");

    expect(layout).toEqual({ columns: { graph: true, properties: true, cells: true }, mathsOrientation: "row", outputWidthPx: null });
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
