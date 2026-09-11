import { beforeEach, describe, expect, it } from "vitest";

import type { MathBuiltinDto } from "../../../../ipc/workbook";
import { builtinDoc, builtinDocAt, resetBuiltinDocs, setBuiltinDocs, wordAt, wordRangeAt } from "./builtinDocs";

/** One catalog entry shaped like the wire's, with only the fields this
 *  module reads filled in meaningfully. */
function dto(name: string): MathBuiltinDto {
  return {
    name,
    status: "implemented",
    arity: [1],
    renamed_from: [],
    category: "Spectral",
    signature: `${name}(x)`,
    unit_rule: "same as x",
    shape: "series",
    description: `what ${name} computes`,
    example: `${name}(speed)`,
    doc_anchor: name,
  } as MathBuiltinDto;
}

beforeEach(() => {
  resetBuiltinDocs();
});

describe("wordAt", () => {
  it("wordAt — a position inside an identifier — the whole identifier", () => {
    // Arrange / Act
    const word = wordAt("y = lap_delta_time(x)", 8);

    // Assert
    expect(word).toBe("lap_delta_time");
  });

  it("wordAt — a caret just past the end of an identifier — still that identifier", () => {
    // Arrange — F1 is pressed with the caret between two characters, and the
    // caret after `welch` has to find `welch`.
    const text = "welch";

    // Act
    const word = wordAt(text, text.length);

    // Assert
    expect(word).toBe("welch");
  });

  it("wordAt — a position on punctuation between two identifiers — no word", () => {
    // Arrange / Act
    const word = wordAt("a + b", 2);

    // Assert
    expect(word).toBeNull();
  });

  it("wordAt — a position outside the text — no word", () => {
    // Arrange / Act / Assert
    expect(wordAt("abc", -1)).toBeNull();
    expect(wordAt("abc", 99)).toBeNull();
  });

  it("wordAt — an identifier with digits and underscores — all of it is one word", () => {
    // Arrange / Act
    const word = wordAt("ch_2_raw + 1", 3);

    // Assert
    expect(word).toBe("ch_2_raw");
  });
});

describe("wordRangeAt", () => {
  it("wordRangeAt — the second occurrence of a name — the offsets of that occurrence, not the first", () => {
    // Arrange
    const text = "welch(welch(x))";

    // Act
    const range = wordRangeAt(text, 8);

    // Assert
    expect(range).toEqual({ from: 6, to: 11 });
  });
});

describe("builtinDoc", () => {
  it("builtinDoc — before the catalog is published — nothing, rather than a guess", () => {
    // Arrange / Act / Assert
    expect(builtinDoc("welch")).toBeUndefined();
  });

  it("builtinDoc — after publishing the catalog — the entry for that name", () => {
    // Arrange
    setBuiltinDocs([dto("welch")]);

    // Act
    const doc = builtinDoc("welch");

    // Assert
    expect(doc).toEqual({
      name: "welch",
      signature: "welch(x)",
      unit_rule: "same as x",
      description: "what welch computes",
      doc_anchor: "welch",
    });
  });

  it("builtinDoc — a second publish — replaces the first rather than merging with it", () => {
    // Arrange
    setBuiltinDocs([dto("welch")]);

    // Act
    setBuiltinDocs([dto("median")]);

    // Assert
    expect(builtinDoc("welch")).toBeUndefined();
    expect(builtinDoc("median")).toBeDefined();
  });
});

describe("builtinDocAt", () => {
  it("builtinDocAt — the caret inside a builtin call — that builtin's entry", () => {
    // Arrange
    setBuiltinDocs([dto("welch")]);

    // Act
    const doc = builtinDocAt("y = welch(speed)", 6);

    // Assert
    expect(doc?.doc_anchor).toBe("welch");
  });

  it("builtinDocAt — the caret on a name that is not a builtin — nothing", () => {
    // Arrange
    setBuiltinDocs([dto("welch")]);

    // Act
    const doc = builtinDocAt("y = speed", 6);

    // Assert
    expect(doc).toBeUndefined();
  });
});
