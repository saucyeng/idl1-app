import { describe, expect, test } from "vitest";

import { channelPayload, isHostMessage, type HostVarPayload } from "./protocol";

describe("isHostMessage", () => {
  test("isHostMessage — every message the sandbox may send — is accepted", () => {
    expect(isHostMessage({ type: "ready" })).toBe(true);
    expect(isHostMessage({ type: "pong", nonce: 7 })).toBe(true);
    expect(isHostMessage({ type: "cellResult", cellId: "c1", html: "<div></div>" })).toBe(true);
    expect(isHostMessage({ type: "cellError", cellId: "c1", message: "boom" })).toBe(true);
    expect(isHostMessage({ type: "inlineResult", spanId: "s1", text: "42" })).toBe(true);
  });

  test("isHostMessage — an object with an unknown type — is rejected", () => {
    expect(isHostMessage({ type: "teardown" })).toBe(false);
  });

  test("isHostMessage — a message whose payload fields are the wrong type — is rejected", () => {
    expect(isHostMessage({ type: "cellResult", cellId: "c1", html: 42 })).toBe(false);
  });
});

describe("channelPayload", () => {
  test("channelPayload — a decoded channel — puts both buffers in the transfer list exactly once", () => {
    const t = new ArrayBuffer(8);
    const v = new ArrayBuffer(8);

    const { message, transfer } = channelPayload("fork_velocity", 1, t, v);

    expect(transfer).toHaveLength(2);
    expect(transfer.filter((b) => b === t)).toHaveLength(1);
    expect(transfer.filter((b) => b === v)).toHaveLength(1);
    expect(message).toEqual({
      type: "setHostVar",
      name: "fork_velocity",
      value: { kind: "channel", length: 1, t, v },
    });
  });

  // review-task7.md Important finding: `channelData.ts`'s `v` buffer must be
  // built from a `Float64Array`, matching `sandbox/main.ts`'s
  // `materializeHostVar`, which unconditionally does `new
  // Float64Array(payload.t)`/`new Float64Array(payload.v)` on receipt — a
  // narrower host-side element type would silently corrupt every value.
  // This test round-trips real `t`/`v` values through the exact view
  // construction `materializeHostVar` uses, without importing
  // `sandbox/main.ts` itself (a separate bundle entry with import-time
  // `window`/iframe side effects, per its own doc comment).
  test("channelPayload — t/v built as Float64Array — survive the sandbox's Float64Array reinterpretation bit-for-bit", () => {
    const tSource = new Float64Array([0, 1.5, 3.25]);
    const vSource = new Float64Array([10.1, -2.5, NaN]);

    const { message } = channelPayload("fork_velocity", 3, tSource.buffer, vSource.buffer);

    const payload = message.value as Extract<HostVarPayload, { kind: "channel" }>;
    const tRoundTripped = new Float64Array(payload.t);
    const vRoundTripped = new Float64Array(payload.v);

    expect(Array.from(tRoundTripped)).toEqual([0, 1.5, 3.25]);
    expect(vRoundTripped[0]).toBe(10.1);
    expect(vRoundTripped[1]).toBe(-2.5);
    expect(Number.isNaN(vRoundTripped[2])).toBe(true);
  });
});
