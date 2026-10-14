import type { DeviceStatus, ImuState } from "../../../ipc/device";
import type { DeviceConfig, ImuSlot } from "./config/model";

/**
 * Pure decision logic for the Logger dashboard's module grid (navigation map
 * v4, 2026-10-14): one home-screen-style tile per module on the logger —
 * battery, SD card, the two radios, GPS, each IMU, heart rate and every
 * enabled analog, digital and wheel channel — plus an Add tile. Each tile
 * carries a health {@link ModuleTone} for the box around its icon and one or
 * two short text lines. No `@/components/*` import here (CLAUDE.md §4):
 * `ModuleGrid.tsx` draws the tiles, this module decides them.
 *
 * SPEC §7.3 binds every live reading: an absent status line means
 * "unknown", never zero. Before the first poll every live tile reads
 * {@link NOT_POLLED}; a poll that omitted the line reads {@link UNREPORTED}.
 *
 * `config` is the logger's own configuration (with any unsent edits), or
 * `null` before the read-back arrives or when it failed; with `null` the grid
 * shows live modules only and never invents a range or rate from defaults (a
 * fabricated reading is worse than a blank one, SPEC §23.10).
 */

/** Line text before the first `device_status` poll has returned. */
export const NOT_POLLED = "…";
/** Line text when a poll returned but the device did not report the line. */
export const UNREPORTED = "n/a";

/** Battery percentage at or below which the battery tile turns amber. */
export const BATTERY_LOW_PCT = 20;

/** Mebibytes per gibibyte, for the SD free-space line. */
const MIB_PER_GIB = 1024;

/**
 * Colour of the box around a tile's icon. `good` healthy (green), `warn`
 * starting, searching or degraded (amber), `bad` an error (red), `off`
 * disabled or absent (grey), `idle` configured but with no live status on
 * the wire to judge it by (neutral, not grey: it is not disabled).
 */
export type ModuleTone = "good" | "warn" | "bad" | "off" | "idle";

/** Which drawn icon a tile uses. `ModuleGrid.tsx` maps each to a glyph. */
export type ModuleIcon = "battery" | "sd" | "bluetooth" | "wifi" | "gps" | "imu" | "heart" | "analog" | "digital" | "wheel" | "add";

/** One tile of the module grid. */
export interface ModuleTile {
  /** Stable React key and test handle, e.g. `"imu1"`, `"analog:fork_pot"`. */
  key: string;
  icon: ModuleIcon;
  /** Short name under the icon, e.g. "Fork". */
  label: string;
  /** One or two short lines of reading text; never empty. */
  lines: string[];
  tone: ModuleTone;
}

/** Inputs to {@link moduleTiles}. */
export interface ModuleTileInputs {
  /** Last `device_status` read, or `null` before the first poll returns. */
  status: DeviceStatus | null;
  /** The active profile's configuration, or `null` with no profile. */
  config: DeviceConfig | null;
  /** `true` once the status poll has missed several replies in a row. */
  linkLost: boolean;
}

/** IMU index → board position (IDL0_SPEC §3.2): IMU0 frame, IMU1 fork, IMU2 swingarm. */
const IMU_LABEL = ["Frame", "Fork", "Swingarm"] as const;

const IMU_TONE: Record<ImuState, ModuleTone> = { ok: "good", partial: "warn", error: "bad", absent: "off", off: "off" };
const IMU_STATE_TEXT: Record<ImuState, string> = { ok: "OK", partial: "partial", error: "error", absent: "absent", off: "disabled" };

/** A live line through the three-reading rule. */
function live<T>(status: DeviceStatus | null, read: (s: DeviceStatus) => T | null): T | typeof NOT_POLLED | typeof UNREPORTED {
  if (status === null) return NOT_POLLED;
  const value = read(status);
  return value === null ? UNREPORTED : value;
}

/** `"±32 g · 2000°/s"` for an enabled slot. */
function rangeText(slot: ImuSlot): string {
  return `±${slot.accel_range_g} g · ${slot.gyro_range_dps}°/s`;
}

function batteryTile(status: DeviceStatus | null): ModuleTile {
  const pct = live(status, (s) => s.battery_pct);
  if (typeof pct !== "number") return { key: "battery", icon: "battery", label: "Battery", lines: [pct], tone: "idle" };
  return { key: "battery", icon: "battery", label: "Battery", lines: [`${pct}%`], tone: pct <= BATTERY_LOW_PCT ? "warn" : "good" };
}

function sdTile(status: DeviceStatus | null): ModuleTile {
  const base = { key: "sd", icon: "sd" as const, label: "SD card" };
  const sd = live(status, (s) => s.sd);
  if (sd === NOT_POLLED || sd === UNREPORTED) return { ...base, lines: [sd], tone: "idle" };
  const free = status?.sd_free_mib ?? null;
  const freeText = free === null ? null : `${(free / MIB_PER_GIB).toFixed(1)} GiB free`;
  switch (sd) {
    case "ok":
      return { ...base, lines: [freeText ?? "OK"], tone: "good" };
    case "full":
      return { ...base, lines: ["full"], tone: "bad" };
    case "error":
      return { ...base, lines: ["error"], tone: "bad" };
    case "absent":
      return { ...base, lines: ["no card"], tone: "bad" };
  }
}

function bluetoothTile(status: DeviceStatus | null, linkLost: boolean): ModuleTile {
  const base = { key: "bluetooth", icon: "bluetooth" as const, label: "Bluetooth" };
  if (linkLost) return { ...base, lines: ["no reply"], tone: "warn" };
  if (status === null) return { ...base, lines: ["connecting"], tone: "warn" };
  return { ...base, lines: ["connected"], tone: "good" };
}

function wifiTile(status: DeviceStatus | null): ModuleTile {
  const base = { key: "wifi", icon: "wifi" as const, label: "WiFi" };
  const on = live(status, (s) => s.wifi_on);
  if (on === NOT_POLLED || on === UNREPORTED) return { ...base, lines: [on], tone: "idle" };
  return on ? { ...base, lines: ["on"], tone: "good" } : { ...base, lines: ["off"], tone: "off" };
}

function gpsTile(status: DeviceStatus | null): ModuleTile {
  const base = { key: "gps", icon: "gps" as const, label: "GPS" };
  const gps = live(status, (s) => s.gps);
  if (gps === NOT_POLLED || gps === UNREPORTED) return { ...base, lines: [gps], tone: "idle" };
  if (gps === "absent") return { ...base, lines: ["absent"], tone: "off" };
  // 0 satellites while searching is a real reading, never "unreported".
  const sats = status?.gps_sats ?? null;
  const satsLine = sats === null ? null : `${sats} sats`;
  if (gps === "no_fix") return { ...base, lines: satsLine === null ? ["searching"] : ["searching", satsLine], tone: "warn" };
  const mode = status?.gps_fix_quality === 2 ? "DGPS fix" : "fix";
  return { ...base, lines: satsLine === null ? [mode] : [mode, satsLine], tone: "good" };
}

function imuTile(index: 0 | 1 | 2, status: DeviceStatus | null, config: DeviceConfig | null): ModuleTile {
  const key = `imu${index}`;
  const base = { key, icon: "imu" as const, label: IMU_LABEL[index] };
  const slot = config === null ? null : config.imu[key as "imu0" | "imu1" | "imu2"];
  const state = live(status, (s) => [s.imu0, s.imu1, s.imu2][index]);
  if (slot !== null && !slot.enabled) return { ...base, lines: ["disabled"], tone: "off" };
  const range = slot === null ? null : rangeText(slot);
  if (state === NOT_POLLED || state === UNREPORTED) {
    return { ...base, lines: range === null ? [state] : [range], tone: "idle" };
  }
  const lines = range === null || state !== "ok" ? [IMU_STATE_TEXT[state]] : [range];
  return { ...base, lines, tone: IMU_TONE[state] };
}

function heartTile(status: DeviceStatus | null, config: DeviceConfig | null): ModuleTile {
  const base = { key: "hr", icon: "heart" as const, label: "Heart rate" };
  const enabled = config?.heart_rate_monitor?.enabled ?? null;
  if (enabled === false) return { ...base, lines: ["disabled"], tone: "off" };
  const hr = live(status, (s) => s.hr);
  if (hr === NOT_POLLED) return { ...base, lines: [hr], tone: "idle" };
  if (hr === UNREPORTED) return { ...base, lines: enabled ? ["no strap"] : [hr], tone: enabled ? "warn" : "off" };
  const strap = status?.hr_battery_pct ?? null;
  return { ...base, lines: strap === null ? [hr] : [hr, `strap ${strap}%`], tone: "good" };
}

/** Enabled analog, digital and wheel channels from the configuration. They
 *  have no live status on the wire, so their tone is `idle`. */
function channelTiles(config: DeviceConfig | null): ModuleTile[] {
  if (config === null) return [];
  const tiles: ModuleTile[] = [];
  for (const ch of config.analog.channels) {
    if (!ch.enabled) continue;
    tiles.push({ key: `analog:${ch.key}`, icon: "analog", label: ch.label || ch.key, lines: [`${config.analog.sample_rate_hz} Hz`], tone: "idle" });
  }
  for (const ch of config.digital.channels) {
    if (!ch.enabled) continue;
    tiles.push({ key: `digital:${ch.key}`, icon: "digital", label: ch.label || ch.key, lines: [ch.kind], tone: "idle" });
  }
  for (const side of ["front", "rear"] as const) {
    const slot = config.wheel_speed[side];
    if (!slot.enabled) continue;
    tiles.push({
      key: `wheel:${side}`,
      icon: "wheel",
      label: side === "front" ? "Front wheel" : "Rear wheel",
      lines: [`${slot.points_per_revolution} per rev`],
      tone: "idle",
    });
  }
  return tiles;
}

/**
 * The grid's tiles in display order: battery, SD, Bluetooth, WiFi, GPS, the
 * three IMUs, heart rate, every enabled channel, then Add. The radios and
 * the logger's own modules always show; channels show only when the active
 * configuration enables them.
 */
export function moduleTiles({ status, config, linkLost }: ModuleTileInputs): ModuleTile[] {
  const tiles: ModuleTile[] = [
    batteryTile(status),
    sdTile(status),
    bluetoothTile(status, linkLost),
    wifiTile(status),
    gpsTile(status),
    imuTile(0, status, config),
    imuTile(1, status, config),
    imuTile(2, status, config),
  ];
  tiles.push(heartTile(status, config));
  tiles.push(...channelTiles(config));
  tiles.push({ key: "add", icon: "add", label: "Add", lines: ["module"], tone: "idle" });
  return tiles;
}
