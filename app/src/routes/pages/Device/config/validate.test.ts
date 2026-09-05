import { describe, expect, it } from "vitest";

import { parseConfig } from "./model";
import type { DeviceConfig } from "./model";
import { isPushable, validateConfig } from "./validate";

/** SPEC §8's own worked-example `idl0_config.json`, verbatim — the fixture
 *  every zero-issue test below parses. A local copy, not imported from
 *  `model.test.ts`, so this file's fixture data cannot drift silently out
 *  of step with a change made only on the model side. */
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

/** A fresh, structurally-independent parse of `SPEC_WORKED_EXAMPLE`, so
 *  each test can mutate its own copy without leaking into another test. */
function workedConfig(): DeviceConfig {
  return structuredClone(parseConfig(SPEC_WORKED_EXAMPLE).config);
}

describe("validateConfig", () => {
  it("validateConfig — SPEC §8's worked example — no issues at all", () => {
    // Arrange
    const config = workedConfig();

    // Act
    const issues = validateConfig(config);

    // Assert
    expect(issues).toEqual([]);
  });

  it("validateConfig — imu.sample_rate_hz 800 in high-performance mode — one error naming the valid ODR set", () => {
    // Arrange
    const config = workedConfig();
    config.imu.sample_rate_hz = 800;

    // Act
    const issues = validateConfig(config);

    // Assert
    const rateIssues = issues.filter((i) => i.path === "imu.sample_rate_hz");
    expect(rateIssues).toHaveLength(1);
    expect(rateIssues[0].severity).toBe("error");
    expect(rateIssues[0].message).toMatch(/12\.5.*1666|1666.*12\.5/);
  });

  it("validateConfig — imu.sample_rate_hz 1666 with low_power_mode true — an error: 1666 is high-perf only (SPEC §8's two rate tables)", () => {
    // Arrange
    const config = workedConfig();
    config.imu.sample_rate_hz = 1666;
    config.imu.low_power_mode = true;

    // Act
    const issues = validateConfig(config);

    // Assert
    const rateIssues = issues.filter((i) => i.path === "imu.sample_rate_hz");
    expect(rateIssues).toHaveLength(1);
    expect(rateIssues[0].severity).toBe("error");
  });

  it("validateConfig — imu.low_power_mode and imu.high_performance_mode both true — a warning, not an error: SPEC §8 does not say which flag wins", () => {
    // Arrange
    const config = workedConfig();
    config.imu.low_power_mode = true;
    config.imu.high_performance_mode = true;

    // Act
    const issues = validateConfig(config);

    // Assert
    const modeIssues = issues.filter((i) => i.path === "imu.low_power_mode");
    expect(modeIssues).toHaveLength(1);
    expect(modeIssues[0].severity).toBe("warning");
    expect(modeIssues[0].message).toBe("low_power_mode and high_performance_mode both set; firmware behaviour unspecified (SPEC §8)");
  });

  it("validateConfig — imu0.accel_range_g 20 — an error listing ±4/8/16/32 g", () => {
    // Arrange
    const config = workedConfig();
    config.imu.imu0.accel_range_g = 20;

    // Act
    const issues = validateConfig(config);

    // Assert
    const rangeIssues = issues.filter((i) => i.path === "imu0.accel_range_g");
    expect(rangeIssues).toHaveLength(1);
    expect(rangeIssues[0].severity).toBe("error");
    expect(rangeIssues[0].message).toContain("4");
    expect(rangeIssues[0].message).toContain("8");
    expect(rangeIssues[0].message).toContain("16");
    expect(rangeIssues[0].message).toContain("32");
  });

  it("validateConfig — imu0 enabled with every axis false — a warning, not an error: an enabled IMU logging nothing is a mistake, not undefined hardware behaviour", () => {
    // Arrange
    const config = workedConfig();
    config.imu.imu0.channels = {
      accel_x: false,
      accel_y: false,
      accel_z: false,
      gyro_x: false,
      gyro_y: false,
      gyro_z: false,
    };

    // Act
    const issues = validateConfig(config);

    // Assert
    const channelIssues = issues.filter((i) => i.path === "imu0.channels");
    expect(channelIssues).toHaveLength(1);
    expect(channelIssues[0].severity).toBe("warning");
  });

  it("validateConfig — gps.sample_rate_hz 0 and 11 — an error each, naming the 1..10 Hz range", () => {
    // Arrange
    const configLow = workedConfig();
    configLow.gps.sample_rate_hz = 0;
    const configHigh = workedConfig();
    configHigh.gps.sample_rate_hz = 11;

    // Act
    const issuesLow = validateConfig(configLow).filter((i) => i.path === "gps.sample_rate_hz");
    const issuesHigh = validateConfig(configHigh).filter((i) => i.path === "gps.sample_rate_hz");

    // Assert
    expect(issuesLow).toHaveLength(1);
    expect(issuesLow[0].severity).toBe("error");
    expect(issuesLow[0].message).toContain("1");
    expect(issuesLow[0].message).toContain("10");
    expect(issuesHigh).toHaveLength(1);
    expect(issuesHigh[0].severity).toBe("error");
  });

  it("validateConfig — gps.sample_rate_hz 5.5 — an error: the spec says integer", () => {
    // Arrange
    const config = workedConfig();
    config.gps.sample_rate_hz = 5.5;

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "gps.sample_rate_hz");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toMatch(/integer/i);
  });

  it("validateConfig — gps.dynamic_model \"car\" — an error listing the five valid models", () => {
    // Arrange
    const config = workedConfig();
    config.gps.dynamic_model = "car" as DeviceConfig["gps"]["dynamic_model"];

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "gps.dynamic_model");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    for (const model of ["portable", "pedestrian", "automotive", "sea", "airborne"]) {
      expect(issues[0].message).toContain(model);
    }
  });

  it("validateConfig — gps.nmea_sentences empty — a warning: the parser needs GGA and RMC", () => {
    // Arrange
    const config = workedConfig();
    config.gps.nmea_sentences = [];

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "gps.nmea_sentences");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].message).toContain("GGA");
    expect(issues[0].message).toContain("RMC");
  });

  it("validateConfig — two analog channels sharing a key — one error per duplicate, naming the key", () => {
    // Arrange
    const config = workedConfig();
    config.analog.channels = [
      { key: "strain_left", label: "A", adc_pin: 4, units: "kN", scale: 1, offset: 0, enabled: true },
      { key: "strain_left", label: "B", adc_pin: 5, units: "kN", scale: 1, offset: 0, enabled: true },
    ];

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "analog.channels[1].key");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toContain("strain_left");
  });

  it("validateConfig — an analog channel with an empty key — an error; the key addresses the entry in the array", () => {
    // Arrange
    const config = workedConfig();
    config.analog.channels = [{ key: "", label: "A", adc_pin: 4, units: "kN", scale: 1, offset: 0, enabled: true }];

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "analog.channels[0].key");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
  });

  it("validateConfig — an analog channel with scale 0 — an error: every sample would read as the offset", () => {
    // Arrange
    const config = workedConfig();
    config.analog.channels = [{ key: "strain_left", label: "A", adc_pin: 4, units: "kN", scale: 0, offset: -1.5, enabled: true }];

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "analog.channels[0].scale");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
  });

  it("validateConfig — two analog channels on the same adc_pin — an error naming both paths", () => {
    // Arrange
    const config = workedConfig();
    config.analog.channels = [
      { key: "strain_left", label: "A", adc_pin: 4, units: "kN", scale: 1, offset: 0, enabled: true },
      { key: "strain_right", label: "B", adc_pin: 4, units: "kN", scale: 1, offset: 0, enabled: true },
    ];

    // Act
    const issues = validateConfig(config).filter((i) => i.severity === "error" && i.message.includes("adc_pin"));

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("analog.channels[0].adc_pin");
    expect(issues[0].message).toContain("analog.channels[1].adc_pin");
  });

  it("validateConfig — an analog channel with adc_pin null (unassigned) — an error, so a draft channel can never be pushed (ruling R58)", () => {
    // Arrange
    const config = workedConfig();
    config.analog.channels = [{ key: "strain_left", label: "A", adc_pin: null, units: "kN", scale: 1, offset: 0, enabled: true }];

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "analog.channels[0].adc_pin");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toBe("pin unassigned");
  });

  it("validateConfig — an analog channel with adc_pin -1 — an error naming a non-negative-integer requirement (ruling R58)", () => {
    // Arrange
    const config = workedConfig();
    config.analog.channels = [{ key: "strain_left", label: "A", adc_pin: -1, units: "kN", scale: 1, offset: 0, enabled: true }];

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "analog.channels[0].adc_pin");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toBe("pin must be a non-negative integer");
  });

  it("validateConfig — an analog channel with adc_pin 1.5 — an error naming a non-negative-integer requirement", () => {
    // Arrange
    const config = workedConfig();
    config.analog.channels = [{ key: "strain_left", label: "A", adc_pin: 1.5, units: "kN", scale: 1, offset: 0, enabled: true }];

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "analog.channels[0].adc_pin");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toBe("pin must be a non-negative integer");
  });

  it("validateConfig — two analog channels both unassigned (adc_pin null) — each gets its own unassigned error, never a collision error between them", () => {
    // Arrange
    const config = workedConfig();
    config.analog.channels = [
      { key: "strain_left", label: "A", adc_pin: null, units: "kN", scale: 1, offset: 0, enabled: true },
      { key: "strain_right", label: "B", adc_pin: null, units: "kN", scale: 1, offset: 0, enabled: true },
    ];

    // Act
    const issues = validateConfig(config);
    const unassigned = issues.filter((i) => i.message === "pin unassigned");
    const collisions = issues.filter((i) => i.message.includes("both claim pin"));

    // Assert
    expect(unassigned).toHaveLength(2);
    expect(collisions).toHaveLength(0);
  });

  it("validateConfig — a digital channel with gpio_pin null (unassigned) — an error (ruling R58)", () => {
    // Arrange
    const config = workedConfig();
    config.digital.channels = [{ key: "marker_btn", label: "Marker", kind: "marker", gpio_pin: null, active_low: true, debounce_ms: 20, enabled: true }];

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "digital.channels[0].gpio_pin");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toBe("pin unassigned");
  });

  it("validateConfig — a digital channel with gpio_pin -1 — an error naming a non-negative-integer requirement (ruling R58)", () => {
    // Arrange
    const config = workedConfig();
    config.digital.channels = [{ key: "marker_btn", label: "Marker", kind: "marker", gpio_pin: -1, active_low: true, debounce_ms: 20, enabled: true }];

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "digital.channels[0].gpio_pin");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toBe("pin must be a non-negative integer");
  });

  it("validateConfig — a digital channel with gpio_pin 1.5 — an error naming a non-negative-integer requirement", () => {
    // Arrange
    const config = workedConfig();
    config.digital.channels = [{ key: "marker_btn", label: "Marker", kind: "marker", gpio_pin: 1.5, active_low: true, debounce_ms: 20, enabled: true }];

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "digital.channels[0].gpio_pin");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toBe("pin must be a non-negative integer");
  });

  it("validateConfig — a digital channel with kind \"level\" — a warning: the schema reserves it but Spec 1 firmware does not ship it", () => {
    // Arrange
    const config = workedConfig();
    config.digital.channels = [{ key: "reed", label: "Reed", kind: "level", gpio_pin: 21, active_low: false, debounce_ms: 20, enabled: true }];

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "digital.channels[0].kind");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
  });

  it("validateConfig — a digital channel with debounce_ms negative — an error", () => {
    // Arrange
    const config = workedConfig();
    config.digital.channels = [{ key: "marker_btn", label: "Marker", kind: "marker", gpio_pin: 21, active_low: true, debounce_ms: -5, enabled: true }];

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "digital.channels[0].debounce_ms");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
  });

  it("validateConfig — two channels (one analog, one digital) sharing a gpio/adc pin number — an error: one physical pin, two claims", () => {
    // Arrange
    const config = workedConfig();
    config.analog.channels = [{ key: "strain_left", label: "A", adc_pin: 21, units: "kN", scale: 1, offset: 0, enabled: true }];
    config.digital.channels = [{ key: "marker_btn", label: "Marker", kind: "marker", gpio_pin: 21, active_low: true, debounce_ms: 20, enabled: true }];

    // Act
    const issues = validateConfig(config).filter((i) => i.severity === "error" && i.message.includes("pin 21"));

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("analog.channels[0].adc_pin");
    expect(issues[0].message).toContain("digital.channels[0].gpio_pin");
  });

  it("validateConfig — wheel slot enabled with points_per_revolution 0 — an error: a divide-by-zero in every speed derivation", () => {
    // Arrange
    const config = workedConfig();
    config.wheel_speed.front = { enabled: true, points_per_revolution: 0, wheel_circumference_mm: 2300 };

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "wheel_speed.front.points_per_revolution");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
  });

  it("validateConfig — wheel slot enabled with wheel_circumference_mm 0 — an error", () => {
    // Arrange
    const config = workedConfig();
    config.wheel_speed.rear = { enabled: true, points_per_revolution: 12, wheel_circumference_mm: 0 };

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "wheel_speed.rear.wheel_circumference_mm");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
  });

  it("validateConfig — wheel slot disabled with nonsense values — no issue: a disabled slot is not pushed to hardware", () => {
    // Arrange
    const config = workedConfig();
    config.wheel_speed.front = { enabled: false, points_per_revolution: -5, wheel_circumference_mm: -100 };

    // Act
    const issues = validateConfig(config);

    // Assert
    expect(issues).toEqual([]);
  });

  it("validateConfig — HRM enabled with a lowercase address — an error naming the uppercase colon-separated format (SPEC §8)", () => {
    // Arrange
    const config = workedConfig();
    config.heart_rate_monitor = { enabled: true, device_address: "aa:bb:cc:dd:ee:ff", device_name: "Polar H10" };

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "heart_rate_monitor.device_address");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
  });

  it("validateConfig — HRM enabled with an empty address — an error", () => {
    // Arrange
    const config = workedConfig();
    config.heart_rate_monitor = { enabled: true, device_address: "", device_name: "Polar H10" };

    // Act
    const issues = validateConfig(config).filter((i) => i.path === "heart_rate_monitor.device_address");

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
  });

  it("validateConfig — HRM disabled with an empty address — no issue: enabled false retains a saved address, and none is fine", () => {
    // Arrange
    const config = workedConfig();
    config.heart_rate_monitor = { enabled: false, device_address: "", device_name: "" };

    // Act
    const issues = validateConfig(config);

    // Assert
    expect(issues).toEqual([]);
  });
});

describe("isPushable", () => {
  it("isPushable — issues contain only warnings — true; one error — false", () => {
    // Arrange
    const onlyWarnings = [{ path: "gps.nmea_sentences", severity: "warning" as const, message: "needs GGA/RMC" }];
    const withError = [
      { path: "gps.nmea_sentences", severity: "warning" as const, message: "needs GGA/RMC" },
      { path: "gps.sample_rate_hz", severity: "error" as const, message: "out of range" },
    ];

    // Act
    const pushableWarningsOnly = isPushable(onlyWarnings);
    const pushableWithError = isPushable(withError);

    // Assert
    expect(pushableWarningsOnly).toBe(true);
    expect(pushableWithError).toBe(false);
  });
});
