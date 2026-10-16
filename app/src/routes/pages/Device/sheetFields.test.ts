import { describe, expect, it } from "vitest";

import { newSheet, SHEET_SECTIONS, sectionsFor, sheetValues, toInput } from "./sheetFields";

describe("sectionsFor", () => {
  it("sectionsFor — empty template, or a few fields — every section, or only those fields' sections", () => {
    // Arrange
    const template = ["fork.lsc", "rear_tyre.psi"];

    // Act
    const all = sectionsFor([]);
    const some = sectionsFor(template);

    // Assert
    expect(all).toHaveLength(SHEET_SECTIONS.length);
    expect(some.map((s) => s.title)).toEqual(["Rear tyre", "Fork"]);
    expect(some[1].fields.map((f) => f.key)).toEqual(["fork.lsc"]);
  });
});

describe("sheetValues", () => {
  it("sheetValues — numbers, text and blanks — numbers parsed, blanks left out, bad numbers kept as text", () => {
    // Arrange
    const inputs = { "fork.lsc": " 10 ", "fork.model": "38", "fork.hsc": "", "shock.spring_rate": "air", "front_tyre.psi": "23.5" };

    // Act
    const values = sheetValues(inputs, SHEET_SECTIONS);

    // Assert
    expect(values).toEqual({ "fork.lsc": 10, "fork.model": "38", "shock.spring_rate": "air", "front_tyre.psi": 23.5 });
    expect(toInput(values["fork.lsc"])).toBe("10");
    expect(toInput(undefined)).toBe("");
  });
});

describe("newSheet", () => {
  it("newSheet — values — a sheet entry whose one version carries them", () => {
    // Arrange
    const values = { "fork.lsc": 10 };

    // Act
    const entry = newSheet("gt", values, " after service ", 1_000, "phone", () => 0);

    // Assert
    expect(entry.kind).toBe("sheet");
    expect(entry.versions[0].sheet).toEqual(values);
    expect(entry.versions[0].text).toBe("after service");
  });
});
