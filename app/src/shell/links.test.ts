import { describe, expect, it } from "vitest";

import { applyView, withPaired, withoutPaired } from "./links";
import type { LinkView } from "../ipc/link";

function view(device_id: string, phase: LinkView["phase"]): LinkView {
  return { device_id, info: null, phase, status: null, status_at_ms: null, pending_record: false, error: null };
}

describe("applyView", () => {
  it("applyView — a new logger — added", () => {
    // Arrange
    const current = new Map<string, LinkView>();

    // Act
    const next = applyView(current, view("A", "ready"));

    // Assert
    expect(next.get("A")?.phase).toBe("ready");
  });

  it("applyView — forgotten — removed", () => {
    // Arrange
    const current = new Map([["A", view("A", "ready")]]);

    // Act
    const next = applyView(current, view("A", "forgotten"));

    // Assert
    expect(next.has("A")).toBe(false);
  });
});

describe("paired list", () => {
  it("withPaired — already there — unchanged", () => {
    // Arrange
    const ids = ["A", "B"];

    // Act
    const next = withPaired(ids, "A");

    // Assert
    expect(next).toEqual(["A", "B"]);
  });

  it("withoutPaired — present — removed", () => {
    // Arrange
    const ids = ["A", "B"];

    // Act
    const next = withoutPaired(ids, "A");

    // Assert
    expect(next).toEqual(["B"]);
  });
});
