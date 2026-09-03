import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("fetchEngineVersion", () => {
  it("engine_version resolves — returns the string unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue("0.1.0");
    const { fetchEngineVersion } = await import("./engine");

    // Act
    const version = await fetchEngineVersion();

    // Assert
    expect(version).toBe("0.1.0");
    expect(invoke).toHaveBeenCalledWith("engine_version");
  });
});
