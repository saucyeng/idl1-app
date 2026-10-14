import type { DeviceConfig } from "./config/model";

/**
 * Pure helpers for the Logger dashboard's settings draft (2026-10-14). The
 * module sheets and the rider/bike sheet edit a copy of the configuration
 * read back from the logger; nothing reaches the logger until **Send to
 * logger**, because a push reboots it (SPEC §7.2). These functions say what
 * the draft changed, for the send bar.
 */

/** One section of the configuration the send bar can name, in display order. */
interface Section {
  label: string;
  read: (config: DeviceConfig) => unknown;
}

const SECTIONS: readonly Section[] = [
  { label: "Rider & bike", read: (c) => c.bike_profile },
  { label: "Frame IMU", read: (c) => c.imu.imu0 },
  { label: "Fork IMU", read: (c) => c.imu.imu1 },
  { label: "Swingarm IMU", read: (c) => c.imu.imu2 },
  {
    label: "IMU rate",
    read: (c) => [c.imu.sample_rate_hz, c.imu.accel_range_g, c.imu.gyro_range_dps, c.imu.low_power_mode, c.imu.high_performance_mode, c.imu.orientation, c.imu.bias],
  },
  { label: "GPS", read: (c) => c.gps },
  { label: "Analog", read: (c) => c.analog },
  { label: "Digital", read: (c) => c.digital },
  { label: "Wheel speed", read: (c) => c.wheel_speed },
  { label: "Heart rate", read: (c) => c.heart_rate_monitor ?? null },
  { label: "Other", read: (c) => c.unknown },
];

/** Order-insensitive deep equality over plain JSON values. */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const key of keys) {
    if (!sameJson(ao[key], bo[key])) return false;
  }
  return true;
}

/** The labels of every section `draft` changed from `base`, in display
 *  order. Empty when they match. */
export function changedSections(base: DeviceConfig, draft: DeviceConfig): string[] {
  return SECTIONS.filter((s) => !sameJson(s.read(base), s.read(draft))).map((s) => s.label);
}
