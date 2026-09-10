import { describe, expect, it } from "vitest";

import { resolveLayout } from "../../../../shell/layout";
import { paperViewActive } from "./paperView";

describe("paperViewActive", () => {
  it("paperViewActive — a phone-width viewport — true", () => {
    const active = paperViewActive(390);

    expect(active).toBe(true);
  });

  it("paperViewActive — a tablet-width viewport — false", () => {
    const active = paperViewActive(800);

    expect(active).toBe(false);
  });

  it("paperViewActive — a desktop-width viewport — false", () => {
    const active = paperViewActive(1400);

    expect(active).toBe(false);
  });

  it("paperViewActive — 600 and 1200 exactly — agrees with shell/layout.ts", () => {
    const at599 = paperViewActive(599);
    const at600 = paperViewActive(600);
    const at1200 = paperViewActive(1200);

    expect(at599).toBe(resolveLayout(599) === "narrow");
    expect(at600).toBe(resolveLayout(600) === "narrow");
    expect(at1200).toBe(resolveLayout(1200) === "narrow");
  });

  it("paperViewActive — every width — true exactly when the layout is narrow", () => {
    const widths = [0, 1, 320, 390, 430, 599, 600, 601, 900, 1199, 1200, 1201, 2560];

    for (const width of widths) {
      expect(paperViewActive(width)).toBe(resolveLayout(width) === "narrow");
    }
  });
});
