import { describe, expect, test } from "vitest";

import { channelPayload, isHostMessage } from "./protocol";

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
});
