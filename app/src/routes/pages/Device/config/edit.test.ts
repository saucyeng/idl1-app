import { describe, expect, it } from "vitest";

import {
  clearHrm,
  removeAnalogChannel,
  removeDigitalChannel,
  setGps,
  setHrm,
  setImuAxis,
  setImuModeFlags,
  setImuRanges,
  setImuRate,
  setImuSlot,
  setWheelSlot,
  upsertAnalogChannel,
  upsertDigitalChannel,
} from "./edit";
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

describe("setImuModeFlags", () => {
  it("setImuModeFlags — toggling low_power_mode alone — high_performance_mode and the three IMU slots are untouched", () => {
    // Arrange
    const config = workedExampleConfig();

    // Act
    const result = setImuModeFlags(config, { low_power_mode: true });

    // Assert
    expect(result.imu.low_power_mode).toBe(true);
    expect(result.imu.high_performance_mode).toBe(config.imu.high_performance_mode);
    expect(result.imu.imu0).toEqual(config.imu.imu0);
    expect(result.imu.imu1).toEqual(config.imu.imu1);
    expect(result.imu.imu2).toEqual(config.imu.imu2);
  });
});

describe("setImuRanges", () => {
  it("setImuRanges — a new top-level accel range — gyro range and every IMU slot's own range overrides are untouched", () => {
    // Arrange
    const config = workedExampleConfig();

    // Act
    const result = setImuRanges(config, { accel_range_g: 8 });

    // Assert
    expect(result.imu.accel_range_g).toBe(8);
    expect(result.imu.gyro_range_dps).toBe(config.imu.gyro_range_dps);
    expect(result.imu.imu0.accel_range_g).toBe(config.imu.imu0.accel_range_g);
    expect(result.imu.imu1.gyro_range_dps).toBe(config.imu.imu1.gyro_range_dps);
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

describe("upsertAnalogChannel", () => {
  it("upsertAnalogChannel — a key not yet in analog.channels — appended, digital.channels untouched", () => {
    // Arrange
    const config = workedExampleConfig();
    const channel = { key: "strain_left", label: "Strain Left", adc_pin: 4, units: "kN", scale: 0.0123, offset: -1.5, enabled: true };

    // Act
    const result = upsertAnalogChannel(config, channel);

    // Assert
    expect(result.analog.channels).toEqual([channel]);
    expect(result.digital.channels).toEqual(config.digital.channels);
  });

  it("upsertAnalogChannel — a key already in analog.channels — that entry is replaced in place, other entries untouched", () => {
    // Arrange
    const config = workedExampleConfig();
    const first = { key: "strain_left", label: "Strain Left", adc_pin: 4, units: "kN", scale: 1, offset: 0, enabled: true };
    const second = { key: "strain_right", label: "Strain Right", adc_pin: 5, units: "kN", scale: 1, offset: 0, enabled: true };
    config.analog.channels = [first, second];
    const updatedFirst = { ...first, label: "Strain Left (renamed)", scale: 0.05 };

    // Act
    const result = upsertAnalogChannel(config, updatedFirst);

    // Assert
    expect(result.analog.channels).toEqual([updatedFirst, second]);
  });
});

describe("removeAnalogChannel", () => {
  it("removeAnalogChannel — a key present in analog.channels — that entry is gone, others untouched", () => {
    // Arrange
    const config = workedExampleConfig();
    const first = { key: "strain_left", label: "A", adc_pin: 4, units: "kN", scale: 1, offset: 0, enabled: true };
    const second = { key: "strain_right", label: "B", adc_pin: 5, units: "kN", scale: 1, offset: 0, enabled: true };
    config.analog.channels = [first, second];

    // Act
    const result = removeAnalogChannel(config, "strain_left");

    // Assert
    expect(result.analog.channels).toEqual([second]);
  });
});

describe("upsertDigitalChannel", () => {
  it("upsertDigitalChannel — a key not yet in digital.channels — appended, analog.channels untouched", () => {
    // Arrange
    const config = workedExampleConfig();
    const channel = { key: "marker_1", label: "Marker", kind: "marker" as const, gpio_pin: 21, active_low: true, debounce_ms: 20, enabled: true };

    // Act
    const result = upsertDigitalChannel(config, channel);

    // Assert
    expect(result.digital.channels).toEqual([channel]);
    expect(result.analog.channels).toEqual(config.analog.channels);
  });

  it("upsertDigitalChannel — a key already in digital.channels — that entry is replaced in place", () => {
    // Arrange
    const config = workedExampleConfig();
    const channel = { key: "marker_1", label: "Marker", kind: "marker" as const, gpio_pin: 21, active_low: true, debounce_ms: 20, enabled: true };
    config.digital.channels = [channel];
    const updated = { ...channel, debounce_ms: 50 };

    // Act
    const result = upsertDigitalChannel(config, updated);

    // Assert
    expect(result.digital.channels).toEqual([updated]);
  });
});

describe("removeDigitalChannel", () => {
  it("removeDigitalChannel — a key present in digital.channels — that entry is gone, others untouched", () => {
    // Arrange
    const config = workedExampleConfig();
    const first = { key: "marker_1", label: "A", kind: "marker" as const, gpio_pin: 21, active_low: true, debounce_ms: 20, enabled: true };
    const second = { key: "marker_2", label: "B", kind: "marker" as const, gpio_pin: 22, active_low: true, debounce_ms: 20, enabled: true };
    config.digital.channels = [first, second];

    // Act
    const result = removeDigitalChannel(config, "marker_1");

    // Assert
    expect(result.digital.channels).toEqual([second]);
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
    const beforeAnalog = JSON.parse(JSON.stringify(config.analog));
    const beforeDigital = JSON.parse(JSON.stringify(config.digital));

    // Act
    setImuRate(config, 104);
    setImuSlot(config, "imu0", { enabled: false });
    setImuAxis(config, "imu0", "accel_x", false);
    setImuModeFlags(config, { low_power_mode: true });
    setImuRanges(config, { accel_range_g: 8 });
    setGps(config, { dynamic_model: "sea" });
    setWheelSlot(config, "rear", { enabled: false });
    setHrm(config, { device_name: "Different Strap" });
    clearHrm(config);
    upsertAnalogChannel(config, { key: "new_analog", label: "New", adc_pin: null, units: "", scale: 1, offset: 0, enabled: true });
    removeAnalogChannel(config, "nonexistent");
    upsertDigitalChannel(config, { key: "new_marker", label: "New", kind: "marker", gpio_pin: null, active_low: true, debounce_ms: 20, enabled: true });
    removeDigitalChannel(config, "nonexistent");

    // Assert
    expect(config.imu).toEqual(beforeImu);
    expect(config.gps).toEqual(beforeGps);
    expect(config.wheel_speed).toEqual(beforeWheel);
    expect(config.heart_rate_monitor).toEqual(beforeHrm);
    expect(config.analog).toEqual(beforeAnalog);
    expect(config.digital).toEqual(beforeDigital);
  });
});
