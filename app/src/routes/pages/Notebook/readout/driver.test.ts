import { describe, expect, it } from "vitest";

import type { ReadoutValues } from "../../../../ipc/readout";
import { makeReadoutDriver } from "./driver";

/** A read whose answers the test resolves by hand. */
function deferredReads() {
  const calls: { handle: number; tUs: number; resolve: (v: ReadoutValues) => void; reject: (e: unknown) => void }[] = [];
  const read = (handle: number, tUs: number) =>
    new Promise<ReadoutValues>((resolve, reject) => calls.push({ handle, tUs, resolve, reject }));
  return { calls, read };
}

const answer = (tUs: number): ReadoutValues => ({ t_us: tUs, values: {} });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("makeReadoutDriver", () => {
  it("request — while a read is in flight — only the newest time is sent next", async () => {
    const { calls, read } = deferredReads();
    const got: number[] = [];
    const d = makeReadoutDriver({ read, onValues: (v) => got.push(v.t_us) });
    d.setHandle(1, null);

    d.request(10);
    d.request(20);
    d.request(30);
    calls[0].resolve(answer(10));
    await flush();
    calls[1].resolve(answer(30));
    await flush();

    expect(calls.map((c) => c.tUs)).toEqual([10, 30]);
    expect(got).toEqual([10, 30]);
  });

  it("request — no handle — nothing is sent", () => {
    const { calls, read } = deferredReads();
    const d = makeReadoutDriver({ read, onValues: () => undefined });

    d.request(10);

    expect(calls).toHaveLength(0);
  });

  it("setHandle — while a read is in flight — its answer is dropped and the queue cleared", async () => {
    const { calls, read } = deferredReads();
    const got: number[] = [];
    const d = makeReadoutDriver({ read, onValues: (v) => got.push(v.t_us) });
    d.setHandle(1, null);
    d.request(10);
    d.request(20);

    d.setHandle(2, null);
    calls[0].resolve(answer(10));
    await flush();

    expect(got).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("request — a read fails — onError is told and the next request still goes", async () => {
    const { calls, read } = deferredReads();
    const errors: unknown[] = [];
    const d = makeReadoutDriver({ read, onValues: () => undefined, onError: (e) => errors.push(e) });
    d.setHandle(1, null);
    d.request(10);

    calls[0].reject(new Error("gone"));
    await flush();
    d.request(20);

    expect(errors).toHaveLength(1);
    expect(calls.map((c) => c.tUs)).toEqual([10, 20]);
  });
});
