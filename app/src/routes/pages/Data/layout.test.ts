import { describe, expect, it } from "vitest";

import { dataLayout } from "./layout";

describe("dataLayout — 1400 px — both docked at 280 and 320", () => {
  it("returns fixed-width docked rail and detail panes", () => {
    const layout = dataLayout(1400);

    expect(layout).toEqual({ rail: "docked", detail: "docked", railWidthPx: 280, detailWidthPx: 320 });
  });
});

describe("dataLayout — 800 px — panels, no fixed widths", () => {
  it("returns docked panels with null widths", () => {
    const layout = dataLayout(800);

    expect(layout).toEqual({ rail: "panel", detail: "panel", railWidthPx: null, detailWidthPx: null });
  });
});

describe("dataLayout — 400 px — both sheets", () => {
  it("returns sheet mode for both panes", () => {
    const layout = dataLayout(400);

    expect(layout).toEqual({ rail: "sheet", detail: "sheet", railWidthPx: null, detailWidthPx: null });
  });
});

describe("dataLayout — exactly 600 and exactly 1200 px — the wider side of each boundary", () => {
  it("treats 600 px as the medium (panel) side, not narrow", () => {
    const layout = dataLayout(600);

    expect(layout.rail).toBe("panel");
    expect(layout.detail).toBe("panel");
  });

  it("treats 1200 px as the wide (docked) side, not medium", () => {
    const layout = dataLayout(1200);

    expect(layout.rail).toBe("docked");
    expect(layout.detail).toBe("docked");
  });
});
