import { describe, expect, it } from "vitest";

import { tokenizeMath } from "./mathMode";
import { MATH_FUNCTIONS } from "./functionCatalog";

describe("tokenizeMath", () => {
  it("tokenizeMath — a definition line — yields identifier, equals and expression tokens", () => {
    const line = "roll_deg = [IMU1_AccelZ] * g";

    const tokens = tokenizeMath(line);

    expect(tokens[0]).toMatchObject({ kind: "identifier", text: "roll_deg" });
    expect(tokens[1]).toMatchObject({ kind: "operator", text: "=" });
    expect(tokens.some((t) => t.kind === "channelRef" && t.text === "[IMU1_AccelZ]")).toBe(true);
    expect(tokens.some((t) => t.kind === "operator" && t.text === "*")).toBe(true);
    expect(tokens.some((t) => t.kind === "identifier" && t.text === "g")).toBe(true);
  });

  it("tokenizeMath — a const line — tags const as a keyword, not an identifier", () => {
    const line = "const k = 9.81";

    const tokens = tokenizeMath(line);

    expect(tokens[0]).toMatchObject({ kind: "keyword", text: "const" });
    expect(tokens.find((t) => t.text === "k")).toMatchObject({ kind: "identifier" });
    expect(tokens.some((t) => t.kind === "identifier" && t.text === "const")).toBe(false);
    expect(tokens.some((t) => t.kind === "number" && t.text === "9.81")).toBe(true);
  });

  it("tokenizeMath — a bracketed channel reference containing spaces — is one channel token (C2 §3.1)", () => {
    const line = "x = [IMU 1 Accel X] + 1";

    const tokens = tokenizeMath(line);

    const channelTokens = tokens.filter((t) => t.kind === "channelRef");
    expect(channelTokens).toHaveLength(1);
    expect(channelTokens[0].text).toBe("[IMU 1 Accel X]");
  });

  it("tokenizeMath — a table cell reference {name} and {col[]} — are cell-reference tokens", () => {
    const line = "y = {fork_max} + {col[]}";

    const tokens = tokenizeMath(line);

    const cellTokens = tokens.filter((t) => t.kind === "cellRef");
    expect(cellTokens.map((t) => t.text)).toEqual(["{fork_max}", "{col[]}"]);
  });

  it("tokenizeMath — the keyword operators and, or, not — are operator tokens, not identifiers", () => {
    const line = "a = x > 0 and y < 10 or not z";

    const tokens = tokenizeMath(line);

    for (const word of ["and", "or", "not"]) {
      const found = tokens.filter((t) => t.text === word);
      expect(found.length).toBeGreaterThan(0);
      for (const t of found) {
        expect(t.kind).toBe("keyword");
        expect(t.kind).not.toBe("identifier");
      }
    }
  });

  it("tokenizeMath — a trailing # label: comment — is tagged as a display-name comment, distinct from a plain comment", () => {
    const labelLine = "x = 1 # label: Roll (deg)";
    const plainLine = "y = 2 # just a note";

    const labelTokens = tokenizeMath(labelLine);
    const plainTokens = tokenizeMath(plainLine);

    const labelComment = labelTokens[labelTokens.length - 1];
    expect(labelComment).toMatchObject({ kind: "labelComment", text: "# label: Roll (deg)" });

    const plainComment = plainTokens[plainTokens.length - 1];
    expect(plainComment).toMatchObject({ kind: "comment", text: "# just a note" });
  });

  it("tokenizeMath — a known catalog function name before an open paren — is a function token", () => {
    const line = 'z = butter(2, 10, "low", [Ch])';

    const tokens = tokenizeMath(line);

    expect(tokens.find((t) => t.text === "butter")).toMatchObject({ kind: "function" });
  });

  it("tokenizeMath — an unknown name before an open paren — is an identifier, not a function", () => {
    const line = "z = foo(1)";

    const tokens = tokenizeMath(line);

    expect(tokens.find((t) => t.text === "foo")).toMatchObject({ kind: "identifier" });
  });
});

describe("MATH_FUNCTIONS", () => {
  it("MATH_FUNCTIONS — the catalog — contains all 72 of C2 §3.3's names (scipy-alignment lane, was 69)", () => {
    expect(MATH_FUNCTIONS).toHaveLength(72);

    const names = new Set(MATH_FUNCTIONS.map((f) => f.name));
    expect(names.size).toBe(72);

    for (const name of ["butter", "spectrogram", "rotate_euler", "vec", "current_lap", "where"]) {
      expect(names.has(name)).toBe(true);
    }
  });

  it("MATH_FUNCTIONS — every NotImplemented entry — is marked so it can be shown greyed", () => {
    const notImplemented = MATH_FUNCTIONS.filter((f) => f.status === "notImplemented").map((f) => f.name).sort();

    expect(notImplemented).toEqual(["convolve", "correlate", "hilbert", "resample", "sosfilt", "spectrogram"].sort());
  });
});
