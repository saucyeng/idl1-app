import type { DeviceStatus, ImuState } from "../../../ipc/device";

/**
 * Pure decision logic for the recording-only live status pane
 * (`runs/2026-09-07/ui/UI-DIRECTION-2.md` decisions 66/87, ruling R113):
 * while recording, the device shows **per-IMU OK, GPS satellite count, and
 * recording duration — nothing else** ("keep it lightweight on the ESP32").
 * No `@/components/*` import here (CLAUDE.md §4 / wave-2 operating brief
 * §4) — `HeroCard.tsx` renders this, it does not decide it.
 *
 * SPEC §7.3's rule binds every reader here: **an absent line means
 * "unknown," never zero.** `gps_sats: 0` (searching) and `gps_sats: null`
 * (line never sent) are different facts and must render differently.
 */

/** The three per-IMU fields, in wire order (`imu0`/`imu1`/`imu2`). `null`
 *  means the device did not report that line — distinct from any reported
 *  state, including `"off"` (disabled in the loaded config). `status ===
 *  null` (no poll has returned yet) reads the same as three unreported
 *  lines; the caller distinguishes "not polled" from "polled, unreported"
 *  the same way `HeroCard`'s other fields already do, if it needs to. */
export function liveImuStates(status: DeviceStatus | null): [ImuState | null, ImuState | null, ImuState | null] {
  if (status === null) return [null, null, null];
  return [status.imu0, status.imu1, status.imu2];
}

/** Text for {@link liveImuStates}'s per-sensor value: the reported state
 *  capitalised, or `"unavailable"` when unreported. Kept separate from
 *  `HeroCard`'s aggregate `IMU_LABEL` map because the per-sensor field's
 *  type includes `"off"`, which the aggregate field never reports. */
export function imuLiveLabel(state: ImuState | null): string {
  switch (state) {
    case "ok":
      return "OK";
    case "partial":
      return "Partial";
    case "error":
      return "Error";
    case "absent":
      return "Absent";
    case "off":
      return "Off";
    case null:
      return "unavailable";
    default: {
      const exhaustive: never = state;
      throw new Error(`unhandled ImuState: ${String(exhaustive)}`);
    }
  }
}

/** GPS satellite count for the live pane, `"unavailable"` when the device
 *  did not report `GPSSats` at all. `0` (searching, GGA field 7) is a
 *  reported value and renders as `"0"` — easy to collapse into "unavailable"
 *  by accident since `0` is falsy in JS, which is exactly the mistake
 *  SPEC §7.3's absent-vs-zero rule forbids. */
export function formatGpsSats(status: DeviceStatus | null): string {
  const sats = status?.gps_sats ?? null;
  return sats === null ? "unavailable" : String(sats);
}

/** Where {@link recordingDuration} got its value from. */
export type DurationSource = "device" | "client" | "none";

/** The recording-duration reading for the hero timer and live status pane. */
export interface RecordingDuration {
  /** Milliseconds, or `null` when neither source has a value yet. */
  ms: number | null;
  source: DurationSource;
}

/**
 * Resolves the recording duration to show (ruling R113): prefers the
 * device-reported `status.logging_elapsed_s` whenever present, and falls
 * back to `clientElapsedMs` — this session's own `Date.now()`-based clock,
 * started the moment it first observed `status.logging === true`
 * (`index.tsx`) — as `source: "client"`, which the caller renders dimmed
 * per SPEC §7.3's staleness rule: it is not the device's own account of the
 * session, only a local stand-in for firmware that hasn't sent
 * `LoggingElapsed` yet (or hasn't been updated to). Neither source present
 * yields `source: "none"`, `ms: null` — nothing to show, not a `0:00` that
 * would misreport an unknown duration as a just-started one.
 */
export function recordingDuration(status: DeviceStatus | null, clientElapsedMs: number | null): RecordingDuration {
  const deviceS = status?.logging_elapsed_s ?? null;
  if (deviceS !== null) return { ms: deviceS * 1000, source: "device" };
  if (clientElapsedMs !== null) return { ms: clientElapsedMs, source: "client" };
  return { ms: null, source: "none" };
}
