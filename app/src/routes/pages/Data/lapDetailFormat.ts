import type { LapNeutralZoneVisit, LapSector } from "../../../ipc/catalog";

/** Pure display formatters for `session.json`'s typed `sectors[]`/
 *  `neutral_zone_visits[]` (C3 §6 item 11, closed 2026-09-06). No IPC, no
 *  engine computation (CLAUDE.md §2: "Rust = numbers, JS = pictures").
 *
 *  `null` means "the session-side lap this row draws from is absent"
 *  (`DetailLapRow.sectors`/`neutralZoneVisits` is null only for a
 *  catalog-only lap, R53 Data Q3/Q4) and reads as "—" — an honest "no data
 *  to show". An empty array means the lap really has no sectors/neutral
 *  zone visits and reads as "" (blank), never a fabricated "—" placeholder
 *  where data now genuinely exists (R53 Data Q4/Q5). */

/** One sector's duration in seconds, from its UTC-ms bounds. */
function sectorSeconds(sector: LapSector): number {
  return (sector.end_ms - sector.start_ms) / 1000;
}

/** One neutral-zone visit's duration in seconds, from its UTC-ms bounds. */
function visitSeconds(visit: LapNeutralZoneVisit): number {
  return (visit.exit_ms - visit.enter_ms) / 1000;
}

/** Formats a lap's `sectors[]` as `"S1 12.345s, S2 10.010s"` — "—" when the
 *  session-side lap is absent (`sectors === null`), "" when the lap has no
 *  sectors at all. Never fabricates a value for a missing/negative
 *  duration; a sector whose bounds are inverted (`end_ms < start_ms`, data
 *  the catalog itself should never produce) still renders its literal
 *  (negative) seconds rather than silently hiding the sector. */
export function formatSectors(sectors: LapSector[] | null): string {
  if (sectors === null) return "—";
  if (sectors.length === 0) return "";
  return sectors.map((s) => `${s.name} ${sectorSeconds(s).toFixed(3)}s`).join(", ");
}

/** Formats a lap's `neutral_zone_visits[]` as `"Pit 5.0s"` — "—" when the
 *  session-side lap is absent (`visits === null`), "" when the lap recorded
 *  no neutral-zone visits at all. */
export function formatNeutralZoneVisits(visits: LapNeutralZoneVisit[] | null): string {
  if (visits === null) return "—";
  if (visits.length === 0) return "";
  return visits.map((v) => `${v.name} ${visitSeconds(v).toFixed(1)}s`).join(", ");
}
