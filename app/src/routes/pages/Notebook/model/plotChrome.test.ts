import { describe, expect, it } from "vitest";

import {
  cellChromeMode,
  isShowCodeShortcut,
  plotLegendEntries,
  plotStatusGlyph,
  SETTLE_FADE_MS,
  type ShortcutEvent,
} from "./plotChrome";

/** A `ShortcutEvent` with no modifier held, for the tests to vary. */
function keyEvent(patch: Partial<ShortcutEvent>): ShortcutEvent {
  return { key: "c", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...patch };
}

describe("cellChromeMode — a chart cell — loses the R210 band", () => {
  it("js overlays its chrome and every other kind keeps the band", () => {
    // Arrange
    const kinds = ["js", "math", "table"];

    // Act
    const modes = kinds.map(cellChromeMode);

    // Assert
    expect(modes).toEqual(["overlay", "band", "band"]);
  });
});

describe("plotStatusGlyph — an errored plot — shows its ✕ for as long as the error lasts", () => {
  it("stays a cross however long ago it failed", () => {
    // Arrange
    const elapsed = [null, 0, SETTLE_FADE_MS, SETTLE_FADE_MS * 1000];

    // Act
    const glyphs = elapsed.map((ms) => plotStatusGlyph("error", ms));

    // Assert
    expect(glyphs).toEqual(["cross", "cross", "cross", "cross"]);
  });

  it("spins while queued, evaluating or stale, whatever the settle clock says", () => {
    // Arrange
    const states = ["queued", "evaluating", "stale"] as const;

    // Act
    const glyphs = states.map((status) => plotStatusGlyph(status, SETTLE_FADE_MS * 10));

    // Assert
    expect(glyphs).toEqual(["spinner", "spinner", "spinner"]);
  });

  it("a stale plot long after its last settle — still a spinner, never a faded-out tick", () => {
    // Arrange
    const longAfterTheFade = SETTLE_FADE_MS * 10;

    // Act
    const glyph = plotStatusGlyph("stale", longAfterTheFade);

    // Assert
    expect(glyph).toBe("spinner");
  });
});

describe("plotStatusGlyph — a settled plot — flashes its ✓ and then gets out of the way", () => {
  it("shows the tick up to the fade and nothing from the fade onwards", () => {
    // Arrange
    const elapsed = [null, 0, SETTLE_FADE_MS - 1, SETTLE_FADE_MS, SETTLE_FADE_MS + 1];

    // Act
    const glyphs = elapsed.map((ms) => plotStatusGlyph("settled", ms));

    // Assert
    expect(glyphs).toEqual(["tick", "tick", "tick", "none", "none"]);
  });
});

describe("plotLegendEntries — a single-series plot — shows no legend", () => {
  it("returns nothing for zero or one series", () => {
    // Arrange
    const one = [{ name: "fork_travel", unit: "mm" }];

    // Act
    const entries = [plotLegendEntries([]), plotLegendEntries(one)];

    // Assert
    expect(entries).toEqual([[], []]);
  });
});

describe("plotLegendEntries — a multi-series plot — names every series with its unit and colour", () => {
  it("uses the label when there is one, the name when there is not, and walks the chart tokens", () => {
    // Arrange
    const series = [
      { name: "fork_travel", label: "Fork travel", unit: "mm" },
      { name: "shock_travel", label: null, unit: "mm" },
      { name: "speed", unit: null },
    ];

    // Act
    const entries = plotLegendEntries(series);

    // Assert
    expect(entries).toEqual([
      { key: "fork_travel", label: "Fork travel (mm)", colour: "--chart-1" },
      { key: "shock_travel", label: "shock_travel (mm)", colour: "--chart-2" },
      { key: "speed", label: "speed", colour: "--chart-3" },
    ]);
  });

  it("wraps back to the first token past the eighth series rather than running off the palette", () => {
    // Arrange
    const series = Array.from({ length: 9 }, (_, i) => ({ name: `c${i}` }));

    // Act
    const colours = plotLegendEntries(series).map((entry) => entry.colour);

    // Assert
    expect(colours[0]).toBe("--chart-1");
    expect(colours[7]).toBe("--chart-8");
    expect(colours[8]).toBe("--chart-1");
  });
});

describe("isShowCodeShortcut — Alt+C — reveals the code, and nothing else does", () => {
  it("matches Alt+C in either case", () => {
    // Arrange
    const events = [keyEvent({ altKey: true }), keyEvent({ altKey: true, key: "C" })];

    // Act
    const matches = events.map(isShowCodeShortcut);

    // Assert
    expect(matches).toEqual([true, true]);
  });

  it("rejects a bare C and every Alt+C carrying a second modifier", () => {
    // Arrange
    const events = [
      keyEvent({}),
      keyEvent({ altKey: true, ctrlKey: true }),
      keyEvent({ altKey: true, metaKey: true }),
      keyEvent({ altKey: true, shiftKey: true }),
      keyEvent({ altKey: true, key: "k" }),
    ];

    // Act
    const matches = events.map(isShowCodeShortcut);

    // Assert
    expect(matches).toEqual([false, false, false, false, false]);
  });

  it("plotLegendEntries — series carrying their own colours — uses them instead of mark order", () => {
    const series = [
      { name: "session-a|lap:1", label: "Lap 1", unit: "s", colour: "--chart-3" },
      { name: "session-a|lap:2", label: "Lap 2", unit: "s", colour: "--chart-5" },
    ];

    const entries = plotLegendEntries(series);

    expect(entries).toEqual([
      { key: "session-a|lap:1", label: "Lap 1 (s)", colour: "--chart-3" },
      { key: "session-a|lap:2", label: "Lap 2 (s)", colour: "--chart-5" },
    ]);
  });
});
