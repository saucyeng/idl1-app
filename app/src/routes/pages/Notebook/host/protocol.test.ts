import { describe, expect, test } from "vitest";

import {
  channelPayload,
  combineChannelWindows,
  combineSpectrumWindows,
  evalInlineMessage,
  isHostMessage,
  layoutMessage,
  spectrumPayload,
  transformMessage,
  type HostVarPayload,
  type WindowDescriptor,
} from "./protocol";

function descriptor(overrides: Partial<WindowDescriptor> = {}): WindowDescriptor {
  return { sessionId: "session-a", span: { kind: "session" }, colour: "--chart-1", label: "Session A", ...overrides };
}

describe("isHostMessage", () => {
  test("isHostMessage — every message the sandbox may send — is accepted", () => {
    expect(isHostMessage({ type: "ready" })).toBe(true);
    expect(isHostMessage({ type: "pong", nonce: 7 })).toBe(true);
    expect(isHostMessage({ type: "cellRendered", cellId: "c1", heightPx: 240 })).toBe(true);
    expect(isHostMessage({ type: "cellError", cellId: "c1", message: "boom" })).toBe(true);
    expect(isHostMessage({ type: "inlineResult", spanId: "s1", text: "42" })).toBe(true);
    expect(isHostMessage({ type: "spanError", spanId: "cell-a:0", message: "boom" })).toBe(true);
  });

  test("isHostMessage — an object with an unknown type — is rejected", () => {
    expect(isHostMessage({ type: "teardown" })).toBe(false);
  });

  test("isHostMessage — a message whose payload fields are the wrong type — is rejected", () => {
    expect(isHostMessage({ type: "cellRendered", cellId: "c1", heightPx: "240" })).toBe(false);
  });

  test("isHostMessage — a spanError missing spanId — is rejected", () => {
    expect(isHostMessage({ type: "spanError", message: "boom" })).toBe(false);
  });

  test("isHostMessage — a spanError missing message — is rejected", () => {
    expect(isHostMessage({ type: "spanError", spanId: "cell-a:0" })).toBe(false);
  });
});

describe("channelPayload", () => {
  test("channelPayload — a decoded single-window channel — puts all three buffers in the transfer list exactly once", () => {
    const t = new ArrayBuffer(8);
    const v = new ArrayBuffer(8);
    const w = new ArrayBuffer(8);
    const windows = [descriptor()];

    const { message, transfer } = channelPayload("fork_velocity", 1, t, v, w, windows, { state: "known", text: "mm" });

    expect(transfer).toHaveLength(3);
    expect(transfer.filter((b) => b === t)).toHaveLength(1);
    expect(transfer.filter((b) => b === v)).toHaveLength(1);
    expect(transfer.filter((b) => b === w)).toHaveLength(1);
    expect(message).toEqual({
      type: "setHostVar",
      name: "fork_velocity",
      value: { kind: "channel", length: 1, t, v, w, windows, unit: { state: "known", text: "mm" } },
    });
  });

  // review-task7.md Important finding: `channelData.ts`'s `v` buffer must be
  // built from a `Float64Array`, matching `sandbox/main.ts`'s
  // `materializeHostVar`, which unconditionally does `new
  // Float64Array(payload.t)`/`new Float64Array(payload.v)` on receipt — a
  // narrower host-side element type would silently corrupt every value.
  // This test round-trips real `t`/`v`/`w` values through the exact view
  // construction `materializeHostVar` uses, without importing
  // `sandbox/main.ts` itself (a separate bundle entry with import-time
  // `window`/iframe side effects, per its own doc comment).
  test("channelPayload — t/v/w built as Float64Array — survive the sandbox's Float64Array reinterpretation bit-for-bit", () => {
    const tSource = new Float64Array([0, 1.5, 3.25]);
    const vSource = new Float64Array([10.1, -2.5, NaN]);
    const wSource = new Float64Array([0, 0, 1]);

    const { message } = channelPayload("fork_velocity", 3, tSource.buffer, vSource.buffer, wSource.buffer, [descriptor(), descriptor()], { state: "dimensionless" });

    const payload = message.value as Extract<HostVarPayload, { kind: "channel" }>;
    const tRoundTripped = new Float64Array(payload.t);
    const vRoundTripped = new Float64Array(payload.v);
    const wRoundTripped = new Float64Array(payload.w);

    expect(Array.from(tRoundTripped)).toEqual([0, 1.5, 3.25]);
    expect(vRoundTripped[0]).toBe(10.1);
    expect(vRoundTripped[1]).toBe(-2.5);
    expect(Number.isNaN(vRoundTripped[2])).toBe(true);
    expect(Array.from(wRoundTripped)).toEqual([0, 0, 1]);
  });
});

describe("combineChannelWindows", () => {
  test("combineChannelWindows — no windows — returns an all-empty result", () => {
    const combined = combineChannelWindows([]);

    expect(combined).toEqual({ length: 0, t: new Float64Array(0), v: new Float64Array(0), w: new Float64Array(0), windows: [] });
  });

  test("combineChannelWindows — a single window — is byte-identical to the pre-multi-window shape: no break, w all zero (R127 item 3)", () => {
    const t = new Float64Array([0, 1, 2]);
    const v = new Float64Array([10, 11, 12]);

    const combined = combineChannelWindows([{ descriptor: descriptor(), t, v }]);

    expect(combined.length).toBe(3);
    expect(Array.from(combined.t)).toEqual([0, 1, 2]);
    expect(Array.from(combined.v)).toEqual([10, 11, 12]);
    expect(Array.from(combined.w)).toEqual([0, 0, 0]);
    expect(combined.windows).toEqual([descriptor()]);
  });

  test("combineChannelWindows — two windows — inserts exactly one NaN break row between them, tagged with each window's own index (R127 item 4)", () => {
    const a = { descriptor: descriptor({ sessionId: "session-a" }), t: new Float64Array([0, 1]), v: new Float64Array([10, 11]) };
    const b = { descriptor: descriptor({ sessionId: "session-b" }), t: new Float64Array([0, 1, 2]), v: new Float64Array([20, 21, 22]) };

    const combined = combineChannelWindows([a, b]);

    expect(combined.length).toBe(6); // 2 + 1 break + 3
    expect(Array.from(combined.v)).toEqual([10, 11, NaN, 20, 21, 22]);
    expect(Number.isNaN(combined.t[2])).toBe(true);
    expect(Number.isNaN(combined.v[2])).toBe(true);
    expect(Number.isNaN(combined.w[2])).toBe(true);
    expect(Array.from(combined.w.slice(0, 2))).toEqual([0, 0]);
    expect(Array.from(combined.w.slice(3))).toEqual([1, 1, 1]);
    expect(combined.windows).toEqual([a.descriptor, b.descriptor]);
  });

  test("combineChannelWindows — three windows — inserts exactly two break rows, one between each adjacent pair, no break within a window", () => {
    const make = (n: number) => ({ descriptor: descriptor(), t: new Float64Array(n), v: new Float64Array(n).fill(1) });
    const combined = combineChannelWindows([make(2), make(2), make(2)]);

    const nanIndices = Array.from(combined.v).reduce<number[]>((acc, value, i) => (Number.isNaN(value) ? [...acc, i] : acc), []);

    expect(nanIndices).toEqual([2, 5]);
    expect(combined.length).toBe(8); // 2 + 2 + 2 + 2 breaks
  });
});

describe("spectrumPayload", () => {
  test("spectrumPayload — a decoded single-window spectrum — puts all three buffers in the transfer list exactly once", () => {
    const f = new ArrayBuffer(8);
    const m = new ArrayBuffer(8);
    const w = new ArrayBuffer(8);
    const windows = [descriptor()];

    const { message, transfer } = spectrumPayload("fork_travel_fft", 1, f, m, w, windows);

    expect(transfer).toHaveLength(3);
    expect(transfer.filter((b) => b === f)).toHaveLength(1);
    expect(transfer.filter((b) => b === m)).toHaveLength(1);
    expect(transfer.filter((b) => b === w)).toHaveLength(1);
    expect(message).toEqual({
      type: "setHostVar",
      name: "fork_travel_fft",
      value: { kind: "spectrum", length: 1, f, m, w, windows },
    });
  });

  // Same byte-for-byte proof as `channelPayload`'s own Float64Array
  // round-trip test, and for the same reason: `sandbox/main.ts`'s
  // `materializeHostVar` unconditionally does `new
  // Float64Array(payload.f)`/`new Float64Array(payload.m)`/`.w` on receipt,
  // so a narrower host-side element type would silently corrupt every value.
  test("spectrumPayload — f/m/w built as Float64Array — survive the sandbox's Float64Array reinterpretation bit-for-bit", () => {
    const fSource = new Float64Array([0, 1000, 2000]);
    const mSource = new Float64Array([10.1, -2.5, NaN]);
    const wSource = new Float64Array([0, 0, 1]);

    const { message } = spectrumPayload("fork_travel_fft", 3, fSource.buffer, mSource.buffer, wSource.buffer, [descriptor(), descriptor()]);

    const payload = message.value as Extract<HostVarPayload, { kind: "spectrum" }>;
    const fRoundTripped = new Float64Array(payload.f);
    const mRoundTripped = new Float64Array(payload.m);
    const wRoundTripped = new Float64Array(payload.w);

    expect(Array.from(fRoundTripped)).toEqual([0, 1000, 2000]);
    expect(mRoundTripped[0]).toBe(10.1);
    expect(mRoundTripped[1]).toBe(-2.5);
    expect(Number.isNaN(mRoundTripped[2])).toBe(true);
    expect(Array.from(wRoundTripped)).toEqual([0, 0, 1]);
  });
});

describe("combineSpectrumWindows", () => {
  test("combineSpectrumWindows — a single window — is byte-identical to the pre-R129 shape: no break, w all zero", () => {
    const f = new Float64Array([0, 100, 200]);
    const m = new Float64Array([1, 2, 3]);

    const combined = combineSpectrumWindows([{ descriptor: descriptor(), f, m }]);

    expect(combined.length).toBe(3);
    expect(Array.from(combined.f)).toEqual([0, 100, 200]);
    expect(Array.from(combined.m)).toEqual([1, 2, 3]);
    expect(Array.from(combined.w)).toEqual([0, 0, 0]);
    expect(combined.windows).toEqual([descriptor()]);
  });

  test("combineSpectrumWindows — two windows — inserts exactly one NaN break row between them, tagged with each window's own index", () => {
    const a = { descriptor: descriptor({ sessionId: "session-a" }), f: new Float64Array([0, 100]), m: new Float64Array([1, 2]) };
    const b = { descriptor: descriptor({ sessionId: "session-b" }), f: new Float64Array([0, 100]), m: new Float64Array([3, 4]) };

    const combined = combineSpectrumWindows([a, b]);

    expect(combined.length).toBe(5); // 2 + 1 break + 2
    expect(Array.from(combined.m)).toEqual([1, 2, NaN, 3, 4]);
    expect(Number.isNaN(combined.f[2])).toBe(true);
    expect(Number.isNaN(combined.w[2])).toBe(true);
    expect(Array.from(combined.w.slice(0, 2))).toEqual([0, 0]);
    expect(Array.from(combined.w.slice(3))).toEqual([1, 1]);
  });
});

describe("evalInlineMessage", () => {
  test("evalInlineMessage — a span id and expression — builds the exact evalInline wire shape", () => {
    const message = evalInlineMessage("cell-a:0", "count(fork_bottom_out)");

    expect(message).toEqual({ type: "evalInline", spanId: "cell-a:0", expr: "count(fork_bottom_out)" });
  });
});

describe("transformMessage", () => {
  test("transformMessage — a cell id and a gesture-frame transform — builds the exact transform wire shape", () => {
    const message = transformMessage("cell-a", -12.5, 1.2);

    expect(message).toEqual({ type: "transform", cellId: "cell-a", translateXPx: -12.5, scaleX: 1.2 });
  });
});

describe("layoutMessage", () => {
  test("layoutMessage — a cell id and a client rect — builds the exact layout wire shape", () => {
    const message = layoutMessage("cell-a", { top: 100, left: 8, width: 640 });

    expect(message).toEqual({ type: "layout", cellId: "cell-a", top: 100, left: 8, width: 640 });
  });
});
