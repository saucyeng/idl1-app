import type { AnalogChannel, DeviceConfig, DigitalChannel, ImuSlot } from "./config/model";
import { previewSources } from "./config/sourcesPreview";

/**
 * One channel row within a source's expanded breakdown (SPEC §23.3's
 * "expanded child rows"). `scale`/`offset` are present only for an
 * `analog.channels[]` entry, and are the value the user typed into that
 * entry's own config field — never a registry-derived number (R53 Device
 * Q1; `preview_channel_registry`, IPC need 12, is the only source of a
 * predicted `channel_id`/`data_type`/computed `scale`, and this module does
 * not call it).
 */
export interface ChannelRowView {
  /** The channel's name within its source, e.g. `"accel_x"` or an analog
   *  entry's own `label`. */
  name: string;
  /** Units string, e.g. `"g"`, `"dps"`, `"count"`, `"event"`. */
  units: string;
  /** Whether this individual channel is turned on. */
  enabled: boolean;
  /** The analog entry's own typed scale factor (SPEC §8's `AnalogChannel.scale`).
   *  Present only for an analog channel row. */
  scale?: number;
  /** The analog entry's own typed offset (SPEC §8's `AnalogChannel.offset`).
   *  Present only for an analog channel row. */
  offset?: number;
}

/** One row of the Device tab's channels table (SPEC §23.3): one source,
 *  its enable state and rate (joined from `previewSources`, never
 *  re-derived here), and its expanded per-channel breakdown. */
export interface SourceView {
  /** Stable identifier matching `SourcePreviewRow.sourceKey` — the join key
   *  into `previewSources(config)`'s output. */
  sourceKey: string;
  /** Human-readable row label (idl0's source names, SPEC §23.3). */
  label: string;
  /** Whether this source is turned on in the current config. */
  enabled: boolean;
  /** Hz; null for an event-driven source. Copied from `previewSources`,
   *  never recomputed. */
  sampleRateHz: number | null;
  /** This source's per-channel breakdown, shown when the row expands. */
  channels: ChannelRowView[];
}

/** g. Unit shown on an IMU slot's three accelerometer axis rows. */
const IMU_ACCEL_UNITS = "g";
/** dps. Unit shown on an IMU slot's three gyroscope axis rows. */
const IMU_GYRO_UNITS = "dps";

/** idl0's per-IMU-slot labels (SPEC §23.3's mounting-location naming). */
const IMU_LABELS: Record<"imu0" | "imu1" | "imu2", string> = {
  imu0: "IMU0 (sprung)",
  imu1: "IMU1 (front fork)",
  imu2: "IMU2 (rear)",
};

/** Builds one IMU slot's six fixed axis rows (SPEC §5's channel order),
 *  each carrying only its own `ImuSlot.channels[axis]` enable flag — never
 *  a scale/offset, since an IMU axis's scale is `range / 32768` (SPEC §3),
 *  the wire contract's own arithmetic (R53 Device Q1). */
function imuChannelRows(slot: ImuSlot): ChannelRowView[] {
  return [
    { name: "accel_x", units: IMU_ACCEL_UNITS, enabled: slot.channels.accel_x },
    { name: "accel_y", units: IMU_ACCEL_UNITS, enabled: slot.channels.accel_y },
    { name: "accel_z", units: IMU_ACCEL_UNITS, enabled: slot.channels.accel_z },
    { name: "gyro_x", units: IMU_GYRO_UNITS, enabled: slot.channels.gyro_x },
    { name: "gyro_y", units: IMU_GYRO_UNITS, enabled: slot.channels.gyro_y },
    { name: "gyro_z", units: IMU_GYRO_UNITS, enabled: slot.channels.gyro_z },
  ];
}

/** Builds an analog entry's single channel row, carrying that entry's own
 *  config-typed `scale`/`offset` verbatim — the value the user entered, not
 *  a registry-derived number (R53 Device Q1). */
function analogChannelRow(channel: AnalogChannel): ChannelRowView {
  return {
    name: channel.label,
    units: channel.units,
    enabled: channel.enabled,
    scale: channel.scale,
    offset: channel.offset,
  };
}

/** Builds a digital entry's single channel row. No `scale`/`offset` — a
 *  digital channel has none in SPEC §8. */
function digitalChannelRow(channel: DigitalChannel): ChannelRowView {
  return { name: channel.label, units: "event", enabled: channel.enabled };
}

/** Looks up `sourceKey`'s enable/rate from `previewRows`, the output of
 *  Task 4's `previewSources`. Throws if the key is missing — every source
 *  `listSources` builds a row for is also one `previewSources` reports on,
 *  so a miss means the two lists have drifted apart. */
function lookupPreview(
  previewRows: ReturnType<typeof previewSources>,
  sourceKey: string,
): { enabled: boolean; sampleRateHz: number | null } {
  const row = previewRows.find((r) => r.sourceKey === sourceKey);
  if (!row) {
    throw new Error(`listSources: no previewSources row for sourceKey "${sourceKey}"`);
  }
  return { enabled: row.enabled, sampleRateHz: row.sampleRateHz };
}

/**
 * The Device tab's channels table (SPEC §23.3): one `SourceView` per
 * configurable source in `config`, in a stable order — the six
 * hardware-pinned sources (`imu0`, `imu1`, `imu2`, `gps`, `wheel_front`,
 * `wheel_rear`) first, then one per `analog.channels[]` entry, then one per
 * `digital.channels[]` entry, then the heart rate monitor. Enable state and
 * sample rate are joined from `previewSources(config)` (Task 4) by
 * `sourceKey` — this function never re-derives that logic.
 */
export function listSources(config: DeviceConfig): SourceView[] {
  const previewRows = previewSources(config);
  const views: SourceView[] = [];

  (["imu0", "imu1", "imu2"] as const).forEach((sourceKey) => {
    const { enabled, sampleRateHz } = lookupPreview(previewRows, sourceKey);
    views.push({
      sourceKey,
      label: IMU_LABELS[sourceKey],
      enabled,
      sampleRateHz,
      channels: imuChannelRows(config.imu[sourceKey]),
    });
  });

  {
    const { enabled, sampleRateHz } = lookupPreview(previewRows, "gps");
    views.push({
      sourceKey: "gps",
      label: "GPS",
      enabled,
      sampleRateHz,
      channels: [{ name: "fix", units: "deg / m/s", enabled }],
    });
  }

  (
    [
      ["wheel_front", "Wheel Front"],
      ["wheel_rear", "Wheel Rear"],
    ] as const
  ).forEach(([sourceKey, label]) => {
    const { enabled, sampleRateHz } = lookupPreview(previewRows, sourceKey);
    views.push({
      sourceKey,
      label,
      enabled,
      sampleRateHz,
      channels: [{ name: "pulse", units: "count", enabled }],
    });
  });

  for (const channel of config.analog.channels) {
    const { enabled, sampleRateHz } = lookupPreview(previewRows, channel.key);
    views.push({
      sourceKey: channel.key,
      label: channel.label,
      enabled,
      sampleRateHz,
      channels: [analogChannelRow(channel)],
    });
  }

  for (const channel of config.digital.channels) {
    const { enabled, sampleRateHz } = lookupPreview(previewRows, channel.key);
    views.push({
      sourceKey: channel.key,
      label: channel.label,
      enabled,
      sampleRateHz,
      channels: [digitalChannelRow(channel)],
    });
  }

  {
    const { enabled, sampleRateHz } = lookupPreview(previewRows, "heart_rate_monitor");
    const deviceName = config.heart_rate_monitor?.device_name;
    const label = deviceName ? `Heart Rate Monitor — ${deviceName}` : "Heart Rate Monitor";
    views.push({
      sourceKey: "heart_rate_monitor",
      label,
      enabled,
      sampleRateHz,
      channels: [{ name: "heart_rate", units: "bpm / ms", enabled }],
    });
  }

  return views;
}
