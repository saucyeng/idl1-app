import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFS, serializePrefs, type Prefs } from "./prefs";
import { migrationPlan, runPrefsMigration, type PrefsMigrationDeps } from "./prefsMigration";
import type { EngineSettings } from "./settingsBackend";

const NON_DEFAULT_LOCAL_DOC = serializePrefs({
  engine: { data_dir: null, rider_name: "Isaac", unit_system: "metric" },
  ui: { last_section: "sync", section_list_width_px: 260, theme: "dark", output_register: null, paper_theme: "app" },
} as Prefs);

describe("migrationPlan", () => {
  it("migrationPlan — already migrated — skip regardless of documents", () => {
    // Arrange / Act
    const plan = migrationPlan(NON_DEFAULT_LOCAL_DOC, DEFAULT_PREFS.engine, true);

    // Assert
    expect(plan.action).toBe("skip");
  });

  it("migrationPlan — no local document — skip", () => {
    // Arrange / Act
    const plan = migrationPlan(null, DEFAULT_PREFS.engine, false);

    // Assert
    expect(plan.action).toBe("skip");
  });

  it("migrationPlan — malformed local document — skip, same as no document", () => {
    // Arrange / Act
    const plan = migrationPlan("not json{{{", DEFAULT_PREFS.engine, false);

    // Assert
    expect(plan.action).toBe("skip");
  });

  it("migrationPlan — engine still at every default on disk — imports both fields from local", () => {
    // Arrange / Act
    const plan = migrationPlan(NON_DEFAULT_LOCAL_DOC, DEFAULT_PREFS.engine, false);

    // Assert
    expect(plan.action).toBe("import");
    expect(plan.settings).toEqual({ data_dir: null, rider_name: "Isaac", unit_system: "metric" });
  });

  it("migrationPlan — settings.json wins on conflict — rider_name already non-default on disk is not overwritten", () => {
    // Arrange
    const engineOnDisk: EngineSettings = { data_dir: null, rider_name: "Already Set", unit_system: "imperial" };

    // Act
    const plan = migrationPlan(NON_DEFAULT_LOCAL_DOC, engineOnDisk, false);

    // Assert: unit_system is still at its default, so it imports; rider_name
    // was deliberately set and is kept.
    expect(plan.action).toBe("import");
    expect(plan.settings).toEqual({ data_dir: null, rider_name: "Already Set", unit_system: "metric" });
  });

  it("migrationPlan — settings.json wins on conflict — unit_system already non-default on disk is not overwritten", () => {
    // Arrange
    const engineOnDisk: EngineSettings = { data_dir: null, rider_name: "", unit_system: "metric" };

    // Act
    const plan = migrationPlan(NON_DEFAULT_LOCAL_DOC, engineOnDisk, false);

    // Assert: rider_name is still at its default, so it imports; unit_system
    // was deliberately set and is kept.
    expect(plan.action).toBe("import");
    expect(plan.settings).toEqual({ data_dir: null, rider_name: "Isaac", unit_system: "metric" });
  });

  it("migrationPlan — every field already non-default on disk — skip, nothing left to import", () => {
    // Arrange
    const engineOnDisk: EngineSettings = { data_dir: null, rider_name: "Already Set", unit_system: "metric" };

    // Act
    const plan = migrationPlan(NON_DEFAULT_LOCAL_DOC, engineOnDisk, false);

    // Assert
    expect(plan.action).toBe("skip");
  });

  it("migrationPlan — local document itself is at defaults — skip, nothing to import", () => {
    // Arrange
    const local = serializePrefs(DEFAULT_PREFS);

    // Act
    const plan = migrationPlan(local, DEFAULT_PREFS.engine, false);

    // Assert
    expect(plan.action).toBe("skip");
  });

  it("migrationPlan — never touches data_dir — echoes the on-disk value even when local holds a different one", () => {
    // Arrange
    const engineOnDisk: EngineSettings = { data_dir: "D:\\on-disk", rider_name: "", unit_system: "imperial" };
    const local = serializePrefs({
      engine: { data_dir: "D:\\from-local-storage", rider_name: "Isaac", unit_system: "imperial" },
      ui: DEFAULT_PREFS.ui,
    } as Prefs);

    // Act
    const plan = migrationPlan(local, engineOnDisk, false);

    // Assert
    expect(plan.settings?.data_dir).toBe("D:\\on-disk");
  });

  it("migrationPlan — skipped because settings.json already held a different value — listed with both values", () => {
    // Arrange
    const engineOnDisk: EngineSettings = { data_dir: null, rider_name: "Already Set", unit_system: "imperial" };

    // Act
    const plan = migrationPlan(NON_DEFAULT_LOCAL_DOC, engineOnDisk, false);

    // Assert: rider_name is kept (already non-default), so it is listed with
    // both the kept and discarded values; unit_system is imported instead.
    expect(plan.skipped).toEqual([{ field: "rider_name", onDisk: "Already Set", local: "Isaac" }]);
  });

  it("migrationPlan — a field that was imported — not listed as skipped", () => {
    // Arrange
    const engineOnDisk: EngineSettings = { data_dir: null, rider_name: "Already Set", unit_system: "imperial" };

    // Act
    const plan = migrationPlan(NON_DEFAULT_LOCAL_DOC, engineOnDisk, false);

    // Assert: unit_system was imported (was at its default), so it is not
    // also reported as skipped.
    expect(plan.skipped.some((field) => field.field === "unit_system")).toBe(false);
  });

  it("migrationPlan — on-disk value already equals the local value — not listed as skipped", () => {
    // Arrange: rider_name is non-default on disk but matches local exactly,
    // so nothing was actually discarded.
    const engineOnDisk: EngineSettings = { data_dir: null, rider_name: "Isaac", unit_system: "imperial" };

    // Act
    const plan = migrationPlan(NON_DEFAULT_LOCAL_DOC, engineOnDisk, false);

    // Assert
    expect(plan.skipped.some((field) => field.field === "rider_name")).toBe(false);
  });
});

/** Builds a {@link PrefsMigrationDeps} with fake defaults; `isMigrated`
 *  starts `false` and `markMigrated` flips it, so a test can assert
 *  at-most-once behaviour by calling {@link runPrefsMigration} twice against
 *  the same deps object. */
function fakeDeps(overrides?: Partial<PrefsMigrationDeps>): PrefsMigrationDeps {
  let migrated = false;
  return {
    isMigrated: () => migrated,
    markMigrated: () => {
      migrated = true;
    },
    readLocal: () => Promise.resolve(NON_DEFAULT_LOCAL_DOC),
    writeLocal: () => Promise.resolve(),
    getSettings: () => Promise.resolve(DEFAULT_PREFS.engine),
    setSettings: (settings: EngineSettings) => Promise.resolve(settings),
    ...overrides,
  };
}

describe("runPrefsMigration", () => {
  it("runPrefsMigration — already migrated — already-done, setSettings never called", async () => {
    // Arrange
    const setSettings = vi.fn((settings: EngineSettings) => Promise.resolve(settings));
    const deps = fakeDeps({ isMigrated: () => true, setSettings });

    // Act
    const outcome = await runPrefsMigration(deps);

    // Assert
    expect(outcome).toEqual({ kind: "already-done" });
    expect(setSettings).not.toHaveBeenCalled();
  });

  it("runPrefsMigration — no local document — nothing-to-migrate, setSettings never called", async () => {
    // Arrange
    const setSettings = vi.fn((settings: EngineSettings) => Promise.resolve(settings));
    const deps = fakeDeps({ readLocal: () => Promise.resolve(null), setSettings });

    // Act
    const outcome = await runPrefsMigration(deps);

    // Assert
    expect(outcome).toEqual({ kind: "nothing-to-migrate", skipped: [] });
    expect(setSettings).not.toHaveBeenCalled();
  });

  it("runPrefsMigration — engine at defaults on disk, local holds real values — migrated, sets the flag, strips only the engine half locally", async () => {
    // Arrange
    let storedLocal = NON_DEFAULT_LOCAL_DOC;
    const deps = fakeDeps({
      readLocal: () => Promise.resolve(storedLocal),
      writeLocal: (text: string) => {
        storedLocal = text;
        return Promise.resolve();
      },
    });

    // Act
    const outcome = await runPrefsMigration(deps);
    const rewritten = JSON.parse(storedLocal);

    // Assert
    expect(outcome).toEqual({ kind: "migrated", imported: { rider_name: "Isaac", unit_system: "metric" }, skipped: [] });
    expect(deps.isMigrated()).toBe(true);
    expect(rewritten.engine).toBeUndefined();
    expect(rewritten.ui).toEqual({ last_section: "sync", section_list_width_px: 260, theme: "dark", output_register: null, paper_theme: "app" });
  });

  it("runPrefsMigration — local document has an unknown key nested inside engine — the local rewrite keeps it, dropping only the imported fields", async () => {
    // Arrange
    const localWithUnknownEngineKey = serializePrefs({
      engine: { data_dir: null, rider_name: "Isaac", unit_system: "metric", future_engine_field: "kept-through-migration" },
      ui: { last_section: "sync", section_list_width_px: 260, theme: "dark", output_register: null, paper_theme: "app" },
    } as Prefs);
    let storedLocal = localWithUnknownEngineKey;
    const deps = fakeDeps({
      readLocal: () => Promise.resolve(storedLocal),
      writeLocal: (text: string) => {
        storedLocal = text;
        return Promise.resolve();
      },
    });

    // Act
    const outcome = await runPrefsMigration(deps);
    const rewritten = JSON.parse(storedLocal);

    // Assert
    expect(outcome.kind).toBe("migrated");
    expect(rewritten.engine.future_engine_field).toBe("kept-through-migration");
    expect(rewritten.engine.rider_name).toBeUndefined();
    expect(rewritten.ui).toEqual({ last_section: "sync", section_list_width_px: 260, theme: "dark", output_register: null, paper_theme: "app" });
  });

  it("runPrefsMigration — a setSettings rejection — failed, the flag is not set, local document untouched", async () => {
    // Arrange
    const writeLocal = vi.fn(() => Promise.resolve());
    const deps = fakeDeps({
      setSettings: () => Promise.reject(new Error("disk full")),
      writeLocal,
    });

    // Act
    const outcome = await runPrefsMigration(deps);

    // Assert
    expect(outcome.kind).toBe("failed");
    expect(deps.isMigrated()).toBe(false);
    expect(writeLocal).not.toHaveBeenCalled();
  });

  it("runPrefsMigration — a setSettings rejection then a retry — the second call runs the import again (flag never set)", async () => {
    // Arrange
    let attempts = 0;
    const setSettings = vi.fn((settings: EngineSettings) => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error("disk full")) : Promise.resolve(settings);
    });
    const deps = fakeDeps({ setSettings });

    // Act
    const first = await runPrefsMigration(deps);
    const second = await runPrefsMigration(deps);

    // Assert
    expect(first.kind).toBe("failed");
    expect(second.kind).toBe("migrated");
    expect(deps.isMigrated()).toBe(true);
  });

  it("runPrefsMigration — nothing at its default on disk — nothing-to-migrate, ui keys never deleted", async () => {
    // Arrange
    const writeLocal = vi.fn(() => Promise.resolve());
    const deps = fakeDeps({
      getSettings: () => Promise.resolve({ data_dir: null, rider_name: "Already Set", unit_system: "metric" }),
      writeLocal,
    });

    // Act
    const outcome = await runPrefsMigration(deps);

    // Assert
    expect(outcome).toEqual({
      kind: "nothing-to-migrate",
      skipped: [{ field: "rider_name", onDisk: "Already Set", local: "Isaac" }],
    });
    expect(writeLocal).not.toHaveBeenCalled();
  });
});
