import { describe, expect, it } from "vitest";

import { visibleColumnIds } from "./columnVisibility";

describe("visibleColumnIds", () => {
  it("visibleColumnIds — every column given content — returns all four in reference order", () => {
    const ids = visibleColumnIds({ library: "a", maths: "b", properties: "c", output: "d" });

    expect(ids).toEqual(["library", "maths", "properties", "output"]);
  });

  it("visibleColumnIds — library omitted (R107) — drops library, keeps the rest in order", () => {
    const ids = visibleColumnIds({ maths: "b", properties: "c", output: "d" });

    expect(ids).toEqual(["maths", "properties", "output"]);
  });

  it("visibleColumnIds — library explicitly undefined — treated the same as omitted", () => {
    const ids = visibleColumnIds({ library: undefined, maths: "b", properties: "c", output: "d" });

    expect(ids).toEqual(["maths", "properties", "output"]);
  });
});
