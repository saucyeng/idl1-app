import { describe, expect, it } from "vitest";

import { connectionReducer, initialConnectionState } from "./connection";

describe("connectionReducer", () => {
  it("connectionReducer — DEVICE_DISCOVERED twice for the same device_id — one entry, the newer rssi kept", () => {
    // Arrange
    const scanning = connectionReducer(initialConnectionState, { type: "SCAN_START" });
    const first = { device_id: "d1", name: "IDL0-A3F2", rssi_dbm: -70, service_uuids: [] };
    const second = { device_id: "d1", name: "IDL0-A3F2", rssi_dbm: -40, service_uuids: [] };

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
    const weak = { device_id: "d1", name: "IDL0-A3F2", rssi_dbm: -80, service_uuids: [] };
    const strong = { device_id: "d2", name: "IDL0-B7C1", rssi_dbm: -35, service_uuids: [] };

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

  it("connectionReducer — CONNECTED — phase connected, active set, the ConnectionInfo's firmware_version retained", () => {
    // Arrange
    const connecting = connectionReducer(initialConnectionState, { type: "CONNECT_START" });
    const info = { device_id: "d1", firmware_version: "1.4.0", connected: true };

    // Act
    const connected = connectionReducer(connecting, { type: "CONNECTED", info });

    // Assert
    expect(connected.phase).toBe("connected");
    expect(connected.activeDeviceId).toBe("d1");
    expect(connected.connections).toHaveLength(1);
    expect(connected.connections[0].firmware_version).toBe("1.4.0");
  });

  it("connectionReducer — CONNECTED for a second device — both held, the new one becomes active (decision 86)", () => {
    // Arrange
    const first = connectionReducer(initialConnectionState, {
      type: "CONNECTED",
      info: { device_id: "d1", firmware_version: "1.4.0", connected: true },
    });

    // Act
    const second = connectionReducer(first, {
      type: "CONNECTED",
      info: { device_id: "d2", firmware_version: "1.5.0", connected: true },
    });

    // Assert
    expect(second.connections.map((c) => c.device_id)).toEqual(["d1", "d2"]);
    expect(second.activeDeviceId).toBe("d2");
  });

  it("connectionReducer — SWITCH_ACTIVE to a connected device — one tap, no IPC, activeDeviceId changes only", () => {
    // Arrange
    const first = connectionReducer(initialConnectionState, {
      type: "CONNECTED",
      info: { device_id: "d1", firmware_version: "1.4.0", connected: true },
    });
    const both = connectionReducer(first, {
      type: "CONNECTED",
      info: { device_id: "d2", firmware_version: "1.5.0", connected: true },
    });

    // Act
    const switched = connectionReducer(both, { type: "SWITCH_ACTIVE", deviceId: "d1" });

    // Assert
    expect(switched.activeDeviceId).toBe("d1");
    expect(switched.connections).toEqual(both.connections);
  });

  it("connectionReducer — SWITCH_ACTIVE to a device that isn't connected — ignored, no state change", () => {
    // Arrange
    const connected = connectionReducer(initialConnectionState, {
      type: "CONNECTED",
      info: { device_id: "d1", firmware_version: "1.4.0", connected: true },
    });

    // Act
    const attempted = connectionReducer(connected, { type: "SWITCH_ACTIVE", deviceId: "d9" });

    // Assert
    expect(attempted).toEqual(connected);
  });

  it("connectionReducer — FAILED during connect — phase failed, previously discovered devices retained so the user can retry another", () => {
    // Arrange
    const scanning = connectionReducer(initialConnectionState, { type: "SCAN_START" });
    const device = { device_id: "d1", name: "IDL0-A3F2", rssi_dbm: -60, service_uuids: [] };
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

  it("connectionReducer — DISCONNECTED for the active device with another still connected — active falls back to the remaining one", () => {
    // Arrange
    const first = connectionReducer(initialConnectionState, {
      type: "CONNECTED",
      info: { device_id: "d1", firmware_version: "1.4.0", connected: true },
    });
    const both = connectionReducer(first, {
      type: "CONNECTED",
      info: { device_id: "d2", firmware_version: "1.5.0", connected: true },
    });
    const switchedToD1 = connectionReducer(both, { type: "SWITCH_ACTIVE", deviceId: "d1" });

    // Act
    const disconnected = connectionReducer(switchedToD1, { type: "DISCONNECTED", deviceId: "d1" });

    // Assert
    expect(disconnected.connections.map((c) => c.device_id)).toEqual(["d2"]);
    expect(disconnected.activeDeviceId).toBe("d2");
    expect(disconnected.phase).toBe("connected");
  });

  it("connectionReducer — DISCONNECTED for the only connected device — phase idle, active cleared", () => {
    // Arrange
    const connecting = connectionReducer(initialConnectionState, { type: "CONNECT_START" });
    const info = { device_id: "d1", firmware_version: "1.4.0", connected: true };
    const connected = connectionReducer(connecting, { type: "CONNECTED", info });

    // Act
    const disconnected = connectionReducer(connected, { type: "DISCONNECTED", deviceId: "d1" });

    // Assert
    expect(disconnected.phase).toBe("idle");
    expect(disconnected.connections).toEqual([]);
    expect(disconnected.activeDeviceId).toBeNull();
  });

  it("connectionReducer — DISCONNECTED for a non-active device — active device unaffected", () => {
    // Arrange
    const first = connectionReducer(initialConnectionState, {
      type: "CONNECTED",
      info: { device_id: "d1", firmware_version: "1.4.0", connected: true },
    });
    const both = connectionReducer(first, {
      type: "CONNECTED",
      info: { device_id: "d2", firmware_version: "1.5.0", connected: true },
    });

    // Act
    const disconnected = connectionReducer(both, { type: "DISCONNECTED", deviceId: "d1" });

    // Assert
    expect(disconnected.activeDeviceId).toBe("d2");
    expect(disconnected.connections.map((c) => c.device_id)).toEqual(["d2"]);
  });

  it("connectionReducer — DEVICE_DISCOVERED after SCAN_END — ignored, no state change", () => {
    // Arrange
    const scanning = connectionReducer(initialConnectionState, { type: "SCAN_START" });
    const ended = connectionReducer(scanning, { type: "SCAN_END" });
    const device = { device_id: "d1", name: "IDL0-A3F2", rssi_dbm: -60, service_uuids: [] };

    // Act
    const afterLateDiscovery = connectionReducer(ended, { type: "DEVICE_DISCOVERED", device });

    // Assert
    expect(afterLateDiscovery).toEqual(ended);
  });
});
