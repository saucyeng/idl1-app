import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("bike log IPC", () => {
  it("bike log commands — each call — invokes its C3 §3.11 command with camelCase arguments", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const ipc = await import("./bikelog");
    const entry = { entry_id: "e", bike_id: "gt", kind: "note" as const, versions: [] };

    // Act
    await ipc.listBikes();
    await ipc.bikeForName("GT Force");
    await ipc.getBikeLog("gt");
    await ipc.saveBikeLogEntry(entry);
    await ipc.attachBikeLog("s1", "gt");

    // Assert
    expect(invoke).toHaveBeenCalledWith("list_bikes");
    expect(invoke).toHaveBeenCalledWith("bike_for_name", { name: "GT Force" });
    expect(invoke).toHaveBeenCalledWith("get_bike_log", { bikeId: "gt" });
    expect(invoke).toHaveBeenCalledWith("save_bike_log_entry", { entry });
    expect(invoke).toHaveBeenCalledWith("attach_bike_log", { sessionId: "s1", bikeId: "gt" });
  });
});
