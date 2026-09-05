import type { DeviceConfig, GpsBlock, HrmBlock, ImuBlock, ImuSlot, WheelSlot } from "./model";

/** The three `ImuBlock` sub-block keys (SPEC §8's per-IMU sub-blocks),
 *  shared by every IMU edit operation's `slot` parameter. */
export type ImuSlotKey = "imu0" | "imu1" | "imu2";

/** The two `wheel_speed` sub-block keys (SPEC §8). */
export type WheelSide = "front" | "rear";

/**
 * Sets `imu.sample_rate_hz` (Hz), the SPI-bus-shared IMU output data rate.
 * Every other field of `config` — the three per-IMU range/axis sub-blocks
 * included — is carried over unchanged; the bus rate is orthogonal to each
 * IMU's own range and channel selection (SPEC §8's "Per-IMU range
 * resolution"). Never validates or snaps `hz` against the ODR table —
 * `validateConfig` (Task 3) is the single place an off-list rate is
 * reported, and only as an issue, never a silent correction.
 */
export function setImuRate(config: DeviceConfig, hz: number): DeviceConfig {
  return { ...config, imu: { ...config.imu, sample_rate_hz: hz } };
}

/**
 * Merges `patch` into `config.imu[slot]`, leaving the other two IMU slots
 * and every other field of `config` untouched. `patch` may update any
 * subset of {@link ImuSlot}'s fields, including a nested replacement of
 * `channels` (the caller supplies the whole `channels` object when patching
 * it — `setImuAxis` is the single-axis convenience on top of this).
 */
export function setImuSlot(config: DeviceConfig, slot: ImuSlotKey, patch: Partial<ImuSlot>): DeviceConfig {
  return { ...config, imu: { ...config.imu, [slot]: { ...config.imu[slot], ...patch } } };
}

/**
 * Ticks a single axis enable flag (`channels.accel_x`, etc.) on `slot`,
 * leaving every other axis flag and field on `slot` — and every other IMU
 * slot — unchanged. Built on {@link setImuSlot} rather than duplicating its
 * merge logic.
 */
export function setImuAxis(config: DeviceConfig, slot: ImuSlotKey, axis: keyof ImuSlot["channels"], enabled: boolean): DeviceConfig {
  const currentChannels = config.imu[slot].channels;
  return setImuSlot(config, slot, { channels: { ...currentChannels, [axis]: enabled } });
}

/**
 * Merges `patch` into `config.imu`'s two chip mode flags
 * (`low_power_mode`/`high_performance_mode`), leaving `sample_rate_hz`, both
 * top-level ranges, and all three IMU slots untouched. Never validates the
 * combination — `validateConfig` (Task 3) reports both-true as a warning,
 * this function only commits the toggle.
 */
export function setImuModeFlags(config: DeviceConfig, patch: Partial<Pick<ImuBlock, "low_power_mode" | "high_performance_mode">>): DeviceConfig {
  return { ...config, imu: { ...config.imu, ...patch } };
}

/**
 * Merges `patch` into `config.imu`'s top-level default ranges
 * (`accel_range_g` in g, `gyro_range_dps` in dps), leaving the mode flags,
 * `sample_rate_hz`, and every per-IMU slot's own range override untouched —
 * a slot's own `accel_range_g`/`gyro_range_dps` only take effect when set,
 * and this function never writes into `imu0`/`imu1`/`imu2` (SPEC §8's
 * "Per-IMU range resolution").
 */
export function setImuRanges(config: DeviceConfig, patch: Partial<Pick<ImuBlock, "accel_range_g" | "gyro_range_dps">>): DeviceConfig {
  return { ...config, imu: { ...config.imu, ...patch } };
}

/**
 * Merges `patch` into `config.gps`, leaving every field `patch` does not
 * name unchanged (e.g. patching `dynamic_model` alone leaves
 * `nmea_sentences` and `sbas_enabled` exactly as they were).
 */
export function setGps(config: DeviceConfig, patch: Partial<GpsBlock>): DeviceConfig {
  return { ...config, gps: { ...config.gps, ...patch } };
}

/**
 * Merges `patch` into `config.wheel_speed[side]`, leaving the other side's
 * slot untouched.
 */
export function setWheelSlot(config: DeviceConfig, side: WheelSide, patch: Partial<WheelSlot>): DeviceConfig {
  return { ...config, wheel_speed: { ...config.wheel_speed, [side]: { ...config.wheel_speed[side], ...patch } } };
}

/**
 * Merges `patch` into `config.heart_rate_monitor`, creating the block (with
 * `enabled: false` and empty `device_address`/`device_name` defaults for any
 * field `patch` does not supply) if it was previously absent. Use
 * {@link clearHrm} to remove the block entirely rather than setting
 * `enabled: false` on it — SPEC §8 treats an absent block and
 * `enabled: false` as equivalent, but the app's own default-config
 * convention (SPEC §8) never writes the `enabled: false` shape back in.
 */
export function setHrm(config: DeviceConfig, patch: Partial<HrmBlock>): DeviceConfig {
  const current: HrmBlock = config.heart_rate_monitor ?? { enabled: false, device_address: "", device_name: "" };
  return { ...config, heart_rate_monitor: { ...current, ...patch } };
}

/**
 * Removes `config.heart_rate_monitor` entirely — idl0's Forget action (SPEC
 * §8: omitting the block is equivalent to `enabled: false`). Never leaves a
 * `{ enabled: false, ... }` shape behind; the key itself is gone from the
 * returned config, matching `serializeConfig`'s omission rule.
 */
export function clearHrm(config: DeviceConfig): DeviceConfig {
  const { heart_rate_monitor: _omit, ...rest } = config;
  return rest as DeviceConfig;
}
