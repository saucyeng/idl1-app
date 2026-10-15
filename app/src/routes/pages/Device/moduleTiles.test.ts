import { describe, expect, it } from "vitest";

import type { DeviceStatus } from "../../../ipc/device";
import { defaultConfig } from "./config/defaults";
import type { DeviceConfig } from "./config/model";
import { batteryPctFromMv, firmwareTile, MIN_FIRMWARE, moduleTiles, NOT_POLLED, UNREPORTED } from "./moduleTiles";
import type { ModuleTile } from "./moduleTiles";

/** A `DeviceStatus` with every field `null`/`false`, overridden per test. */
function statusWith(fields: Partial<DeviceStatus>): DeviceStatus {
  return {
    wifi_on: null,
    logging: null,
    battery_pct: null,
    sd: null,
    gps: null,
    imu: null,
    firmware: null,
    ota_pending_verify: false,
    hr: null,
    hr_battery_pct: null,
    logging_elapsed_s: null,
    battery_raw: null,
    battery_mv: null,
    sd_free_mib: null,
    gps_fix_quality: null,
    gps_sats: null,
    gps_hdop_x100: null,
    imu0: null,
    imu1: null,
    imu2: null,
    ...fields,
  };
}

/** The tile with `key`, failing the test if it is not in the grid. */
function tileOf(tiles: ModuleTile[], key: string): ModuleTile {
  const found = tiles.find((t) => t.key === key);
  if (found === undefined) throw new Error(`no tile ${key}`);
  return found;
}

describe("moduleTiles", () => {
  it("moduleTiles — no config, before the first poll — logger modules then Add, every live line not polled", () => {
    // Arrange
    const inputs = { status: null, config: null, linkLost: false };

    // Act
    const tiles = moduleTiles(inputs);

    // Assert
    expect(tiles.map((t) => t.key)).toEqual(["battery", "sd", "bluetooth", "wifi", "firmware", "gps", "imu0", "imu1", "imu2", "hr", "add"]);
    expect(tileOf(tiles, "imu1").lines).toEqual([NOT_POLLED]);
    expect(tileOf(tiles, "bluetooth").lines).toEqual(["connecting"]);
  });

  it("moduleTiles — SD ok with free space — free GiB, green", () => {
    // Arrange
    const status = statusWith({ sd: "ok", sd_free_mib: 12698 });

    // Act
    const sd = tileOf(moduleTiles({ status, config: null, linkLost: false }), "sd");

    // Assert
    expect(sd).toMatchObject({ lines: ["12.4 GiB free"], tone: "good" });
  });

  it("moduleTiles — GPS searching with 0 satellites — amber, 0 shown not unreported", () => {
    // Arrange
    const status = statusWith({ gps: "no_fix", gps_sats: 0 });

    // Act
    const gps = tileOf(moduleTiles({ status, config: null, linkLost: false }), "gps");

    // Assert
    expect(gps).toMatchObject({ lines: ["searching", "0 sats"], tone: "warn" });
  });

  it("moduleTiles — IMU ok with a config — range line, green", () => {
    // Arrange
    const config: DeviceConfig = defaultConfig("dev");
    config.imu.imu1 = { ...config.imu.imu1, enabled: true, accel_range_g: 32, gyro_range_dps: 2000 };
    const status = statusWith({ imu1: "ok" });

    // Act
    const imu = tileOf(moduleTiles({ status, config, linkLost: false }), "imu1");

    // Assert
    expect(imu).toMatchObject({ label: "Fork", lines: ["±32 g · 2000°/s"], tone: "good" });
  });

  it("moduleTiles — IMU error — the state, red, never the range", () => {
    // Arrange
    const config: DeviceConfig = defaultConfig("dev");
    config.imu.imu2 = { ...config.imu.imu2, enabled: true };
    const status = statusWith({ imu2: "error" });

    // Act
    const imu = tileOf(moduleTiles({ status, config, linkLost: false }), "imu2");

    // Assert
    expect(imu).toMatchObject({ lines: ["error"], tone: "bad" });
  });

  it("moduleTiles — IMU disabled in config — grey, disabled", () => {
    // Arrange
    const config: DeviceConfig = defaultConfig("dev");
    config.imu.imu0 = { ...config.imu.imu0, enabled: false };

    // Act
    const imu = tileOf(moduleTiles({ status: statusWith({ imu0: "ok" }), config, linkLost: false }), "imu0");

    // Assert
    expect(imu).toMatchObject({ lines: ["disabled"], tone: "off" });
  });

  it("moduleTiles — battery at the low threshold — amber", () => {
    // Arrange
    const status = statusWith({ battery_pct: 20 });

    // Act
    const battery = tileOf(moduleTiles({ status, config: null, linkLost: false }), "battery");

    // Assert
    expect(battery).toMatchObject({ lines: ["20%"], tone: "warn" });
  });

  it("moduleTiles — link lost — Bluetooth amber, no reply", () => {
    // Arrange
    const status = statusWith({});

    // Act
    const ble = tileOf(moduleTiles({ status, config: null, linkLost: true }), "bluetooth");

    // Assert
    expect(ble).toMatchObject({ lines: ["no reply"], tone: "warn" });
  });

  it("moduleTiles — WiFi line unreported — n/a, neutral", () => {
    // Arrange
    const status = statusWith({ wifi_on: null });

    // Act
    const wifi = tileOf(moduleTiles({ status, config: null, linkLost: false }), "wifi");

    // Assert
    expect(wifi).toMatchObject({ lines: [UNREPORTED], tone: "idle" });
  });

  it("moduleTiles — enabled analog channel and front wheel — tiles before Add, neutral", () => {
    // Arrange
    const config: DeviceConfig = defaultConfig("dev");
    config.analog.channels = [
      { key: "fork_pot", label: "Fork pot", adc_pin: 1, units: "mm", scale: 1, offset: 0, enabled: true } as DeviceConfig["analog"]["channels"][number],
      { key: "spare", label: "Spare", adc_pin: 2, units: "V", scale: 1, offset: 0, enabled: false } as DeviceConfig["analog"]["channels"][number],
    ];
    config.wheel_speed.front = { ...config.wheel_speed.front, enabled: true };

    // Act
    const keys = moduleTiles({ status: null, config, linkLost: false }).map((t) => t.key);

    // Assert
    expect(keys.slice(-3)).toEqual(["analog:fork_pot", "wheel:front", "add"]);
  });

  it("moduleTiles — heart-rate strap enabled but unreported — amber, no strap", () => {
    // Arrange
    const config: DeviceConfig = defaultConfig("dev");
    config.heart_rate_monitor = { enabled: true, device_address: "AA:BB", device_name: "Polar" } as NonNullable<DeviceConfig["heart_rate_monitor"]>;

    // Act
    const hr = tileOf(moduleTiles({ status: statusWith({}), config, linkLost: false }), "hr");

    // Assert
    expect(hr).toMatchObject({ lines: ["no strap"], tone: "warn" });
  });
});

describe("batteryPctFromMv", () => {
  it("batteryPctFromMv — ends and a midpoint — clamped and interpolated", () => {
    const low = batteryPctFromMv(3000);
    const mid = batteryPctFromMv(3850);
    const full = batteryPctFromMv(4210);

    expect(low).toBe(0);
    expect(mid).toBe(50);
    expect(full).toBe(100);
  });

  it("moduleTiles — BatteryMv reported alongside a stale percent — percent from volts, volts shown", () => {
    const status = statusWith({ battery_pct: 100, battery_mv: 3700 });

    const battery = tileOf(moduleTiles({ status, config: null, linkLost: false }), "battery");

    expect(battery).toMatchObject({ lines: ["15%", "3.70 V"], tone: "warn" });
  });
});


describe("firmwareTile", () => {
  const release = { version: "0.3.0", tag: "v0.3.0", name: "", notes: "", prerelease: false, published_at: "", image_url: "", image_size_bytes: 0, sha256_url: null };

  it("firmware older than MIN_FIRMWARE — red, update required, whatever the catalog says", () => {
    // Arrange
    const status = statusWith({ firmware: "0.1.1" });

    // Act
    const tile = firmwareTile(status, { kind: "up-to-date", latest: release, deviceVersion: "0.1.1" });

    // Assert
    expect(tile.tone).toBe("bad");
    expect(tile.lines).toEqual(["v0.1.1", "update required"]);
  });

  it("a newer release on the channel — amber, names it", () => {
    // Arrange
    const status = statusWith({ firmware: MIN_FIRMWARE });

    // Act
    const tile = firmwareTile(status, { kind: "update-available", latest: release, deviceVersion: MIN_FIRMWARE });

    // Assert
    expect(tile.tone).toBe("warn");
    expect(tile.lines[1]).toBe("v0.3.0 out");
  });

  it("up to date or ahead — green", () => {
    // Arrange
    const status = statusWith({ firmware: "0.3.0" });

    // Act
    const upToDate = firmwareTile(status, { kind: "up-to-date", latest: release, deviceVersion: "0.3.0" });
    const ahead = firmwareTile(status, { kind: "ahead", latest: release, deviceVersion: "0.3.0", channel: "stable" });

    // Assert
    expect(upToDate.tone).toBe("good");
    expect(ahead.tone).toBe("good");
  });

  it("no check yet, or no status — neutral", () => {
    // Act
    const unchecked = firmwareTile(statusWith({ firmware: "0.3.0" }), null);
    const unpolled = firmwareTile(null, null);

    // Assert
    expect(unchecked.tone).toBe("idle");
    expect(unpolled.lines).toEqual([NOT_POLLED]);
  });

  it("moduleTiles — the firmware tile sits after WiFi", () => {
    // Act
    const keys = moduleTiles({ status: null, config: null, linkLost: false }).map((t) => t.key);

    // Assert
    expect(keys.indexOf("firmware")).toBe(keys.indexOf("wifi") + 1);
  });
});
