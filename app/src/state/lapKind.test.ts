import { describe, expect, it } from "vitest";

import { countsForFastest, lapKindMark } from "./lapKind";

describe("lapKindMark", () => {
  it("lapKindMark — out and in laps — Out and In", () => {
    expect(lapKindMark("out")).toBe("Out");
    expect(lapKindMark("in")).toBe("In");
  });

  it("lapKindMark — ordinary lap — no mark", () => {
    expect(lapKindMark("normal")).toBeNull();
  });
});

describe("countsForFastest", () => {
  it("countsForFastest — ordinary lap not ignored — counts", () => {
    expect(countsForFastest("normal", false)).toBe(true);
  });

  it("countsForFastest — out, in or ignored lap — does not count", () => {
    expect(countsForFastest("out", false)).toBe(false);
    expect(countsForFastest("in", false)).toBe(false);
    expect(countsForFastest("normal", true)).toBe(false);
  });
});
