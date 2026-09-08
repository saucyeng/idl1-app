/**
 * A node's port shape label (C2 §3.7.4), read from a completed evaluation's
 * `CellDefResult.value` — never guessed. §3.6 (the full shape grammar —
 * `[]`, `[t]`, `[f]`, `[lap]`, `[t,f]`, `[t,c9]`, …) is spec-only in `core`
 * today (the survey's gap list item 1): the wire carries only
 * `HostChannelRef`'s `{length, has_t}`, so this module can resolve exactly
 * the two shapes that pair distinguishes — `[]` (one sample) and `[t]`
 * (a time series) — and reports `"unknown"` for everything else, including
 * "no evaluation yet". A wrong shape shown with the same confidence as a
 * right one is worse than an honest blank (C2 §3.7.4, R135 Open Q1) — this
 * module has no fallback guess to reach for.
 */

import type { HostChannelRef } from "../../../../ipc/workbook";

/** The port shape labels this module can currently resolve. `"unknown"`
 *  covers both "not yet evaluated" and "core hasn't implemented the real
 *  §3.6 shape this value would carry" — the port never distinguishes the
 *  two, since neither can honestly display anything more specific. */
export type PortShape = "[]" | "[t]" | "unknown";

/**
 * Resolves `value` — a completed evaluation's `CellDefResult.value`, or
 * `null` for a definition with no result yet — to the port shape it
 * displays.
 */
export function shapeOf(value: HostChannelRef | null): PortShape {
  if (value === null) return "unknown";
  if (value.length === 1) return "[]";
  if (value.has_t && value.length > 1) return "[t]";
  return "unknown";
}
