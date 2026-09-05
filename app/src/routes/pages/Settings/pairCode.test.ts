import { describe, expect, it } from "vitest";

import { normalizePairCode, validatePairCode } from "./pairCode";

describe("normalizePairCode", () => {
  it("normalizePairCode — \"12 34 56\" — \"123456\"", () => {
    const result = normalizePairCode("12 34 56");

    expect(result).toBe("123456");
  });

  it("normalizePairCode — \"12-34-56\" — \"123456\"", () => {
    const result = normalizePairCode("12-34-56");

    expect(result).toBe("123456");
  });
});

describe("validatePairCode", () => {
  it("validatePairCode — six digits — no issues", () => {
    const issues = validatePairCode("123456");

    expect(issues).toEqual([]);
  });

  it("validatePairCode — five digits — one issue naming the required length", () => {
    const issues = validatePairCode("12345");

    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/6 digits|six digits/i);
  });

  it("validatePairCode — six characters with a letter — one issue naming digits only", () => {
    const issues = validatePairCode("12345a");

    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/digits only|only digits/i);
  });

  it("validatePairCode — an empty string — one issue, and not the same one as a wrong-length code", () => {
    const emptyIssues = validatePairCode("");
    const wrongLengthIssues = validatePairCode("12345");

    expect(emptyIssues).toHaveLength(1);
    expect(emptyIssues[0].message).not.toBe(wrongLengthIssues[0].message);
  });
});
