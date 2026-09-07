import { describe, expect, it } from "vitest";

import { isCodeVisible, toggleCode } from "./codeVisibility";

describe("toggleCode", () => {
  it("toggleCode — an unrevealed cell — revealed, and the input set is unchanged", () => {
    const revealed: ReadonlySet<string> = new Set();

    const next = toggleCode(revealed, "cell-a");

    expect(next.has("cell-a")).toBe(true);
    expect(revealed.has("cell-a")).toBe(false);
  });

  it("toggleCode — twice — back to collapsed", () => {
    const once = toggleCode(new Set(), "cell-a");

    const twice = toggleCode(once, "cell-a");

    expect(twice.has("cell-a")).toBe(false);
  });

  it("toggleCode — one revealed cell among several — leaves the others untouched", () => {
    const revealed: ReadonlySet<string> = new Set(["cell-a", "cell-b"]);

    const next = toggleCode(revealed, "cell-a");

    expect(next.has("cell-a")).toBe(false);
    expect(next.has("cell-b")).toBe(true);
  });
});

describe("isCodeVisible", () => {
  it("isCodeVisible — an unknown id — false", () => {
    const visible = isCodeVisible(new Set(["cell-a"]), "cell-z");

    expect(visible).toBe(false);
  });

  it("isCodeVisible — a revealed id — true", () => {
    const visible = isCodeVisible(new Set(["cell-a"]), "cell-a");

    expect(visible).toBe(true);
  });
});
