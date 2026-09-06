import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("listQuarantine", () => {
  it("list_quarantine resolves — calls invoke with no arguments and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const entries = [{ entry_id: "e1" }];
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(entries);
    const { listQuarantine } = await import("./maintenance");

    // Act
    const result = await listQuarantine();

    // Assert
    expect(result).toBe(entries);
    expect(invoke).toHaveBeenCalledWith("list_quarantine");
  });
});

describe("resolveQuarantine", () => {
  it("resolve_quarantine resolves — calls invoke with the entry id and action", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { resolveQuarantine } = await import("./maintenance");

    // Act
    await resolveQuarantine("e1", "restore");

    // Assert
    expect(invoke).toHaveBeenCalledWith("resolve_quarantine", { entryId: "e1", action: "restore" });
  });

  it("resolve_quarantine with 'discard' — calls invoke with that action", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { resolveQuarantine } = await import("./maintenance");

    // Act
    await resolveQuarantine("e2", "discard");

    // Assert
    expect(invoke).toHaveBeenCalledWith("resolve_quarantine", { entryId: "e2", action: "discard" });
  });
});

describe("verifyDataDir", () => {
  it("verify_data_dir resolves — calls invoke with the repair flag and returns the report unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const report = { findings: [], quarantined: [], elapsed_ms: 5 };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(report);
    const { verifyDataDir } = await import("./maintenance");

    // Act
    const result = await verifyDataDir(false);

    // Assert
    expect(result).toBe(report);
    expect(invoke).toHaveBeenCalledWith("verify_data_dir", { repair: false });
  });

  it("verify_data_dir with repair true — calls invoke with repair true", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const report = { findings: [], quarantined: [], elapsed_ms: 5 };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(report);
    const { verifyDataDir } = await import("./maintenance");

    // Act
    await verifyDataDir(true);

    // Assert
    expect(invoke).toHaveBeenCalledWith("verify_data_dir", { repair: true });
  });
});
