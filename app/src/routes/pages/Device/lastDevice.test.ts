import { describe, expect, it } from "vitest";

import { memoryLastDeviceBackend, shouldAutoConnect } from "./lastDevice";

describe("memoryLastDeviceBackend", () => {
  it("memoryLastDeviceBackend — read before any write, no seed — resolves null", async () => {
    // Arrange
    const backend = memoryLastDeviceBackend();

    // Act
    const value = await backend.read();

    // Assert
    expect(value).toBeNull();
  });

  it("memoryLastDeviceBackend — write then read — the written device id round-trips", async () => {
    // Arrange
    const backend = memoryLastDeviceBackend();

    // Act
    await backend.write("d1");
    const value = await backend.read();

    // Assert
    expect(value).toBe("d1");
  });

  it("memoryLastDeviceBackend — seeded — read resolves the seed before any write", async () => {
    // Arrange
    const backend = memoryLastDeviceBackend("d-seeded");

    // Act
    const value = await backend.read();

    // Assert
    expect(value).toBe("d-seeded");
  });
});

describe("shouldAutoConnect", () => {
  it("shouldAutoConnect — a stored id, untouched initial state, not yet attempted — true", () => {
    expect(shouldAutoConnect("d1", false, 0, "idle")).toBe(true);
  });

  it("shouldAutoConnect — no stored id — false even at the untouched initial state", () => {
    expect(shouldAutoConnect(null, false, 0, "idle")).toBe(false);
  });

  it("shouldAutoConnect — already attempted this session — false, even with a stored id", () => {
    expect(shouldAutoConnect("d1", true, 0, "idle")).toBe(false);
  });

  it("shouldAutoConnect — a device is already connected — false, never supersedes an existing connection", () => {
    expect(shouldAutoConnect("d1", false, 1, "connected")).toBe(false);
  });

  it("shouldAutoConnect — user is already scanning/connecting/failed when the stored id resolves — false, no surprise mid-flow", () => {
    expect(shouldAutoConnect("d1", false, 0, "scanning")).toBe(false);
    expect(shouldAutoConnect("d1", false, 0, "connecting")).toBe(false);
    expect(shouldAutoConnect("d1", false, 0, "failed")).toBe(false);
  });
});
