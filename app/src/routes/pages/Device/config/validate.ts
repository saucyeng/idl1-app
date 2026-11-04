import type { AnalogChannel, DeviceConfig, DigitalChannel, GpsBlock, GpsConstellation, HrmBlock, ImuSlot, WheelSlot } from "./model";

/** Valid `imu.sample_rate_hz` for the IDL1's LSM6DSV320X, Hz (SPEC §8;
 *  idl1-firmware decisions.md P2 and `imu_ranges.h`). The chip's 7.5 Hz step
 *  is left out because the firmware's integer field can't hold it. One set
 *  in every power mode, unlike the idl0's LSM6DSO32. */
export const IMU_ODR_HZ: readonly number[] = [15, 30, 60, 120, 240, 480, 960, 1920, 3840, 7680];

/** Valid low-g accelerometer full-scale ranges for the LSM6DSV320X, g
 *  (SPEC §8; decisions.md P1). Shared by the top-level default and every
 *  `imuN.accel_range_g` override. ±32 g and up exist only on the chip's
 *  separate high-g accelerometer. */
export const ACCEL_RANGES_G: readonly number[] = [2, 4, 8, 16];

/** Valid high-g accelerometer full-scale ranges, g (SPEC §8; decisions.md Q8). */
export const HG_RANGES_G: readonly number[] = [32, 64, 128, 256, 320];

/** Valid high-g accelerometer rates, Hz: the chip's high-g ODR ladder, which
 *  starts at 480 (SPEC §8; decisions.md P1). */
export const HG_ODR_HZ: readonly number[] = [480, 960, 1920, 3840, 7680];

/** Valid gyro full-scale ranges for the LSM6DSV320X, dps (SPEC §8;
 *  decisions.md P3: ±125 dps is gone, ±4000 dps is new). Shared by the
 *  top-level default and every `imuN.gyro_range_dps` override. */
export const GYRO_RANGES_DPS: readonly number[] = [250, 500, 1000, 2000, 4000];

/** Which logger hardware a config is for. IDL1 has LSM6DSV320X IMUs (with
 *  high-g on the pods); IDL0 has LSM6DSO32s, still ridden on some bikes
 *  (Isaac, 2026-10-14), so the app keeps their value sets too. */
export type Hardware = "idl0" | "idl1";

/** The logger hardware from its advertised name: `IDL0-XXXX` is an IDL0
 *  board; `IDL1-XXXX` (idl1-firmware F6) and anything else is IDL1. */
export function hardwareFromName(name: string): Hardware {
  return /^IDL0-/i.test(name.trim()) ? "idl0" : "idl1";
}

/** IDL0 LSM6DSO32 rates in high-performance mode, Hz (SPEC §8). */
export const IDL0_IMU_ODR_HIGH_PERF_HZ: readonly number[] = [12.5, 26, 52, 104, 208, 416, 833, 1666];
/** IDL0 LSM6DSO32 rates in low-power mode, Hz (SPEC §8). */
export const IDL0_IMU_ODR_LOW_POWER_HZ: readonly number[] = [1.6, 12.5, 26, 52, 104, 208];

/** One hardware's IMU value sets. */
export interface ImuValueSets {
  /** Valid `imu.sample_rate_hz`, Hz, for the config's power mode. */
  odrHz: readonly number[];
  /** Valid accel ranges, g. */
  accelRangesG: readonly number[];
  /** Valid gyro ranges, dps. */
  gyroRangesDps: readonly number[];
  /** True when the pods have a high-g accelerometer. */
  highG: boolean;
}

/** The IMU value sets for `hardware`, given the config's `low_power_mode`
 *  (only IDL0's rate set depends on it). */
export function imuValueSets(hardware: Hardware, lowPowerMode: boolean): ImuValueSets {
  if (hardware === "idl0") {
    return {
      odrHz: lowPowerMode ? IDL0_IMU_ODR_LOW_POWER_HZ : IDL0_IMU_ODR_HIGH_PERF_HZ,
      accelRangesG: [4, 8, 16, 32],
      gyroRangesDps: [125, 250, 500, 1000, 2000],
      highG: false,
    };
  }
  return { odrHz: IMU_ODR_HZ, accelRangesG: ACCEL_RANGES_G, gyroRangesDps: GYRO_RANGES_DPS, highG: true };
}

/** Minimum valid `gps.sample_rate_hz` (SPEC §8: "u-blox MAX-M10S: sample
 *  rate (1–10 Hz)"). Hz. */
export const GPS_RATE_HZ_MIN = 1;

/** Maximum valid `gps.sample_rate_hz` on IDL0 (SPEC §8, same line). Hz. */
export const GPS_RATE_HZ_MAX = 10;

/** Maximum valid `gps.sample_rate_hz` on IDL1, any constellation set (SPEC
 *  §8 "SAM-M10Q (IDL1)"); {@link gpsRateLimitHz} narrows it. Hz. */
export const GPS_RATE_HZ_MAX_IDL1 = 18;

/** Valid `gps.dynamic_model` values on IDL0 (SPEC §8, "Configurable chip
 *  options": "dynamic model (portable/pedestrian/automotive/sea/airborne)"). */
export const GPS_DYNAMIC_MODELS_IDL0: readonly GpsBlock["dynamic_model"][] = ["portable", "pedestrian", "automotive", "sea", "airborne"];

/** Valid `gps.dynamic_model` values on IDL1 (SPEC §8 "SAM-M10Q (IDL1)"):
 *  IDL0's plus stationary and the 2 g / 4 g airborne models. */
export const GPS_DYNAMIC_MODELS: readonly GpsBlock["dynamic_model"][] = ["portable", "stationary", "pedestrian", "automotive", "sea", "airborne", "airborne_2g", "airborne_4g"];

/** The dynamic models `hardware`'s GPS module takes. */
export function gpsDynamicModels(hardware: Hardware): readonly GpsBlock["dynamic_model"][] {
  return hardware === "idl0" ? GPS_DYNAMIC_MODELS_IDL0 : GPS_DYNAMIC_MODELS;
}

/** Valid `gps.constellations` entries (SPEC §8 "SAM-M10Q (IDL1)"). */
export const GPS_CONSTELLATIONS: readonly GpsConstellation[] = ["GPS", "GALILEO", "BEIDOU", "GLONASS"];

/**
 * The highest `gps.sample_rate_hz` the SAM-M10Q holds for a constellation
 * set (SPEC §8 "Rate limit by constellations", from the data sheet's ≥98 %
 * fix-rate table), Hz. `undefined` means all four. A set the data sheet
 * doesn't list gets the four-constellation figure: turning one off never
 * lowers the limit.
 */
export function gpsRateLimitHz(constellations: readonly string[] | undefined): number {
  const on = new Set(constellations ?? GPS_CONSTELLATIONS);
  const has = (c: GpsConstellation) => on.has(c);
  if (on.size === 1) return 18;
  if (on.size === 2 && has("GPS") && has("GALILEO")) return 10;
  if (on.size === 3 && has("GPS") && has("GALILEO") && has("BEIDOU")) return 8;
  if (on.size === 3 && has("GPS") && has("GALILEO") && has("GLONASS")) return 6;
  return 4;
}

/** One IDL1 advanced `gps` number field (SPEC §8 "SAM-M10Q (IDL1)"): its
 *  range, factory default, step, and which way is "tighter" (fewer fixes),
 *  for the SPEC's warning on a tighter-than-default value. */
export interface GpsAdvancedField {
  key: "min_elevation_deg" | "min_cno_dbhz" | "min_satellites" | "max_satellites" | "fix_gate_satellites" | "fix_gate_cno_dbhz" | "pdop_mask" | "position_accuracy_mask_m";
  label: string;
  detail: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  /** `"higher"`: a value above the default can stop fixes; `"lower"`: below; `null`: no warning. */
  tighter: "higher" | "lower" | null;
}

export const GPS_ADVANCED_FIELDS: readonly GpsAdvancedField[] = [
  { key: "min_elevation_deg", label: "Minimum elevation", detail: "Ignore satellites lower than this above the horizon", unit: "°", min: 0, max: 60, step: 1, defaultValue: 5, tighter: "higher" },
  { key: "min_cno_dbhz", label: "Minimum signal", detail: "Ignore satellites weaker than this", unit: "dBHz", min: 0, max: 50, step: 1, defaultValue: 6, tighter: "higher" },
  { key: "min_satellites", label: "Minimum satellites", detail: "Fewest satellites a fix may use", unit: "", min: 1, max: 32, step: 1, defaultValue: 3, tighter: null },
  { key: "max_satellites", label: "Maximum satellites", detail: "Most satellites a fix may use", unit: "", min: 1, max: 32, step: 1, defaultValue: 32, tighter: null },
  { key: "fix_gate_satellites", label: "Fix gate: satellites", detail: "Only try a fix with this many above the gate signal; 0 = off", unit: "", min: 0, max: 32, step: 1, defaultValue: 0, tighter: "higher" },
  { key: "fix_gate_cno_dbhz", label: "Fix gate: signal", detail: "The signal the fix gate counts satellites above", unit: "dBHz", min: 0, max: 50, step: 1, defaultValue: 0, tighter: null },
  { key: "pdop_mask", label: "PDOP mask", detail: "Drop fixes with worse position DOP", unit: "", min: 1, max: 25, step: 0.1, defaultValue: 25, tighter: "lower" },
  { key: "position_accuracy_mask_m", label: "Accuracy mask", detail: "Drop fixes estimated worse than this", unit: "m", min: 1, max: 100, step: 1, defaultValue: 100, tighter: "lower" },
];

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

/** Checks `imu.sample_rate_hz` against the hardware's ODR set. */
function checkImuSampleRate(imu: DeviceConfig["imu"], sets: ImuValueSets, issues: ValidationIssue[]): void {
  if (!sets.odrHz.includes(imu.sample_rate_hz)) {
    pushError(issues, "imu.sample_rate_hz", `${imu.sample_rate_hz} Hz is not a valid IMU rate (SPEC §8); valid values: ${sets.odrHz.join(", ")} Hz`);
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
 *  enabled — its channel mask. Ruling R155 (Direction-2 decision 70,
 *  Isaac's own lived experience: partial masks lost him channels
 *  mid-session): the app only ever writes an all-or-nothing channel mask.
 *  A partial mask stays wire-legal and importer-readable forever — the
 *  wire's §5.3 mask is a bitfield and files with one already exist — but
 *  this app refuses to *create* one. Zero channels on is the pre-existing
 *  "logs nothing" mistake and stays a warning, not this new error. */
function checkImuSlot(slot: ImuSlot, slotPath: string, sets: ImuValueSets, issues: ValidationIssue[]): void {
  checkRange(slot.accel_range_g, sets.accelRangesG, `${slotPath}.accel_range_g`, "accel range", "g", issues);
  checkRange(slot.gyro_range_dps, sets.gyroRangesDps, `${slotPath}.gyro_range_dps`, "gyro range", "dps", issues);
  const channelValues = Object.values(slot.channels);
  const channelsOn = channelValues.filter((on) => on).length;
  if (slot.enabled && channelsOn === 0) {
    pushWarning(issues, `${slotPath}.channels`, `${slotPath} is enabled but every channel is off — it will log nothing`);
  } else if (slot.enabled && channelsOn < channelValues.length) {
    pushError(
      issues,
      `${slotPath}.channels`,
      `${slotPath} has only ${channelsOn} of ${channelValues.length} channels on — the app only writes an all-or-nothing channel mask (a partial mask is wire-legal and stays importer-readable, but this app will not create one; ruling R155)`,
    );
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
function checkImu(imu: DeviceConfig["imu"], hardware: Hardware, issues: ValidationIssue[]): void {
  const sets = imuValueSets(hardware, imu.low_power_mode);
  checkImuSampleRate(imu, sets, issues);
  checkRange(imu.accel_range_g, sets.accelRangesG, "imu.accel_range_g", "accel range", "g", issues);
  checkRange(imu.gyro_range_dps, sets.gyroRangesDps, "imu.gyro_range_dps", "gyro range", "dps", issues);
  if (sets.highG) {
    checkRange(imu.hg_range_g, HG_RANGES_G, "imu.hg_range_g", "high-g range", "g", issues);
    checkRange(imu.hg_sample_rate_hz, HG_ODR_HZ, "imu.hg_sample_rate_hz", "high-g rate", "Hz", issues);
  }
  checkImuModeFlags(imu, issues);
  checkImuSlot(imu.imu0, "imu0", sets, issues);
  checkImuSlot(imu.imu1, "imu1", sets, issues);
  checkImuSlot(imu.imu2, "imu2", sets, issues);
}

/** Checks the `gps` block: rate integrality and range (and on IDL1 the
 *  constellation limit), dynamic model membership, NMEA sentence presence,
 *  and IDL1's advanced fields. */
function checkGps(gps: GpsBlock, hardware: Hardware, issues: ValidationIssue[]): void {
  const rateMax = hardware === "idl0" ? GPS_RATE_HZ_MAX : GPS_RATE_HZ_MAX_IDL1;
  if (!Number.isInteger(gps.sample_rate_hz)) {
    pushError(issues, "gps.sample_rate_hz", `${gps.sample_rate_hz} Hz is not an integer (SPEC §8: "Integer 1-10 Hz")`);
  } else if (gps.sample_rate_hz < GPS_RATE_HZ_MIN || gps.sample_rate_hz > rateMax) {
    pushError(issues, "gps.sample_rate_hz", `${gps.sample_rate_hz} Hz is outside the ${GPS_RATE_HZ_MIN}..${rateMax} Hz range (SPEC §8)`);
  } else if (hardware === "idl1" && gps.sample_rate_hz > gpsRateLimitHz(gps.constellations)) {
    pushError(
      issues,
      "gps.sample_rate_hz",
      `${gps.sample_rate_hz} Hz is above the ${gpsRateLimitHz(gps.constellations)} Hz the GPS holds with these constellations; turn some off or lower the rate (SPEC §8 "Rate limit by constellations")`,
    );
  }

  const models = gpsDynamicModels(hardware);
  if (!models.includes(gps.dynamic_model)) {
    pushError(issues, "gps.dynamic_model", `"${gps.dynamic_model}" is not a valid dynamic model (SPEC §8); valid values: ${models.join(", ")}`);
  } else if (hardware === "idl1" && gps.dynamic_model === "stationary") {
    pushWarning(issues, "gps.dynamic_model", "stationary assumes the logger is not moving; fixes while riding may be poor or missing");
  }

  if (hardware === "idl1") checkGpsAdvanced(gps, issues);

  if (gps.nmea_sentences.length === 0) {
    pushWarning(issues, "gps.nmea_sentences", "no NMEA sentences selected; the app's GPS parser needs at least GGA and RMC");
  }
}

/** IDL1's advanced `gps` fields (SPEC §8 "SAM-M10Q (IDL1)"): an unset
 *  field is the module's factory value and is not checked. */
function checkGpsAdvanced(gps: GpsBlock, issues: ValidationIssue[]): void {
  if (gps.constellations !== undefined) {
    const bad = gps.constellations.filter((c) => !(GPS_CONSTELLATIONS as readonly string[]).includes(c));
    if (gps.constellations.length === 0) {
      pushError(issues, "gps.constellations", "at least one constellation must be on (SPEC §8)");
    } else if (bad.length > 0) {
      pushError(issues, "gps.constellations", `${bad.join(", ")} is not a constellation; valid: ${GPS_CONSTELLATIONS.join(", ")} (SPEC §8)`);
    }
  }
  for (const field of GPS_ADVANCED_FIELDS) {
    const value = gps[field.key];
    if (value === undefined) continue;
    const onStep = field.step === 1 ? Number.isInteger(value) : Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
    if (!onStep || value < field.min || value > field.max) {
      pushError(issues, `gps.${field.key}`, `${value} is not ${field.min}..${field.max}${field.step === 1 ? "" : ` in steps of ${field.step}`} (SPEC §8)`);
      continue;
    }
    const tighter = field.tighter === "higher" ? value > field.defaultValue : field.tighter === "lower" ? value < field.defaultValue : false;
    if (tighter) {
      pushWarning(issues, `gps.${field.key}`, `${field.label} is tighter than the module's default (${field.defaultValue}); the GPS may report fewer fixes, or none`);
    }
  }
  const minSats = gps.min_satellites ?? 3;
  const maxSats = gps.max_satellites ?? 32;
  if (minSats > maxSats) {
    pushError(issues, "gps.min_satellites", `minimum satellites ${minSats} is more than the maximum ${maxSats} (SPEC §8)`);
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
export function validateConfig(config: DeviceConfig, hardware: Hardware = "idl1"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkImu(config.imu, hardware, issues);
  checkGps(config.gps, hardware, issues);
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
