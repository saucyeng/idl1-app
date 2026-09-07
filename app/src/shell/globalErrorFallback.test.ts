import { describe, expect, it } from "vitest";

import { describeUnhandledRejection, describeWindowError } from "./globalErrorFallback";

describe("describeWindowError", () => {
  it("an ErrorEvent with a real Error — names the source and reuses the error's own name/message", () => {
    const described = describeWindowError({ error: new TypeError("stalled sandbox rebuild threw"), message: "Uncaught TypeError" });

    expect(described).toEqual({ source: "window error", name: "TypeError", message: "stalled sandbox rebuild threw" });
  });

  it("no `.error` (cross-origin script failure) — falls back to `.message` rather than describing null", () => {
    const described = describeWindowError({ error: null, message: "Script error." });

    expect(described).toEqual({ source: "window error", name: "Error", message: "Script error." });
  });

  it("`.error` is undefined and no `.message` — never crashes", () => {
    const described = describeWindowError({});

    expect(described.source).toBe("window error");
    expect(described.message).toBe("undefined");
  });
});

describe("describeUnhandledRejection", () => {
  it("a rejected promise's Error reason — names the source and reuses the error's own name/message", () => {
    const described = describeUnhandledRejection(new Error("Couldn't find callback id"));

    expect(described).toEqual({ source: "unhandled promise rejection", name: "Error", message: "Couldn't find callback id" });
  });

  it("a rejection with a non-Error reason (e.g. a bare string reject) — stringifies without crashing", () => {
    const described = describeUnhandledRejection("boom");

    expect(described).toEqual({ source: "unhandled promise rejection", name: "Error", message: "boom" });
  });

  it("a rejection with `undefined` as its reason — never crashes", () => {
    const described = describeUnhandledRejection(undefined);

    expect(described).toEqual({ source: "unhandled promise rejection", name: "Error", message: "undefined" });
  });
});
