import { describe, expect, it } from "vitest";

import { SECTIONS, defaultSectionId, sectionById } from "./sections";

describe("SECTIONS", () => {
  it("SECTIONS — the list — holds exactly the nine idl1 sections, with no drive-sync entry", () => {
    const ids = SECTIONS.map((section) => section.id);

    expect(ids).toEqual([
      "profile",
      "units",
      "data",
      "sync",
      "firmware",
      "controls",
      "theme",
      "howTos",
      "about",
    ]);

    expect(ids).not.toContain("drive");
    expect(ids).not.toContain("driveSync");
  });

  it("SECTIONS — every entry — has a unique id", () => {
    const ids = SECTIONS.map((section) => section.id);

    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe("sectionById", () => {
  it("sectionById — a known id — returns that section; an unknown id — returns undefined, never throws", () => {
    const found = sectionById("sync");
    const notFound = sectionById("driveSync");

    expect(found).toEqual({
      id: "sync",
      label: "Sync",
      description: "LAN peer pairing and sync status.",
    });
    expect(notFound).toBeUndefined();
    expect(() => sectionById("")).not.toThrow();
  });
});

describe("defaultSectionId", () => {
  it("defaultSectionId — is profile, matching the section list's first entry", () => {
    expect(defaultSectionId).toBe("profile");
    expect(defaultSectionId).toBe(SECTIONS[0].id);
  });
});
