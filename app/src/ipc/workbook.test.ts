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

describe("evalWorkbook", () => {
  it("eval_workbook resolves — calls invoke with id and sessionId and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const cells = [{ cell_id: "aaaaaaaa", kind: "math", value: null, defs: [], errors: [] }];
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(cells);
    const { evalWorkbook } = await import("./workbook");

    // Act
    const result = await evalWorkbook("w1", "s1");

    // Assert
    expect(result).toBe(cells);
    expect(invoke).toHaveBeenCalledWith("eval_workbook", { id: "w1", sessionId: "s1" });
  });

  it("eval_workbook with no session bound — calls invoke with sessionId null", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { evalWorkbook } = await import("./workbook");

    // Act
    await evalWorkbook("w1", null);

    // Assert
    expect(invoke).toHaveBeenCalledWith("eval_workbook", { id: "w1", sessionId: null });
  });
});

describe("saveWorkbook", () => {
  it("save_workbook resolves — calls invoke with id, markdown and basedOnHash and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const saved = { hash: "abc123", saved_utc_ms: 1_700_000_000_000 };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(saved);
    const { saveWorkbook } = await import("./workbook");

    // Act
    const result = await saveWorkbook("w1", "# md", "h0");

    // Assert
    expect(result).toBe(saved);
    expect(invoke).toHaveBeenCalledWith("save_workbook", { id: "w1", markdown: "# md", basedOnHash: "h0" });
  });

  it("save_workbook creating a new workbook — calls invoke with basedOnHash null", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({ hash: "abc", saved_utc_ms: 0 });
    const { saveWorkbook } = await import("./workbook");

    // Act
    await saveWorkbook("w1", "# md", null);

    // Assert
    expect(invoke).toHaveBeenCalledWith("save_workbook", { id: "w1", markdown: "# md", basedOnHash: null });
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
