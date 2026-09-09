import { describe, expect, it, vi } from "vitest";

import type { SettleTimer } from "../model/settle";
import { makeRerenderCoalescer } from "./rerenderCoalescer";

/** A fully controllable fake `SettleTimer` — mirrors `settle.test.ts`'s own
 *  fake: time advances only when `advance(ms)` is called. */
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

describe("makeRerenderCoalescer", () => {
  it("makeRerenderCoalescer — a burst of ~50 notify calls spread across separate tasks — fires onFire exactly once", () => {
    // Arrange: this is the real page-load shape (SandboxHost's brief) --
    // one `notify()` per channel/spectrum publish, each landing in its own
    // task once its own IPC round trip resolves, but all close together.
    const { timer, advance } = makeFakeTimer();
    const onFire = vi.fn();
    const coalescer = makeRerenderCoalescer(50, onFire, timer);

    for (let i = 0; i < 50; i++) {
      coalescer.notify();
      advance(5); // each publish lands a little after the previous one, well inside the 50ms quiet period
    }
    advance(50);

    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("makeRerenderCoalescer — two notify calls separated by more than delayMs — fires twice", () => {
    const { timer, advance } = makeFakeTimer();
    const onFire = vi.fn();
    const coalescer = makeRerenderCoalescer(50, onFire, timer);

    coalescer.notify();
    advance(100);
    coalescer.notify();
    advance(100);

    expect(onFire).toHaveBeenCalledTimes(2);
  });

  it("makeRerenderCoalescer — a late notify after the burst has settled — still reaches onFire (a late-bound host var still re-renders)", () => {
    // This is the behaviour Task 4's dispatch says must not regress:
    // without coalescing (or with it broken), a host variable bound after
    // `setCells` never reaches its cell.
    const { timer, advance } = makeFakeTimer();
    const onFire = vi.fn();
    const coalescer = makeRerenderCoalescer(50, onFire, timer);

    coalescer.notify();
    advance(50);
    expect(onFire).toHaveBeenCalledTimes(1);

    coalescer.notify(); // a slow channel resolves well after the first burst settled
    advance(50);

    expect(onFire).toHaveBeenCalledTimes(2);
  });

  it("makeRerenderCoalescer — cancelled before the delay elapses — never fires", () => {
    const { timer, advance } = makeFakeTimer();
    const onFire = vi.fn();
    const coalescer = makeRerenderCoalescer(50, onFire, timer);

    coalescer.notify();
    coalescer.cancel();
    advance(1000);

    expect(onFire).not.toHaveBeenCalled();
  });
});
