import { describe, expect, it } from "vitest";

import { defaultConfig } from "./defaults";
import { addChannelOptions, newAnalogChannel, newDigitalMarker } from "./newChannel";

describe("newAnalogChannel", () => {
  it("newAnalogChannel — an empty config — key \"analog_1\"", () => {
    // Arrange
    const config = defaultConfig("aabbccddeeff");

    // Act
    const channel = newAnalogChannel(config);

    // Assert
    expect(channel.key).toBe("analog_1");
  });

  it("newAnalogChannel — a config already holding analog_1 — key \"analog_2\", never a duplicate", () => {
    // Arrange
    const config = defaultConfig("aabbccddeeff");
    config.analog.channels = [{ key: "analog_1", label: "Strain", adc_pin: 4, units: "kN", scale: 1, offset: 0, enabled: true }];

    // Act
    const channel = newAnalogChannel(config);

    // Assert
    expect(channel.key).toBe("analog_2");
  });

  it("newAnalogChannel — defaults — enabled true, scale 1, offset 0, pin unassigned, matching SPEC §8's example entry shape", () => {
    // Arrange
    const config = defaultConfig("aabbccddeeff");

    // Act
    const channel = newAnalogChannel(config);

    // Assert
    expect(channel.enabled).toBe(true);
    expect(channel.scale).toBe(1);
    expect(channel.offset).toBe(0);
    expect(channel.adc_pin).toBeNull();
  });
});

describe("newDigitalMarker", () => {
  it("newDigitalMarker — defaults — kind \"marker\", active_low true, debounce_ms 20, pin unassigned (SPEC §8's example)", () => {
    // Arrange
    const config = defaultConfig("aabbccddeeff");

    // Act
    const channel = newDigitalMarker(config);

    // Assert
    expect(channel.kind).toBe("marker");
    expect(channel.active_low).toBe(true);
    expect(channel.debounce_ms).toBe(20);
    expect(channel.gpio_pin).toBeNull();
    expect(channel.enabled).toBe(true);
  });

  it("newDigitalMarker — a config already holding marker_1 — key \"marker_2\", never a duplicate", () => {
    // Arrange
    const config = defaultConfig("aabbccddeeff");
    config.digital.channels = [{ key: "marker_1", label: "Marker", kind: "marker", gpio_pin: 21, active_low: true, debounce_ms: 20, enabled: true }];

    // Act
    const channel = newDigitalMarker(config);

    // Assert
    expect(channel.key).toBe("marker_2");
  });
});

describe("addChannelOptions", () => {
  it("addChannelOptions — both wheel slots already enabled — both wheel entries carry a disabledReason", () => {
    // Arrange
    const config = defaultConfig("aabbccddeeff");
    config.wheel_speed.front.enabled = true;
    config.wheel_speed.rear.enabled = true;

    // Act
    const options = addChannelOptions(config);

    // Assert
    const front = options.find((o) => o.key === "wheel_front");
    const rear = options.find((o) => o.key === "wheel_rear");
    expect(front?.disabledReason).not.toBeNull();
    expect(rear?.disabledReason).not.toBeNull();
  });

  it("addChannelOptions — neither wheel slot enabled — both wheel entries have no disabledReason", () => {
    // Arrange
    const config = defaultConfig("aabbccddeeff");

    // Act
    const options = addChannelOptions(config);

    // Assert
    const front = options.find((o) => o.key === "wheel_front");
    const rear = options.find((o) => o.key === "wheel_rear");
    expect(front?.disabledReason).toBeNull();
    expect(rear?.disabledReason).toBeNull();
  });

  it("addChannelOptions — always — level and pwm digital kinds absent from the options (SPEC §8: reserved, not exposed)", () => {
    // Arrange
    const config = defaultConfig("aabbccddeeff");

    // Act
    const options = addChannelOptions(config);

    // Assert
    const labels = options.map((o) => o.label.toLowerCase());
    expect(labels.some((l) => l.includes("level"))).toBe(false);
    expect(labels.some((l) => l.includes("pwm"))).toBe(false);
  });
});
