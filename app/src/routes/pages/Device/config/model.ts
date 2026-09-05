import {
  DEFAULT_ANALOG_SAMPLE_RATE_HZ,
  DEFAULT_CONFIG_VERSION,
  DEFAULT_GPS_DYNAMIC_MODEL,
  DEFAULT_GPS_NMEA_SENTENCES,
  DEFAULT_GPS_SAMPLE_RATE_HZ,
  DEFAULT_IMU_ACCEL_RANGE_G,
  DEFAULT_IMU_GYRO_RANGE_DPS,
  DEFAULT_IMU_SAMPLE_RATE_HZ,
  DEFAULT_WHEEL_CIRCUMFERENCE_MM,
  DEFAULT_WHEEL_POINTS_PER_REVOLUTION,
  defaultConfig,
} from "./defaults";

/** `idl0_config.json` (SPEC §8) as the app models it. Field names, defaults
 *  and units are the spec's; nothing here is invented. Keys the app does not
 *  know are preserved in `unknown` and re-emitted verbatim on serialise —
 *  SPEC §8's "firmware ignores unknown JSON fields" cuts both ways. */
export interface DeviceConfig {
  /** App-managed, read-only in the UI (SPEC §8). */
  config_version: number;
  /** 12-char lowercase hex of the device MAC (SPEC §3.6). Read-only. */
  device_id: string;
  bike_profile: { name: string; default_rider: string };
  imu: ImuBlock;
  gps: GpsBlock;
  analog: { sample_rate_hz: number; channels: AnalogChannel[] };
  digital: { channels: DigitalChannel[] };
  wheel_speed: { front: WheelSlot; rear: WheelSlot };
  /** Omitting the block is equivalent to `enabled: false` (SPEC §8). */
  heart_rate_monitor?: HrmBlock;
  /** Every top-level key the app did not recognise, re-emitted verbatim. */
  unknown: Record<string, unknown>;
}

/** SPEC §8's `imu` block. Shared IMU settings plus the three per-slot
 *  sub-blocks (§8, "Per-IMU range resolution"). */
export interface ImuBlock {
  /** Hz. Shared across all three IMUs — the SPI bus reads them in lockstep. */
  sample_rate_hz: number;
  /** g. Top-level default; per-IMU `accel_range_g` overrides it (SPEC §8). */
  accel_range_g: number;
  /** dps. Same default-then-override rule. */
  gyro_range_dps: number;
  low_power_mode: boolean;
  high_performance_mode: boolean;
  imu0: ImuSlot;
  imu1: ImuSlot;
  imu2: ImuSlot;
  /** Per-IMU mounting rotation, row-major 3x3 (SPEC §8 worked example). */
  orientation?: { imu0_rotation_matrix: number[][]; imu1_rotation_matrix: number[][]; imu2_rotation_matrix: number[][] };
  /** Per-IMU calibration offsets: [accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z]. */
  bias?: { imu0: number[]; imu1: number[]; imu2: number[] };
}

/** One IMU's own enable/range/channel-selection state (SPEC §8). */
export interface ImuSlot {
  enabled: boolean;
  /** g. Overrides `ImuBlock.accel_range_g` when this slot is present. */
  accel_range_g: number;
  /** dps. Overrides `ImuBlock.gyro_range_dps` when this slot is present. */
  gyro_range_dps: number;
  channels: { accel_x: boolean; accel_y: boolean; accel_z: boolean; gyro_x: boolean; gyro_y: boolean; gyro_z: boolean };
}

/** SPEC §8's `gps` block, the u-blox MAX-M10S settings. */
export interface GpsBlock {
  /** Hz, integer 1..10 (SPEC §8's valid-value table). */
  sample_rate_hz: number;
  dynamic_model: "portable" | "pedestrian" | "automotive" | "sea" | "airborne";
  nmea_sentences: string[];
  sbas_enabled: boolean;
}

/** One entry of `analog.channels` (SPEC §8). */
export interface AnalogChannel {
  key: string;
  label: string;
  adc_pin: number;
  units: string;
  scale: number;
  offset: number;
  enabled: boolean;
}

/** One entry of `digital.channels` (SPEC §8). */
export interface DigitalChannel {
  key: string;
  label: string;
  kind: "marker" | "level" | "pwm";
  gpio_pin: number;
  active_low: boolean;
  /** ms. Software debounce window for `marker`/`level` kinds. */
  debounce_ms: number;
  enabled: boolean;
}

/** One `wheel_speed.front`/`.rear` slot (SPEC §8). */
export interface WheelSlot {
  enabled: boolean;
  points_per_revolution: number;
  /** mm. */
  wheel_circumference_mm: number;
}

/** SPEC §8's `heart_rate_monitor` block. Absence is equivalent to
 *  `enabled: false` and is modelled as `DeviceConfig.heart_rate_monitor`
 *  being `undefined`, never as this shape with `enabled: false` filled in. */
export interface HrmBlock {
  enabled: boolean;
  /** 6-byte BLE public address, colon-separated uppercase hex. */
  device_address: string;
  /** Informational, preserved across pushes, used as the UI label. */
  device_name: string;
}

/** One field `parseConfig` could not read as SPEC §8 specifies: a malformed
 *  value a default replaced, or — for a SPEC-stated valid-value set such as
 *  `imu.sample_rate_hz`'s ODR list — a value kept exactly as read despite
 *  being off that list. Never a silent fix; every repair is reported so the
 *  user (Task 3's validator surfaces these) can decide what to do. */
export interface Repair {
  /** Dot/bracket path into the config, e.g. `"analog.channels[2]"` or `"device_id"`. */
  path: string;
  /** What was wrong, and what the parser did about it. */
  reason: string;
}

/** `parseConfig`'s return: the best-effort typed config plus every repair
 *  it had to make getting there. Zero `repairs` means the input matched
 *  SPEC §8 field-for-field. */
export interface ParseResult {
  config: DeviceConfig;
  repairs: Repair[];
}

/** IMU ODRs SPEC §8's valid-value table lists across both power modes
 *  (high-performance: 12.5–1666 Hz; low-power: 1.6–208 Hz). Hz. */
const VALID_IMU_ODR_HZ = new Set([1.6, 12.5, 26, 52, 104, 208, 416, 833, 1666]);

/** SPEC §8's `gps.dynamic_model` valid-value set. */
const VALID_GPS_DYNAMIC_MODELS = new Set(["portable", "pedestrian", "automotive", "sea", "airborne"]);

/** SPEC §8's `digital.channels[].kind` valid-value set (`level`/`pwm` are
 *  reserved in the schema but not yet exposed in the app's picker). */
const VALID_DIGITAL_KINDS = new Set(["marker", "level", "pwm"]);

/** A short, human-readable description of `value`'s runtime type, for
 *  `Repair.reason` text. `null` and arrays are called out separately from
 *  `"object"` since JSON tells them apart even though `typeof` does not. */
function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

/** True for a JSON object (not `null`, not an array) — the shape every
 *  SPEC §8 block is expected to be. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads `value` as a nested config block. An absent block (`undefined`) is
 *  valid per SPEC §8 ("a config file that omits the per-IMU sub-blocks
 *  entirely is valid") and returns `{}` with no repair; a present value of
 *  the wrong type is malformed and is replaced with `{}` plus a `Repair`. */
function objectOrDefault(value: unknown, path: string, repairs: Repair[]): Record<string, unknown> {
  if (value === undefined) return {};
  if (isPlainObject(value)) return value;
  repairs.push({ path, reason: `expected an object, got ${describeType(value)}; using defaults` });
  return {};
}

/** Reads `obj[key]` as a string. Absence silently falls back to `fallback`
 *  (the field simply was not set); a present wrong-typed value is a
 *  `Repair`. Use `readRequiredString` for a field SPEC §8 marks read-only,
 *  where absence itself is worth reporting. */
function readString(obj: Record<string, unknown>, key: string, fallback: string, path: string, repairs: Repair[]): string {
  const value = obj[key];
  if (value === undefined) return fallback;
  if (typeof value === "string") return value;
  repairs.push({ path, reason: `expected a string, got ${describeType(value)}; using default ${JSON.stringify(fallback)}` });
  return fallback;
}

/** Reads `obj[key]` as a finite number, same absence/repair rule as `readString`. */
function readNumber(obj: Record<string, unknown>, key: string, fallback: number, path: string, repairs: Repair[]): number {
  const value = obj[key];
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  repairs.push({ path, reason: `expected a number, got ${describeType(value)}; using default ${fallback}` });
  return fallback;
}

/** Reads `obj[key]` as a boolean, same absence/repair rule as `readString`. */
function readBoolean(obj: Record<string, unknown>, key: string, fallback: boolean, path: string, repairs: Repair[]): boolean {
  const value = obj[key];
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  repairs.push({ path, reason: `expected a boolean, got ${describeType(value)}; using default ${fallback}` });
  return fallback;
}

/** Reads `obj[key]` as a required string (SPEC §8 read-only field): absence
 *  is itself reported, since the app must never invent this value. */
function readRequiredString(obj: Record<string, unknown>, key: string, path: string, repairs: Repair[]): string {
  const value = obj[key];
  if (typeof value === "string") return value;
  repairs.push({
    path,
    reason:
      value === undefined
        ? "missing; this field is read-only and the app never invents it — using an empty string"
        : `expected a string, got ${describeType(value)}; this field is read-only and the app never invents it — using an empty string`,
  });
  return "";
}

/** Reads `obj[key]` as a required, app-managed number (SPEC §8 read-only
 *  field): absence is itself reported. */
function readRequiredNumber(obj: Record<string, unknown>, key: string, fallback: number, path: string, repairs: Repair[]): number {
  const value = obj[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  repairs.push({
    path,
    reason:
      value === undefined
        ? `missing; this field is app-managed and read-only — using ${fallback}`
        : `expected a number, got ${describeType(value)}; this field is app-managed and read-only — using ${fallback}`,
  });
  return fallback;
}

/** Reads `obj[key]` as an array of strings, dropping any non-string entry
 *  (with a `Repair`) rather than the whole array. Absence falls back to
 *  `fallback` with no repair. */
function readStringArray(obj: Record<string, unknown>, key: string, fallback: string[], path: string, repairs: Repair[]): string[] {
  const value = obj[key];
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value)) {
    repairs.push({ path, reason: `expected an array, got ${describeType(value)}; using default ${JSON.stringify(fallback)}` });
    return [...fallback];
  }
  const result: string[] = [];
  value.forEach((item, i) => {
    if (typeof item === "string") {
      result.push(item);
    } else {
      repairs.push({ path: `${path}[${i}]`, reason: `expected a string, got ${describeType(item)}; entry dropped` });
    }
  });
  return result;
}

/** Reads `obj[key]` as an array of numbers, same absence/repair rule as
 *  `readStringArray` but the whole array falls back together (a bias/IMU
 *  offset vector is meaningless partially repaired). */
function readNumberArray(obj: Record<string, unknown>, key: string, fallback: number[], path: string, repairs: Repair[]): number[] {
  const value = obj[key];
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || !value.every((n) => typeof n === "number" && Number.isFinite(n))) {
    repairs.push({ path, reason: `expected an array of numbers, got ${describeType(value)}; using default` });
    return [...fallback];
  }
  return value as number[];
}

/** Reads `value` as a 3x3 rotation matrix, falling back to the identity
 *  matrix (no reorientation) on anything else — SPEC §8's worked example
 *  shows identity for an IMU mounted flat with the board's own axes. */
function readRotationMatrix(value: unknown, path: string, repairs: Repair[]): number[][] {
  const identity = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  if (value === undefined) return identity;
  const isValid = Array.isArray(value) && value.every((row) => Array.isArray(row) && row.every((n) => typeof n === "number" && Number.isFinite(n)));
  if (!isValid) {
    repairs.push({ path, reason: `expected a 3x3 array of numbers, got ${describeType(value)}; using the identity matrix` });
    return identity;
  }
  return value as number[][];
}

/** Reads an array of objects at `value`, dropping any non-object entry
 *  (with a `Repair`) rather than the whole array — `analog.channels` and
 *  `digital.channels` both use this shape. */
function readObjectArray<T>(
  value: unknown,
  path: string,
  repairs: Repair[],
  readItem: (item: Record<string, unknown>, itemPath: string, repairs: Repair[]) => T,
): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    repairs.push({ path, reason: `expected an array, got ${describeType(value)}; using an empty list` });
    return [];
  }
  const result: T[] = [];
  value.forEach((item, i) => {
    const itemPath = `${path}[${i}]`;
    if (!isPlainObject(item)) {
      repairs.push({ path: itemPath, reason: `expected a channel object, got ${describeType(item)}; entry dropped` });
      return;
    }
    result.push(readItem(item, itemPath, repairs));
  });
  return result;
}

/** Reads `imu.sample_rate_hz`. A deliberate difference from idl0: idl0's
 *  `ImuSettingsDialog` snapped a stored 800 Hz to the nearest valid ODR on
 *  open, silently. This model keeps the read value exactly and records a
 *  `Repair` instead — snapping edits a user's device configuration without
 *  telling them. Task 3's validator turns an off-list rate into a blocking
 *  error before push; this function only reports it. */
function readImuSampleRate(obj: Record<string, unknown>, path: string, repairs: Repair[]): number {
  const value = obj["sample_rate_hz"];
  if (value === undefined) return DEFAULT_IMU_SAMPLE_RATE_HZ;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    repairs.push({ path, reason: `expected a number, got ${describeType(value)}; using default ${DEFAULT_IMU_SAMPLE_RATE_HZ}` });
    return DEFAULT_IMU_SAMPLE_RATE_HZ;
  }
  if (!VALID_IMU_ODR_HZ.has(value)) {
    repairs.push({ path, reason: `${value} Hz is not a valid IMU ODR (SPEC §8); kept as read — never silently snapped` });
  }
  return value;
}

/** Reads one `imu.imuN` sub-block. Absence is valid (SPEC §8: all three
 *  IMUs inherit `defaultAccelRangeG`/`defaultGyroRangeDps`, the resolved
 *  top-level values); a present slot's own range fields override those
 *  defaults per axis. */
function readImuSlot(value: unknown, defaultAccelRangeG: number, defaultGyroRangeDps: number, path: string, repairs: Repair[]): ImuSlot {
  const obj = objectOrDefault(value, path, repairs);
  const channelsObj = objectOrDefault(obj["channels"], `${path}.channels`, repairs);
  return {
    enabled: readBoolean(obj, "enabled", false, `${path}.enabled`, repairs),
    accel_range_g: readNumber(obj, "accel_range_g", defaultAccelRangeG, `${path}.accel_range_g`, repairs),
    gyro_range_dps: readNumber(obj, "gyro_range_dps", defaultGyroRangeDps, `${path}.gyro_range_dps`, repairs),
    channels: {
      accel_x: readBoolean(channelsObj, "accel_x", false, `${path}.channels.accel_x`, repairs),
      accel_y: readBoolean(channelsObj, "accel_y", false, `${path}.channels.accel_y`, repairs),
      accel_z: readBoolean(channelsObj, "accel_z", false, `${path}.channels.accel_z`, repairs),
      gyro_x: readBoolean(channelsObj, "gyro_x", false, `${path}.channels.gyro_x`, repairs),
      gyro_y: readBoolean(channelsObj, "gyro_y", false, `${path}.channels.gyro_y`, repairs),
      gyro_z: readBoolean(channelsObj, "gyro_z", false, `${path}.channels.gyro_z`, repairs),
    },
  };
}

/** Reads `imu.orientation`, absent entirely by default (SPEC §8 states no
 *  default rotation matrix; only the worked example shows one). */
function readOrientation(value: unknown, path: string, repairs: Repair[]): ImuBlock["orientation"] {
  if (value === undefined) return undefined;
  const obj = objectOrDefault(value, path, repairs);
  return {
    imu0_rotation_matrix: readRotationMatrix(obj["imu0_rotation_matrix"], `${path}.imu0_rotation_matrix`, repairs),
    imu1_rotation_matrix: readRotationMatrix(obj["imu1_rotation_matrix"], `${path}.imu1_rotation_matrix`, repairs),
    imu2_rotation_matrix: readRotationMatrix(obj["imu2_rotation_matrix"], `${path}.imu2_rotation_matrix`, repairs),
  };
}

/** Reads `imu.bias`, absent entirely by default (same rationale as
 *  `readOrientation`). */
function readBias(value: unknown, path: string, repairs: Repair[]): ImuBlock["bias"] {
  if (value === undefined) return undefined;
  const obj = objectOrDefault(value, path, repairs);
  const zero = [0, 0, 0, 0, 0, 0];
  return {
    imu0: readNumberArray(obj, "imu0", zero, `${path}.imu0`, repairs),
    imu1: readNumberArray(obj, "imu1", zero, `${path}.imu1`, repairs),
    imu2: readNumberArray(obj, "imu2", zero, `${path}.imu2`, repairs),
  };
}

/** Reads the `imu` block. */
function readImu(value: unknown, path: string, repairs: Repair[]): ImuBlock {
  const obj = objectOrDefault(value, path, repairs);
  const accel_range_g = readNumber(obj, "accel_range_g", DEFAULT_IMU_ACCEL_RANGE_G, `${path}.accel_range_g`, repairs);
  const gyro_range_dps = readNumber(obj, "gyro_range_dps", DEFAULT_IMU_GYRO_RANGE_DPS, `${path}.gyro_range_dps`, repairs);
  const orientation = readOrientation(obj["orientation"], `${path}.orientation`, repairs);
  const bias = readBias(obj["bias"], `${path}.bias`, repairs);
  return {
    sample_rate_hz: readImuSampleRate(obj, `${path}.sample_rate_hz`, repairs),
    accel_range_g,
    gyro_range_dps,
    low_power_mode: readBoolean(obj, "low_power_mode", false, `${path}.low_power_mode`, repairs),
    high_performance_mode: readBoolean(obj, "high_performance_mode", true, `${path}.high_performance_mode`, repairs),
    imu0: readImuSlot(obj["imu0"], accel_range_g, gyro_range_dps, `${path}.imu0`, repairs),
    imu1: readImuSlot(obj["imu1"], accel_range_g, gyro_range_dps, `${path}.imu1`, repairs),
    imu2: readImuSlot(obj["imu2"], accel_range_g, gyro_range_dps, `${path}.imu2`, repairs),
    ...(orientation !== undefined ? { orientation } : {}),
    ...(bias !== undefined ? { bias } : {}),
  };
}

/** Reads `gps.dynamic_model`. */
function readDynamicModel(obj: Record<string, unknown>, path: string, repairs: Repair[]): GpsBlock["dynamic_model"] {
  const value = obj["dynamic_model"];
  if (value === undefined) return DEFAULT_GPS_DYNAMIC_MODEL;
  if (typeof value === "string" && VALID_GPS_DYNAMIC_MODELS.has(value)) {
    return value as GpsBlock["dynamic_model"];
  }
  repairs.push({
    path,
    reason: `expected one of portable/pedestrian/automotive/sea/airborne, got ${describeType(value)}; using default ${DEFAULT_GPS_DYNAMIC_MODEL}`,
  });
  return DEFAULT_GPS_DYNAMIC_MODEL;
}

/** Reads the `gps` block. */
function readGps(value: unknown, path: string, repairs: Repair[]): GpsBlock {
  const obj = objectOrDefault(value, path, repairs);
  return {
    sample_rate_hz: readNumber(obj, "sample_rate_hz", DEFAULT_GPS_SAMPLE_RATE_HZ, `${path}.sample_rate_hz`, repairs),
    dynamic_model: readDynamicModel(obj, `${path}.dynamic_model`, repairs),
    nmea_sentences: readStringArray(obj, "nmea_sentences", [...DEFAULT_GPS_NMEA_SENTENCES], `${path}.nmea_sentences`, repairs),
    sbas_enabled: readBoolean(obj, "sbas_enabled", true, `${path}.sbas_enabled`, repairs),
  };
}

/** Reads one `analog.channels[]` entry. */
function readAnalogChannel(item: Record<string, unknown>, path: string, repairs: Repair[]): AnalogChannel {
  return {
    key: readString(item, "key", "", `${path}.key`, repairs),
    label: readString(item, "label", "", `${path}.label`, repairs),
    adc_pin: readNumber(item, "adc_pin", 0, `${path}.adc_pin`, repairs),
    units: readString(item, "units", "", `${path}.units`, repairs),
    scale: readNumber(item, "scale", 1, `${path}.scale`, repairs),
    offset: readNumber(item, "offset", 0, `${path}.offset`, repairs),
    enabled: readBoolean(item, "enabled", true, `${path}.enabled`, repairs),
  };
}

/** Reads the `analog` block. */
function readAnalog(value: unknown, path: string, repairs: Repair[]): DeviceConfig["analog"] {
  const obj = objectOrDefault(value, path, repairs);
  return {
    sample_rate_hz: readNumber(obj, "sample_rate_hz", DEFAULT_ANALOG_SAMPLE_RATE_HZ, `${path}.sample_rate_hz`, repairs),
    channels: readObjectArray(obj["channels"], `${path}.channels`, repairs, readAnalogChannel),
  };
}

/** Reads `digital.channels[].kind`, defaulting to `marker` — the only kind
 *  Spec 1 ships in the app's `+ Add channel…` picker (SPEC §8). */
function readDigitalKind(obj: Record<string, unknown>, path: string, repairs: Repair[]): DigitalChannel["kind"] {
  const value = obj["kind"];
  if (value === undefined) return "marker";
  if (typeof value === "string" && VALID_DIGITAL_KINDS.has(value)) {
    return value as DigitalChannel["kind"];
  }
  repairs.push({ path, reason: `expected one of marker/level/pwm, got ${describeType(value)}; using default marker` });
  return "marker";
}

/** Reads one `digital.channels[]` entry. */
function readDigitalChannel(item: Record<string, unknown>, path: string, repairs: Repair[]): DigitalChannel {
  return {
    key: readString(item, "key", "", `${path}.key`, repairs),
    label: readString(item, "label", "", `${path}.label`, repairs),
    kind: readDigitalKind(item, `${path}.kind`, repairs),
    gpio_pin: readNumber(item, "gpio_pin", 0, `${path}.gpio_pin`, repairs),
    active_low: readBoolean(item, "active_low", false, `${path}.active_low`, repairs),
    debounce_ms: readNumber(item, "debounce_ms", 20, `${path}.debounce_ms`, repairs),
    enabled: readBoolean(item, "enabled", true, `${path}.enabled`, repairs),
  };
}

/** Reads the `digital` block. */
function readDigital(value: unknown, path: string, repairs: Repair[]): DeviceConfig["digital"] {
  const obj = objectOrDefault(value, path, repairs);
  return { channels: readObjectArray(obj["channels"], `${path}.channels`, repairs, readDigitalChannel) };
}

/** Reads one `wheel_speed.front`/`.rear` slot. */
function readWheelSlot(value: unknown, path: string, repairs: Repair[]): WheelSlot {
  const obj = objectOrDefault(value, path, repairs);
  return {
    enabled: readBoolean(obj, "enabled", false, `${path}.enabled`, repairs),
    points_per_revolution: readNumber(obj, "points_per_revolution", DEFAULT_WHEEL_POINTS_PER_REVOLUTION, `${path}.points_per_revolution`, repairs),
    wheel_circumference_mm: readNumber(obj, "wheel_circumference_mm", DEFAULT_WHEEL_CIRCUMFERENCE_MM, `${path}.wheel_circumference_mm`, repairs),
  };
}

/** Reads the `wheel_speed` block. */
function readWheelSpeed(value: unknown, path: string, repairs: Repair[]): DeviceConfig["wheel_speed"] {
  const obj = objectOrDefault(value, path, repairs);
  return {
    front: readWheelSlot(obj["front"], `${path}.front`, repairs),
    rear: readWheelSlot(obj["rear"], `${path}.rear`, repairs),
  };
}

/** Reads `bike_profile`. */
function readBikeProfile(value: unknown, path: string, repairs: Repair[]): DeviceConfig["bike_profile"] {
  const obj = objectOrDefault(value, path, repairs);
  return {
    name: readString(obj, "name", "", `${path}.name`, repairs),
    default_rider: readString(obj, "default_rider", "", `${path}.default_rider`, repairs),
  };
}

/** Reads `heart_rate_monitor`. Absent is SPEC §8's stated equivalent of
 *  `enabled: false` and is modelled as `undefined` — never invented as a
 *  filled-in `{ enabled: false, ... }` object — so a round trip through
 *  `serializeConfig` omits the key rather than writing it back in. */
function readHrm(value: unknown, path: string, repairs: Repair[]): HrmBlock | undefined {
  if (value === undefined) return undefined;
  const obj = objectOrDefault(value, path, repairs);
  return {
    enabled: readBoolean(obj, "enabled", false, `${path}.enabled`, repairs),
    device_address: readString(obj, "device_address", "", `${path}.device_address`, repairs),
    device_name: readString(obj, "device_name", "", `${path}.device_name`, repairs),
  };
}

/** The top-level keys `parseConfig` understands; anything else lands in
 *  `DeviceConfig.unknown` and is re-emitted verbatim by `serializeConfig`. */
const KNOWN_TOP_LEVEL_KEYS = new Set([
  "config_version",
  "device_id",
  "bike_profile",
  "imu",
  "gps",
  "analog",
  "digital",
  "wheel_speed",
  "heart_rate_monitor",
]);

/**
 * Parses `json` (typically `JSON.parse`d `idl0_config.json`) into a typed
 * `DeviceConfig`, leniently: a malformed field falls back to its SPEC §8
 * default and is recorded as a `Repair` rather than throwing. A value that
 * is the right type but off a SPEC-stated valid set (`imu.sample_rate_hz`'s
 * ODR list) is kept exactly as read and reported as a `Repair` instead of
 * being snapped to the nearest valid value — see `readImuSampleRate`'s doc
 * comment for why. `json` that is not an object at all returns
 * `defaultConfig("")` with a single `Repair`; it never throws.
 */
export function parseConfig(json: unknown): ParseResult {
  const repairs: Repair[] = [];

  if (!isPlainObject(json)) {
    repairs.push({ path: "", reason: `expected a JSON object, got ${describeType(json)}; using defaults` });
    return { config: defaultConfig(""), repairs };
  }

  const config_version = readRequiredNumber(json, "config_version", DEFAULT_CONFIG_VERSION, "config_version", repairs);
  const device_id = readRequiredString(json, "device_id", "device_id", repairs);
  const bike_profile = readBikeProfile(json["bike_profile"], "bike_profile", repairs);
  const imu = readImu(json["imu"], "imu", repairs);
  const gps = readGps(json["gps"], "gps", repairs);
  const analog = readAnalog(json["analog"], "analog", repairs);
  const digital = readDigital(json["digital"], "digital", repairs);
  const wheel_speed = readWheelSpeed(json["wheel_speed"], "wheel_speed", repairs);
  const heart_rate_monitor = readHrm(json["heart_rate_monitor"], "heart_rate_monitor", repairs);

  const unknown: Record<string, unknown> = {};
  for (const key of Object.keys(json)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      unknown[key] = json[key];
    }
  }

  const config: DeviceConfig = {
    config_version,
    device_id,
    bike_profile,
    imu,
    gps,
    analog,
    digital,
    wheel_speed,
    ...(heart_rate_monitor !== undefined ? { heart_rate_monitor } : {}),
    unknown,
  };

  return { config, repairs };
}

/**
 * Serialises `config` back to the `idl0_config.json` text `push_config`
 * accepts. `unknown` keys are re-emitted verbatim at the top level, and a
 * `heart_rate_monitor` block is included only when `config.heart_rate_monitor`
 * is set — SPEC §8's stated equivalence between an absent block and
 * `enabled: false` is kept minimal rather than writing the block back in.
 * Never re-orders or drops a key `parseConfig` read.
 */
export function serializeConfig(config: DeviceConfig): string {
  const out: Record<string, unknown> = {
    config_version: config.config_version,
    device_id: config.device_id,
    bike_profile: config.bike_profile,
    imu: config.imu,
    gps: config.gps,
    analog: config.analog,
    digital: config.digital,
    wheel_speed: config.wheel_speed,
  };
  if (config.heart_rate_monitor !== undefined) {
    out.heart_rate_monitor = config.heart_rate_monitor;
  }
  for (const [key, value] of Object.entries(config.unknown)) {
    out[key] = value;
  }
  return JSON.stringify(out, null, 2);
}
