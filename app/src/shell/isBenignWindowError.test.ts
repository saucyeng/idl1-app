import { describe, expect, it } from "vitest";

import { isBenignWindowError } from "./isBenignWindowError";

describe("isBenignWindowError", () => {
  it("undelivered-notifications message — matched — true", () => {
    const message = "ResizeObserver loop completed with undelivered notifications.";

    const result = isBenignWindowError(message);

    expect(result).toBe(true);
  });

  it("loop-limit-exceeded message — matched — true", () => {
    const message = "ResizeObserver loop limit exceeded";

    const result = isBenignWindowError(message);

    expect(result).toBe(true);
  });

  it("unrelated error message — not matched — false", () => {
    const message = "Cannot read properties of undefined (reading 'foo')";

    const result = isBenignWindowError(message);

    expect(result).toBe(false);
  });

  it("benign phrase as a substring of a longer message — not an exact match — false", () => {
    const message = "Uncaught: ResizeObserver loop limit exceeded somewhere else";

    const result = isBenignWindowError(message);

    expect(result).toBe(false);
  });

  it("empty message — not matched — false", () => {
    const message = "";

    const result = isBenignWindowError(message);

    expect(result).toBe(false);
  });
});
