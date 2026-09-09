import type { ChannelSummary, LapChannelStat, LapNeutralZoneVisit, LapSector, LapSummary, SessionDetail } from "../../../ipc/catalog";
import { venueLabel } from "../../../state/selection";

/** One row of the session detail pane's channel table — a pure projection
 *  of one `ChannelSummary` (C3 §3.2). `nominalRateHz` is metadata only —
 *  never used to synthesize sample times (C1 §3.5); a renderer must label
 *  it as such, not just print the bare number. */
export interface DetailChannelRow {
  channelId: string;
  unit: string;
  sourceKind: string;
  channelKind: ChannelSummary["channel_kind"];
  /** u64, number of samples recorded on this channel. */
  sampleCount: number;
  /** Hz, metadata only — never used to synthesize time (C1 §3.5). */
  nominalRateHz: number;
}

/** One row of the session detail pane's lap table — the join of
 *  `SessionDetail.laps` (file-native `LapDetail`, keyed by `lap_number`) and
 *  `listLaps`'s catalog-cached `LapSummary`, also keyed by `lap_number`. A
 *  lap number present in only one source is never dropped — `presence`
 *  records which source(s) supplied it. */
export interface DetailLapRow {
  /** int, 1-based (C1 §6 laps[].lap_number). */
  lapNumber: number;
  presence: "both" | "session-only" | "catalog-only";
  /** ms — from whichever source carries this lap; null only if a future
   *  source omits `lap_time_ms` entirely, which neither current source does
   *  for a lap it reports. */
  lapTimeMs: number | null;
  /** `session.json`'s own `sectors[]` for this lap (C3 §6 item 11, closed) —
   *  null when the session-side lap is absent (never confused with an
   *  empty array, which means "this lap really has no sectors"). */
  sectors: LapSector[] | null;
  /** `session.json`'s own `neutral_zone_visits[]` for this lap (C3 §6 item
   *  11, closed) — null when the session-side lap is absent. */
  neutralZoneVisits: LapNeutralZoneVisit[] | null;
  /** Catalog `LapSummary.track_id` — null when the catalog-side lap is
   *  absent, or the catalog attributes no track to this lap. */
  trackId: string | null;
  /** Catalog `lap_summary` per-channel stats — empty when the catalog-side
   *  lap is absent. */
  channelStats: LapChannelStat[];
  /** `true` iff `lapNumber` is in `SessionDetail.ignored_lap_numbers`. */
  ignored: boolean;
  /** `true` for the session's reference lap: `SessionDetail
   *  .reference_lap_number` when set, otherwise (C1 §6: null means "use
   *  fastest lap") the fastest non-ignored lap by `lapTimeMs`. */
  isReference: boolean;
}

/** Everything the session detail pane draws, merging one `get_session`
 *  result (C1 `Session` + `session.json`) with `list_laps`'s catalog-cached
 *  `LapSummary[]` (C3 §3.2). Pure projection — no IPC, no engine
 *  computation. */
export interface DetailView {
  sessionId: string;
  rider: string;
  bike: string;
  bikeComment: string;
  /** `venue_name`, or "(none)" — the shared synthetic label
   *  ([[selection.ts]]'s `venueLabel`), so the list and the detail pane
   *  always agree. */
  venue: string;
  eventName: string;
  eventSession: string;
  shortComment: string;
  longComment: string;
  tag: string;
  channels: DetailChannelRow[];
  laps: DetailLapRow[];
}

/** A lap row's identity and time, the two fields the reference-lap and
 *  best-lap computations need — kept narrow so those helpers don't depend
 *  on the full `DetailLapRow` shape. */
interface TimedLap {
  lapNumber: number;
  lapTimeMs: number | null;
}

/** The fastest non-ignored lap's number, or null when no lap qualifies
 *  (every lap ignored, or none has a known time). C1 §6: a null
 *  `reference_lap_number` means "use fastest lap". */
function fastestNonIgnoredLapNumber(laps: readonly TimedLap[], ignored: ReadonlySet<number>): number | null {
  let bestLapNumber: number | null = null;
  let bestTimeMs = Number.POSITIVE_INFINITY;
  for (const lap of laps) {
    if (ignored.has(lap.lapNumber) || lap.lapTimeMs === null) continue;
    if (lap.lapTimeMs < bestTimeMs) {
      bestTimeMs = lap.lapTimeMs;
      bestLapNumber = lap.lapNumber;
    }
  }
  return bestLapNumber;
}

/** Merges one `get_session` result and its `list_laps` result into the
 *  session detail pane's view model (C3 §3.2). Every lap number present in
 *  either source gets exactly one row — a lap present in only one source is
 *  flagged via `presence`, never dropped. */
export function toDetailView(detail: SessionDetail, laps: LapSummary[]): DetailView {
  const ignored = new Set(detail.ignored_lap_numbers);
  const catalogByNumber = new Map(laps.map((l) => [l.lap_number, l]));
  const sessionByNumber = new Map(detail.laps.map((l) => [l.lap_number, l]));
  const lapNumbers = [...new Set([...sessionByNumber.keys(), ...catalogByNumber.keys()])].sort((a, b) => a - b);

  const withoutReference = lapNumbers.map((lapNumber) => {
    const sessionLap = sessionByNumber.get(lapNumber) ?? null;
    const catalogLap = catalogByNumber.get(lapNumber) ?? null;
    const presence: DetailLapRow["presence"] =
      sessionLap !== null && catalogLap !== null ? "both" : sessionLap !== null ? "session-only" : "catalog-only";

    return {
      lapNumber,
      presence,
      lapTimeMs: sessionLap?.lap_time_ms ?? catalogLap?.lap_time_ms ?? null,
      sectors: sessionLap === null ? null : sessionLap.sectors,
      neutralZoneVisits: sessionLap === null ? null : sessionLap.neutral_zone_visits,
      trackId: catalogLap?.track_id ?? null,
      channelStats: catalogLap?.channel_stats ?? [],
      ignored: ignored.has(lapNumber),
    };
  });

  const referenceLapNumber =
    detail.reference_lap_number ?? fastestNonIgnoredLapNumber(withoutReference, ignored);

  const lapRows: DetailLapRow[] = withoutReference.map((row) => ({
    ...row,
    isReference: row.lapNumber === referenceLapNumber,
  }));

  return {
    sessionId: detail.session_id,
    rider: detail.rider,
    bike: detail.bike,
    bikeComment: detail.bike_comment,
    venue: venueLabel(detail.venue_name),
    eventName: detail.event_name,
    eventSession: detail.event_session,
    shortComment: detail.short_comment,
    longComment: detail.long_comment,
    tag: detail.tag,
    channels: detail.channels.map((c) => ({
      channelId: c.channel_id,
      unit: c.unit,
      sourceKind: c.source_kind,
      channelKind: c.channel_kind,
      sampleCount: c.sample_count,
      nominalRateHz: c.nominal_rate_hz,
    })),
    laps: lapRows,
  };
}

/** The fastest non-ignored lap's time, in ms — null when every lap is
 *  ignored or none has a known `lapTimeMs` (never `Infinity`). */
export function bestLapMs(laps: DetailView["laps"]): number | null {
  let best: number | null = null;
  for (const lap of laps) {
    if (lap.ignored || lap.lapTimeMs === null) continue;
    if (best === null || lap.lapTimeMs < best) best = lap.lapTimeMs;
  }
  return best;
}
