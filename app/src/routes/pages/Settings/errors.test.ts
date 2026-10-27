import { describe, expect, it } from "vitest";

import { describeIpcError } from "./errors";

describe("describeIpcError", () => {
  it("describeIpcError — kind sync — leads with LAN sync and carries the backend's reason", () => {
    const text = describeIpcError({ kind: "sync", message: "POST /pair failed: builder error" });

    expect(text).toMatch(/^LAN sync ran into a problem/);
    expect(text).toContain("(POST /pair failed: builder error)");
  });

  it("describeIpcError — kind invalid_argument from pair_peer — text points at the pairing code", () => {
    const text = describeIpcError({
      kind: "invalid_argument",
      message: "malformed code",
    });

    expect(text).toMatch(/pairing code/i);
  });

  it("describeIpcError — kind not_found — text says the item couldn't be found", () => {
    const text = describeIpcError({ kind: "not_found", message: "no such peer" });

    expect(text).toMatch(/couldn't be found/i);
  });

  it("describeIpcError — kind io — text says a file on disk couldn't be read or written", () => {
    const text = describeIpcError({ kind: "io", message: "EACCES" });

    expect(text).toMatch(/file on disk/i);
  });

  it("describeIpcError — kind internal — text says something went wrong, not the raw message", () => {
    const text = describeIpcError({ kind: "internal", message: "panic at line 42" });

    expect(text).toMatch(/went wrong/i);
    expect(text).not.toMatch(/panic at line 42/i);
  });

  it("describeIpcError — an unknown kind — generic text, never throws", () => {
    const text = describeIpcError({ kind: "some_future_kind", message: "" });

    expect(text.length).toBeGreaterThan(0);
    expect(() => describeIpcError({ kind: "", message: "" })).not.toThrow();
  });
});
