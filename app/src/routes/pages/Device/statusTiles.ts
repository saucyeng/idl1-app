import type { DeviceStatus, GpsState, ImuState, SdState } from "../../../ipc/device";

/**
 * Pure decision logic for the hero card's status grid: one tile per fact
 * the rider checks before dropping in — each IMU on its own, satellites
 * apart from the fix state, SD free space, battery, heart rate and mode.
 * No `@/components/*` import here (CLAUDE.md §4) — `HeroCard.tsx` renders
 * the tiles, it does not decide them.
 *
 * SPEC §7.3's rule binds every tile: **an absent line means "unknown,"
 * never zero.** A tile therefore has three distinct readings — the reported
 * value, {@link UNREPORTED} when a poll returned without that line, and
 * {@link NOT_POLLED} before any poll has returned at all.
 */

/** Tile value before the first `device_status` poll has returned. Short on
 *  purpose: a tile is roughly 100 px wide on a phone. */
export const NOT_POLLED = "…";
/** Tile value when a poll returned but the device did not report the line. */
export const UNREPORTED = "n/a";

/** How a tile's value is coloured. `good` healthy, `warn` degraded or still
 *  acquiring, `bad` a fault, `dim` unknown/off/absent, `plain` a reading
 *  with no health judgement attached (battery, heart rate, mode). */
export type TileTone = "good" | "warn" | "bad" | "dim" | "plain";

/** One cell of the status grid. */
export interface StatusTile {
  /** Stable React key and test handle. */
  key: string;
  label: string;
  value: string;
  tone: TileTone;
}

/** Mebibytes per gibibyte, for the SD free-space reading. */
const MIB_PER_GIB = 1024;

const IMU_VALUE: Record<ImuState, string> = { ok: "OK", partial: "Partial", error: "Error", absent: "Absent", off: "Off" };
const IMU_TONE: Record<ImuState, TileTone> = { ok: "good", partial: "warn", error: "bad", absent: "dim", off: "dim" };
const GPS_VALUE: Record<GpsState, string> = { fix: "Fix", no_fix: "No fix", absent: "Absent" };
const GPS_TONE: Record<GpsState, TileTone> = { fix: "good", no_fix: "warn", absent: "dim" };
const SD_VALUE: Record<SdState, string> = { ok: "OK", full: "Full", error: "Error", absent: "Absent" };
const SD_TONE: Record<SdState, TileTone> = { ok: "good", full: "bad", error: "bad", absent: "dim" };

/** Builds one tile through the three-reading rule: `read` returns `null`
 *  for a line the device did not report. */
function tile<T>(
  key: string,
  label: string,
  status: DeviceStatus | null,
  read: (s: DeviceStatus) => T | null,
  show: (value: T, s: DeviceStatus) => { value: string; tone: TileTone },
): StatusTile {
  if (status === null) return { key, label, value: NOT_POLLED, tone: "dim" };
  const reading = read(status);
  if (reading === null) return { key, label, value: UNREPORTED, tone: "dim" };
  return { key, label, ...show(reading, status) };
}

function imuTile(key: string, label: string, status: DeviceStatus | null, read: (s: DeviceStatus) => ImuState | null): StatusTile {
  return tile(key, label, status, read, (state) => ({ value: IMU_VALUE[state], tone: IMU_TONE[state] }));
}

/** SD state, with free space in GiB appended while the card is healthy and
 *  the device reported `sd_free_mib`. */
function sdShow(state: SdState, status: DeviceStatus): { value: string; tone: TileTone } {
  if (state === "ok" && status.sd_free_mib !== null) {
    return { value: `${(status.sd_free_mib / MIB_PER_GIB).toFixed(1)} GiB`, tone: "good" };
  }
  return { value: SD_VALUE[state], tone: SD_TONE[state] };
}

/** SPEC §23.9's mode word. Recording wins over WiFi: the two are mutually
 *  exclusive, so the order only matters for a device caught mid-transition.
 *  `null` when either input is unreported — mode cannot be derived from a
 *  half-known state. */
function modeOf(status: DeviceStatus): string | null {
  if (status.logging === null || status.wifi_on === null) return null;
  if (status.logging) return "Recording";
  return status.wifi_on ? "WiFi" : "Idle";
}

/**
 * The tiles to show, in display order. IMU indices follow the board:
 * IMU0 is the onboard sensor, IMU1 the front pod, IMU2 the rear pod.
 *
 * While `recording` only the three IMUs and the satellite count are shown
 * (decision 87: the live pane stays light while the logger is busy); the
 * recording duration lives on the CTA.
 */
export function statusTiles(status: DeviceStatus | null, recording: boolean): StatusTile[] {
  const imus = [
    imuTile("imu0", "IMU0 main", status, (s) => s.imu0),
    imuTile("imu1", "IMU1 front", status, (s) => s.imu1),
    imuTile("imu2", "IMU2 rear", status, (s) => s.imu2),
  ];
  // Satellites take the fix state's colour: 0 while searching is a real
  // reading and must still render as "0", never as unreported.
  const sats = tile("sats", "Sats", status, (s) => s.gps_sats, (count, s) => ({
    value: String(count),
    tone: s.gps === null ? "plain" : GPS_TONE[s.gps],
  }));
  if (recording) return [...imus, sats];

  return [
    ...imus,
    tile("gps", "GPS", status, (s) => s.gps, (state) => ({ value: GPS_VALUE[state], tone: GPS_TONE[state] })),
    sats,
    tile("sd", "SD", status, (s) => s.sd, sdShow),
    tile("battery", "Battery", status, (s) => s.battery_pct, (pct) => ({ value: `${pct}%`, tone: "plain" })),
    tile("hr", "HR", status, (s) => s.hr, (hr) => ({ value: hr, tone: "plain" })),
    tile("mode", "Mode", status, modeOf, (mode) => ({ value: mode, tone: "plain" })),
  ];
}
