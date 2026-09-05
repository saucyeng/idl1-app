import { describe, expect, test, vi } from "vitest";

import { createWatchdog } from "./watchdog";

describe("watchdog", () => {
  test("watchdog — a pong arrives inside the deadline — does not trip", () => {
    let currentTime = 0;
    const now = () => currentTime;
    const send = vi.fn();
    const onStalled = vi.fn();
    const watchdog = createWatchdog({ now, send, onStalled });

    currentTime = 500;
    watchdog.tick(500);
    currentTime = 1500;
    watchdog.onPong();
    currentTime = 4000;
    watchdog.tick(4000);

    expect(onStalled).not.toHaveBeenCalled();
  });

  test("watchdog — no pong within the deadline — trips once and calls onStalled", () => {
    let currentTime = 0;
    const now = () => currentTime;
    const send = vi.fn();
    const onStalled = vi.fn();
    const watchdog = createWatchdog({ now, send, onStalled });

    currentTime = 1000;
    watchdog.tick(1000);
    currentTime = 2000;
    watchdog.tick(2000);
    currentTime = 3000;
    watchdog.tick(3000);
    currentTime = 3500;
    watchdog.tick(3500);
    currentTime = 4000;
    watchdog.tick(4000);

    expect(onStalled).toHaveBeenCalledTimes(1);
  });

  test("watchdog — a stall then a rebuild then a pong — resumes pinging without a second trip", () => {
    let currentTime = 0;
    const now = () => currentTime;
    const send = vi.fn();
    const onStalled = vi.fn();
    const watchdog = createWatchdog({ now, send, onStalled });

    currentTime = 3000;
    watchdog.tick(3000);
    expect(onStalled).toHaveBeenCalledTimes(1);

    currentTime = 3200;
    watchdog.onPong();
    currentTime = 6000;
    watchdog.tick(6000);

    expect(onStalled).toHaveBeenCalledTimes(1);
  });
});
