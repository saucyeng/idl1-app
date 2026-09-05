/** Pure display formatters for the Data tab. No IPC, no engine computation —
 *  every function here takes a number the catalog already produced and
 *  returns text for the screen (CLAUDE.md §2: "Rust = numbers, JS =
 *  pictures"). */

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

/** Formats a lap time in milliseconds as `m:ss.SSS` (idl0's
 *  `data_filters_provider.dart` lap-time display). `ms` must be a
 *  non-negative finite number; a negative value or `NaN` (a missing or
 *  corrupt lap time) reads "—" rather than a nonsense clock. */
export function formatLapTimeMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";

  const totalMs = Math.floor(ms);
  const minutes = Math.floor(totalMs / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

/** Formats a duration in milliseconds as `h:mm:ss`, or `m:ss` when the
 *  duration is under an hour (the hour field is omitted, not zero-padded to
 *  "0:mm:ss"). `ms` must be a non-negative finite number; a negative value or
 *  `NaN` reads "—". */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mmss = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}` : mmss;
}

/** Formats a byte count as a human-readable size (`"1.0 MB"`), one decimal
 *  place, binary (1024-based) units up to GB. `n` must be a non-negative
 *  finite number of bytes. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

/** Formats a Unix epoch millisecond timestamp as a locale date
 *  (`Intl.DateTimeFormat`, e.g. "Sep 5, 2026"). `ms` is a real timestamp —
 *  callers own the C1 §3.1 "0 = unknown" convention (`sessionRow.ts` does). */
export function formatDateMs(ms: number): string {
  return dateFormatter.format(new Date(ms));
}

/** Formats a Unix epoch millisecond timestamp as a locale time (e.g.
 *  "2:15 PM"). `ms` is a real timestamp — callers own the C1 §3.1 "0 =
 *  unknown" convention. */
export function formatTimeMs(ms: number): string {
  return timeFormatter.format(new Date(ms));
}

/** Local (viewer time zone) `YYYY-MM-DD` for a UTC-ms timestamp — used for
 *  grouping and sort keys, not display (display uses `formatDateMs`'s
 *  locale-formatted text). Groups by the viewer's local date, not the UTC
 *  date, so a session just after local midnight groups with "today" even
 *  when UTC is still on "yesterday". */
export function localIsoDate(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear().toString().padStart(4, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}
