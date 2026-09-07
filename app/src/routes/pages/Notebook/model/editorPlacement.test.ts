import { describe, expect, it } from "vitest";

import { resolveLayout } from "../../../../shell/layout";
import { editorPlacement, outputIsReadOnly } from "./editorPlacement";

describe("editorPlacement", () => {
  it("editorPlacement — 400 px — sheet", () => {
    expect(editorPlacement(400)).toBe("sheet");
  });

  it("editorPlacement — 800 px — inline", () => {
    expect(editorPlacement(800)).toBe("inline");
  });

  it("editorPlacement — 1400 px — panes", () => {
    expect(editorPlacement(1400)).toBe("panes");
  });

  it("editorPlacement — 600 and 1200 exactly — matches shell/layout.ts", () => {
    const at600 = editorPlacement(600);
    const at1200 = editorPlacement(1200);

    expect(at600).toBe(resolveLayout(600) === "wide" ? "panes" : resolveLayout(600) === "medium" ? "inline" : "sheet");
    expect(at1200).toBe(resolveLayout(1200) === "wide" ? "panes" : resolveLayout(1200) === "medium" ? "inline" : "sheet");
    expect(at600).toBe("inline");
    expect(at1200).toBe("panes");
  });
});

describe("outputIsReadOnly", () => {
  it("outputIsReadOnly — sheet — true", () => {
    expect(outputIsReadOnly("sheet")).toBe(true);
  });

  it("outputIsReadOnly — panes and inline — false", () => {
    expect(outputIsReadOnly("panes")).toBe(false);
    expect(outputIsReadOnly("inline")).toBe(false);
  });
});
