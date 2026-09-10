import { describe, expect, it } from "vitest";

import { resolveGraphHost } from "./graphHost";

describe("resolveGraphHost", () => {
  it("resolveGraphHost — slot node present, placement panes — portal", () => {
    expect(resolveGraphHost(true, "panes")).toBe("portal");
  });

  it("resolveGraphHost — slot node present, placement inline — portal (the studio's output column measures narrower than the window)", () => {
    expect(resolveGraphHost(true, "inline")).toBe("portal");
  });

  it("resolveGraphHost — slot node present, placement sheet — portal (slot wins even at the narrowest measured width)", () => {
    expect(resolveGraphHost(true, "sheet")).toBe("portal");
  });

  it("resolveGraphHost — no slot node, placement panes — in-page", () => {
    expect(resolveGraphHost(false, "panes")).toBe("in-page");
  });

  it("resolveGraphHost — no slot node, placement inline — in-page", () => {
    expect(resolveGraphHost(false, "inline")).toBe("in-page");
  });

  it("resolveGraphHost — no slot node, placement sheet — none (decision 77: the canvas is desktop-only)", () => {
    expect(resolveGraphHost(false, "sheet")).toBe("none");
  });
});
