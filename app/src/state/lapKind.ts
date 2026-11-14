import type { LapKind } from "../ipc/catalog";

/**
 * Out and in laps (C1 §6 `laps[].kind`, 2026-11-13), shared by every lap
 * list in the app. Pure: no React, no IPC.
 *
 * The rule is the engine's (`idl_rs::table::resolve_baseline_row`, the
 * `[lap]` averages): an out lap, an in lap and an ignored lap are still
 * listed, but none of them is the fastest lap or counts in an average.
 * The kind itself is the engine's answer, read from `session.json`; this
 * module never works it out.
 */

/** The mark a lap list shows next to the lap number: `"Out"`, `"In"`,
 *  `"Long"` (likely two laps merged by a missed start/finish crossing), or
 *  `null` for an ordinary lap. */
export function lapKindMark(kind: LapKind): "Out" | "In" | "Long" | null {
  if (kind === "out") return "Out";
  if (kind === "in") return "In";
  if (kind === "long") return "Long";
  return null;
}

/** Whether a lap can be the fastest lap: an ordinary lap that is not
 *  ignored. */
export function countsForFastest(kind: LapKind, ignored: boolean): boolean {
  return kind === "normal" && !ignored;
}
