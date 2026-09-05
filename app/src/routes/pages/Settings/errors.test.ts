import { describe, expect, it } from "vitest";

import { describeIpcError } from "./errors";

describe("describeIpcError", () => {
  it("describeIpcError — kind sync — text says LAN sync, not \"error 3\"", () => {
    const text = describeIpcError({ kind: "sync", message: "error 3" });

    expect(text).toMatch(/LAN sync/i);
    expect(text).not.toMatch(/error 3/i);
  });

  it("describeIpcError — kind invalid_argument from pair_peer — text points at the pairing code", () => {
    const text = describeIpcError({
      kind: "invalid_argument",
      message: "malformed code",
    });

    expect(text).toMatch(/pairing code/i);
  });

  it("describeIpcError — an unknown kind — generic text, never throws", () => {
    const text = describeIpcError({ kind: "some_future_kind", message: "" });

    expect(text.length).toBeGreaterThan(0);
    expect(() => describeIpcError({ kind: "", message: "" })).not.toThrow();
  });
});
