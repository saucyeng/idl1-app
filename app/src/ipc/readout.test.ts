import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("readout IPC", () => {
  it("openReadout — called — invokes open_readout with workbookId, window and names", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const handle = { handle: 3, units: { speed: "km/h" }, extent: { speed: [0, 61.2] } };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(handle);
    const { openReadout } = await import("./readout");
    const window = { session_id: "s1", span: { kind: "session" as const }, colour: "--chart-1" };

    // Act
    const result = await openReadout("wb", window, ["speed"]);

    // Assert
    expect(result).toBe(handle);
    expect(invoke).toHaveBeenCalledWith("open_readout", { workbookId: "wb", window, names: ["speed"] });
  });

  it("readReadout — no tail — sends tail null", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({ t_us: 5, values: {} });
    const { readReadout } = await import("./readout");

    // Act
    await readReadout(3, 5);

    // Assert
    expect(invoke).toHaveBeenCalledWith("read_readout", { handle: 3, tUs: 5, tail: null });
  });

  it("readReadout — with a tail — passes count and step_us through", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({ t_us: 5, values: {}, tail: {} });
    const { readReadout } = await import("./readout");

    // Act
    await readReadout(3, 5, { count: 120, step_us: 16_683 });

    // Assert
    expect(invoke).toHaveBeenCalledWith("read_readout", { handle: 3, tUs: 5, tail: { count: 120, step_us: 16_683 } });
  });

  it("closeReadout — called — invokes close_readout with the handle", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { closeReadout } = await import("./readout");

    // Act
    await closeReadout(3);

    // Assert
    expect(invoke).toHaveBeenCalledWith("close_readout", { handle: 3 });
  });
});
