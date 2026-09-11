import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("readWorkbookReference", () => {
  it("read_workbook_reference resolves — calls invoke with no arguments and returns the document unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const markdown = "# Workbook reference\n";
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(markdown);
    const { readWorkbookReference } = await import("./docs");

    // Act
    const result = await readWorkbookReference();

    // Assert
    expect(result).toBe(markdown);
    expect(invoke).toHaveBeenCalledWith("read_workbook_reference");
  });

  it("read_workbook_reference rejects — the rejection propagates rather than becoming an empty document", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const error = { kind: "not_found", message: "the reference is missing from the bundle" };
    (invoke as ReturnType<typeof vi.fn>).mockRejectedValue(error);
    const { readWorkbookReference } = await import("./docs");

    // Act / Assert
    await expect(readWorkbookReference()).rejects.toBe(error);
  });
});

describe("openAgentTerminal", () => {
  it("open_agent_terminal with a session — the context is passed through under its own key", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { openAgentTerminal } = await import("./docs");

    // Act
    await openAgentTerminal({ session_id: "s1" });

    // Assert
    expect(invoke).toHaveBeenCalledWith("open_agent_terminal", { context: { session_id: "s1" } });
  });

  it("open_agent_terminal with no argument — an empty context, never a missing one", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { openAgentTerminal } = await import("./docs");

    // Act
    await openAgentTerminal();

    // Assert
    expect(invoke).toHaveBeenCalledWith("open_agent_terminal", { context: {} });
  });
});
