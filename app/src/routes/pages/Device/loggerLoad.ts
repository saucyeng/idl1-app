import type { DeviceConfig } from "./config/model";

/**
 * The logger's sampling load (2026-10-15): how many samples per second a
 * config asks for in total, against what the logger can sustain. A single
 * channel at 7680 Hz can be fine, but every channel at 2 kHz probably isn't
 * (Isaac). The rating says which side of that line a config is on.
 *
 * The limit is a placeholder, **not measured**: Isaac's estimate of about
 * 20,000 samples/s. The bus (two pods on one 400 kHz I2C), the SD writes
 * and the CPU have not been bench-tested at high rates. Replace
 * {@link LOAD_LIMIT_SPS} with the measured figure and drop
 * {@link LOAD_LIMIT_MEASURED}'s caveat once a bench test exists.
 *
 * Counted: each enabled IMU axis at the shared IMU rate, each pod's three
 * high-g axes at the high-g rate, each analog channel at the analog rate,
 * and GPS at its fix rate (one record per fix). Heart rate, digital and
 * wheel channels are event-rate and small enough to leave out.
 */

/** Samples per second the logger is taken to sustain. Estimate. */
export const LOAD_LIMIT_SPS = 20_000;

/** False until {@link LOAD_LIMIT_SPS} comes from a bench test. */
export const LOAD_LIMIT_MEASURED = false;

/** Fraction of the limit below which a config rates green. */
export const LOAD_GREEN_BELOW = 0.6;

/** Green: comfortable. Amber: near the limit. Red: over it. */
export type LoadRating = "good" | "warn" | "bad";

/** A config's sampling load. */
export interface LoggerLoad {
  /** Total samples per second the config asks for. */
  samplesPerSecond: number;
  /** `samplesPerSecond / LOAD_LIMIT_SPS`. */
  fraction: number;
  rating: LoadRating;
}

/** Total samples per second `config` asks for (see the module comment). */
export function samplesPerSecond(config: DeviceConfig): number {
  const imu = config.imu;
  let total = 0;
  for (const slot of [imu.imu0, imu.imu1, imu.imu2]) {
    if (!slot.enabled) continue;
    total += Object.values(slot.channels).filter(Boolean).length * imu.sample_rate_hz;
    if (slot.hg_enabled === true) total += 3 * imu.hg_sample_rate_hz;
  }
  total += config.analog.channels.length * config.analog.sample_rate_hz;
  total += config.gps.sample_rate_hz;
  return total;
}

/** `config`'s load and rating against {@link LOAD_LIMIT_SPS}. */
export function loggerLoad(config: DeviceConfig): LoggerLoad {
  const sps = samplesPerSecond(config);
  const fraction = sps / LOAD_LIMIT_SPS;
  const rating: LoadRating = fraction < LOAD_GREEN_BELOW ? "good" : fraction < 1 ? "warn" : "bad";
  return { samplesPerSecond: sps, fraction, rating };
}

/** One line for the meter, e.g. `"8,700 samples/s of ~20,000"`. */
export function describeLoad(load: LoggerLoad): string {
  const limit = `${LOAD_LIMIT_MEASURED ? "" : "~"}${LOAD_LIMIT_SPS.toLocaleString("en-US")}`;
  return `${Math.round(load.samplesPerSecond).toLocaleString("en-US")} samples/s of ${limit}`;
}
