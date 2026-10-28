import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: vi.fn().mockImplementation(function (this: { onmessage: unknown }) {
    this.onmessage = undefined;
  }),
}));

describe("evalSessionSet", () => {
  it("eval_session_set resolves — calls invoke with workbookId and a progress channel and returns the result unchanged", async () => {
    // Arrange
    const { invoke, Channel } = await import("@tauri-apps/api/core");
    const result = { set_key: "k", groups: [{ name: "Day 1" }], members: [], tables: [], warnings: [], cancelled: false };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(result);
    const { evalSessionSet } = await import("./sessionSet");

    // Act
    const got = await evalSessionSet("w1");

    // Assert
    expect(got).toBe(result);
    expect(Channel).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("eval_session_set", expect.objectContaining({ workbookId: "w1" }));
  });
});
