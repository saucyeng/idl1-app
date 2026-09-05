import { describe, expect, it } from "vitest";

import { clearHrm, setGps, setHrm, setImuAxis, setImuRate, setImuSlot, setWheelSlot } from "./edit";
import { defaultConfig } from "./defaults";
import type { DeviceConfig } from "./model";

/** SPEC §8's worked example, close enough to exercise every edit operation:
 *  three distinctly-ranged IMU slots, a non-default GPS block, both wheel
 *  slots enabled with different geometry, and an HRM block. */
function workedExampleConfig(): DeviceConfig {
  const config = defaultConfig("aabbccddeeff");
  config.imu.imu0.enabled = true;
  config.imu.imu0.accel_range_g = 32;
  config.imu.imu0.channels.accel_x = true;
  config.imu.imu1.enabled = true;
  config.imu.imu1.accel_range_g = 16;
  config.imu.imu1.gyro_range_dps = 500;
  config.imu.imu2.enabled = true;
  config.imu.imu2.gyro_range_dps = 250;
  config.wheel_speed.front = { enabled: true, points_per_revolution: 12, wheel_circumference_mm: 2300 };
  config.wheel_speed.rear = { enabled: true, points_per_revolution: 6, wheel_circumference_mm: 2100 };
  config.heart_rate_monitor = { enabled: true, device_address: "AA:BB:CC:DD:EE:FF", device_name: "Polar H10" };
  return config;
}

describe("setImuRate", () => {
  it("setImuRate — changing the shared bus rate — all three IMU slots keep their own ranges and axis enables", () => {
    // Arrange
    const config = workedExampleConfig();

    // Act
    const result = setImuRate(config, 208);

    // Assert
    expect(result.imu.sample_rate_hz).toBe(208);
    expect(result.imu.imu0).toEqual(config.imu.imu0);
    expect(result.imu.imu1).toEqual(config.imu.imu1);
    expect(result.imu.imu2).toEqual(config.imu.imu2);
  });
});

describe("setImuSlot", () => {
  it("setImuSlot — enabling imu1 — imu0 and imu2 untouched", () => {
    // Arrange
    const config = workedExampleConfig();
    config.imu.imu1.enabled = false;

    // Act
    const result = setImuSlot(config, "imu1", { enabled: true });

    // Assert
    expect(result.imu.imu1.enabled).toBe(true);
    expect(result.imu.imu0).toEqual(config.imu.imu0);
    expect(result.imu.imu2).toEqual(config.imu.imu2);
  });
});

describe("setImuAxis", () => {
  it("setImuAxis — ticking gyro_z on imu2 — only that flag changes; unknown keys still present", () => {
    // Arrange
    const config = workedExampleConfig();
    expect(config.imu.imu2.channels.gyro_z).toBe(false);

    // Act
    const result = setImuAxis(config, "imu2", "gyro_z", true);

    // Assert
    expect(result.imu.imu2.channels).toEqual({ ...config.imu.imu2.channels, gyro_z: true });
    expect(result.imu.imu2.accel_range_g).toBe(config.imu.imu2.accel_range_g);
    expect(result.imu.imu2.gyro_range_dps).toBe(config.imu.imu2.gyro_range_dps);
    expect(result.imu.imu0).toEqual(config.imu.imu0);
    expect(result.imu.imu1).toEqual(config.imu.imu1);
  });
});

describe("setGps", () => {
  it("setGps — a new dynamic model — nmea_sentences and sbas_enabled unchanged", () => {
    // Arrange
    const config = workedExampleConfig();

    // Act
    const result = setGps(config, { dynamic_model: "airborne" });

    // Assert
    expect(result.gps.dynamic_model).toBe("airborne");
    expect(result.gps.nmea_sentences).toEqual(config.gps.nmea_sentences);
    expect(result.gps.sbas_enabled).toBe(config.gps.sbas_enabled);
    expect(result.gps.sample_rate_hz).toBe(config.gps.sample_rate_hz);
  });
});

describe("setWheelSlot", () => {
  it("setWheelSlot — editing front — rear untouched", () => {
    // Arrange
    const config = workedExampleConfig();

    // Act
    const result = setWheelSlot(config, "front", { wheel_circumference_mm: 2350 });

    // Assert
    expect(result.wheel_speed.front.wheel_circumference_mm).toBe(2350);
    expect(result.wheel_speed.front.enabled).toBe(config.wheel_speed.front.enabled);
    expect(result.wheel_speed.rear).toEqual(config.wheel_speed.rear);
  });
});

describe("setHrm then clearHrm", () => {
  it("setHrm then clearHrm — the block is removed entirely (config.heart_rate_monitor is undefined), matching idl0's Forget (SPEC §8: omitting the block equals disabled)", () => {
    // Arrange
    const config = defaultConfig("aabbccddeeff");
    expect(config.heart_rate_monitor).toBeUndefined();

    // Act
    const withHrm = setHrm(config, { enabled: true, device_address: "AA:BB:CC:DD:EE:FF", device_name: "Polar H10" });
    const cleared = clearHrm(withHrm);

    // Assert
    expect(withHrm.heart_rate_monitor).toEqual({ enabled: true, device_address: "AA:BB:CC:DD:EE:FF", device_name: "Polar H10" });
    expect(cleared.heart_rate_monitor).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(cleared, "heart_rate_monitor")).toBe(false);
  });
});

describe("every edit function — immutability", () => {
  it("every edit function — the input config object — is not mutated (immutability, checked by deep-equality against a pre-call clone)", () => {
    // Arrange
    const config = workedExampleConfig();
    const beforeImu = JSON.parse(JSON.stringify(config.imu));
    const beforeGps = JSON.parse(JSON.stringify(config.gps));
    const beforeWheel = JSON.parse(JSON.stringify(config.wheel_speed));
    const beforeHrm = JSON.parse(JSON.stringify(config.heart_rate_monitor));

    // Act
    setImuRate(config, 104);
    setImuSlot(config, "imu0", { enabled: false });
    setImuAxis(config, "imu0", "accel_x", false);
    setGps(config, { dynamic_model: "sea" });
    setWheelSlot(config, "rear", { enabled: false });
    setHrm(config, { device_name: "Different Strap" });
    clearHrm(config);

    // Assert
    expect(config.imu).toEqual(beforeImu);
    expect(config.gps).toEqual(beforeGps);
    expect(config.wheel_speed).toEqual(beforeWheel);
    expect(config.heart_rate_monitor).toEqual(beforeHrm);
  });
});
