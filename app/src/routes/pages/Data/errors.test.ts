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

  it("describeIpcError — kind \"invalid_argument\" with detail.field — names the rejected field", () => {
    const result = describeIpcError({
      kind: "invalid_argument",
      message: "name must not be empty",
      detail: { field: "name" },
    });

    expect(result.kind).toBe("invalid_argument");
    expect(result.text).toBe('That request was invalid: check "name".');
    expect(result.retryable).toBe(false);
  });

  it("describeIpcError — kind \"invalid_argument\" with no detail — falls back to the generic text", () => {
    const result = describeIpcError({
      kind: "invalid_argument",
      message: "name must not be empty",
    });

    expect(result.text).toBe("That request was invalid.");
  });

  it("describeIpcError — kind \"invalid_argument\" with a non-string detail.field — falls back to the generic text, never throws", () => {
    expect(() =>
      describeIpcError({ kind: "invalid_argument", message: "bad", detail: { field: 42 } }),
    ).not.toThrow();

    const result = describeIpcError({ kind: "invalid_argument", message: "bad", detail: { field: 42 } });

    expect(result.text).toBe("That request was invalid.");
  });
});
