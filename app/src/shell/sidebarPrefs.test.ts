import { describe, expect, it } from "vitest";

import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_PREFS,
  sanitizeSidebarPrefs,
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  withSidebarState,
} from "./sidebarPrefs";

describe("clampSidebarWidth", () => {
  it("width — a width inside the range — is kept", () => {
    const width = clampSidebarWidth(320);

    expect(width).toBe(320);
  });

  it("width — a drag past either bound — stops at the bound", () => {
    expect(clampSidebarWidth(40)).toBe(SIDEBAR_MIN_WIDTH_PX);
    expect(clampSidebarWidth(4000)).toBe(SIDEBAR_MAX_WIDTH_PX);
  });

  it("width — a fractional drag — is rounded to a whole pixel", () => {
    const width = clampSidebarWidth(283.4);

    expect(width).toBe(283);
  });

  it("width — a missing or non-numeric value — falls back to the default", () => {
    expect(clampSidebarWidth(undefined)).toBe(SIDEBAR_DEFAULT_WIDTH_PX);
    expect(clampSidebarWidth("280")).toBe(SIDEBAR_DEFAULT_WIDTH_PX);
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT_WIDTH_PX);
  });
});

describe("sanitizeSidebarPrefs", () => {
  it("prefs — nothing stored — gives every shape an open sidebar at the default width", () => {
    const prefs = sanitizeSidebarPrefs(undefined);

    expect(prefs).toEqual(DEFAULT_SIDEBAR_PREFS);
  });

  it("prefs — a stored document — keeps each shape's own state", () => {
    const prefs = sanitizeSidebarPrefs({
      ultrawide: { widthPx: 460, collapsed: false },
      wide: { widthPx: 240, collapsed: true },
    });

    expect(prefs.ultrawide).toEqual({ widthPx: 460, collapsed: false });
    expect(prefs.wide).toEqual({ widthPx: 240, collapsed: true });
    expect(prefs.narrow).toEqual({ widthPx: SIDEBAR_DEFAULT_WIDTH_PX, collapsed: false });
  });

  it("prefs — a hand-edited width outside the range — is clamped, not rejected", () => {
    const prefs = sanitizeSidebarPrefs({ wide: { widthPx: 9000, collapsed: false } });

    expect(prefs.wide.widthPx).toBe(SIDEBAR_MAX_WIDTH_PX);
  });

  it("prefs — a non-boolean collapsed flag — reads as not collapsed", () => {
    const prefs = sanitizeSidebarPrefs({ wide: { widthPx: 300, collapsed: "yes" } });

    expect(prefs.wide.collapsed).toBe(false);
  });

  it("prefs — an array or a string where the document should be — yields the defaults", () => {
    expect(sanitizeSidebarPrefs([])).toEqual(DEFAULT_SIDEBAR_PREFS);
    expect(sanitizeSidebarPrefs("wide")).toEqual(DEFAULT_SIDEBAR_PREFS);
    expect(sanitizeSidebarPrefs(null)).toEqual(DEFAULT_SIDEBAR_PREFS);
  });
});

describe("withSidebarState", () => {
  it("update — one shape's drag — leaves every other shape alone", () => {
    const next = withSidebarState(DEFAULT_SIDEBAR_PREFS, "ultrawide", { widthPx: 420, collapsed: false });

    expect(next.ultrawide.widthPx).toBe(420);
    expect(next.wide).toEqual(DEFAULT_SIDEBAR_PREFS.wide);
    expect(next.narrow).toEqual(DEFAULT_SIDEBAR_PREFS.narrow);
  });

  it("update — a width past a bound — is clamped on the way in", () => {
    const next = withSidebarState(DEFAULT_SIDEBAR_PREFS, "wide", { widthPx: 12, collapsed: true });

    expect(next.wide).toEqual({ widthPx: SIDEBAR_MIN_WIDTH_PX, collapsed: true });
  });

  it("update — collapsing — keeps the width it had, so reopening restores it", () => {
    const dragged = withSidebarState(DEFAULT_SIDEBAR_PREFS, "wide", { widthPx: 400, collapsed: false });

    const collapsed = withSidebarState(dragged, "wide", { ...dragged.wide, collapsed: true });

    expect(collapsed.wide).toEqual({ widthPx: 400, collapsed: true });
  });
});
