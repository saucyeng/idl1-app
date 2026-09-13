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

describe("evalWorkbookV2", () => {
  it("eval_workbook_v2 resolves — calls invoke with id and windows and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const windows = [{ session_id: "s1", span: { kind: "session" as const }, colour: "--chart-1" }];
    const outcome = [{ ok: [{ cell_id: "aaaaaaaa", kind: "math", value: null, defs: [], errors: [] }] }];
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(outcome);
    const { evalWorkbookV2 } = await import("./workbook");

    // Act
    const result = await evalWorkbookV2("w1", windows);

    // Assert
    expect(result).toBe(outcome);
    expect(invoke).toHaveBeenCalledWith("eval_workbook_v2", { id: "w1", windows });
  });

  it("eval_workbook_v2 with no windows — calls invoke with an empty array", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue([{ ok: [] }]);
    const { evalWorkbookV2 } = await import("./workbook");

    // Act
    await evalWorkbookV2("w1", []);

    // Assert
    expect(invoke).toHaveBeenCalledWith("eval_workbook_v2", { id: "w1", windows: [] });
  });

  it("eval_workbook_v2 with a mix of ok and error entries — returns the union untouched, no narrowing", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const windows = [
      { session_id: "s1", span: { kind: "lap" as const, lap_number: 1 }, colour: "--chart-1" },
      { session_id: "s1", span: { kind: "lap" as const, lap_number: 99 }, colour: "--chart-2" },
    ];
    const outcome = [
      { ok: [] },
      { error: { kind: "invalid_argument", message: "unknown lap", detail: { lap: 99, window: 1 } } },
    ];
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(outcome);
    const { evalWorkbookV2 } = await import("./workbook");

    // Act
    const result = await evalWorkbookV2("w1", windows);

    // Assert
    expect(result).toEqual(outcome);
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

describe("unwatchWorkbook", () => {
  it("unwatch_workbook resolves — calls invoke with the id alone, no channel", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { unwatchWorkbook } = await import("./workbook");

    // Act
    await unwatchWorkbook("w1");

    // Assert
    expect(invoke).toHaveBeenCalledWith("unwatch_workbook", { id: "w1" });
  });
});

describe("readWorkbook", () => {
  it("read_workbook resolves — calls invoke with idOrPath and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const source = { markdown: "# hi", hash: "h1", path: "/data/workbooks/w1.idl1wb" };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(source);
    const { readWorkbook } = await import("./workbook");

    // Act
    const result = await readWorkbook("w1");

    // Assert
    expect(result).toBe(source);
    expect(invoke).toHaveBeenCalledWith("read_workbook", { idOrPath: "w1" });
  });
});

describe("createWorkbook", () => {
  it("create_workbook resolves — calls invoke with name and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const handle = { id: "w2", name: "New workbook", path: "/data/workbooks/new-workbook.idl1wb", cell_count: 0 };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(handle);
    const { createWorkbook } = await import("./workbook");

    // Act
    const result = await createWorkbook("New workbook");

    // Assert
    expect(result).toBe(handle);
    expect(invoke).toHaveBeenCalledWith("create_workbook", { name: "New workbook" });
  });
});

describe("listMathBuiltins", () => {
  it("list_math_builtins resolves — calls invoke with no arguments and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const builtins = [{ name: "rms", arity: [1, 2], status: "implemented" }];
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(builtins);
    const { listMathBuiltins } = await import("./workbook");

    // Act
    const result = await listMathBuiltins();

    // Assert
    expect(result).toBe(builtins);
    expect(invoke).toHaveBeenCalledWith("list_math_builtins");
  });
});

describe("fetchHostChannelV2", () => {
  it("fetch_host_channel_v2 resolves — calls invoke with the four named arguments and decodes the response", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const buf = new ArrayBuffer(24);
    const view = new DataView(buf);
    [0x49, 0x44, 0x4c, 0x48].forEach((b, i) => view.setUint8(i, b)); // "IDLH"
    view.setUint16(4, 2, true); // version
    view.setUint16(6, 0, true); // flags: no t
    view.setUint32(8, 0, true); // length
    view.setUint32(12, 0, true); // t_length
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(buf);
    const { fetchHostChannelV2 } = await import("./workbook");
    const window = { session_id: "s1", span: { kind: "session" as const }, colour: "--chart-1" };

    // Act
    const result = await fetchHostChannelV2("w1", window, "avg_speed", 1000);

    // Assert
    expect(result.hasT).toBe(false);
    expect(result.v.length).toBe(0);
    expect(invoke).toHaveBeenCalledWith("fetch_host_channel_v2", {
      workbookId: "w1", window, defName: "avg_speed", budget: 1000,
    });
  });

  it("fetch_host_channel_v2 with window null — calls invoke with window null", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const buf = new ArrayBuffer(24);
    const view = new DataView(buf);
    [0x49, 0x44, 0x4c, 0x48].forEach((b, i) => view.setUint8(i, b)); // "IDLH"
    view.setUint16(4, 2, true);
    view.setUint16(6, 0, true);
    view.setUint32(8, 0, true);
    view.setUint32(12, 0, true);
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(buf);
    const { fetchHostChannelV2 } = await import("./workbook");

    // Act
    await fetchHostChannelV2("w1", null, "avg_speed", 1000);

    // Assert
    expect(invoke).toHaveBeenCalledWith("fetch_host_channel_v2", {
      workbookId: "w1", window: null, defName: "avg_speed", budget: 1000,
    });
  });
});
