import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: vi.fn().mockImplementation(function (this: { onmessage: unknown }) {
    this.onmessage = undefined;
  }),
}));

describe("bleConnect", () => {
  it("ble_connect resolves — calls invoke with deviceId and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const info = { device_id: "d1", name: "IDL0-A3F2", firmware_version: "1.2.3", connected: true };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(info);
    const { bleConnect } = await import("./device");

    // Act
    const result = await bleConnect("d1");

    // Assert
    expect(result).toBe(info);
    expect(invoke).toHaveBeenCalledWith("ble_connect", { deviceId: "d1" });
  });
});

describe("bleScan", () => {
  it("ble_scan resolves — calls invoke with timeoutMs and a progress channel", async () => {
    // Arrange
    const { invoke, Channel } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { bleScan } = await import("./device");

    // Act
    await bleScan(5000, () => {});

    // Assert
    expect(Channel).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("ble_scan", expect.objectContaining({ timeoutMs: 5000 }));
  });
});

describe("connectDevice", () => {
  it("connect_device resolves — calls invoke with the device id", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const info = { device_id: "d1", name: "IDL0-A3F2", firmware_version: "1.2.3", connected: true };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(info);
    const { connectDevice } = await import("./device");

    // Act
    const result = await connectDevice("d1");

    // Assert
    expect(result).toBe(info);
    expect(invoke).toHaveBeenCalledWith("connect_device", { deviceId: "d1" });
  });
});

describe("disconnectDevice", () => {
  it("disconnect_device resolves — calls invoke with the device id", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { disconnectDevice } = await import("./device");

    // Act
    await disconnectDevice("d1");

    // Assert
    expect(invoke).toHaveBeenCalledWith("disconnect_device", { deviceId: "d1" });
  });
});

describe("deviceStatus", () => {
  it("device_status resolves — calls invoke with the device id and returns the status unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const status = {
      wifi_on: true, logging: false, battery_pct: 80, sd: "ok", gps: "fix", imu: "ok",
      firmware: "1.5.0", ota_pending_verify: false, hr: null, hr_battery_pct: null,
    };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(status);
    const { deviceStatus } = await import("./device");

    // Act
    const result = await deviceStatus("d1");

    // Assert
    expect(result).toBe(status);
    expect(invoke).toHaveBeenCalledWith("device_status", { deviceId: "d1" });
  });
});

describe("deviceControl", () => {
  it("device_control resolves — calls invoke with the device id and command", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const status = { wifi_on: null, logging: true, battery_pct: null, sd: null, gps: null, imu: null, firmware: null, ota_pending_verify: false, hr: null, hr_battery_pct: null };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(status);
    const { deviceControl } = await import("./device");

    // Act
    const result = await deviceControl("d1", "start_recording");

    // Assert
    expect(result).toBe(status);
    expect(invoke).toHaveBeenCalledWith("device_control", { deviceId: "d1", command: "start_recording" });
  });
});

describe("pullConfig", () => {
  it("pull_config resolves — calls invoke with the device id and returns the config JSON string", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue("{\"version\":1}");
    const { pullConfig } = await import("./device");

    // Act
    const result = await pullConfig("d1");

    // Assert
    expect(result).toBe("{\"version\":1}");
    expect(invoke).toHaveBeenCalledWith("pull_config", { deviceId: "d1" });
  });
});

describe("previewChannelRegistry", () => {
  it("preview_channel_registry resolves — calls invoke with the config JSON string", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const rows = [{ channel_id: 1, data_type: "i16", sample_rate_hz: 100, scale: 1, offset: 0, name: "n", units: "g" }];
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(rows);
    const { previewChannelRegistry } = await import("./device");

    // Act
    const result = await previewChannelRegistry("{}");

    // Assert
    expect(result).toBe(rows);
    expect(invoke).toHaveBeenCalledWith("preview_channel_registry", { configJson: "{}" });
  });
});
