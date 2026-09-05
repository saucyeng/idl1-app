import type { EnginePrefs } from "./prefs";

/** The unit system stored in {@link EnginePrefs.unit_system}. Re-exported
 *  here (rather than imported by callers from `./prefs`) so this module's
 *  consumers — the Units section and its test — need only this file. */
export type UnitSystem = EnginePrefs["unit_system"];

/** One row of {@link UNIT_SYSTEMS} — a toggle option and its display label. */
export interface UnitSystemOption {
  /** The value written to {@link EnginePrefs.unit_system}. */
  value: UnitSystem;
  /** Label shown on the toggle. */
  label: string;
}

/** The Units section's two-way toggle options, in display order. */
export const UNIT_SYSTEMS: readonly UnitSystemOption[] = [
  { value: "imperial", label: "Imperial" },
  { value: "metric", label: "Metric" },
];

/** The read-only unit summary shown under the toggle — every unit string the
 *  app's math channels default to for a given {@link UnitSystem}. Matches
 *  idl0's table (`app_settings.dart`'s `UnitSystem` doc comment) field for
 *  field, including force, power and spring rate, which idl0's own UI never
 *  rendered even though its engine already picked units for them. */
export interface UnitSummary {
  /** Speed unit: `"mph"` (imperial) or `"km/h"` (metric). */
  speed: string;
  /** Distance unit: `"ft/mi"` (imperial) or `"m/km"` (metric). */
  distance: string;
  /** Pressure unit: `"psi"` (imperial) or `"kPa"` (metric). */
  pressure: string;
  /** Temperature unit: `"°F"` (imperial) or `"°C"` (metric). */
  temperature: string;
  /** Force unit: `"lbf"` (imperial) or `"N"` (metric). */
  force: string;
  /** Power unit: `"hp"` (imperial) or `"W"` (metric). */
  power: string;
  /** Spring-rate unit: `"lb/in"` (imperial) or `"N/mm"` (metric). */
  springRate: string;
}

const IMPERIAL_SUMMARY: UnitSummary = {
  speed: "mph",
  distance: "ft/mi",
  pressure: "psi",
  temperature: "°F",
  force: "lbf",
  power: "hp",
  springRate: "lb/in",
};

const METRIC_SUMMARY: UnitSummary = {
  speed: "km/h",
  distance: "m/km",
  pressure: "kPa",
  temperature: "°C",
  force: "N",
  power: "W",
  springRate: "N/mm",
};

/** Returns the full unit summary for `system` — every field always
 *  populated, never a partial table.
 *
 * @param system - Which unit system's table to return. */
export function unitSummary(system: UnitSystem): UnitSummary {
  return system === "metric" ? METRIC_SUMMARY : IMPERIAL_SUMMARY;
}
