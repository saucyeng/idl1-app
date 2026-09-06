import type { DeviceStatus } from "../../../ipc/device";
import type { ConnectionState } from "./connection";

/** Props for {@link HeroCard}. */
export interface HeroCardProps {
  /** The Device tab's scan/connect state (`connection.ts`). */
  connectionState: ConnectionState;
  /** The last known `device_status` read, or null before the first poll
   *  returns for this connection. */
  status: DeviceStatus | null;
  /** True once `statusPoll.ts`'s `isLinkLost` has fired (R78 Q2): the poll
   *  keeps running and `connectionState.connected` is unchanged either way
   *  — this is purely a "something might be wrong" note, not a state
   *  transition. */
  linkLost: boolean;
}

/** One row of the hero card's peripheral readout. */
function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="device-hero__row">
      <span className="device-hero__label">{label}</span>
      <span className="device-hero__value">{value}</span>
    </div>
  );
}

/** Text shown for a field the device genuinely did not report (`null` in
 *  `DeviceStatus`) — never a plausible-looking zero or "healthy" state it
 *  cannot back up (SPEC §23.10, lane brief "Do not"). */
const UNAVAILABLE = "unavailable";
/** Text shown when no `device_status` poll has returned yet at all —
 *  distinct from {@link UNAVAILABLE}, which means the device itself did not
 *  report that line. */
const NOT_POLLED_YET = "not polled yet";

/** Renders one `DeviceStatus` field as one of three distinct strings: the
 *  real value (via `format`) when `status` has it, {@link UNAVAILABLE} when
 *  `status` exists but this field is `null` (the device did not report the
 *  line), or {@link NOT_POLLED_YET} when `status` itself is `null` (no poll
 *  has returned yet). */
function fieldText<T>(status: DeviceStatus | null, read: (s: DeviceStatus) => T | null, format: (value: T) => string): string {
  if (status === null) return NOT_POLLED_YET;
  const value = read(status);
  if (value === null) return UNAVAILABLE;
  return format(value);
}

const SD_LABEL: Record<NonNullable<DeviceStatus["sd"]>, string> = {
  ok: "OK",
  full: "Full",
  error: "Error",
  absent: "Absent",
};

const GPS_LABEL: Record<NonNullable<DeviceStatus["gps"]>, string> = {
  fix: "Fix",
  no_fix: "No fix",
  absent: "Absent",
};

const IMU_LABEL: Record<NonNullable<DeviceStatus["imu"]>, string> = {
  ok: "OK",
  partial: "Partial",
  error: "Error",
  absent: "Absent",
};

/** Derives the SPEC §23.9 mode line (`Idle` / `Recording` / `WiFi`) from
 *  `logging`/`wifi_on`. Follows the same three-state pattern as
 *  {@link fieldText}: {@link NOT_POLLED_YET} before any poll, {@link
 *  UNAVAILABLE} when a poll returned but either input came back `null`
 *  (mode cannot be derived from a half-known state), otherwise the derived
 *  word. Recording takes priority over WiFi — SPEC §23.9 states the two are
 *  mutually exclusive, so this ordering only matters for a device caught
 *  mid-transition. */
function modeText(status: DeviceStatus | null): string {
  if (status === null) return NOT_POLLED_YET;
  if (status.logging === null || status.wifi_on === null) return UNAVAILABLE;
  if (status.logging) return "Recording";
  if (status.wifi_on) return "WiFi";
  return "Idle";
}

/**
 * The Device tab's status hero (plan Task 9, SPEC §23.10, wired live by
 * L7b Task 10, R77.4). Shows the managed connection's own facts
 * (`connectionState.connected`) plus every `DeviceStatus` field the 1 Hz
 * `device_status` poll (`statusPoll.ts`) has returned, each rendered
 * through {@link fieldText}'s three-state rule: a real value, `"unavailable"`
 * for a field the device did not report, or `"not polled yet"` before the
 * first result. A fabricated reading is worse than a blank one (SPEC
 * §23.10) — this card never guesses.
 *
 * What idl0's hero card also did and this one does not (Step 1, still
 * gaps): the colour-coded readout, RX/TX link-activity indicators, the
 * `mm:ss` recording timer, the device dropdown/picker sheet, and
 * auto-connect ("headphones" model) — see the commit's CHANGELOG bullet
 * and SPEC §23.10's wave-2 paragraph for the full list and why each is
 * deferred.
 */
export default function HeroCard({ connectionState, status, linkLost }: HeroCardProps) {
  const connected = connectionState.connected;
  return (
    <section className="device-hero">
      <StatusRow label="Connection" value={connected ? `Connected — ${connected.device_id}` : "Not connected"} />
      {linkLost && (
        <p role="status" className="device-hero__link-lost">
          Link lost? The device hasn&apos;t answered the last few status checks. Still trying — no action needed unless
          this persists.
        </p>
      )}
      <StatusRow label="Mode" value={modeText(status)} />
      <StatusRow label="Recording" value={fieldText(status, (s) => s.logging, (v) => (v ? "Recording" : "Idle"))} />
      <StatusRow label="SD card" value={fieldText(status, (s) => s.sd, (v) => SD_LABEL[v])} />
      <StatusRow label="GPS fix" value={fieldText(status, (s) => s.gps, (v) => GPS_LABEL[v])} />
      <StatusRow label="IMU" value={fieldText(status, (s) => s.imu, (v) => IMU_LABEL[v])} />
      <StatusRow label="HRM" value={fieldText(status, (s) => s.hr, (v) => v)} />
      <StatusRow label="Battery" value={fieldText(status, (s) => s.battery_pct, (v) => `${v}%`)} />
      <StatusRow label="Firmware" value={fieldText(status, (s) => s.firmware, (v) => `FW v${v}`)} />
      <StatusRow label="WiFi" value={fieldText(status, (s) => s.wifi_on, (v) => (v ? "On" : "Off"))} />
    </section>
  );
}
