import { describe, expect, it } from "vitest";

import { describeIpcError } from "./errors";

describe("describeIpcError", () => {
  it("describeIpcError — IpcError with kind \"not_found\" — text names the missing entity, retryable false", () => {
    const result = describeIpcError({
      kind: "not_found",
      message: "session s1 not found",
    });

    expect(result.kind).toBe("not_found");
    expect(result.text.toLowerCase()).toContain("not found");
    expect(result.retryable).toBe(false);
  });

  it("describeIpcError — IpcError with kind \"io\" — text suggests rebuilding the catalog, retryable true", () => {
    const result = describeIpcError({
      kind: "io",
      message: "read failed",
    });

    expect(result.kind).toBe("io");
    expect(result.text.toLowerCase()).toContain("rebuild");
    expect(result.retryable).toBe(true);
  });

  it("describeIpcError — kind the frontend has never seen — falls through to a generic message, never throws (C3 §5: kinds are additive)", () => {
    expect(() =>
      describeIpcError({
        kind: "some_future_kind_not_in_the_table",
        message: "whatever",
      }),
    ).not.toThrow();

    const result = describeIpcError({
      kind: "some_future_kind_not_in_the_table",
      message: "whatever",
    });

    expect(result.kind).toBe("some_future_kind_not_in_the_table");
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("describeIpcError — a plain Error, not an IpcError — still produces text, never throws", () => {
    expect(() => describeIpcError(new Error("boom"))).not.toThrow();

    const result = describeIpcError(new Error("boom"));

    expect(result.text.length).toBeGreaterThan(0);
  });
});
