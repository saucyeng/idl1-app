import { describe, expect, it } from "vitest";

import { defaultConfig } from "./defaults";
import type { AnalogChannel, DigitalChannel } from "./model";
import { previewSources } from "./sourcesPreview";

/** A default config with imu0 enabled and one analog + one digital channel,
 *  mirroring SPEC §8's worked example closely enough to exercise every
 *  source kind `previewSources` reports on. */
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

describe("previewSources", () => {
  it("previewSources — SPEC §8's worked example — one row per fixed source (imu0/1/2, gps, wheel front/rear) plus one row per analog/digital entry, plus hrm", () => {
    const config = configWithOneOfEach();

    const rows = previewSources(config);

    const sourceKeys = rows.map((row) => row.sourceKey);
    expect(sourceKeys).toEqual([
      "imu0",
      "imu1",
      "imu2",
      "gps",
      "wheel_front",
      "wheel_rear",
      "strain_left",
      "marker_btn",
      "heart_rate_monitor",
    ]);
  });

  it("previewSources — a disabled imu slot — enabled false, sampleRateHz still reported (the bus rate is shared and always known, unlike a per-axis rate)", () => {
    const config = defaultConfig("aabbccddeeff");
    config.imu.imu1.enabled = false;

    const rows = previewSources(config);

    const imu1 = rows.find((row) => row.sourceKey === "imu1");
    expect(imu1?.enabled).toBe(false);
    expect(imu1?.sampleRateHz).toBe(config.imu.sample_rate_hz);
  });

  it("previewSources — wheel front enabled, rear disabled — front's row enabled true, rear's enabled false, both sampleRateHz null", () => {
    const config = defaultConfig("aabbccddeeff");
    config.wheel_speed.front.enabled = true;
    config.wheel_speed.rear.enabled = false;

    const rows = previewSources(config);

    const front = rows.find((row) => row.sourceKey === "wheel_front");
    const rear = rows.find((row) => row.sourceKey === "wheel_rear");
    expect(front?.enabled).toBe(true);
    expect(front?.sampleRateHz).toBeNull();
    expect(rear?.enabled).toBe(false);
    expect(rear?.sampleRateHz).toBeNull();
  });

  it("previewSources — two analog channels — one row per entry, each carrying its own units", () => {
    const config = defaultConfig("aabbccddeeff");
    const channelA: AnalogChannel = {
      key: "strain_left",
      label: "Strain Left",
      adc_pin: 4,
      units: "kN",
      scale: 0.0123,
      offset: -1.5,
      enabled: true,
    };
    const channelB: AnalogChannel = {
      key: "strain_right",
      label: "Strain Right",
      adc_pin: 5,
      units: "bar",
      scale: 1,
      offset: 0,
      enabled: false,
    };
    config.analog.channels.push(channelA, channelB);

    const rows = previewSources(config);

    const rowA = rows.find((row) => row.sourceKey === "strain_left");
    const rowB = rows.find((row) => row.sourceKey === "strain_right");
    expect(rowA?.units).toBe("kN");
    expect(rowA?.enabled).toBe(true);
    expect(rowA?.sampleRateHz).toBe(config.analog.sample_rate_hz);
    expect(rowB?.units).toBe("bar");
    expect(rowB?.enabled).toBe(false);
    expect(rowB?.sampleRateHz).toBe(config.analog.sample_rate_hz);
  });

  it("previewSources — heart_rate_monitor absent — hrm row present with enabled false (SPEC §8: absence equals disabled), sampleRateHz null", () => {
    const config = defaultConfig("aabbccddeeff");
    expect(config.heart_rate_monitor).toBeUndefined();

    const rows = previewSources(config);

    const hrm = rows.find((row) => row.sourceKey === "heart_rate_monitor");
    expect(hrm?.enabled).toBe(false);
    expect(hrm?.sampleRateHz).toBeNull();
  });

  it("previewSources — heart_rate_monitor enabled — hrm row enabled true, sampleRateHz null (two different rates, HR_BPM and HR_RR — reported as neither, not a guess)", () => {
    const config = defaultConfig("aabbccddeeff");
    config.heart_rate_monitor = {
      enabled: true,
      device_address: "AA:BB:CC:DD:EE:FF",
      device_name: "Polar H10 12345678",
    };

    const rows = previewSources(config);

    const hrm = rows.find((row) => row.sourceKey === "heart_rate_monitor");
    expect(hrm?.enabled).toBe(true);
    expect(hrm?.sampleRateHz).toBeNull();
  });

  it("previewSources — no source's sampleRateHz claims a value SPEC §5.2 does not state — an event-driven source is always null, never 0", () => {
    const config = configWithOneOfEach();

    const rows = previewSources(config);

    const wheelFront = rows.find((row) => row.sourceKey === "wheel_front");
    const wheelRear = rows.find((row) => row.sourceKey === "wheel_rear");
    const marker = rows.find((row) => row.sourceKey === "marker_btn");
    const hrm = rows.find((row) => row.sourceKey === "heart_rate_monitor");
    expect(wheelFront?.sampleRateHz).not.toBe(0);
    expect(wheelFront?.sampleRateHz).toBeNull();
    expect(wheelRear?.sampleRateHz).not.toBe(0);
    expect(wheelRear?.sampleRateHz).toBeNull();
    expect(marker?.sampleRateHz).not.toBe(0);
    expect(marker?.sampleRateHz).toBeNull();
    expect(hrm?.sampleRateHz).not.toBe(0);
    expect(hrm?.sampleRateHz).toBeNull();
  });
});
