/** The engine half — field for field `idl_rs::store::settings::AppSettings`
 *  and C4 §1's `settings.json` keys, so the eventual `get_settings` /
 *  `set_settings` command needs no translation layer. */
export interface EnginePrefs {
  /** C4 §1's `<data>` override. `null` = the platform default. */
  data_dir: string | null;
  /** "" = not set (C4 §1; there is no null representation). */
  rider_name: string;
  /** Unit system used across the app. Engine default is `"imperial"`. */
  unit_system: "imperial" | "metric";
}

/** The UI-only half — never leaves this machine, never reaches the engine. */
export interface UiPrefs {
  /** Which Settings section the tab reopens on. */
  last_section: string;
  /** Wide-layout section-list width, in pixels. */
  section_list_width_px: number;
}

/** The full persisted-prefs document — the engine-mirroring half plus the
 *  UI-only half, kept as separate nested objects so the `engine` half can be
 *  lifted out unchanged for a future `set_settings` call. */
export interface Prefs {
  engine: EnginePrefs;
  ui: UiPrefs;
}

/** The document's defaults — every field absent or unreadable falls back to
 *  these, matching `idl_rs::store::settings::AppSettings::default()` for the
 *  engine half. */
export const DEFAULT_PREFS: Prefs = {
  engine: {
    data_dir: null,
    rider_name: "",
    unit_system: "imperial",
  },
  ui: {
    last_section: "profile",
    section_list_width_px: 220,
  },
};

/** Narrows `raw` to a plain JSON object, or `undefined` for anything else
 *  (including `null` and arrays) — the shared guard behind {@link parsePrefs}'s
 *  leniency. */
function asRecord(raw: unknown): Record<string, unknown> | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  return raw as Record<string, unknown>;
}

/** Parses the `engine` half, keeping any unknown sibling keys the raw object
 *  carries (a newer app version's fields) alongside the three typed ones. */
function parseEngine(raw: unknown): EnginePrefs {
  const record = asRecord(raw) ?? {};
  const dataDir = typeof record.data_dir === "string" ? record.data_dir : DEFAULT_PREFS.engine.data_dir;
  const riderName = typeof record.rider_name === "string" ? record.rider_name : DEFAULT_PREFS.engine.rider_name;
  const unitSystem = record.unit_system === "metric" ? "metric" : record.unit_system === "imperial" ? "imperial" : DEFAULT_PREFS.engine.unit_system;
  return { ...record, data_dir: dataDir, rider_name: riderName, unit_system: unitSystem } as EnginePrefs;
}

/** Parses the `ui` half, keeping any unknown sibling keys. */
function parseUi(raw: unknown): UiPrefs {
  const record = asRecord(raw) ?? {};
  const lastSection = typeof record.last_section === "string" ? record.last_section : DEFAULT_PREFS.ui.last_section;
  const widthPx = typeof record.section_list_width_px === "number" ? record.section_list_width_px : DEFAULT_PREFS.ui.section_list_width_px;
  return { ...record, last_section: lastSection, section_list_width_px: widthPx } as UiPrefs;
}

/** Parses a raw, untyped document (from `localStorage`, or eventually
 *  `get_settings`) into a {@link Prefs}. Lenient: an unreadable or partial
 *  document yields defaults for the keys it cannot supply, and keeps unknown
 *  keys — at both the top level and within `engine`/`ui` — so a newer app's
 *  settings survive an older one reading and rewriting the document. Never
 *  throws.
 *
 * @param raw - Anything — typically `JSON.parse` output, but this function
 *  does not assume it parsed successfully or landed on an object. */
export function parsePrefs(raw: unknown): Prefs {
  const record = asRecord(raw) ?? {};
  return {
    ...record,
    engine: parseEngine(record.engine),
    ui: parseUi(record.ui),
  } as Prefs;
}

/** Serializes a {@link Prefs} back to JSON text, preserving whatever unknown
 *  keys {@link parsePrefs} kept so a round trip through this module never
 *  drops data a newer app version wrote. */
export function serializePrefs(prefs: Prefs): string {
  return JSON.stringify(prefs);
}
