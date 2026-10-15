import { describe, expect, it } from "vitest";

import { defaultConfig } from "./config/defaults";
import { setImuEnabled, setImuHg, setImuRate } from "./config/edit";
import { describeLoad, LOAD_LIMIT_SPS, loggerLoad, samplesPerSecond } from "./loggerLoad";

describe("samplesPerSecond", () => {
  it("defaults, every IMU off — just the GPS fix rate", () => {
    // Arrange
    const config = defaultConfig("aabbccddeeff");

    // Act
    const sps = samplesPerSecond(config);

    // Assert
    expect(sps).toBe(config.gps.sample_rate_hz);
  });

  it("three IMUs at 480 Hz plus one pod's high-g at 960 Hz — 6 axes each plus 3 high-g axes", () => {
    // Arrange
    let config = defaultConfig("aabbccddeeff");
    config = setImuEnabled(config, "imu0", true);
    config = setImuEnabled(config, "imu1", true);
    config = setImuEnabled(config, "imu2", true);
    config = setImuRate(config, 480);
    config = setImuHg(config, "imu1", true);
    config.imu.hg_sample_rate_hz = 960;

    // Act
    const sps = samplesPerSecond(config);

    // Assert
    expect(sps).toBe(3 * 6 * 480 + 3 * 960 + config.gps.sample_rate_hz);
  });

  it("high-g on a disabled pod — not counted", () => {
    // Arrange
    let config = defaultConfig("aabbccddeeff");
    config = setImuHg(config, "imu2", true);

    // Act
    const sps = samplesPerSecond(config);

    // Assert
    expect(sps).toBe(config.gps.sample_rate_hz);
  });
});

describe("loggerLoad", () => {
  it("under 60 % of the limit — green; under the limit — amber; at or over — red", () => {
    // Arrange
    let one = defaultConfig("aabbccddeeff");
    one = setImuEnabled(one, "imu0", true);
    let three = setImuEnabled(setImuEnabled(one, "imu1", true), "imu2", true);
    three = setImuRate(three, 960);

    // Act
    const green = loggerLoad(setImuRate(one, 960)); // 5,760/s
    const amber = loggerLoad(three); // 17,280/s
    const red = loggerLoad(setImuRate(three, 1920)); // 34,560/s

    // Assert
    expect(green.rating).toBe("good");
    expect(amber.rating).toBe("warn");
    expect(red.rating).toBe("bad");
    expect(red.fraction).toBeGreaterThanOrEqual(1);
  });

  it("describeLoad — the count against the estimated limit, marked approximate", () => {
    // Act
    const text = describeLoad({ samplesPerSecond: 8700.4, fraction: 8700.4 / LOAD_LIMIT_SPS, rating: "good" });

    // Assert
    expect(text).toBe("8,700 samples/s of ~20,000");
  });
});
