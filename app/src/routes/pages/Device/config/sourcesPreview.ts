import type { DeviceConfig, WheelSlot } from "./model";

/** One row of the channel-enable preview the Device tab's channels table
 *  (Task 5) shows per configurable source — enable state, sample rate, and
 *  units only. Deliberately narrower than SPEC §5.2's full registry entry
 *  (channel_id, data_type, scale, offset): those are the wire contract's
 *  own numbers (SPEC §3), computed by core::parse, and this preview does
 *  not duplicate that arithmetic in TypeScript (R53 Device Q1). When
 *  `preview_channel_registry` (IPC need 12) lands, this module is replaced
 *  wholesale, not extended. */
export interface SourcePreviewRow {
  /** Stable identifier for the source: `"imu0"`/`"imu1"`/`"imu2"`, `"gps"`,
   *  `"wheel_front"`/`"wheel_rear"`, an `analog.channels[]`/`digital.channels[]`
   *  entry's own `key`, or `"heart_rate_monitor"`. */
  sourceKey: string;
  /** Human-readable name for the channels table's row label. */
  label: string;
  /** Whether this source is turned on in the current config. */
  enabled: boolean;
  /** Hz; null for an event-driven source (wheel pulse counters, a digital
   *  marker) — never a fabricated rate. */
  sampleRateHz: number | null;
  /** Units string, sometimes a combined label (e.g. "g / dps" for one IMU's
   *  row) since this preview is one row per source, not one per axis. */
  units: string;
}

/** One `imu.imu0`/`imu1`/`imu2` slot as a preview row. Enabled iff the
 *  slot's own `enabled` is true; the sample rate is the shared IMU bus
 *  rate (`imu.sample_rate_hz`), which is always known regardless of which
 *  axes are turned on — unlike a per-axis rate, which SPEC §5.2 does not
 *  define independently of the shared bus. */
function previewImuSlot(sourceKey: "imu0" | "imu1" | "imu2", config: DeviceConfig): SourcePreviewRow {
  const slot = config.imu[sourceKey];
  return {
    sourceKey,
    label: `IMU ${sourceKey.slice(3)}`,
    enabled: slot.enabled,
    sampleRateHz: config.imu.sample_rate_hz,
    units: "g / dps",
  };
}

/** The `gps` block as a preview row. Enabled is not a concept SPEC §8
 *  states for GPS (unlike IMU slots or HRM, there is no `gps.enabled`
 *  field) — GPS is always considered configured/on, since the u-blox
 *  MAX-M10S has no per-config disable switch. */
function previewGps(config: DeviceConfig): SourcePreviewRow {
  return {
    sourceKey: "gps",
    label: "GPS",
    enabled: true,
    sampleRateHz: config.gps.sample_rate_hz,
    units: "deg / m/s",
  };
}

/** One `wheel_speed.front`/`.rear` slot as a preview row. Event-driven
 *  (wheel pulse counters have no fixed rate per SPEC §5.2's registry, rate
 *  0 = event-driven) — `sampleRateHz` is always null, never a fabricated
 *  0 or a shared rate that does not exist for this source. */
function previewWheelSlot(sourceKey: "wheel_front" | "wheel_rear", label: string, slot: WheelSlot): SourcePreviewRow {
  return {
    sourceKey,
    label,
    enabled: slot.enabled,
    sampleRateHz: null,
    units: "count",
  };
}

/** The channel-enable preview for `config`'s configurable sources: enable
 *  state, sample rate (or `null` for an event-driven source), and units
 *  only — per R53 Device Q1, no `scale`, predicted `channel_id`, or
 *  `data_type` (those are `preview_channel_registry`'s job, IPC need 12).
 *  One row per IMU slot, one for GPS, one per wheel slot, one per
 *  `analog.channels[]`/`digital.channels[]` entry, and one for the heart
 *  rate monitor — in that order. */
export function previewSources(config: DeviceConfig): SourcePreviewRow[] {
  const rows: SourcePreviewRow[] = [
    previewImuSlot("imu0", config),
    previewImuSlot("imu1", config),
    previewImuSlot("imu2", config),
    previewGps(config),
    previewWheelSlot("wheel_front", "Wheel Front", config.wheel_speed.front),
    previewWheelSlot("wheel_rear", "Wheel Rear", config.wheel_speed.rear),
  ];

  for (const channel of config.analog.channels) {
    rows.push({
      sourceKey: channel.key,
      label: channel.label,
      enabled: channel.enabled,
      sampleRateHz: config.analog.sample_rate_hz,
      units: channel.units,
    });
  }

  for (const channel of config.digital.channels) {
    rows.push({
      sourceKey: channel.key,
      label: channel.label,
      enabled: channel.enabled,
      // Event-driven per SPEC §8 (`marker`: one CHANNEL_SAMPLE per debounced
      // press); `level`/`pwm` are fixed-rate in the wire format (§5.2) but
      // not yet exposed in the app's picker, so this preview does not model
      // a rate for any digital kind yet.
      sampleRateHz: null,
      units: "event",
    });
  }

  rows.push({
    sourceKey: "heart_rate_monitor",
    label: "Heart Rate Monitor",
    enabled: config.heart_rate_monitor?.enabled ?? false,
    // SPEC §5.2 fixes HR_BPM at 1 Hz and HR_RR event-driven — two different
    // rates for one source. Reporting neither avoids picking one.
    sampleRateHz: null,
    units: "bpm / ms",
  });

  return rows;
}
