import type { Gate, LapTiming, NeutralZone, SectorGate } from "../../../ipc/catalog";

/** Pure display formatters for `TrackDetail`'s track-write fields (C3 §3.2,
 *  ruling R86: `lap_timing`/`neutral_zones`/`sector_gates`/
 *  `reference_polyline`, no longer `unknown`). No IPC, no engine
 *  computation (CLAUDE.md §2: "Rust = numbers, JS = pictures"). Every
 *  coordinate is decimal degrees on the wire (R27) — these formatters
 *  render that unit explicitly (`°`) rather than a bare number, since a
 *  degree with six decimal places reads as an arbitrary float otherwise.
 *  No map is drawn here — the map-based gate placement editor stays wave 3
 *  (ruling R54); this pane is text-only. */

/** One coordinate to six decimal places with its unit, e.g. "51.500000°". */
function formatDegrees(value: number): string {
  return `${value.toFixed(6)}°`;
}

/** One gate as its two endpoints, e.g.
 *  "51.500000°, -0.100000° → 51.501000°, -0.099000°". */
export function formatGate(gate: Gate): string {
  return `${formatDegrees(gate.lat1)}, ${formatDegrees(gate.lon1)} → ${formatDegrees(gate.lat2)}, ${formatDegrees(gate.lon2)}`;
}

/** A track's lap-timing geometry. `null` (no geometry set yet) reads as
 *  "Not configured", never a blank cell. */
export function formatLapTiming(timing: LapTiming | null): string {
  if (timing === null) return "Not configured";
  if (timing.kind === "circuit") return `Circuit — start/finish ${formatGate(timing.start_finish)}`;
  return `Point to point — start ${formatGate(timing.start)}, finish ${formatGate(timing.finish)}`;
}

/** A track's `sector_gates[]`, one gate per line-equivalent entry joined
 *  by "; ". An empty list reads as "None", never a blank line — this pane
 *  has no other way to show "zero sectors configured" versus "still
 *  loading". */
export function formatSectorGates(gates: SectorGate[]): string {
  if (gates.length === 0) return "None";
  return gates.map((g) => `${g.name}: ${formatGate(g.gate)}`).join("; ");
}

/** A track's `neutral_zones[]`, one zone per entry joined by "; ". */
export function formatNeutralZones(zones: NeutralZone[]): string {
  if (zones.length === 0) return "None";
  return zones.map((z) => `${z.name} — enter ${formatGate(z.enter)}, exit ${formatGate(z.exit)}`).join("; ");
}

/** A track's `reference_polyline[]` as a point count plus its first and
 *  last coordinate, e.g. "42 points (51.500000°, -0.100000° → 51.510000°,
 *  -0.090000°)". An empty polyline reads as "No points recorded.",
 *  distinct from the count-only cases below. */
export function formatReferencePolylineSummary(points: { lat: number; lon: number }[]): string {
  if (points.length === 0) return "No points recorded.";
  const first = points[0];
  const last = points[points.length - 1];
  const noun = points.length === 1 ? "point" : "points";
  return `${points.length} ${noun} (${formatDegrees(first.lat)}, ${formatDegrees(first.lon)} → ${formatDegrees(last.lat)}, ${formatDegrees(last.lon)})`;
}

/** Label for the "Rescan N sessions" action `save_track`/`delete_track`
 *  offer via `stale_session_ids` (C3 §3.2, ruling R86) — "Rescan 1
 *  session" / "Rescan 3 sessions", never "Rescan 1 sessions". */
export function formatRescanSessionsLabel(count: number): string {
  return `Rescan ${count} session${count === 1 ? "" : "s"}`;
}
