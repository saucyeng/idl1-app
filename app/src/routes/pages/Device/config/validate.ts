import type { AnalogChannel, DeviceConfig, DigitalChannel, GpsBlock, HrmBlock, ImuSlot, WheelSlot } from "./model";

/** High-performance-mode IMU output data rates (SPEC §8, "Valid
 *  `sample_rate_hz` values" table). Hz. Applies when `imu.low_power_mode`
 *  is `false`. */
export const IMU_ODR_HIGH_PERF_HZ: readonly number[] = [12.5, 26, 52, 104, 208, 416, 833, 1666];

/** Low-power-mode IMU output data rates (SPEC §8, same table). Hz. Applies
 *  when `imu.low_power_mode` is `true`. */
export const IMU_ODR_LOW_POWER_HZ: readonly number[] = [1.6, 12.5, 26, 52, 104, 208];

/** Valid accel full-scale ranges for the LSM6DSO32 (SPEC §8, "Configurable
 *  chip options": "accel range (±4/8/16/32g)"). g. Shared by the top-level
 *  default and every `imuN.accel_range_g` override. */
export const ACCEL_RANGES_G: readonly number[] = [4, 8, 16, 32];

/** Valid gyro full-scale ranges for the LSM6DSO32 (SPEC §8, "Configurable
 *  chip options": "gyro range (±125–2000 dps)"). dps. Shared by the
 *  top-level default and every `imuN.gyro_range_dps` override. */
export const GYRO_RANGES_DPS: readonly number[] = [125, 250, 500, 1000, 2000];

/** Minimum valid `gps.sample_rate_hz` (SPEC §8: "u-blox MAX-M10S: sample
 *  rate (1–10 Hz)"). Hz. */
export const GPS_RATE_HZ_MIN = 1;

/** Maximum valid `gps.sample_rate_hz` (SPEC §8, same line). Hz. */
export const GPS_RATE_HZ_MAX = 10;

/** Valid `gps.dynamic_model` values (SPEC §8, "Configurable chip options":
 *  "dynamic model (portable/pedestrian/automotive/sea/airborne)"). */
export const GPS_DYNAMIC_MODELS: readonly GpsBlock["dynamic_model"][] = ["portable", "pedestrian", "automotive", "sea", "airborne"];

/** NMEA sentences the app's parser is written against (SPEC §8: "NMEA
 *  sentences (GGA+RMC default)" plus the GSA/GSV/GLL/VTG the u-blox module
 *  can also emit). Used only in `validateConfig`'s message text — the
 *  schema does not constrain `gps.nmea_sentences` to this set. */
export const NMEA_SENTENCES: readonly string[] = ["GGA", "RMC", "GSA", "GSV", "GLL", "VTG"];

/** Valid `digital.channels[].kind` values (SPEC §8). Only `"marker"` ships
 *  in Spec 1 firmware's app picker; `"level"` and `"pwm"` are reserved. */
export const DIGITAL_KINDS: readonly DigitalChannel["kind"][] = ["marker", "level", "pwm"];

/** The 6-byte BLE public address format SPEC §8 states for
 *  `heart_rate_monitor.device_address`: colon-separated uppercase hex,
 *  e.g. `"AA:BB:CC:DD:EE:FF"`. */
export const BLE_ADDRESS_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

/** One problem found in a config, addressed by a dotted path into the
 *  document so a form can put it beside the field that caused it. */
export interface ValidationIssue {
  /** e.g. `"imu.sample_rate_hz"`, `"analog.channels[2].adc_pin"`. */
  path: string;
  /** `"error"` blocks a push; `"warning"` does not. */
  severity: "error" | "warning";
  /** Human-readable explanation, naming the SPEC-valid values where one exists. */
  message: string;
}

/** Pushes an error `ValidationIssue` naming `path` and `message` onto `issues`. */
function pushError(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, severity: "error", message });
}

/** Pushes a warning `ValidationIssue` naming `path` and `message` onto `issues`. */
function pushWarning(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, severity: "warning", message });
}

/** Checks `value` against SPEC §8's IMU ODR table for the mode `imu` is
 *  currently in: `low_power_mode` selects `IMU_ODR_LOW_POWER_HZ`, otherwise
 *  `IMU_ODR_HIGH_PERF_HZ` — the two tables are disjoint from each other. */
function checkImuSampleRate(imu: DeviceConfig["imu"], issues: ValidationIssue[]): void {
  const validRates = imu.low_power_mode ? IMU_ODR_LOW_POWER_HZ : IMU_ODR_HIGH_PERF_HZ;
  if (!validRates.includes(imu.sample_rate_hz)) {
    pushError(
      issues,
      "imu.sample_rate_hz",
      `${imu.sample_rate_hz} Hz is not a valid ODR for ${imu.low_power_mode ? "low-power" : "high-performance"} mode (SPEC §8); valid values: ${validRates.join(", ")} Hz`,
    );
  }
}

/** Checks one range field (`accel_range_g` or `gyro_range_dps`) against its
 *  SPEC §8 valid-value list. */
function checkRange(value: number, validValues: readonly number[], path: string, label: string, unit: string, issues: ValidationIssue[]): void {
  if (!validValues.includes(value)) {
    pushError(issues, path, `${value} ${unit} is not a valid ${label} (SPEC §8); valid values: ${validValues.map((v) => `${v} ${unit}`).join(", ")}`);
  }
}

/** Checks one `imu.imuN` slot: its own accel/gyro range, and — when
 *  enabled — that at least one axis channel is turned on. */
function checkImuSlot(slot: ImuSlot, slotPath: string, issues: ValidationIssue[]): void {
  checkRange(slot.accel_range_g, ACCEL_RANGES_G, `${slotPath}.accel_range_g`, "accel range", "g", issues);
  checkRange(slot.gyro_range_dps, GYRO_RANGES_DPS, `${slotPath}.gyro_range_dps`, "gyro range", "dps", issues);
  const anyChannelOn = Object.values(slot.channels).some((on) => on);
  if (slot.enabled && !anyChannelOn) {
    pushWarning(issues, `${slotPath}.channels`, `${slotPath} is enabled but every channel is off — it will log nothing`);
  }
}

/** Checks `imu.low_power_mode`/`imu.high_performance_mode` for both being
 *  set at once. Firmware confirms the two are XOR (`runs/2026-09-08/firmware/STATUS-7.3-DELTA.md`,
 *  "Resolved with Isaac"): both set is a config validation error, blocking
 *  a push (`isPushable`) — supersedes the earlier `warning` (SPEC §8 alone
 *  didn't state a precedence rule; firmware now says there is none to
 *  state, because the combination is simply invalid). Neither flag set is
 *  not checked here — that reads as ordinary high-performance mode
 *  (`checkImuSampleRate`'s own `low_power_mode ? ... : ...` default) and
 *  firmware has stated no objection to it. */
function checkImuModeFlags(imu: DeviceConfig["imu"], issues: ValidationIssue[]): void {
  if (imu.low_power_mode && imu.high_performance_mode) {
    pushError(issues, "imu.low_power_mode", "low_power_mode and high_performance_mode cannot both be set — firmware treats them as mutually exclusive (STATUS-7.3-DELTA.md)");
  }
}

/** Checks the `imu` block: the shared sample rate, the top-level default
 *  ranges, the mode flags, and each of the three per-IMU sub-blocks. */
function checkImu(imu: DeviceConfig["imu"], issues: ValidationIssue[]): void {
  checkImuSampleRate(imu, issues);
  checkRange(imu.accel_range_g, ACCEL_RANGES_G, "imu.accel_range_g", "accel range", "g", issues);
  checkRange(imu.gyro_range_dps, GYRO_RANGES_DPS, "imu.gyro_range_dps", "gyro range", "dps", issues);
  checkImuModeFlags(imu, issues);
  checkImuSlot(imu.imu0, "imu0", issues);
  checkImuSlot(imu.imu1, "imu1", issues);
  checkImuSlot(imu.imu2, "imu2", issues);
}

/** Checks the `gps` block: rate integrality and range, dynamic model
 *  membership, and NMEA sentence presence. */
function checkGps(gps: GpsBlock, issues: ValidationIssue[]): void {
  if (!Number.isInteger(gps.sample_rate_hz)) {
    pushError(issues, "gps.sample_rate_hz", `${gps.sample_rate_hz} Hz is not an integer (SPEC §8: "Integer 1-10 Hz")`);
  } else if (gps.sample_rate_hz < GPS_RATE_HZ_MIN || gps.sample_rate_hz > GPS_RATE_HZ_MAX) {
    pushError(issues, "gps.sample_rate_hz", `${gps.sample_rate_hz} Hz is outside the ${GPS_RATE_HZ_MIN}..${GPS_RATE_HZ_MAX} Hz range (SPEC §8)`);
  }

  if (!GPS_DYNAMIC_MODELS.includes(gps.dynamic_model)) {
    pushError(issues, "gps.dynamic_model", `"${gps.dynamic_model}" is not a valid dynamic model (SPEC §8); valid values: ${GPS_DYNAMIC_MODELS.join(", ")}`);
  }

  if (gps.nmea_sentences.length === 0) {
    pushWarning(issues, "gps.nmea_sentences", "no NMEA sentences selected; the app's GPS parser needs at least GGA and RMC");
  }
}

/** One channel's claim on a physical pin, gathered from either
 *  `analog.channels[].adc_pin` or `digital.channels[].gpio_pin` so the two
 *  arrays can be checked for collisions together. `pin` is never `null`
 *  here — {@link checkPinCollisions} filters unassigned claims out before
 *  building this list; an unassigned pin can never collide with anything. */
interface PinClaim {
  path: string;
  pin: number;
}

/** Checks every pair of pin claims across both `analog.channels` and
 *  `digital.channels` for a shared physical pin number — same-kind (two
 *  analog channels) and cross-kind (one analog, one digital) collisions
 *  alike, since both claim the same physical GPIO/ADC pin on the MCU. An
 *  unassigned (`null`) pin is excluded from this check entirely (ruling
 *  R58) — it is reported once, as its own "pin unassigned" error, by
 *  {@link checkAnalogChannels}/{@link checkDigitalChannels}, not here. */
function checkPinCollisions(analog: AnalogChannel[], digital: DigitalChannel[], issues: ValidationIssue[]): void {
  const isClaim = (claim: PinClaim | null): claim is PinClaim => claim !== null;
  const claims: PinClaim[] = [
    ...analog.map((c, i): PinClaim | null => (c.adc_pin === null ? null : { path: `analog.channels[${i}].adc_pin`, pin: c.adc_pin })).filter(isClaim),
    ...digital.map((c, i): PinClaim | null => (c.gpio_pin === null ? null : { path: `digital.channels[${i}].gpio_pin`, pin: c.gpio_pin })).filter(isClaim),
  ];
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      if (claims[i].pin === claims[j].pin) {
        pushError(issues, claims[j].path, `${claims[i].path} and ${claims[j].path} both claim pin ${claims[i].pin}`);
      }
    }
  }
}

/** True iff an assigned pin (`adc_pin`/`gpio_pin`, already known not
 *  `null`) is a real physical pin number: ruling R58's second sentence,
 *  "a non-negative-integer input". The pin *range* is still unconstrained
 *  (SPEC §8 states none), but a negative or fractional value is never a
 *  real pin regardless of range — this is checked independently of how
 *  the value reached this `DeviceConfig` (the form's own `parsePinInput`
 *  already keeps a negative/fractional keystroke from committing, but
 *  `validateConfig` does not trust that as the only guard — a config could
 *  arrive here from a duplicated profile or a loaded file predating this
 *  check). */
function isValidAssignedPin(pin: number): boolean {
  return Number.isInteger(pin) && pin >= 0;
}

/** Checks `analog.channels`: duplicate/empty keys, zero scale, and an
 *  unassigned or invalid pin (ruling R58 — a draft channel can never reach
 *  the device half-configured, so this is an error, not a warning). Pin
 *  collisions among assigned pins are checked jointly with
 *  `digital.channels` by `checkPinCollisions`, not here. */
function checkAnalogChannels(channels: AnalogChannel[], issues: ValidationIssue[]): void {
  const seenKeys = new Map<string, number>();
  channels.forEach((channel, i) => {
    const path = `analog.channels[${i}]`;
    if (channel.key === "") {
      pushError(issues, `${path}.key`, `analog channel at index ${i} has an empty key`);
    } else if (seenKeys.has(channel.key)) {
      pushError(issues, `${path}.key`, `key "${channel.key}" is used by more than one analog channel`);
    } else {
      seenKeys.set(channel.key, i);
    }

    if (channel.scale === 0) {
      pushError(issues, `${path}.scale`, `scale 0 means every sample reads back as the fixed offset ${channel.offset}`);
    }

    if (channel.adc_pin === null) {
      pushError(issues, `${path}.adc_pin`, "pin unassigned");
    } else if (!isValidAssignedPin(channel.adc_pin)) {
      pushError(issues, `${path}.adc_pin`, "pin must be a non-negative integer");
    }
  });
}

/** Checks `digital.channels`: kind support, debounce sign, and an
 *  unassigned or invalid pin (ruling R58, same rule as
 *  {@link checkAnalogChannels}). Pin collisions among assigned pins are
 *  checked jointly with `analog.channels` by `checkPinCollisions`, not
 *  here. */
function checkDigitalChannels(channels: DigitalChannel[], issues: ValidationIssue[]): void {
  channels.forEach((channel, i) => {
    const path = `digital.channels[${i}]`;
    if (channel.kind !== "marker") {
      pushWarning(issues, `${path}.kind`, `kind "${channel.kind}" is reserved in the schema but Spec 1 firmware does not ship it`);
    }
    if (channel.debounce_ms < 0) {
      pushError(issues, `${path}.debounce_ms`, `debounce_ms ${channel.debounce_ms} ms is negative`);
    }
    if (channel.gpio_pin === null) {
      pushError(issues, `${path}.gpio_pin`, "pin unassigned");
    } else if (!isValidAssignedPin(channel.gpio_pin)) {
      pushError(issues, `${path}.gpio_pin`, "pin must be a non-negative integer");
    }
  });
}

/** Checks one `wheel_speed.front`/`.rear` slot. A disabled slot is never
 *  pushed to hardware (SPEC §8: users enable per slot via the Device tab),
 *  so its stored values are not validated while disabled. */
function checkWheelSlot(slot: WheelSlot, slotPath: string, issues: ValidationIssue[]): void {
  if (!slot.enabled) return;
  if (slot.points_per_revolution <= 0) {
    pushError(issues, `${slotPath}.points_per_revolution`, `points_per_revolution ${slot.points_per_revolution} would divide by zero in every speed derivation`);
  }
  if (slot.wheel_circumference_mm <= 0) {
    pushError(issues, `${slotPath}.wheel_circumference_mm`, `wheel_circumference_mm ${slot.wheel_circumference_mm} mm is not a usable geometry`);
  }
}

/** Checks `heart_rate_monitor`. Absent, or present with `enabled: false`,
 *  is SPEC §8's stated no-op state and is not validated — a saved address
 *  is retained but not connected to, so an unset or malformed address
 *  while disabled is not a config-push blocker. */
function checkHrm(hrm: HrmBlock | undefined, issues: ValidationIssue[]): void {
  if (hrm === undefined || !hrm.enabled) return;
  if (!BLE_ADDRESS_RE.test(hrm.device_address)) {
    pushError(
      issues,
      "heart_rate_monitor.device_address",
      `"${hrm.device_address}" is not a valid BLE address; SPEC §8 requires 6 uppercase hex bytes, colon-separated, e.g. "AA:BB:CC:DD:EE:FF"`,
    );
  }
}

/**
 * Validates `config` against every rule SPEC §8 states as a hard
 * requirement or a valid-value set, returning one `ValidationIssue` per
 * problem found. This is the single gate between a `DeviceConfig` and
 * `pushConfig` (see the load-bearing invariant in the L7b lane brief: a
 * config is never pushed unvalidated). `error`-severity issues name a
 * genuine SPEC §8 violation ("undefined chip behavior" or worse); `warning`
 * issues flag a config that is valid but almost certainly a mistake (an
 * enabled IMU logging nothing, a reserved digital channel kind). Neither
 * mutates `config` — a value the user typed is never silently snapped to a
 * nearby valid one; the caller decides what to do with each issue.
 */
export function validateConfig(config: DeviceConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkImu(config.imu, issues);
  checkGps(config.gps, issues);
  checkAnalogChannels(config.analog.channels, issues);
  checkDigitalChannels(config.digital.channels, issues);
  checkPinCollisions(config.analog.channels, config.digital.channels, issues);
  checkWheelSlot(config.wheel_speed.front, "wheel_speed.front", issues);
  checkWheelSlot(config.wheel_speed.rear, "wheel_speed.rear", issues);
  checkHrm(config.heart_rate_monitor, issues);

  return issues;
}

/**
 * True iff none of `issues` has severity `"error"`. The only gate on
 * `pushConfig` — a `"warning"` issue is shown to the user but never blocks
 * a push.
 */
export function isPushable(issues: ValidationIssue[]): boolean {
  return !issues.some((issue) => issue.severity === "error");
}
