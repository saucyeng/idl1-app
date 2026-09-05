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
    const info = { device_id: "d1", firmware_version: "1.2.3", connected: true };
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
