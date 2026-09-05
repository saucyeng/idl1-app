import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: vi.fn().mockImplementation(function (this: { onmessage: unknown }) {
    this.onmessage = undefined;
  }),
}));

describe("listImporters", () => {
  it("list_importers resolves — calls invoke with no arguments and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const importers = [{ id: "idl0", label: "IDL0 log", extensions: [".idl0"] }];
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(importers);
    const { listImporters } = await import("./import");

    // Act
    const result = await listImporters();

    // Assert
    expect(result).toBe(importers);
    expect(invoke).toHaveBeenCalledWith("list_importers");
  });
});

describe("importFile", () => {
  it("import_file resolves — calls invoke with path, importerId and a progress channel", async () => {
    // Arrange
    const { invoke, Channel } = await import("@tauri-apps/api/core");
    const outcome = { session: { session_id: "s1" }, warnings: [] };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(outcome);
    const { importFile } = await import("./import");

    // Act
    const result = await importFile("/tmp/x.idl0", null, () => {});

    // Assert
    expect(result).toBe(outcome);
    expect(Channel).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith(
      "import_file",
      expect.objectContaining({ path: "/tmp/x.idl0", importerId: null })
    );
  });

  it("import_file resolves with warnings — the resolved ImportOutcome keeps both session and warnings", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const outcome = { session: { session_id: "s2" }, warnings: ["truncated at record 400"] };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(outcome);
    const { importFile } = await import("./import");

    // Act
    const result = await importFile("/tmp/y.idl0", null, () => {});

    // Assert
    expect(result.session).toEqual(outcome.session);
    expect(result.warnings).toEqual(["truncated at record 400"]);
  });
});
