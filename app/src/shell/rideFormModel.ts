import type { BikeLogView, RunningSheet } from "../ipc/bikelog";
import type { SessionDetail, SessionMetadataPatch } from "../ipc/catalog";
import { SHEET_SECTIONS } from "../routes/pages/Device/sheetFields";

/** Pure helpers for the ride form sheet (ride-form mockup, 2026-10-16). */

/** `detail`'s nine editable fields with the form's title and notes in
 *  place: title is `short_comment`, notes are `long_comment`. */
export function notesPatch(detail: SessionDetail, title: string, notes: string): SessionMetadataPatch {
  return {
    rider: detail.rider,
    bike: detail.bike,
    bike_comment: detail.bike_comment,
    venue_name: detail.venue_name,
    event_name: detail.event_name,
    event_session: detail.event_session,
    short_comment: title,
    long_comment: notes,
    tag: detail.tag,
  };
}

/** The ride facts strip: label and value. */
export interface Fact {
  label: string;
  value: string;
}

/** Laps, best lap and start time from the session; duration when the
 *  catalog knows it. Formatting only: every number comes from Rust. */
export function rideFacts(detail: SessionDetail, durationMs: number | null, fmt: { duration: (ms: number) => string; lap: (ms: number) => string; time: (ms: number) => string }): Fact[] {
  const counted = detail.laps.filter((l) => !detail.ignored_lap_numbers.includes(l.lap_number));
  const best = counted.length === 0 ? null : Math.min(...counted.map((l) => l.lap_time_ms));
  const facts: Fact[] = [];
  if (detail.timestamp_utc_ms > 0) facts.push({ label: "Started", value: fmt.time(detail.timestamp_utc_ms) });
  if (durationMs !== null) facts.push({ label: "Duration", value: fmt.duration(durationMs) });
  facts.push({ label: "Laps", value: String(detail.laps.length) });
  if (best !== null) facts.push({ label: "Best lap", value: fmt.lap(best) });
  return facts;
}

/** Field key → "Fork LSC (clicks)". */
const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  SHEET_SECTIONS.flatMap((s) => s.fields.map((f) => [f.key, `${s.title} ${f.label}${f.unit ? ` (${f.unit})` : ""}`])),
);

/** One row of "Setup at the start". */
export interface SetupRow {
  label: string;
  value: string;
  /** The baseline's value when a note changed it since, else null. */
  was: string | null;
}

function show(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value);
}

/** The setup sheet the ride started with, each value marked with the
 *  baseline's when a note has changed it since. Sheet order. */
export function setupRows(sheet: RunningSheet, log: BikeLogView | null): SetupRow[] {
  const baseline = sheet.baseline === null ? null : (log?.entries.find((e) => e.entry.entry_id === sheet.baseline)?.current?.sheet ?? null);
  const order = SHEET_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));
  const keys = Object.keys(sheet.values).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib) || a.localeCompare(b);
  });
  return keys.map((key) => {
    const value = sheet.values[key];
    const before = baseline?.[key];
    const was = baseline !== null && before !== undefined && show(before) !== show(value) ? show(before) : null;
    return { label: FIELD_LABELS[key] ?? key, value: show(value), was };
  });
}

/** One setup change the ride took from the bike log. */
export interface AttachedNote {
  entryId: string;
  text: string;
  /** UTC ms. */
  atMs: number;
  /** The lap it was noted during, or null when before the ride. */
  lap: number | null;
  /** Noted during the ride (between its start and its last lap's end). */
  during: boolean;
  kind: "note" | "sheet";
}

/** The entries the ride took, in time order, each placed at the lap it was
 *  noted during. Deleted or missing entries are left out. */
export function attachedNotes(detail: SessionDetail, log: BikeLogView | null): AttachedNote[] {
  const ids = detail.bike_log?.entry_ids ?? [];
  const end = detail.laps.length > 0 ? Math.max(...detail.laps.map((l) => l.end_timestamp_ms)) : detail.timestamp_utc_ms;
  return ids.flatMap((id) => {
    const view = log?.entries.find((e) => e.entry.entry_id === id);
    if (!view || view.deleted || view.current === null) return [];
    const at = view.current.at_ms;
    const lap = detail.laps.find((l) => at >= l.start_timestamp_ms && at < l.end_timestamp_ms)?.lap_number ?? null;
    const during = detail.timestamp_utc_ms > 0 && at >= detail.timestamp_utc_ms && at <= end;
    return [{ entryId: id, text: view.current.text, atMs: at, lap, during, kind: view.entry.kind }];
  });
}
