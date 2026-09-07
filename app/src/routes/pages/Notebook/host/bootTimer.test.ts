import { describe, expect, test, vi } from "vitest";

import { BOOT_TIMEOUT_MS, createBootTimer } from "./bootTimer";

/** A fake `schedule`/`cancel` pair that never touches a real timer: each
 *  `schedule` call is held in `pending` until the test explicitly fires it
 *  (simulating the deadline elapsing) or it is cancelled. */
function fakeScheduler() {
  let nextHandle = 1;
  const pending = new Map<number, () => void>();

  return {
    schedule: vi.fn((fn: () => void, _delayMs: number): unknown => {
      const handle = nextHandle++;
      pending.set(handle, fn);
      return handle;
    }),
    cancel: vi.fn((handle: unknown): void => {
      pending.delete(handle as number);
    }),
    /** Simulates every currently-pending deadline elapsing. */
    fireAll(): void {
      const fns = [...pending.values()];
      pending.clear();
      for (const fn of fns) fn();
    },
  };
}

describe("bootTimer", () => {
  test("boot timer — the deadline passes with no ready — reports unavailable once", () => {
    const scheduler = fakeScheduler();
    const onUnavailable = vi.fn();
    const timer = createBootTimer({ ...scheduler, onUnavailable });

    timer.arm();
    scheduler.fireAll();

    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(scheduler.schedule).toHaveBeenCalledWith(expect.any(Function), BOOT_TIMEOUT_MS);
  });

  test("boot timer — ready arrives before the deadline — never reported and the timer is cleared", () => {
    const scheduler = fakeScheduler();
    const onUnavailable = vi.fn();
    const timer = createBootTimer({ ...scheduler, onUnavailable });

    timer.arm();
    timer.onReady();
    scheduler.fireAll();

    expect(onUnavailable).not.toHaveBeenCalled();
    expect(scheduler.cancel).toHaveBeenCalledTimes(1);
  });

  test("boot timer — retry re-arms the deadline — restarts the deadline and resets any prior report", () => {
    const scheduler = fakeScheduler();
    const onUnavailable = vi.fn();
    const timer = createBootTimer({ ...scheduler, onUnavailable });

    timer.arm();
    scheduler.fireAll();
    expect(onUnavailable).toHaveBeenCalledTimes(1);

    timer.arm();
    scheduler.fireAll();

    expect(onUnavailable).toHaveBeenCalledTimes(2);
  });

  test("boot timer — dispose while armed — never fires, as when the route goes hidden mid-boot (R95)", () => {
    const scheduler = fakeScheduler();
    const onUnavailable = vi.fn();
    const timer = createBootTimer({ ...scheduler, onUnavailable });

    timer.arm();
    timer.dispose();
    scheduler.fireAll();

    expect(onUnavailable).not.toHaveBeenCalled();
  });
});
