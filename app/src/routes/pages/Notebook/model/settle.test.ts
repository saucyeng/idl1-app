import { describe, expect, it, vi } from "vitest";

import { isStaleSettleResult, makeSettle, type SettleTimer } from "./settle";

/** A fully controllable fake `SettleTimer`: time advances only when
 *  `advance(ms)` is called, and a scheduled callback fires exactly once its
 *  scheduled instant is reached — no reliance on real wall-clock timers or
 *  vitest's fake-timer mode. */
function makeFakeTimer(): { timer: SettleTimer; advance(ms: number): void } {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { dueAt: number; callback: () => void }>();

  const timer: SettleTimer = {
    setTimeout(callback: () => void, delayMs: number): number {
      const id = nextId++;
      pending.set(id, { dueAt: now + delayMs, callback });
      return id;
    },
    clearTimeout(handle: number): void {
      pending.delete(handle);
    },
  };

  function advance(ms: number): void {
    now += ms;
    for (const [id, entry] of [...pending]) {
      if (entry.dueAt <= now) {
        pending.delete(id);
        entry.callback();
      }
    }
  }

  return { timer, advance };
}

describe("makeSettle", () => {
  it("makeSettle — three calls inside the delay — fires onSettle once with the last value", () => {
    const { timer, advance } = makeFakeTimer();
    const onSettle = vi.fn();
    const settle = makeSettle<number>(100, onSettle, timer);

    settle.notify(1);
    advance(50);
    settle.notify(2);
    advance(50);
    settle.notify(3);
    advance(100);

    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith(3);
  });

  it("makeSettle — two calls separated by more than the delay — fires twice", () => {
    const { timer, advance } = makeFakeTimer();
    const onSettle = vi.fn();
    const settle = makeSettle<number>(100, onSettle, timer);

    settle.notify(1);
    advance(150);
    settle.notify(2);
    advance(150);

    expect(onSettle).toHaveBeenCalledTimes(2);
    expect(onSettle).toHaveBeenNthCalledWith(1, 1);
    expect(onSettle).toHaveBeenNthCalledWith(2, 2);
  });

  it("makeSettle — cancelled before the delay elapses — never fires", () => {
    const { timer, advance } = makeFakeTimer();
    const onSettle = vi.fn();
    const settle = makeSettle<number>(100, onSettle, timer);

    settle.notify(1);
    settle.cancel();
    advance(1000);

    expect(onSettle).not.toHaveBeenCalled();
  });

  it("makeSettle — latestSeq — starts at zero and increments once per settle firing, readable from inside onSettle", () => {
    const { timer, advance } = makeFakeTimer();
    const seqSeenInsideOnSettle: number[] = [];
    let settle!: ReturnType<typeof makeSettle<number>>;
    settle = makeSettle<number>(100, () => seqSeenInsideOnSettle.push(settle.latestSeq()), timer);

    settle.notify(1);
    advance(100);
    settle.notify(2);
    advance(100);

    expect(seqSeenInsideOnSettle).toEqual([1, 2]);
    expect(settle.latestSeq()).toBe(2);
  });
});

describe("isStaleSettleResult", () => {
  it("isStaleSettleResult — the captured seq still matches the current seq — is not stale", () => {
    const resultSeq = 3;
    const currentSeq = 3;

    const stale = isStaleSettleResult(resultSeq, currentSeq);

    expect(stale).toBe(false);
  });

  it("isStaleSettleResult — a newer settle fired since the async work captured its seq — is stale", () => {
    const resultSeq = 3;
    const currentSeq = 4;

    const stale = isStaleSettleResult(resultSeq, currentSeq);

    expect(stale).toBe(true);
  });
});
