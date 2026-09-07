import { describe, expect, it } from "vitest";

import { describeRouteError } from "./routeErrorFallback";

describe("describeRouteError", () => {
  it("an Error instance — returns its constructor name and message", () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'invoke')");

    const described = describeRouteError(error);

    expect(described).toEqual({ name: "TypeError", message: "Cannot read properties of undefined (reading 'invoke')" });
  });

  it("a plain string throw — becomes the message with a generic name", () => {
    const described = describeRouteError("boom");

    expect(described).toEqual({ name: "Error", message: "boom" });
  });

  it("a non-Error, non-string throw (e.g. a thrown object) — stringifies without crashing", () => {
    const described = describeRouteError({ kind: "internal", detail: 42 });

    expect(described.name).toBe("Error");
    expect(described.message).toContain("internal");
  });

  it("undefined or null thrown — never crashes, produces a readable fallback", () => {
    expect(describeRouteError(undefined).message).toBe("undefined");
    expect(describeRouteError(null).message).toBe("null");
  });
});
