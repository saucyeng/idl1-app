import { describe, expect, it } from "vitest";

import type { DeviceStatus } from "../../../ipc/device";
import { NOT_POLLED, statusTiles, UNREPORTED } from "./statusTiles";

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
function tileOf(tiles: ReturnType<typeof statusTiles>, key: string) {
  const found = tiles.find((t) => t.key === key);
  if (found === undefined) throw new Error(`no tile ${key}`);
  return found;
}

describe("statusTiles", () => {
  it("statusTiles — idle — nine tiles with each IMU and the satellites on their own", () => {
    // Arrange / Act
    const tiles = statusTiles(statusWith({}), false);

    // Assert
    expect(tiles.map((t) => t.key)).toEqual(["imu0", "imu1", "imu2", "gps", "sats", "sd", "battery", "hr", "mode"]);
  });

  it("statusTiles — recording — only the three IMUs and the satellites", () => {
    // Arrange / Act
    const tiles = statusTiles(statusWith({}), true);

    // Assert
    expect(tiles.map((t) => t.key)).toEqual(["imu0", "imu1", "imu2", "sats"]);
  });

  it("statusTiles — no poll has returned — every tile reads not-polled, dimmed", () => {
    // Arrange / Act
    const tiles = statusTiles(null, false);

    // Assert
    expect(tiles.every((t) => t.value === NOT_POLLED && t.tone === "dim")).toBe(true);
  });

  it("statusTiles — a poll returned without a line — that tile reads unreported, not a default", () => {
    // Arrange
    const status = statusWith({ imu0: "ok" });

    // Act
    const tiles = statusTiles(status, false);

    // Assert
    expect(tileOf(tiles, "imu0").value).toBe("OK");
    expect(tileOf(tiles, "imu1")).toMatchObject({ value: UNREPORTED, tone: "dim" });
    expect(tileOf(tiles, "battery").value).toBe(UNREPORTED);
  });

  it("statusTiles — one pod down — only that IMU's tile shows the fault", () => {
    // Arrange
    const status = statusWith({ imu0: "ok", imu1: "error", imu2: "off" });

    // Act
    const tiles = statusTiles(status, false);

    // Assert
    expect(tileOf(tiles, "imu0")).toMatchObject({ value: "OK", tone: "good" });
    expect(tileOf(tiles, "imu1")).toMatchObject({ value: "Error", tone: "bad" });
    expect(tileOf(tiles, "imu2")).toMatchObject({ value: "Off", tone: "dim" });
  });

  it("statusTiles — zero satellites while searching — renders 0 in the no-fix colour, not unreported", () => {
    // Arrange
    const status = statusWith({ gps: "no_fix", gps_sats: 0 });

    // Act
    const tiles = statusTiles(status, false);

    // Assert
    expect(tileOf(tiles, "sats")).toMatchObject({ value: "0", tone: "warn" });
    expect(tileOf(tiles, "gps")).toMatchObject({ value: "No fix", tone: "warn" });
  });

  it("statusTiles — satellites reported without a fix state — count shown with no health colour", () => {
    // Arrange
    const status = statusWith({ gps_sats: 7 });

    // Act
    const tiles = statusTiles(status, false);

    // Assert
    expect(tileOf(tiles, "sats")).toMatchObject({ value: "7", tone: "plain" });
  });

  it("statusTiles — healthy SD with free space reported — shows GiB free", () => {
    // Arrange
    const status = statusWith({ sd: "ok", sd_free_mib: 28304 });

    // Act
    const tiles = statusTiles(status, false);

    // Assert
    expect(tileOf(tiles, "sd")).toMatchObject({ value: "27.6 GiB", tone: "good" });
  });

  it.each([
    ["ok", null, "OK", "good"],
    ["full", 0, "Full", "bad"],
    ["error", null, "Error", "bad"],
    ["absent", null, "Absent", "dim"],
  ] as const)("statusTiles — SD %s with free space %s — shows %s", (sd, sdFreeMib, value, tone) => {
    // Arrange
    const status = statusWith({ sd, sd_free_mib: sdFreeMib });

    // Act
    const tiles = statusTiles(status, false);

    // Assert
    expect(tileOf(tiles, "sd")).toMatchObject({ value, tone });
  });

  it.each([
    [false, false, "Idle"],
    [true, false, "Recording"],
    [false, true, "WiFi"],
    [true, true, "Recording"],
  ] as const)("statusTiles — logging %s, wifi %s — mode reads %s", (logging, wifiOn, mode) => {
    // Arrange
    const status = statusWith({ logging, wifi_on: wifiOn });

    // Act
    const tiles = statusTiles(status, false);

    // Assert
    expect(tileOf(tiles, "mode").value).toBe(mode);
  });

  it("statusTiles — logging known but WiFi unreported — mode is unreported, not guessed", () => {
    // Arrange
    const status = statusWith({ logging: false });

    // Act
    const tiles = statusTiles(status, false);

    // Assert
    expect(tileOf(tiles, "mode").value).toBe(UNREPORTED);
  });

  it("statusTiles — battery and heart rate reported — shown as plain readings", () => {
    // Arrange
    const status = statusWith({ battery_pct: 62, hr: "142 bpm" });

    // Act
    const tiles = statusTiles(status, false);

    // Assert
    expect(tileOf(tiles, "battery")).toMatchObject({ value: "62%", tone: "plain" });
    expect(tileOf(tiles, "hr")).toMatchObject({ value: "142 bpm", tone: "plain" });
  });
});
