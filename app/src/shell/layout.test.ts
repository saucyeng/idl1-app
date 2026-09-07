import { describe, expect, it } from "vitest";
import { navPlacement, resolveLayout, usesColumns } from "./layout";

describe("resolveLayout", () => {
  it("resolveLayout — 599 px — narrow", () => {
    expect(resolveLayout(599)).toBe("narrow");
  });

  it("resolveLayout — 600 px — medium", () => {
    expect(resolveLayout(600)).toBe("medium");
  });

  it("resolveLayout — 1199 px — medium", () => {
    expect(resolveLayout(1199)).toBe("medium");
  });

  it("resolveLayout — 1200 px — wide", () => {
    expect(resolveLayout(1200)).toBe("wide");
  });

  it("resolveLayout — 2560 px — wide", () => {
    expect(resolveLayout(2560)).toBe("wide");
  });
});

describe("navPlacement", () => {
  it("navPlacement — narrow — bottom", () => {
    expect(navPlacement("narrow")).toBe("bottom");
  });

  it("navPlacement — medium — top", () => {
    expect(navPlacement("medium")).toBe("top");
  });

  it("navPlacement — wide — top", () => {
    expect(navPlacement("wide")).toBe("top");
  });
});

describe("usesColumns", () => {
  it("usesColumns — narrow — false", () => {
    expect(usesColumns("narrow")).toBe(false);
  });

  it("usesColumns — medium — false", () => {
    expect(usesColumns("medium")).toBe(false);
  });

  it("usesColumns — wide — true", () => {
    expect(usesColumns("wide")).toBe(true);
  });
});
