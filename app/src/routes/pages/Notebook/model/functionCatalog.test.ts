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
});
