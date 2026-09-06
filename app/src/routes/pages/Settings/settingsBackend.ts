import { DEFAULT_PREFS, parsePrefs, serializePrefs, type EnginePrefs, type Prefs } from "./prefs";
import type { PrefsBackend } from "./prefsStore";

/** The engine-mirroring shape this backend exchanges with `get_settings`/
 *  `set_settings` (C3 §3.10) — structurally identical to `app/src/ipc/app.ts`'s
 *  `AppSettings` (`data_dir`, `rider_name`, `unit_system`). Kept as an alias
 *  of {@link EnginePrefs} rather than importing `ipc/app.ts` directly, so this
 *  module never depends on the Tauri host and every test runs against plain
 *  injected functions. */
export type EngineSettings = EnginePrefs;

/** The IPC this backend needs, injected so the module never imports
 *  `app/src/ipc/app.ts` directly and every test runs without a Tauri host. */
export interface SettingsBackendDeps {
  /** `getSettings` (C3 §3.10) — never fails; a missing or malformed
   *  `settings.json` yields defaults. */
  getSettings: () => Promise<EngineSettings>;
  /** `setSettings` (C3 §3.10) — returns the state actually on disk after the
   *  write; ignores the `data_dir` field of its argument (R59 Q5). */
  setSettings: (settings: EngineSettings) => Promise<EngineSettings>;
  /** The `ui` half's own store — `localStorageBackend()` in production. */
  local: PrefsBackend;
}

/** Parses `raw` (a `PrefsBackend.read()` result) into a {@link Prefs},
 *  degrading to {@link DEFAULT_PREFS} for a missing or unparsable document —
 *  the same leniency `createPrefsStore`'s own `readInitial` applies, kept
 *  here too since this module never imports that private helper. */
async function readLocalPrefs(local: PrefsBackend): Promise<Prefs> {
  let raw: string | null;
  try {
    raw = await local.read();
  } catch {
    return DEFAULT_PREFS;
  }
  if (raw === null) {
    return DEFAULT_PREFS;
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFS;
  }
  return parsePrefs(parsedJson);
}

/** A `PrefsBackend` whose `engine` half round-trips through
 *  `get_settings`/`set_settings` (C3 §3.10) and whose `ui` half stays in the
 *  WebView's own storage (`deps.local`). `read()` merges the two into the one
 *  document shape `parsePrefs` already understands; `write()` splits it back
 *  (L7c Task 8, R77.4, R53 Settings Q1). */
export function settingsBackend(deps: SettingsBackendDeps): PrefsBackend {
  /** The last `engine` half this backend has actually seen confirmed by
   *  `get_settings`/`set_settings`. Used only as the `data_dir` value echoed
   *  on `write()` (R59 Q5: `set_settings` ignores that field, so this backend
   *  must never invent `null` for it) and as the fallback engine half when
   *  `get_settings` rejects. */
  let lastKnownEngine: EngineSettings = DEFAULT_PREFS.engine;

  return {
    async read(): Promise<string> {
      const localDoc = await readLocalPrefs(deps.local);
      let engine: EngineSettings;
      try {
        const fromServer = await deps.getSettings();
        engine = { ...localDoc.engine, ...fromServer };
        lastKnownEngine = fromServer;
      } catch {
        // getSettings should never reject (C3 §3.10), but a typed rejection
        // is still possible — degrade to whatever the local document holds
        // for engine (which itself already falls back to DEFAULT_PREFS.engine
        // when the local document has nothing), never to lastKnownEngine,
        // which could be stale.
        engine = localDoc.engine;
      }
      const merged: Prefs = { ...localDoc, engine, ui: localDoc.ui };
      return serializePrefs(merged);
    },

    async write(text: string): Promise<void> {
      const prefs = parsePrefs(JSON.parse(text));
      const toPersist: EngineSettings = {
        data_dir: lastKnownEngine.data_dir,
        rider_name: prefs.engine.rider_name,
        unit_system: prefs.engine.unit_system,
      };
      // Not caught here — a setSettings rejection must propagate out of
      // write() so createPrefsStore.set() is the one place that turns it
      // into a reported { ok: false } result.
      const persisted = await deps.setSettings(toPersist);
      lastKnownEngine = persisted;

      const toStoreLocally: Prefs = { ...prefs, engine: persisted, ui: prefs.ui };
      await deps.local.write(serializePrefs(toStoreLocally));
    },
  };
}
