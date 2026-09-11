import { describe, expect, it } from "vitest";

import { activityBadges, badgeLabel } from "./activityBadges";

describe("activityBadges", () => {
  it("badges — an idle app — shows none at all", () => {
    const badges = activityBadges({ pendingImports: 0, deviceLink: "disconnected" });

    expect(badges).toEqual({ device: null, data: null, notebook: null, settings: null });
  });

  it("badges — files waiting to import — puts the count on Data", () => {
    const badges = activityBadges({ pendingImports: 12, deviceLink: "disconnected" });

    expect(badges.data).toEqual({
      kind: "count",
      count: 12,
      tone: "neutral",
      title: "12 files waiting to import",
    });
  });

  it("badges — one file waiting — says file, not files", () => {
    const badges = activityBadges({ pendingImports: 1, deviceLink: "disconnected" });

    expect(badges.data?.title).toBe("1 file waiting to import");
  });

  it("badges — a connected device — is a good-tone dot with no number", () => {
    const badges = activityBadges({ pendingImports: 0, deviceLink: "connected" });

    expect(badges.device).toEqual({ kind: "dot", count: null, tone: "good", title: "Device connected" });
  });

  it("badges — a device that stopped answering — warns rather than reading as connected", () => {
    const badges = activityBadges({ pendingImports: 0, deviceLink: "lost" });

    expect(badges.device?.tone).toBe("warn");
  });

  it("badges — a negative or fractional count — is clamped to a whole non-negative number", () => {
    const negative = activityBadges({ pendingImports: -4, deviceLink: "disconnected" });
    const fractional = activityBadges({ pendingImports: 3.7, deviceLink: "disconnected" });

    expect(negative.data).toBeNull();
    expect(fractional.data?.count).toBe(3);
  });

  it("badges — a non-finite count — shows nothing rather than NaN", () => {
    const badges = activityBadges({ pendingImports: Number.NaN, deviceLink: "disconnected" });

    expect(badges.data).toBeNull();
  });

  it("badges — Notebook and Settings — have nothing to report", () => {
    const badges = activityBadges({ pendingImports: 5, deviceLink: "connected" });

    expect(badges.notebook).toBeNull();
    expect(badges.settings).toBeNull();
  });
});

describe("badgeLabel", () => {
  it("label — a count under a hundred — prints the number", () => {
    const label = badgeLabel({ kind: "count", count: 99, tone: "neutral", title: "" });

    expect(label).toBe("99");
  });

  it("label — a folder import of thousands — prints 99+ so the strip cannot widen", () => {
    const label = badgeLabel({ kind: "count", count: 10_000, tone: "neutral", title: "" });

    expect(label).toBe("99+");
  });

  it("label — a dot — prints nothing", () => {
    const label = badgeLabel({ kind: "dot", count: null, tone: "good", title: "" });

    expect(label).toBe("");
  });
});
