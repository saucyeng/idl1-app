import { describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (..._args: unknown[]) => ({}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: unknown = null;
  },
}));

import { isSolveCancelled, solvePhysics } from "./physics";

describe("solvePhysics", () => {
  it("solvePhysics — a fractional span — whole µs on the wire, start down and end up", async () => {
    invoke.mockClear();

    await solvePhysics("s1", 1_000.4, 2_000.4, () => {});

    const [command, args] = invoke.mock.calls[0] as [string, Record<string, unknown>];
    expect(command).toBe("solve_physics");
    expect(args.fromUs).toBe(1_000);
    expect(args.toUs).toBe(2_001);
  });
});

describe("isSolveCancelled", () => {
  it("isSolveCancelled — a cancelled rejection and other errors — true only for the cancel", () => {
    expect(isSolveCancelled({ kind: "internal", message: "x", detail: { cancelled: true } })).toBe(true);
    expect(isSolveCancelled({ kind: "internal", message: "x", detail: { cancelled: false } })).toBe(false);
    expect(isSolveCancelled({ kind: "conflict", message: "x" })).toBe(false);
    expect(isSolveCancelled("boom")).toBe(false);
  });
});
