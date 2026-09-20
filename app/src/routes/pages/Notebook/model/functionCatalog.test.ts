import { describe, expect, it } from "vitest";

import { diffFunctionCatalog, MATH_FUNCTIONS, type CatalogEntry, type RemoteMathBuiltin } from "./functionCatalog";

describe("diffFunctionCatalog", () => {
  it("diffFunctionCatalog — matching local and remote catalogs — returns no mismatches", () => {
    // Arrange
    const local: CatalogEntry[] = [
      { name: "rms", signature: "rms(ch)", category: "Time-domain", status: "implemented" },
      { name: "sosfilt", signature: "sosfilt(sos, ch)", category: "Filter", status: "notImplemented" },
    ];
    const remote: RemoteMathBuiltin[] = [
      { name: "rms", status: "implemented" },
      { name: "sosfilt", status: "not_implemented" },
    ];

    // Act
    const result = diffFunctionCatalog(remote, local);

    // Assert
    expect(result).toEqual([]);
  });

  it("diffFunctionCatalog — a builtin this transcription doesn't have — reports missing_locally", () => {
    // Arrange
    const local: CatalogEntry[] = [{ name: "rms", signature: "rms(ch)", category: "Time-domain", status: "implemented" }];
    const remote: RemoteMathBuiltin[] = [
      { name: "rms", status: "implemented" },
      { name: "new_builtin", status: "implemented" },
    ];

    // Act
    const result = diffFunctionCatalog(remote, local);

    // Assert
    expect(result).toEqual([{ kind: "missing_locally", name: "new_builtin" }]);
  });

  it("diffFunctionCatalog — a name this transcription has but the engine doesn't — reports missing_remotely", () => {
    // Arrange
    const local: CatalogEntry[] = [
      { name: "rms", signature: "rms(ch)", category: "Time-domain", status: "implemented" },
      { name: "stale_name", signature: "stale_name(ch)", category: "Time-domain", status: "implemented" },
    ];
    const remote: RemoteMathBuiltin[] = [{ name: "rms", status: "implemented" }];

    // Act
    const result = diffFunctionCatalog(remote, local);

    // Assert
    expect(result).toEqual([{ kind: "missing_remotely", name: "stale_name" }]);
  });

  it("diffFunctionCatalog — a name whose implemented status disagrees — reports status_mismatch with both values", () => {
    // Arrange
    const local: CatalogEntry[] = [{ name: "sosfilt", signature: "sosfilt(sos, ch)", category: "Filter", status: "notImplemented" }];
    const remote: RemoteMathBuiltin[] = [{ name: "sosfilt", status: "implemented" }];

    // Act
    const result = diffFunctionCatalog(remote, local);

    // Assert
    expect(result).toEqual([
      { kind: "status_mismatch", name: "sosfilt", detail: "local=not_implemented remote=implemented" },
    ]);
  });

  it("diffFunctionCatalog — the real MATH_FUNCTIONS table against itself (as remote) — agrees with no mismatches", () => {
    // Arrange
    const remote: RemoteMathBuiltin[] = MATH_FUNCTIONS.map((entry) => ({
      name: entry.name,
      status: entry.status === "implemented" ? "implemented" : "not_implemented",
    }));

    // Act
    const result = diffFunctionCatalog(remote);

    // Assert
    expect(result).toEqual([]);
  });

  // `MATH_FUNCTIONS` is generated (ruling R249): there is no longer a
  // hand-transcribed count or a hand-picked list of names to pin against
  // drift, because there is nothing left to drift — `functionCatalog.json`
  // is regenerated from the engine's own catalog and CI diff-gates it, the
  // same guarantee `cliTable.json` already has. What is still worth
  // testing here is the *shape* `MATH_FUNCTIONS` and its JSON source
  // promise the rest of this module's callers.
  it("MATH_FUNCTIONS — is not empty, and every entry is a complete CatalogEntry", () => {
    // Arrange / Act
    const entries = MATH_FUNCTIONS;

    // Assert
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(typeof entry.name).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.signature).toBe("string");
      expect(typeof entry.category).toBe("string");
      expect(["implemented", "notImplemented"]).toContain(entry.status);
    }
  });

  it("MATH_FUNCTIONS — every name — is unique", () => {
    // Arrange
    const names = MATH_FUNCTIONS.map((entry) => entry.name);

    // Act
    const unique = new Set(names);

    // Assert
    expect(unique.size).toBe(names.length);
  });

  it("MATH_FUNCTIONS — order — matches the generated file's own name order", () => {
    // Arrange
    const names = MATH_FUNCTIONS.map((entry) => entry.name);

    // Act
    const sorted = [...names].sort();

    // Assert — `idl-rs docs workbook --json` sorts by name; this module
    // must not silently re-sort or reorder what it read.
    expect(names).toEqual(sorted);
  });
});
