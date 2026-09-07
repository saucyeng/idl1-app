import { describe, expect, it } from "vitest";

import { resolveEditorHost } from "./editorHost";

describe("resolveEditorHost", () => {
  it("resolveEditorHost — slot node present, placement panes — portal", () => {
    expect(resolveEditorHost(true, "panes")).toBe("portal");
  });

  it("resolveEditorHost — slot node present, placement inline — portal (slot wins over a narrower measured width)", () => {
    expect(resolveEditorHost(true, "inline")).toBe("portal");
  });

  it("resolveEditorHost — slot node present, placement sheet — portal (slot wins even at the narrowest measured width)", () => {
    expect(resolveEditorHost(true, "sheet")).toBe("portal");
  });

  it("resolveEditorHost — no slot node, placement panes — panes", () => {
    expect(resolveEditorHost(false, "panes")).toBe("panes");
  });

  it("resolveEditorHost — no slot node, placement inline — inline", () => {
    expect(resolveEditorHost(false, "inline")).toBe("inline");
  });

  it("resolveEditorHost — no slot node, placement sheet — sheet", () => {
    expect(resolveEditorHost(false, "sheet")).toBe("sheet");
  });
});
