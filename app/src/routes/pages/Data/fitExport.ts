/**
 * Pure helpers for the Data tab's "Export .fit" button (C3 §3.2
 * `export_session_fit`, added 2026-11-05) — idl0's `fit_export.dart` and
 * `FitExportControls`, ported.
 */
import type { SessionDetail } from "../../../ipc/catalog";

/** The GPS channels the FIT encoder needs (`collect_fixes` in
 *  `rust/core/src/export/fit/mod.rs`); without all three it refuses. */
const REQUIRED_GPS_CHANNELS = ["GPS_Latitude", "GPS_Longitude", "GPS_EpochMs"] as const;

/** Whether `detail` can be exported to FIT: it has every GPS channel the
 *  encoder reads, each with at least one sample. idl0 showed the button only
 *  for sessions with GPS; so does this. */
export function canExportFit(detail: SessionDetail): boolean {
  return REQUIRED_GPS_CHANNELS.every((id) => detail.channels.some((c) => c.channel_id === id && c.sample_count > 0));
}

/** Two-digit zero pad. */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The save dialog's suggested name: `YYYY-MM-DD_<venue>.fit`, or
 * `YYYY-MM-DD_HHMM.fit` when the session has no venue (idl0's rule, so a
 * blank venue never reads "unknown"). Date and time are local, matching the
 * session list. Spaces become `_`, and characters Windows refuses in a file
 * name are dropped. `ride.fit` when the start time is unknown (`0`).
 *
 * @param timestampUtcMs Session start, Unix epoch ms; `0` = unknown (C1 §3.1).
 * @param venue The session's venue name; `""` = none.
 */
export function fitExportFileName(timestampUtcMs: number, venue: string): string {
  if (timestampUtcMs === 0) return "ride.fit";
  const d = new Date(timestampUtcMs);
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const cleaned = venue
    .trim()
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "_");
  if (cleaned === "") return `${date}_${pad2(d.getHours())}${pad2(d.getMinutes())}.fit`;
  return `${date}_${cleaned}.fit`;
}

/** `path` with a `.fit` extension, added when the dialog returned a name
 *  without one (case-insensitive, so `RIDE.FIT` is left alone). */
export function withFitExtension(path: string): string {
  return path.toLowerCase().endsWith(".fit") ? path : `${path}.fit`;
}
