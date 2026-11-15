/**
 * Display units for readouts (video overlay spec §7a, Isaac 2026-11-15).
 * The engine stays metric; a readout converts the one value it draws, at
 * draw time, never a channel and never stored. Two choices, everything else
 * metric: distance and speed (km or mi), and temperature (C or F). Pure.
 */

/** The person's display-unit choices (C3 §3.10, after the split). */
export interface DisplayUnits {
  /** `"km"`: km, km/h. `"mi"`: mi, mph. */
  distance: "km" | "mi";
  /** `"C"`: °C. `"F"`: °F. */
  temperature: "C" | "F";
}

/** How to show a value recorded in some unit: `shown = value * scale + offset`, labelled `unit`. */
export interface DisplayConversion {
  /** The label to show. */
  unit: string | null;
  /** Multiplier applied to the recorded value. */
  scale: number;
  /** Added after scaling (only temperature has one). */
  offset: number;
}

const KM_PER_MI = 1.609344;

/** The conversion from the recorded `unit` to what `prefs` shows. A unit
 *  outside the two choices, or already in the chosen system, is shown as
 *  recorded (`scale` 1, `offset` 0). Metres never convert (Isaac,
 *  2026-11-15), so a zoomed distance axis scales cleanly. */
export function displayConversion(unit: string | null, prefs: DisplayUnits): DisplayConversion {
  const same: DisplayConversion = { unit, scale: 1, offset: 0 };
  if (unit === null) return same;
  if (prefs.distance === "mi") {
    if (unit === "km/h") return { unit: "mph", scale: 1 / KM_PER_MI, offset: 0 };
    if (unit === "m/s") return { unit: "mph", scale: 3600 / 1000 / KM_PER_MI, offset: 0 };
    if (unit === "km") return { unit: "mi", scale: 1 / KM_PER_MI, offset: 0 };
  }
  if (prefs.temperature === "F" && (unit === "°C" || unit === "degC" || unit === "C")) {
    return { unit: "°F", scale: 9 / 5, offset: 32 };
  }
  return same;
}

/** `value` shown through `c`; `null` stays `null`. */
export function applyConversion(value: number | null, c: DisplayConversion): number | null {
  return value === null ? null : value * c.scale + c.offset;
}
