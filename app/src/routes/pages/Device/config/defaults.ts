import type { AnalogChannel, DeviceConfig, DigitalChannel, GpsBlock, ImuBlock, ImuSlot, WheelSlot } from "./model";

/** SPEC §8 worked example's IMU sample rate — a valid high-performance ODR. Hz. */
export const DEFAULT_IMU_SAMPLE_RATE_HZ = 833;
/** SPEC §8 worked example's top-level accel range, inherited by any IMU slot
 *  that does not override it (SPEC §8, "Per-IMU range resolution"). g. */
export const DEFAULT_IMU_ACCEL_RANGE_G = 32;
/** SPEC §8 worked example's top-level gyro range, inherited likewise. dps. */
export const DEFAULT_IMU_GYRO_RANGE_DPS = 2000;

/** SPEC §8: GPS defaults to a 5 Hz fix rate. Hz. */
export const DEFAULT_GPS_SAMPLE_RATE_HZ = 5;
/** SPEC §8 worked example's dynamic model default. */
export const DEFAULT_GPS_DYNAMIC_MODEL: GpsBlock["dynamic_model"] = "automotive";
/** SPEC §8: "NMEA sentences (GGA+RMC default)". */
export const DEFAULT_GPS_NMEA_SENTENCES: readonly string[] = ["GGA", "RMC"];

/** SPEC §8: analog sample rate defaults to 100 Hz, shared across channels
 *  (the ADC scheduler round-robins between configured pins). Hz. */
export const DEFAULT_ANALOG_SAMPLE_RATE_HZ = 100;

/** SPEC §8 worked example's wheel-speed geometry default, both slots
 *  disabled ("Wheel speed defaults" — no bike has a Hall sensor wired yet). */
export const DEFAULT_WHEEL_POINTS_PER_REVOLUTION = 12;
/** mm. SPEC §8 worked example's wheel-speed circumference default. */
export const DEFAULT_WHEEL_CIRCUMFERENCE_MM = 2300;

/** SPEC §8: "App-managed. Increment only for breaking firmware-compatibility
 *  changes." — the schema version this app writes into a fresh config. */
export const DEFAULT_CONFIG_VERSION = 1;

/** One disabled IMU slot seeded from the top-level accel/gyro range
 *  (SPEC §8's per-IMU range resolution: the per-IMU sub-block is optional
 *  and inherits the top-level default when absent). */
function defaultImuSlot(accelRangeG: number, gyroRangeDps: number): ImuSlot {
  return {
    enabled: false,
    accel_range_g: accelRangeG,
    gyro_range_dps: gyroRangeDps,
    channels: {
      accel_x: false,
      accel_y: false,
      accel_z: false,
      gyro_x: false,
      gyro_y: false,
      gyro_z: false,
    },
  };
}

/** The IMU block for a fresh config: SPEC §8 worked example's ODR/range
 *  values, seeded into all three slots, every slot disabled until the user
 *  turns one on. `orientation` and `bias` are omitted — both are optional
 *  per-IMU calibration data SPEC §8 has no default for. */
function defaultImu(): ImuBlock {
  return {
    sample_rate_hz: DEFAULT_IMU_SAMPLE_RATE_HZ,
    accel_range_g: DEFAULT_IMU_ACCEL_RANGE_G,
    gyro_range_dps: DEFAULT_IMU_GYRO_RANGE_DPS,
    low_power_mode: false,
    high_performance_mode: true,
    imu0: defaultImuSlot(DEFAULT_IMU_ACCEL_RANGE_G, DEFAULT_IMU_GYRO_RANGE_DPS),
    imu1: defaultImuSlot(DEFAULT_IMU_ACCEL_RANGE_G, DEFAULT_IMU_GYRO_RANGE_DPS),
    imu2: defaultImuSlot(DEFAULT_IMU_ACCEL_RANGE_G, DEFAULT_IMU_GYRO_RANGE_DPS),
  };
}

/** The GPS block for a fresh config: SPEC §8's stated 5 Hz automotive
 *  default with the stated GGA+RMC NMEA default, SBAS on. */
function defaultGps(): GpsBlock {
  return {
    sample_rate_hz: DEFAULT_GPS_SAMPLE_RATE_HZ,
    dynamic_model: DEFAULT_GPS_DYNAMIC_MODEL,
    nmea_sentences: [...DEFAULT_GPS_NMEA_SENTENCES],
    sbas_enabled: true,
  };
}

/** One disabled wheel-speed slot at SPEC §8's worked-example geometry. */
function defaultWheelSlot(): WheelSlot {
  return {
    enabled: false,
    points_per_revolution: DEFAULT_WHEEL_POINTS_PER_REVOLUTION,
    wheel_circumference_mm: DEFAULT_WHEEL_CIRCUMFERENCE_MM,
  };
}

/**
 * A fresh `DeviceConfig` for `deviceId`, using only the defaults SPEC §8
 * states in prose or shows in its worked example: wheel-speed slots
 * disabled, GPS at 5 Hz automotive with GGA+RMC, analog at 100 Hz with no
 * channels configured ("No default entries — users add channels via the
 * Device tab"), digital likewise empty, and the IMU seeded from the worked
 * example's ODR/range values with every slot disabled until the user turns
 * one on. `heart_rate_monitor` is omitted — SPEC §8 states omission is
 * equivalent to `enabled: false`. `bike_profile` has no SPEC-stated default,
 * so both of its fields start empty pending user entry.
 */
export function defaultConfig(deviceId: string): DeviceConfig {
  return {
    config_version: DEFAULT_CONFIG_VERSION,
    device_id: deviceId,
    bike_profile: { name: "", default_rider: "" },
    imu: defaultImu(),
    gps: defaultGps(),
    analog: { sample_rate_hz: DEFAULT_ANALOG_SAMPLE_RATE_HZ, channels: [] as AnalogChannel[] },
    digital: { channels: [] as DigitalChannel[] },
    wheel_speed: { front: defaultWheelSlot(), rear: defaultWheelSlot() },
    unknown: {},
  };
}
