import { describe, expect, it } from "vitest";

import type { DeviceStatus } from "../../../ipc/device";
import { formatGpsSats, imuLiveLabel, liveImuStates, recordingDuration } from "./liveStatus";

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

describe("liveImuStates", () => {
  it("liveImuStates — status is null (no poll yet) — three unavailable slots", () => {
    // Arrange / Act
    const result = liveImuStates(null);

    // Assert
    expect(result).toEqual([null, null, null]);
  });

  it("liveImuStates — a mix of reported and unreported sensors — passed through unchanged", () => {
    // Arrange
    const status = statusWith({ imu0: "ok", imu1: null, imu2: "off" });

    // Act
    const result = liveImuStates(status);

    // Assert
    expect(result).toEqual(["ok", null, "off"]);
  });
});

describe("imuLiveLabel", () => {
  it.each([
    ["ok", "OK"],
    ["partial", "Partial"],
    ["error", "Error"],
    ["absent", "Absent"],
    ["off", "Off"],
    [null, "unavailable"],
  ] as const)("imuLiveLabel(%s) — renders %s", (state, expected) => {
    // Arrange / Act
    const result = imuLiveLabel(state);

    // Assert
    expect(result).toBe(expected);
  });
});

describe("formatGpsSats", () => {
  it("formatGpsSats — status is null (no poll yet) — unavailable", () => {
    // Arrange / Act
    const result = formatGpsSats(null);

    // Assert
    expect(result).toBe("unavailable");
  });

  it("formatGpsSats — gps_sats is null (device did not report the line) — unavailable, not \"0\"", () => {
    // Arrange
    const status = statusWith({ gps_sats: null });

    // Act
    const result = formatGpsSats(status);

    // Assert
    expect(result).toBe("unavailable");
  });

  it("formatGpsSats — gps_sats is 0 (searching, a reported value) — \"0\", not unavailable", () => {
    // Arrange
    const status = statusWith({ gps_sats: 0 });

    // Act
    const result = formatGpsSats(status);

    // Assert
    expect(result).toBe("0");
  });

  it("formatGpsSats — gps_sats is a positive count — the count as a string", () => {
    // Arrange
    const status = statusWith({ gps_sats: 7 });

    // Act
    const result = formatGpsSats(status);

    // Assert
    expect(result).toBe("7");
  });
});

describe("recordingDuration", () => {
  it("recordingDuration — device reports logging_elapsed_s — device source, seconds converted to ms", () => {
    // Arrange
    const status = statusWith({ logging_elapsed_s: 305 });

    // Act
    const result = recordingDuration(status, 999_000);

    // Assert
    expect(result).toEqual({ ms: 305_000, source: "device" });
  });

  it("recordingDuration — device field absent, client elapsed present — client source (dimmed by the caller)", () => {
    // Arrange
    const status = statusWith({ logging_elapsed_s: null });

    // Act
    const result = recordingDuration(status, 12_000);

    // Assert
    expect(result).toEqual({ ms: 12_000, source: "client" });
  });

  it("recordingDuration — status is null (no poll yet), client elapsed present — client source", () => {
    // Arrange / Act
    const result = recordingDuration(null, 4_000);

    // Assert
    expect(result).toEqual({ ms: 4_000, source: "client" });
  });

  it("recordingDuration — neither source has a value — none, ms null (not 0)", () => {
    // Arrange / Act
    const result = recordingDuration(null, null);

    // Assert
    expect(result).toEqual({ ms: null, source: "none" });
  });

  it("recordingDuration — device reports logging_elapsed_s: 0 (just started) — device source, not treated as absent", () => {
    // Arrange
    const status = statusWith({ logging_elapsed_s: 0 });

    // Act
    const result = recordingDuration(status, 30_000);

    // Assert
    expect(result).toEqual({ ms: 0, source: "device" });
  });
});
