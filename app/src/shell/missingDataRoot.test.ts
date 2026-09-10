import { describe, expect, it } from "vitest";

import { describeMissingDataRoot, missingDataRootFrom } from "./missingDataRoot";

describe("missingDataRootFrom", () => {
  it("missingDataRootFrom — an io rejection carrying reason missing_root — returns the configured path", () => {
    const error = { kind: "io", message: "…", detail: { path: "D:\\race-data", reason: "missing_root" } };

    const result = missingDataRootFrom(error);

    expect(result).toEqual({ path: "D:\\race-data" });
  });

  it("missingDataRootFrom — an io rejection with a different reason — returns null", () => {
    const error = { kind: "io", message: "…", detail: { path: "blobs/x", reason: "blob_hash_mismatch" } };

    const result = missingDataRootFrom(error);

    expect(result).toBeNull();
  });

  it("missingDataRootFrom — a plain io rejection with no detail — returns null", () => {
    const error = { kind: "io", message: "disk full" };

    const result = missingDataRootFrom(error);

    expect(result).toBeNull();
  });

  it("missingDataRootFrom — the missing_root reason under a non-io kind — returns null", () => {
    const error = { kind: "internal", message: "…", detail: { path: "D:\\race-data", reason: "missing_root" } };

    const result = missingDataRootFrom(error);

    expect(result).toBeNull();
  });

  it("missingDataRootFrom — a rejection that is not IpcError-shaped at all — returns null", () => {
    const cases: unknown[] = [null, undefined, "io", 7, new Error("boom"), { detail: { reason: "missing_root" } }];

    const results = cases.map(missingDataRootFrom);

    expect(results).toEqual([null, null, null, null, null, null]);
  });

  it("missingDataRootFrom — detail.path missing or not a string — returns null", () => {
    const error = { kind: "io", message: "…", detail: { reason: "missing_root", path: 3 } };

    const result = missingDataRootFrom(error);

    expect(result).toBeNull();
  });
});

describe("describeMissingDataRoot", () => {
  it("describeMissingDataRoot — a missing root — names the path and states nothing was changed", () => {
    const root = { path: "D:\\race-data" };

    const text = describeMissingDataRoot(root);

    expect(text).toContain("D:\\race-data");
    expect(text).toContain("Nothing has been changed");
  });
});
