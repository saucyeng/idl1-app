import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("cursorReadout", () => {
  it("cursor_readout resolves — calls invoke with sessionId, channels and tUs", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const readout = { t_us: 1000, values: { fork_travel: 42 } };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(readout);
    const { cursorReadout } = await import("./cursor");

    // Act
    const result = await cursorReadout("s1", ["fork_travel"], 1000);

    // Assert
    expect(result).toBe(readout);
    expect(invoke).toHaveBeenCalledWith("cursor_readout", {
      sessionId: "s1",
      channels: ["fork_travel"],
      tUs: 1000,
    });
  });
});
