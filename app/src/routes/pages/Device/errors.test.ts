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

  it("describeIpcError — kind config with a device-given reason — the reason is appended verbatim", () => {
    // Arrange
    const error = { kind: "config", message: "unsupported config_version" };

    // Act
    const text = describeIpcError(error);

    // Assert
    expect(text).toContain("unsupported config_version");
    expect(text.startsWith("The device rejected the config it was sent")).toBe(true);
  });

  it("describeIpcError — kind config with an empty message — falls back to the generic sentence, no bare trailing colon", () => {
    // Arrange
    const error = { kind: "config", message: "" };

    // Act
    const text = describeIpcError(error);

    // Assert
    expect(text).toBe("The device rejected the config it was sent. Nothing was changed on the device.");
    expect(text).not.toContain(":");
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

  it("describeIpcError — wifi with join_ap hint — names the network to join", () => {
    // Arrange
    const error = { kind: "wifi", message: "GET /ping failed", detail: { hint: "join_ap", ssid: "IDL0-A3F2" } };

    // Act
    const text = describeIpcError(error);

    // Assert
    expect(text).toContain("IDL0-A3F2");
    expect(text.toLowerCase()).toContain("join");
  });

  it("describeIpcError — kind permission_denied — asks for the permission, not a retry", () => {
    // Arrange
    const error = { kind: "permission_denied", message: "denied", detail: { permission: "ble" } };

    // Act
    const text = describeIpcError(error);

    // Assert
    expect(text.toLowerCase()).toContain("permission");
    expect(text).not.toContain("denied");
  });
});
