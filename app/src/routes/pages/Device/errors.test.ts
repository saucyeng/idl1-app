import { describe, expect, it } from "vitest";

import { describeIpcError } from "./errors";

describe("describeIpcError", () => {
  it("describeIpcError — kind ble — text names Bluetooth, not a stack trace", () => {
    // Arrange
    const error = { kind: "ble", message: "adapter timeout" };

    // Act
    const text = describeIpcError(error);

    // Assert
    expect(text.toLowerCase()).toContain("bluetooth");
    expect(text).not.toContain("at ");
    expect(text).not.toContain("adapter timeout");
  });

  it("describeIpcError — kind config — text says the device rejected the config, distinct from config_parse's local-validation text", () => {
    // Arrange
    const configError = { kind: "config", message: "nak" };
    const configParseError = { kind: "config_parse", message: "bad json" };

    // Act
    const configText = describeIpcError(configError);
    const configParseText = describeIpcError(configParseError);

    // Assert
    expect(configText.toLowerCase()).toContain("rejected");
    expect(configText).not.toBe(configParseText);
  });

  it("describeIpcError — an unknown kind — generic text, never throws (C3 §5: kinds are additive)", () => {
    // Arrange
    const error = { kind: "some_future_kind", message: "whatever the future adds" };

    // Act
    const call = () => describeIpcError(error);

    // Assert
    expect(call).not.toThrow();
    expect(describeIpcError(error).length).toBeGreaterThan(0);
  });
});
