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

  // The self-check above only proves internal consistency -- it would still
  // pass on a stale or truncated table compared against itself. This test
  // pins MATH_FUNCTIONS to the actual 75-entry ground truth transcribed from
  // `rust/core/src/math/catalog.rs`'s `math_builtin_catalog()`
  // (scipy-alignment lane, ledger R151/R157), so a future edit that drops or
  // mis-spells a name fails here rather than only showing up as a silent
  // completion gap.
  it("MATH_FUNCTIONS — the scipy-alignment lane's renames and additions — are present with the engine's exact spellings", () => {
    // Arrange
    const names = new Set(MATH_FUNCTIONS.map((entry) => entry.name));

    // Act / Assert -- renamed
    for (const renamed of ["lap_delta_time", "lap_delta_dist", "angle_between", "percentile", "clip", "where", "cumulative_trapezoid"]) {
      expect(names.has(renamed), `expected renamed builtin "${renamed}"`).toBe(true);
    }
    // Act / Assert -- retired, must not appear as callable entries
    for (const retired of ["variance_time", "variance_dist", "angle", "p", "clamp", "if", "integrate", "fft"]) {
      expect(names.has(retired), `retired name "${retired}" should not be a catalog entry`).toBe(false);
    }
    // Act / Assert -- net-new
    for (const added of ["periodogram", "welch", "cumtrapz", "gradient"]) {
      expect(names.has(added), `expected new builtin "${added}"`).toBe(true);
    }
  });

  it("MATH_FUNCTIONS — total count and implemented/notImplemented split — match the engine catalog's own counts (75 = 69 + 6)", () => {
    // Arrange
    const implemented = MATH_FUNCTIONS.filter((e) => e.status === "implemented").length;
    const notImplemented = MATH_FUNCTIONS.filter((e) => e.status === "notImplemented").length;

    // Act / Assert
    expect(MATH_FUNCTIONS.length).toBe(75);
    expect(implemented).toBe(69);
    expect(notImplemented).toBe(6);
  });

  // The five mismatches the running app reported on 2026-09-20 (the
  // "function reference is out of date with the engine" banner): one rename
  // this table never followed, and the three lap scalars R217 item 2 added.
  // Pinned by name so the same drift cannot return silently.
  it("MATH_FUNCTIONS — the 2026-09-20 catch-up — has envelope and the lap scalars, and no longer has hilbert", () => {
    // Arrange
    const names = new Set(MATH_FUNCTIONS.map((entry) => entry.name));

    // Act / Assert
    for (const added of ["envelope", "lap_number", "lap_time", "sector_time"]) {
      expect(names.has(added), `expected builtin "${added}"`).toBe(true);
    }
    expect(names.has("hilbert"), 'retired name "hilbert" should not be a catalog entry').toBe(false);
  });
});
