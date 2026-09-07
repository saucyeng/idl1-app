import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFS, parsePrefs, serializePrefs } from "./prefs";
import { createPrefsStore, memoryBackend } from "./prefsStore";
import { settingsBackend, type EngineSettings, type SettingsBackendDeps } from "./settingsBackend";

/** Builds a {@link SettingsBackendDeps} with sensible fake defaults,
 *  overridable per test. `getSettings`/`setSettings` default to resolving
 *  with {@link DEFAULT_PREFS}.engine so a test only has to override what it
 *  cares about. */
function fakeDeps(overrides?: Partial<SettingsBackendDeps>): SettingsBackendDeps {
  return {
    getSettings: vi.fn(() => Promise.resolve(DEFAULT_PREFS.engine)),
    setSettings: vi.fn((settings: EngineSettings) => Promise.resolve(settings)),
    local: memoryBackend(),
    ...overrides,
  };
}

describe("settingsBackend — read()", () => {
  it("read() merges engine from getSettings over ui from local", async () => {
    // Arrange
    const local = memoryBackend(
      serializePrefs(parsePrefs({ engine: { rider_name: "stale" }, ui: { last_section: "sync", section_list_width_px: 260 } })),
    );
    const deps = fakeDeps({
      getSettings: () => Promise.resolve({ data_dir: null, rider_name: "Isaac", unit_system: "metric" }),
      local,
    });
    const backend = settingsBackend(deps);

    // Act
    const raw = await backend.read();
    const prefs = parsePrefs(JSON.parse(raw as string));

    // Assert
    expect(prefs.engine.rider_name).toBe("Isaac");
    expect(prefs.engine.unit_system).toBe("metric");
    expect(prefs.ui.last_section).toBe("sync");
    expect(prefs.ui.section_list_width_px).toBe(260);
  });

  it("read() preserves unknown keys from the local document", async () => {
    // Arrange
    const local = memoryBackend(
      JSON.stringify({
        future_top_level: "kept",
        engine: { rider_name: "Isaac", future_engine_field: "kept-too" },
        ui: { last_section: "profile", section_list_width_px: 220 },
      }),
    );
    const deps = fakeDeps({ local });
    const backend = settingsBackend(deps);

    // Act
    const raw = await backend.read();
    const parsedBack = JSON.parse(raw as string);

    // Assert
    expect(parsedBack.future_top_level).toBe("kept");
    expect(parsedBack.engine.future_engine_field).toBe("kept-too");
  });

  it("read() with no local document yields defaults for ui", async () => {
    // Arrange
    const deps = fakeDeps({ local: memoryBackend() });
    const backend = settingsBackend(deps);

    // Act
    const raw = await backend.read();
    const prefs = parsePrefs(JSON.parse(raw as string));

    // Assert
    expect(prefs.ui).toEqual(DEFAULT_PREFS.ui);
  });

  it("getSettings rejecting degrades to the local/default engine half", async () => {
    // Arrange
    const local = memoryBackend(serializePrefs(parsePrefs({ engine: { rider_name: "from-local" } })));
    const deps = fakeDeps({
      getSettings: () => Promise.reject(new Error("get_settings unavailable")),
      local,
    });
    const backend = settingsBackend(deps);

    // Act
    const raw = await backend.read();
    const prefs = parsePrefs(JSON.parse(raw as string));

    // Assert
    expect(prefs.engine.rider_name).toBe("from-local");
  });

  it("getSettings rejecting with no local document — degrades all the way to DEFAULT_PREFS.engine", async () => {
    // Arrange
    const deps = fakeDeps({
      getSettings: () => Promise.reject(new Error("get_settings unavailable")),
      local: memoryBackend(),
    });
    const backend = settingsBackend(deps);

    // Act
    const raw = await backend.read();
    const prefs = parsePrefs(JSON.parse(raw as string));

    // Assert
    expect(prefs.engine).toEqual(DEFAULT_PREFS.engine);
  });
});

describe("settingsBackend — write()", () => {
  it("write() sends exactly rider_name/unit_system (plus the echoed data_dir) to setSettings", async () => {
    // Arrange
    const setSettings = vi.fn((settings: EngineSettings) => Promise.resolve(settings));
    const deps = fakeDeps({
      getSettings: () => Promise.resolve({ data_dir: "D:\\race-data", rider_name: "", unit_system: "imperial" }),
      setSettings,
    });
    const backend = settingsBackend(deps);
    await backend.read(); // seeds lastKnownEngine.data_dir from getSettings

    // Act
    await backend.write(
      serializePrefs(parsePrefs({ engine: { rider_name: "Isaac", unit_system: "metric" }, ui: DEFAULT_PREFS.ui })),
    );

    // Assert
    expect(setSettings).toHaveBeenCalledWith({ data_dir: "D:\\race-data", rider_name: "Isaac", unit_system: "metric" });
  });

  it("write() also persists the whole document locally", async () => {
    // Arrange
    const local = memoryBackend();
    const deps = fakeDeps({ local });
    const backend = settingsBackend(deps);

    // Act
    await backend.write(
      serializePrefs(
        parsePrefs({
          future_top_level: "kept",
          engine: { rider_name: "Isaac", unit_system: "metric" },
          ui: { last_section: "sync", section_list_width_px: 260 },
        }),
      ),
    );
    const storedRaw = await local.read();
    const stored = JSON.parse(storedRaw as string);

    // Assert
    expect(stored.engine.rider_name).toBe("Isaac");
    expect(stored.engine.unit_system).toBe("metric");
    expect(stored.ui).toEqual({ last_section: "sync", section_list_width_px: 260, theme: "dark", output_register: null });
    expect(stored.future_top_level).toBe("kept");
  });

  it("write() preserves an unknown key nested inside engine that read() had seen locally", async () => {
    // Arrange: seed the local document with an engine-nested unknown key,
    // the same way read() would have left it there (a newer app's field),
    // with getSettings agreeing on the three known fields so read()'s merge
    // does not itself change rider_name/unit_system.
    const local = memoryBackend(
      JSON.stringify({
        engine: { rider_name: "Isaac", unit_system: "imperial", future_engine_field: "kept-through-write" },
        ui: DEFAULT_PREFS.ui,
      }),
    );
    const deps = fakeDeps({
      getSettings: () => Promise.resolve({ data_dir: null, rider_name: "Isaac", unit_system: "imperial" }),
      local,
    });
    const backend = settingsBackend(deps);

    // Act: write() is handed exactly the document read() just returned.
    const raw = await backend.read();
    await backend.write(raw as string);
    const storedRaw = await local.read();
    const stored = JSON.parse(storedRaw as string);

    // Assert
    expect(stored.engine.future_engine_field).toBe("kept-through-write");
    expect(stored.engine.rider_name).toBe("Isaac");
  });

  it("a setSettings rejection propagates out of write()", async () => {
    // Arrange
    const deps = fakeDeps({ setSettings: () => Promise.reject(new Error("disk full")) });
    const backend = settingsBackend(deps);

    // Act / Assert
    await expect(backend.write(serializePrefs(DEFAULT_PREFS))).rejects.toThrow("disk full");
  });
});

describe("settingsBackend — through createPrefsStore", () => {
  it("a full createPrefsStore(settingsBackend(...)) round trip (set({engine}) → get()) returns the value setSettings returned, not the one it was sent", async () => {
    // Arrange: a fake server that normalizes rider_name on write and echoes
    // the normalized value back from getSettings from then on.
    // createPrefsStore caches the patch it was given eagerly (before its
    // write settles) and never re-reads afterwards, so this round trip is
    // observed across a fresh store construction — the same as a page
    // reload — not by re-calling get() on the writer's own store.
    let persistedEngine: EngineSettings = DEFAULT_PREFS.engine;
    const getSettings = vi.fn(() => Promise.resolve(persistedEngine));
    const setSettings = vi.fn((sent: EngineSettings) => {
      persistedEngine = { ...sent, rider_name: "Server-Normalized Name" };
      return Promise.resolve(persistedEngine);
    });
    const local = memoryBackend();
    const writerStore = createPrefsStore(settingsBackend({ getSettings, setSettings, local }));

    // Act
    await writerStore.set({ engine: { data_dir: null, rider_name: "Isaac", unit_system: "metric" } });
    const readerStore = createPrefsStore(settingsBackend({ getSettings, setSettings, local }));
    const prefs = await readerStore.get();

    // Assert
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ rider_name: "Isaac" }));
    expect(prefs.engine.rider_name).toBe("Server-Normalized Name");
  });
});
