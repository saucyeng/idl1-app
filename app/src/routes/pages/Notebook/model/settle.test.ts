import { describe, expect, it, vi } from "vitest";

import { makeSettle, type SettleTimer } from "./settle";

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
});
