import { describe, expect, it } from "vitest";

import { defaultConfig } from "./defaults";
import { parseConfig, serializeConfig } from "./model";
import type { DeviceConfig } from "./model";

/** SPEC §8's own worked-example `idl0_config.json`, verbatim — the fixture
 *  every "golden" test below parses. */
const SPEC_WORKED_EXAMPLE = {
  config_version: 1,
  device_id: "XXXXXXXXXXXX",
  bike_profile: {
    name: "Trek Session 2024",
    default_rider: "Rider Name",
  },
  imu: {
    sample_rate_hz: 833,
    accel_range_g: 32,
    gyro_range_dps: 2000,
    low_power_mode: false,
    high_performance_mode: true,
    imu0: {
      enabled: true,
      accel_range_g: 32,
      gyro_range_dps: 2000,
      channels: { accel_x: true, accel_y: true, accel_z: true, gyro_x: true, gyro_y: true, gyro_z: false },
    },
    imu1: {
      enabled: true,
      accel_range_g: 16,
      gyro_range_dps: 500,
      channels: { accel_x: true, accel_y: true, accel_z: true, gyro_x: false, gyro_y: false, gyro_z: false },
    },
    imu2: {
      enabled: true,
      accel_range_g: 16,
      gyro_range_dps: 500,
      channels: { accel_x: true, accel_y: true, accel_z: true, gyro_x: false, gyro_y: false, gyro_z: false },
    },
    orientation: {
      imu0_rotation_matrix: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      imu1_rotation_matrix: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      imu2_rotation_matrix: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    bias: {
      imu0: [0, 0, 0, 0, 0, 0],
      imu1: [0, 0, 0, 0, 0, 0],
      imu2: [0, 0, 0, 0, 0, 0],
    },
  },
  gps: {
    sample_rate_hz: 5,
    dynamic_model: "automotive",
    nmea_sentences: ["GGA", "RMC"],
    sbas_enabled: true,
  },
  analog: {
    sample_rate_hz: 100,
    channels: [],
  },
  digital: {
    channels: [],
  },
  wheel_speed: {
    front: { enabled: false, points_per_revolution: 12, wheel_circumference_mm: 2300 },
    rear: { enabled: false, points_per_revolution: 12, wheel_circumference_mm: 2300 },
  },
  heart_rate_monitor: {
    enabled: true,
    device_address: "AA:BB:CC:DD:EE:FF",
    device_name: "Polar H10 12345678",
  },
};

describe("parseConfig", () => {
  it("parseConfig — SPEC §8's worked example verbatim — every field lands typed, zero repairs", () => {
    // Arrange
    const json = SPEC_WORKED_EXAMPLE;

    // Act
    const result = parseConfig(json);

    // Assert
    expect(result.repairs).toEqual([]);
    expect(result.config.config_version).toBe(1);
    expect(result.config.device_id).toBe("XXXXXXXXXXXX");
    expect(result.config.bike_profile).toEqual({ name: "Trek Session 2024", default_rider: "Rider Name" });
    expect(result.config.imu.sample_rate_hz).toBe(833);
    expect(result.config.imu.imu1.accel_range_g).toBe(16);
    expect(result.config.gps).toEqual({ sample_rate_hz: 5, dynamic_model: "automotive", nmea_sentences: ["GGA", "RMC"], sbas_enabled: true });
    expect(result.config.wheel_speed.front.enabled).toBe(false);
    expect(result.config.heart_rate_monitor).toEqual({
      enabled: true,
      device_address: "AA:BB:CC:DD:EE:FF",
      device_name: "Polar H10 12345678",
    });
  });

  it("parseConfig then serializeConfig — SPEC §8's worked example — round-trips to the same parsed value (idempotent)", () => {
    // Arrange
    const first = parseConfig(SPEC_WORKED_EXAMPLE);

    // Act
    const serialized = serializeConfig(first.config);
    const second = parseConfig(JSON.parse(serialized));

    // Assert
    expect(second.repairs).toEqual([]);
    expect(second.config).toEqual(first.config);
  });

  it("parseConfig — a top-level key the app has never seen — kept in unknown and re-emitted by serializeConfig verbatim", () => {
    // Arrange
    const json = { ...SPEC_WORKED_EXAMPLE, factory_calibration_date: "2026-01-15" };

    // Act
    const parsed = parseConfig(json);
    const reparsed = parseConfig(JSON.parse(serializeConfig(parsed.config)));

    // Assert
    expect(parsed.config.unknown).toEqual({ factory_calibration_date: "2026-01-15" });
    expect(reparsed.config.unknown).toEqual({ factory_calibration_date: "2026-01-15" });
  });

  it("parseConfig — heart_rate_monitor block absent — parses as enabled false (SPEC §8's stated equivalence)", () => {
    // Arrange
    const { heart_rate_monitor: _omit, ...json } = SPEC_WORKED_EXAMPLE;

    // Act
    const result = parseConfig(json);

    // Assert
    expect(result.config.heart_rate_monitor).toBeUndefined();
    expect(result.repairs).toEqual([]);
  });

  it("parseConfig — imu sub-blocks absent — all three IMUs inherit the top-level accel/gyro ranges (SPEC §8's per-IMU range resolution)", () => {
    // Arrange
    const json = {
      ...SPEC_WORKED_EXAMPLE,
      imu: { sample_rate_hz: 833, accel_range_g: 8, gyro_range_dps: 250, low_power_mode: false, high_performance_mode: true },
    };

    // Act
    const result = parseConfig(json);

    // Assert
    expect(result.config.imu.imu0.accel_range_g).toBe(8);
    expect(result.config.imu.imu1.gyro_range_dps).toBe(250);
    expect(result.config.imu.imu2.accel_range_g).toBe(8);
    expect(result.repairs).toEqual([]);
  });

  it("parseConfig — imu.sample_rate_hz is 800, not a valid ODR — value kept as read and a Repair recorded, never silently snapped", () => {
    // Arrange
    const json = { ...SPEC_WORKED_EXAMPLE, imu: { ...SPEC_WORKED_EXAMPLE.imu, sample_rate_hz: 800 } };

    // Act
    const result = parseConfig(json);

    // Assert
    expect(result.config.imu.sample_rate_hz).toBe(800);
    expect(result.repairs).toEqual([{ path: "imu.sample_rate_hz", reason: expect.stringContaining("not a valid IMU ODR") }]);
  });

  it("parseConfig — analog.channels holds a non-object entry — that entry is dropped with a Repair, the rest survive", () => {
    // Arrange
    const validChannel = { key: "strain_left", label: "Strain Left", adc_pin: 4, units: "kN", scale: 0.0123, offset: -1.5, enabled: true };
    const json = { ...SPEC_WORKED_EXAMPLE, analog: { sample_rate_hz: 100, channels: [validChannel, "not a channel", null] } };

    // Act
    const result = parseConfig(json);

    // Assert
    expect(result.config.analog.channels).toEqual([validChannel]);
    expect(result.repairs).toEqual([
      { path: "analog.channels[1]", reason: expect.stringContaining("entry dropped") },
      { path: "analog.channels[2]", reason: expect.stringContaining("entry dropped") },
    ]);
  });

  it("parseConfig — device_id missing — empty string plus a Repair; the field is read-only, never invented", () => {
    // Arrange
    const { device_id: _omit, ...json } = SPEC_WORKED_EXAMPLE;

    // Act
    const result = parseConfig(json);

    // Assert
    expect(result.config.device_id).toBe("");
    expect(result.repairs).toEqual([{ path: "device_id", reason: expect.stringContaining("read-only") }]);
  });

  it("parseConfig — malformed field types throughout the document — each field falls back to its default with a Repair, nothing thrown", () => {
    // Arrange
    const json = {
      config_version: "not-a-number",
      device_id: 12345,
      bike_profile: "not an object",
      imu: {
        sample_rate_hz: 833,
        accel_range_g: "not-a-number",
        gyro_range_dps: 2000,
        low_power_mode: "not-a-boolean",
        high_performance_mode: true,
        imu0: { enabled: "not-a-boolean", accel_range_g: 32, gyro_range_dps: 2000, channels: {} },
        imu1: SPEC_WORKED_EXAMPLE.imu.imu1,
        imu2: SPEC_WORKED_EXAMPLE.imu.imu2,
      },
      gps: { sample_rate_hz: 5, dynamic_model: "warp-speed", nmea_sentences: ["GGA", 42], sbas_enabled: true },
      analog: { sample_rate_hz: 100, channels: [] },
      digital: {
        channels: [{ key: "marker_btn", label: "Marker", kind: "not-a-kind", gpio_pin: "not-a-number", active_low: "not-a-boolean", debounce_ms: 20, enabled: true }],
      },
      wheel_speed: "not an object",
    };

    // Act
    const result = parseConfig(json);

    // Assert
    expect(result.config.config_version).toBe(1);
    expect(result.config.device_id).toBe("");
    expect(result.config.bike_profile).toEqual({ name: "", default_rider: "" });
    expect(result.config.imu.accel_range_g).toBe(32);
    expect(result.config.imu.low_power_mode).toBe(false);
    expect(result.config.imu.imu0.enabled).toBe(false);
    expect(result.config.gps.dynamic_model).toBe("automotive");
    expect(result.config.gps.nmea_sentences).toEqual(["GGA"]);
    expect(result.config.digital.channels[0].kind).toBe("marker");
    expect(result.config.digital.channels[0].gpio_pin).toBe(0);
    expect(result.config.digital.channels[0].active_low).toBe(false);
    expect(result.config.wheel_speed.front.enabled).toBe(false);
    expect(result.repairs.length).toBeGreaterThan(10);
  });

  it("parseConfig — imu.orientation and imu.bias present but malformed — falls back to the identity matrix and zero bias with Repairs", () => {
    // Arrange
    const json = {
      ...SPEC_WORKED_EXAMPLE,
      imu: {
        ...SPEC_WORKED_EXAMPLE.imu,
        orientation: { imu0_rotation_matrix: "not a matrix", imu1_rotation_matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], imu2_rotation_matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
        bias: { imu0: ["a", "b"], imu1: [0, 0, 0, 0, 0, 0], imu2: [0, 0, 0, 0, 0, 0] },
      },
    };

    // Act
    const result = parseConfig(json);

    // Assert
    expect(result.config.imu.orientation?.imu0_rotation_matrix).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(result.config.imu.bias?.imu0).toEqual([0, 0, 0, 0, 0, 0]);
    expect(result.repairs).toEqual([
      { path: "imu.orientation.imu0_rotation_matrix", reason: expect.stringContaining("identity matrix") },
      { path: "imu.bias.imu0", reason: expect.stringContaining("array of numbers") },
    ]);
  });

  it("parseConfig — not an object at all — returns defaultConfig with one Repair, never throws", () => {
    // Arrange
    const inputs: unknown[] = [null, 42, "not json", ["an", "array"]];

    for (const json of inputs) {
      // Act
      const result = parseConfig(json);

      // Assert
      expect(result.config).toEqual(defaultConfig(""));
      expect(result.repairs).toHaveLength(1);
    }
  });
});

describe("serializeConfig", () => {
  it("serializeConfig — a config with no HRM block — omits the key rather than emitting enabled:false (SPEC §8's equivalence, kept minimal)", () => {
    // Arrange
    const config: DeviceConfig = defaultConfig("aabbccddeeff");

    // Act
    const text = serializeConfig(config);
    const parsed = JSON.parse(text);

    // Assert
    expect(Object.prototype.hasOwnProperty.call(parsed, "heart_rate_monitor")).toBe(false);
  });
});

describe("defaultConfig", () => {
  it("defaultConfig — every field — matches SPEC §8's stated defaults exactly (wheel slots disabled, gps 5 Hz automotive, analog 100 Hz, empty channel arrays)", () => {
    // Arrange
    const deviceId = "aabbccddeeff";

    // Act
    const config = defaultConfig(deviceId);

    // Assert
    expect(config.device_id).toBe(deviceId);
    expect(config.config_version).toBe(1);
    expect(config.wheel_speed.front.enabled).toBe(false);
    expect(config.wheel_speed.rear.enabled).toBe(false);
    expect(config.gps).toEqual({ sample_rate_hz: 5, dynamic_model: "automotive", nmea_sentences: ["GGA", "RMC"], sbas_enabled: true });
    expect(config.analog).toEqual({ sample_rate_hz: 100, channels: [] });
    expect(config.digital).toEqual({ channels: [] });
    expect(config.heart_rate_monitor).toBeUndefined();
  });
});
