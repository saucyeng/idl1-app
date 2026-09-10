import { describe, expect, it } from "vitest";

import { DEFAULT_PREFS, parsePrefs, serializePrefs } from "./prefs";

describe("parsePrefs", () => {
  it("parsePrefs — a full document — every field typed, values preserved", () => {
    // Arrange
    const raw = {
      engine: { data_dir: "D:\\race-data", rider_name: "Isaac", unit_system: "metric" },
      ui: { last_section: "sync", section_list_width_px: 240 },
    };

    // Act
    const prefs = parsePrefs(raw);

    // Assert
    expect(prefs.engine.data_dir).toBe("D:\\race-data");
    expect(prefs.engine.rider_name).toBe("Isaac");
    expect(prefs.engine.unit_system).toBe("metric");
    expect(prefs.ui.last_section).toBe("sync");
    expect(prefs.ui.section_list_width_px).toBe(240);
  });

  it("parsePrefs — an empty object — DEFAULT_PREFS exactly", () => {
    // Arrange
    const raw = {};

    // Act
    const prefs = parsePrefs(raw);

    // Assert
    expect(prefs).toEqual(DEFAULT_PREFS);
  });

  it('parsePrefs — unit_system "metric" — kept; "furlongs" — falls back to imperial (C4 §1\'s default), never throws', () => {
    // Arrange
    const metricRaw = { engine: { unit_system: "metric" } };
    const bogusRaw = { engine: { unit_system: "furlongs" } };

    // Act
    const metricPrefs = parsePrefs(metricRaw);
    const bogusPrefs = parsePrefs(bogusRaw);

    // Assert
    expect(metricPrefs.engine.unit_system).toBe("metric");
    expect(bogusPrefs.engine.unit_system).toBe("imperial");
  });

  it('parsePrefs — rider_name absent — "" (C4 §1: "" means not set, there is no null)', () => {
    // Arrange
    const raw = { engine: {} };

    // Act
    const prefs = parsePrefs(raw);

    // Assert
    expect(prefs.engine.rider_name).toBe("");
  });

  it("parsePrefs — data_dir absent — null (C4 §1: absent means the platform default)", () => {
    // Arrange
    const raw = { engine: {} };

    // Act
    const prefs = parsePrefs(raw);

    // Assert
    expect(prefs.engine.data_dir).toBeNull();
  });

  it("parsePrefs — a key from a newer version — preserved through serializePrefs, not dropped", () => {
    // Arrange
    const raw = { engine: { rider_name: "Isaac", future_field: "kept" }, future_top_level: true };

    // Act
    const prefs = parsePrefs(raw);
    const serialized = serializePrefs(prefs);
    const parsedBack = JSON.parse(serialized);

    // Assert
    expect(parsedBack.engine.future_field).toBe("kept");
    expect(parsedBack.future_top_level).toBe(true);
  });

  it("parsePrefs — null, a string, an array — DEFAULT_PREFS each time, never throws", () => {
    // Arrange
    const inputs: unknown[] = [null, "not an object", [1, 2, 3]];

    // Act
    const results = inputs.map((input) => parsePrefs(input));

    // Assert
    results.forEach((result) => expect(result).toEqual(DEFAULT_PREFS));
  });

  it("parsePrefs then serializePrefs — a full document — round-trips to the same parsed value", () => {
    // Arrange
    const raw = {
      engine: { data_dir: "D:\\race-data", rider_name: "Isaac", unit_system: "metric" },
      ui: { last_section: "data", section_list_width_px: 260 },
    };

    // Act
    const first = parsePrefs(raw);
    const roundTripped = parsePrefs(JSON.parse(serializePrefs(first)));

    // Assert
    expect(roundTripped).toEqual(first);
  });

  it("parsePrefs — theme and output_register — round-trip through serializePrefs unchanged", () => {
    // Arrange
    const raw = {
      ui: { last_section: "theme", section_list_width_px: 220, theme: "system", output_register: "studio" },
    };

    // Act
    const prefs = parsePrefs(raw);
    const roundTripped = parsePrefs(JSON.parse(serializePrefs(prefs)));

    // Assert
    expect(prefs.ui.theme).toBe("system");
    expect(prefs.ui.output_register).toBe("studio");
    expect(roundTripped.ui.theme).toBe("system");
    expect(roundTripped.ui.output_register).toBe("studio");
  });

  it("parsePrefs — an unknown theme or output_register value — falls back to the default, never throws", () => {
    // Arrange
    const raw = { ui: { theme: "sepia", output_register: "vellum" } };

    // Act
    const prefs = parsePrefs(raw);

    // Assert
    expect(prefs.ui.theme).toBe("dark");
    expect(prefs.ui.output_register).toBeNull();
  });

  it("parsePrefs — ui absent — theme defaults to dark, output_register defaults to null (no choice made)", () => {
    // Arrange
    const raw = {};

    // Act
    const prefs = parsePrefs(raw);

    // Assert
    expect(prefs.ui.theme).toBe("dark");
    expect(prefs.ui.output_register).toBeNull();
  });

  it("parsePrefs — paper_theme absent (an older app's document) — defaults to app", () => {
    // Arrange
    const raw = { ui: { theme: "dark" } };

    // Act
    const prefs = parsePrefs(raw);

    // Assert
    expect(prefs.ui.paper_theme).toBe("app");
  });

  it("parsePrefs — a stored paper_theme — kept as written", () => {
    // Arrange
    const raw = { ui: { paper_theme: "light" } };

    // Act
    const prefs = parsePrefs(raw);

    // Assert
    expect(prefs.ui.paper_theme).toBe("light");
  });

  it("parsePrefs — an unknown paper_theme value — falls back to app, never throws", () => {
    // Arrange
    const raw = { ui: { paper_theme: "sepia" } };

    // Act
    const prefs = parsePrefs(raw);

    // Assert
    expect(prefs.ui.paper_theme).toBe("app");
  });

  it("serializePrefs — engine and ui halves — nested so the engine half can be lifted out unchanged for a future set_settings call", () => {
    // Arrange
    const prefs = parsePrefs({
      engine: { data_dir: null, rider_name: "Isaac", unit_system: "imperial" },
      ui: { last_section: "profile", section_list_width_px: 220 },
    });

    // Act
    const serialized = JSON.parse(serializePrefs(prefs));

    // Assert
    expect(serialized.engine).toEqual(prefs.engine);
    expect(serialized.ui).toEqual(prefs.ui);
  });
});
