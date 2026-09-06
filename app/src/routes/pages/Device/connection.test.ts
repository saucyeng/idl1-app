import { describe, expect, it } from "vitest";

import { connectionReducer, initialConnectionState } from "./connection";

describe("connectionReducer", () => {
  it("connectionReducer — DEVICE_DISCOVERED twice for the same device_id — one entry, the newer rssi kept", () => {
    // Arrange
    const scanning = connectionReducer(initialConnectionState, { type: "SCAN_START" });
    const first = { device_id: "d1", name: "IDL0-A3F2", rssi_dbm: -70 };
    const second = { device_id: "d1", name: "IDL0-A3F2", rssi_dbm: -40 };

    // Act
    const afterFirst = connectionReducer(scanning, { type: "DEVICE_DISCOVERED", device: first });
    const afterSecond = connectionReducer(afterFirst, { type: "DEVICE_DISCOVERED", device: second });

    // Assert
    expect(afterSecond.discovered).toHaveLength(1);
    expect(afterSecond.discovered[0].rssi_dbm).toBe(-40);
  });

  it("connectionReducer — DEVICE_DISCOVERED — list stays sorted by rssi_dbm descending (strongest first)", () => {
    // Arrange
    const scanning = connectionReducer(initialConnectionState, { type: "SCAN_START" });
    const weak = { device_id: "d1", name: "IDL0-A3F2", rssi_dbm: -80 };
    const strong = { device_id: "d2", name: "IDL0-B7C1", rssi_dbm: -35 };

    // Act
    const afterWeak = connectionReducer(scanning, { type: "DEVICE_DISCOVERED", device: weak });
    const afterStrong = connectionReducer(afterWeak, { type: "DEVICE_DISCOVERED", device: strong });

    // Assert
    expect(afterStrong.discovered.map((d) => d.device_id)).toEqual(["d2", "d1"]);
  });

  it("connectionReducer — SCAN_END with nothing found — phase idle, discovered empty, no error", () => {
    // Arrange
    const scanning = connectionReducer(initialConnectionState, { type: "SCAN_START" });

    // Act
    const ended = connectionReducer(scanning, { type: "SCAN_END" });

    // Assert
    expect(ended.phase).toBe("idle");
    expect(ended.discovered).toEqual([]);
    expect(ended.error).toBeNull();
  });

  it("connectionReducer — CONNECTED — phase connected, the ConnectionInfo's firmware_version retained", () => {
    // Arrange
    const connecting = connectionReducer(initialConnectionState, { type: "CONNECT_START" });
    const info = { device_id: "d1", firmware_version: "1.4.0", connected: true };

    // Act
    const connected = connectionReducer(connecting, { type: "CONNECTED", info });

    // Assert
    expect(connected.phase).toBe("connected");
    expect(connected.connected?.firmware_version).toBe("1.4.0");
  });

  it("connectionReducer — FAILED during connect — phase failed, previously discovered devices retained so the user can retry another", () => {
    // Arrange
    const scanning = connectionReducer(initialConnectionState, { type: "SCAN_START" });
    const device = { device_id: "d1", name: "IDL0-A3F2", rssi_dbm: -60 };
    const discovered = connectionReducer(scanning, { type: "DEVICE_DISCOVERED", device });
    const ended = connectionReducer(discovered, { type: "SCAN_END" });
    const connecting = connectionReducer(ended, { type: "CONNECT_START" });

    // Act
    const failed = connectionReducer(connecting, { type: "FAILED", error: "no adapter" });

    // Assert
    expect(failed.phase).toBe("failed");
    expect(failed.discovered).toEqual([device]);
    expect(failed.error).toBe("no adapter");
  });

  it("connectionReducer — DISCONNECTED after CONNECTED — phase idle, connected cleared", () => {
    // Arrange
    const connecting = connectionReducer(initialConnectionState, { type: "CONNECT_START" });
    const info = { device_id: "d1", firmware_version: "1.4.0", connected: true };
    const connected = connectionReducer(connecting, { type: "CONNECTED", info });

    // Act
    const disconnected = connectionReducer(connected, { type: "DISCONNECTED" });

    // Assert
    expect(disconnected.phase).toBe("idle");
    expect(disconnected.connected).toBeNull();
  });

  it("connectionReducer — DEVICE_DISCOVERED after SCAN_END — ignored, no state change", () => {
    // Arrange
    const scanning = connectionReducer(initialConnectionState, { type: "SCAN_START" });
    const ended = connectionReducer(scanning, { type: "SCAN_END" });
    const device = { device_id: "d1", name: "IDL0-A3F2", rssi_dbm: -60 };

    // Act
    const afterLateDiscovery = connectionReducer(ended, { type: "DEVICE_DISCOVERED", device });

    // Assert
    expect(afterLateDiscovery).toEqual(ended);
  });
});
