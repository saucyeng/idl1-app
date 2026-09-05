import { describe, expect, it } from "vitest";

import { defaultConfig } from "./config/defaults";
import type { AnalogChannel, DigitalChannel } from "./config/model";
import { listSources } from "./sources";

/** A config with one analog and one digital entry, mirroring SPEC §8's
 *  worked example closely enough to exercise every source kind
 *  `listSources` reports on — matches `sourcesPreview.test.ts`'s fixture
 *  since `listSources` joins onto `previewSources`'s output. */
function configWithOneOfEach() {
  const config = defaultConfig("aabbccddeeff");
  config.imu.imu0.enabled = true;
  config.imu.imu0.channels.accel_x = true;

  const analogChannel: AnalogChannel = {
    key: "strain_left",
    label: "Strain Left",
    adc_pin: 4,
    units: "kN",
    scale: 0.0123,
    offset: -1.5,
    enabled: true,
  };
  config.analog.channels.push(analogChannel);

  const digitalChannel: DigitalChannel = {
    key: "marker_btn",
    label: "Marker",
    kind: "marker",
    gpio_pin: 21,
    active_low: true,
    debounce_ms: 20,
    enabled: true,
  };
  config.digital.channels.push(digitalChannel);

  return config;
}

describe("listSources", () => {
  it("listSources — SPEC §8's worked example — the six fixed sources in a stable order, hardware-pinned ones first", () => {
    const config = configWithOneOfEach();

    const sourceKeys = listSources(config).map((view) => view.sourceKey);

    expect(sourceKeys.slice(0, 6)).toEqual(["imu0", "imu1", "imu2", "gps", "wheel_front", "wheel_rear"]);
  });

  it("listSources — two analog entries — one source each, keyed by the entry's own config key, after the fixed sources", () => {
    const config = configWithOneOfEach();
    const secondAnalog: AnalogChannel = {
      key: "strain_right",
      label: "Strain Right",
      adc_pin: 5,
      units: "kN",
      scale: 0.0098,
      offset: 0.5,
      enabled: false,
    };
    config.analog.channels.push(secondAnalog);

    const views = listSources(config);
    const sourceKeys = views.map((view) => view.sourceKey);

    expect(sourceKeys.indexOf("strain_left")).toBeGreaterThanOrEqual(6);
    expect(sourceKeys.indexOf("strain_right")).toBeGreaterThan(sourceKeys.indexOf("strain_left"));
  });

  it("listSources — an HRM with a device_name — label carries the name; without one — the bare label", () => {
    const withName = configWithOneOfEach();
    withName.heart_rate_monitor = { enabled: true, device_address: "AA:BB:CC:DD:EE:FF", device_name: "Polar H10" };
    const withoutName = configWithOneOfEach();

    const withNameLabel = listSources(withName).find((v) => v.sourceKey === "heart_rate_monitor")?.label;
    const withoutNameLabel = listSources(withoutName).find((v) => v.sourceKey === "heart_rate_monitor")?.label;

    expect(withNameLabel).toBe("Heart Rate Monitor — Polar H10");
    expect(withoutNameLabel).toBe("Heart Rate Monitor");
  });

  it("listSources — GPS — sampleRateHz from the config; wheel and marker sources — null (event-driven), matching previewSources", () => {
    const config = configWithOneOfEach();

    const views = listSources(config);

    expect(views.find((v) => v.sourceKey === "gps")?.sampleRateHz).toBe(config.gps.sample_rate_hz);
    expect(views.find((v) => v.sourceKey === "wheel_front")?.sampleRateHz).toBeNull();
    expect(views.find((v) => v.sourceKey === "wheel_rear")?.sampleRateHz).toBeNull();
    expect(views.find((v) => v.sourceKey === "marker_btn")?.sampleRateHz).toBeNull();
  });

  it("listSources — a disabled source — present in the list, marked disabled (idl0 shows IMU/GPS/HRM even when off)", () => {
    const config = configWithOneOfEach();
    config.imu.imu1.enabled = false;

    const views = listSources(config);
    const imu1 = views.find((v) => v.sourceKey === "imu1");

    expect(imu1).toBeDefined();
    expect(imu1?.enabled).toBe(false);
  });

  it("listSources — an IMU — six axis rows regardless of which are enabled, each carrying its own enable state, none carrying scale/offset", () => {
    const config = configWithOneOfEach();

    const imu0 = listSources(config).find((v) => v.sourceKey === "imu0");

    expect(imu0?.channels).toHaveLength(6);
    expect(imu0?.channels.map((c) => c.name)).toEqual(["accel_x", "accel_y", "accel_z", "gyro_x", "gyro_y", "gyro_z"]);
    expect(imu0?.channels.find((c) => c.name === "accel_x")?.enabled).toBe(true);
    expect(imu0?.channels.find((c) => c.name === "accel_y")?.enabled).toBe(false);
    for (const channel of imu0?.channels ?? []) {
      expect(channel.scale).toBeUndefined();
      expect(channel.offset).toBeUndefined();
    }
  });

  it("listSources — an analog entry — its channel row carries the entry's own scale/offset from the config, unchanged from what was typed", () => {
    const config = configWithOneOfEach();

    const analog = listSources(config).find((v) => v.sourceKey === "strain_left");

    expect(analog?.channels).toHaveLength(1);
    expect(analog?.channels[0].scale).toBe(0.0123);
    expect(analog?.channels[0].offset).toBe(-1.5);
  });

  it("listSources — wheel and HRM breakdown rows — named with the exact SPEC §5.4 registry channel name, never an invented word", () => {
    const config = configWithOneOfEach();
    config.heart_rate_monitor = { enabled: true, device_address: "AA:BB:CC:DD:EE:FF", device_name: "Polar H10" };

    const views = listSources(config);
    const wheelFront = views.find((v) => v.sourceKey === "wheel_front");
    const wheelRear = views.find((v) => v.sourceKey === "wheel_rear");
    const hrm = views.find((v) => v.sourceKey === "heart_rate_monitor");

    expect(wheelFront?.channels.map((c) => c.name)).toEqual(["WheelFront"]);
    expect(wheelRear?.channels.map((c) => c.name)).toEqual(["WheelRear"]);
    expect(hrm?.channels.map((c) => c.name)).toEqual(["HR_BPM"]);
  });

  it("listSources — GPS breakdown — the six GPS_* registry channels SPEC §5.4 names, never a collapsed synthetic row", () => {
    const config = configWithOneOfEach();

    const gps = listSources(config).find((v) => v.sourceKey === "gps");

    expect(gps?.channels.map((c) => c.name)).toEqual([
      "GPS_Latitude",
      "GPS_Longitude",
      "GPS_Altitude",
      "GPS_SpeedKmh",
      "GPS_Heading",
      "GPS_EpochMs",
    ]);
  });
});
