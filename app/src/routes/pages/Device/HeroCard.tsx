import type { ConnectionState } from "./connection";

/** Props for {@link HeroCard}. */
export interface HeroCardProps {
  /** The Device tab's scan/connect state (`connection.ts`) — the only
   *  source of truth this card has for what the device is doing. */
  connectionState: ConnectionState;
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

/** Text shown for every field this tab cannot read from the device yet
 *  (`device_status`, IPC need 8, is a stub) — never a plausible-looking
 *  zero (SPEC §23.10, lane brief "Do not"). */
const UNAVAILABLE = "unavailable";

/**
 * The Device tab's status hero (plan Task 9, SPEC §23.10). Renders only
 * what the tab can actually know today: the last `ble_connect` result
 * (read as "the last attempt succeeded," never a live link — R53 Device
 * Q4, `connection.ts`'s `ConnectionState` doc) and the firmware version it
 * reported. Mode, recording state, sensor health, battery and link
 * activity have no C3 command yet (IPC needs 8/9) and always render as
 * `"unavailable"`.
 */
export default function HeroCard({ connectionState }: HeroCardProps) {
  const connected = connectionState.connected;
  return (
    <section className="device-hero">
      <StatusRow label="Connection" value={connected ? `Last connect succeeded — ${connected.device_id}` : "Not connected"} />
      <StatusRow label="Firmware" value={connected?.firmware_version ?? UNAVAILABLE} />
      <StatusRow label="Mode" value={UNAVAILABLE} />
      <StatusRow label="Recording" value={UNAVAILABLE} />
      <StatusRow label="SD card" value={UNAVAILABLE} />
      <StatusRow label="GPS fix" value={UNAVAILABLE} />
      <StatusRow label="IMU" value={UNAVAILABLE} />
      <StatusRow label="HRM" value={UNAVAILABLE} />
      <StatusRow label="Battery" value={UNAVAILABLE} />
      <p className="device-hero__note">
        Live status, mode, recording control, sensor health, battery and link activity are not available yet — the
        commands that would read them (<code>device_status</code>, <code>device_control</code>) have not landed.
      </p>
    </section>
  );
}
