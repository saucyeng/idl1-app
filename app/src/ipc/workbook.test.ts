import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: vi.fn().mockImplementation(function (this: { onmessage: unknown }) {
    this.onmessage = undefined;
  }),
}));

describe("openWorkbook", () => {
  it("open_workbook resolves — calls invoke with idOrPath and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const handle = { id: "w1", name: "Session", path: "workbooks/w1.idl1wb", cell_count: 3 };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(handle);
    const { openWorkbook } = await import("./workbook");

    // Act
    const result = await openWorkbook("w1");

    // Assert
    expect(result).toBe(handle);
    expect(invoke).toHaveBeenCalledWith("open_workbook", { idOrPath: "w1" });
  });
});

describe("watchWorkbook", () => {
  it("watch_workbook resolves — calls invoke with id and a channel", async () => {
    // Arrange
    const { invoke, Channel } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { watchWorkbook } = await import("./workbook");

    // Act
    await watchWorkbook("w1", () => {});

    // Assert
    expect(Channel).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("watch_workbook", expect.objectContaining({ id: "w1" }));
  });
});
