import { DEFAULT_PREFS, parsePrefs, type EnginePrefs } from "./prefs";
import type { EngineSettings } from "./settingsBackend";

/** `localStorage` key marking the one-time engine-prefs import done, so
 *  {@link runPrefsMigration} runs at most once per machine (R78 L7c Task 8). */
export const MIGRATION_FLAG_KEY = "idl1.settings.prefs.migrated.v1";

/** The result of one {@link runPrefsMigration} call. */
export type MigrationOutcome =
  | { kind: "already-done" }
  | { kind: "nothing-to-migrate" }
  | { kind: "migrated"; imported: Partial<EnginePrefs> }
  | { kind: "failed"; error: unknown };

/** Decides whether an import should run, and what to send to `setSettings`
 *  if so. Pure — no IO — so every branch is unit-testable without fakes for
 *  storage or IPC.
 *
 * `settings.json` wins on conflict (R78 L7c Task 8, Q1): a field already
 * holding a non-default value on disk was set deliberately (by this app or
 * another `set_settings` caller) and is not overwritten by a possibly-stale
 * `localStorage` copy. Only fields still at their engine default on disk are
 * imported. `data_dir` is never touched — it is `setDataDir`'s key alone.
 *
 * @param localDocument - The raw text `PrefsBackend.read()` last returned for
 *  the `localStorage` copy, or `null`/unparsable JSON for "nothing to
 *  migrate".
 * @param engineOnDisk - The engine half currently on disk, from
 *  `get_settings`.
 * @param alreadyMigrated - Whether {@link MIGRATION_FLAG_KEY} is already set. */
export function migrationPlan(
  localDocument: string | null,
  engineOnDisk: EngineSettings,
  alreadyMigrated: boolean,
): { action: "skip" | "import"; settings?: EngineSettings; reason: string } {
  if (alreadyMigrated) {
    return { action: "skip", reason: "migration already ran on this machine" };
  }

  if (localDocument === null) {
    return { action: "skip", reason: "no localStorage prefs document to import from" };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(localDocument);
  } catch {
    return { action: "skip", reason: "localStorage prefs document is not valid JSON" };
  }

  const localEngine = parsePrefs(parsedJson).engine;

  const riderNameAtDefault = engineOnDisk.rider_name === DEFAULT_PREFS.engine.rider_name;
  const unitSystemAtDefault = engineOnDisk.unit_system === DEFAULT_PREFS.engine.unit_system;

  const importRiderName = riderNameAtDefault && localEngine.rider_name !== DEFAULT_PREFS.engine.rider_name;
  const importUnitSystem = unitSystemAtDefault && localEngine.unit_system !== DEFAULT_PREFS.engine.unit_system;

  if (!importRiderName && !importUnitSystem) {
    return { action: "skip", reason: "engine fields on disk are already set; nothing still at default to import" };
  }

  return {
    action: "import",
    settings: {
      data_dir: engineOnDisk.data_dir,
      rider_name: importRiderName ? localEngine.rider_name : engineOnDisk.rider_name,
      unit_system: importUnitSystem ? localEngine.unit_system : engineOnDisk.unit_system,
    },
    reason: "importing the engine fields still at their default on disk",
  };
}

/** The IO {@link runPrefsMigration} needs, injected so this module never
 *  imports `app/src/ipc/app.ts` directly. */
export interface PrefsMigrationDeps {
  /** Whether {@link MIGRATION_FLAG_KEY} is already set. */
  isMigrated: () => boolean;
  /** Sets {@link MIGRATION_FLAG_KEY}. Called only after `setSettings`
   *  resolves — a failed write must be retried on the next launch. */
  markMigrated: () => void;
  /** Reads the raw `localStorage` prefs document (the same text
   *  `localStorageBackend().read()` returns). */
  readLocal: () => Promise<string | null>;
  /** Rewrites the `localStorage` prefs document with the engine half
   *  removed, keeping `ui` and any unknown keys. */
  writeLocal: (text: string) => Promise<void>;
  /** `getSettings` (C3 §3.10). */
  getSettings: () => Promise<EngineSettings>;
  /** `setSettings` (C3 §3.10). */
  setSettings: (settings: EngineSettings) => Promise<EngineSettings>;
}

/** Runs the one-time import of the `localStorage` engine half into
 *  `settings.json`, per {@link migrationPlan}. Never throws — every failure
 *  path resolves to a `{ kind: "failed" }` outcome instead. */
export async function runPrefsMigration(deps: PrefsMigrationDeps): Promise<MigrationOutcome> {
  if (deps.isMigrated()) {
    return { kind: "already-done" };
  }

  let localDocument: string | null;
  let engineOnDisk: EngineSettings;
  try {
    localDocument = await deps.readLocal();
    engineOnDisk = await deps.getSettings();
  } catch (error) {
    return { kind: "failed", error };
  }

  const plan = migrationPlan(localDocument, engineOnDisk, false);
  if (plan.action === "skip" || plan.settings === undefined) {
    return { kind: "nothing-to-migrate" };
  }

  try {
    await deps.setSettings(plan.settings);
  } catch (error) {
    return { kind: "failed", error };
  }

  deps.markMigrated();

  const imported: Partial<EnginePrefs> = {};
  if (plan.settings.rider_name !== engineOnDisk.rider_name) {
    imported.rider_name = plan.settings.rider_name;
  }
  if (plan.settings.unit_system !== engineOnDisk.unit_system) {
    imported.unit_system = plan.settings.unit_system;
  }

  // Strip the imported engine half from the localStorage document, keeping
  // `ui`, any top-level unknown keys, and any unknown key nested inside
  // `engine` (a newer app version's field, which is not this migration's to
  // delete — only the three known engine fields moved to settings.json) —
  // a best-effort cleanup: `localDocument` is non-null here (migrationPlan
  // only returns "import" when it parsed), and a failure to rewrite it does
  // not lose data (the durable copy is already on disk via setSettings), it
  // only leaves the old engine keys in localStorage where settingsBackend's
  // getSettings-wins merge ignores them.
  try {
    const parsedLocal = parsePrefs(JSON.parse(localDocument as string));
    const { engine: _engine, ...rest } = parsedLocal;
    const { data_dir: _dataDir, rider_name: _riderName, unit_system: _unitSystem, ...unknownEngineKeys } =
      parsedLocal.engine as unknown as Record<string, unknown>;
    const rewritten = Object.keys(unknownEngineKeys).length > 0 ? { ...rest, engine: unknownEngineKeys } : rest;
    await deps.writeLocal(JSON.stringify(rewritten));
  } catch {
    // Best-effort only, see above.
  }

  return { kind: "migrated", imported };
}
