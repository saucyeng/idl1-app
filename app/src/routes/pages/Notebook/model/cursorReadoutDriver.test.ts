import { describe, expect, it, vi } from "vitest";

import type { CursorReadout } from "../../../../ipc/cursor";
import { makeCursorReadoutDriver } from "./cursorReadoutDriver";
import type { SettleTimer } from "./settle";
import type { Viewport } from "./viewport";

/** A fully controllable fake `SettleTimer`, mirroring `settle.test.ts`'s
 *  own helper: time advances only when `advance(ms)` is called. */
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

const VIEWPORT: Viewport = { startUs: 0, endUs: 1_000_000, pixelWidth: 800 };

describe("makeCursorReadoutDriver", () => {
  it("makeCursorReadoutDriver — two notifies within the window — dispatches once, for the latest position", async () => {
    // Arrange
    const { timer, advance } = makeFakeTimer();
    const onState = vi.fn();
    const fetchCursorReadout = vi.fn(
      (_sessionId: string, _channels: string[], tUs: number): Promise<CursorReadout> =>
        Promise.resolve({ t_us: tUs, values: { "front-fork": 1 } })
    );
    const driver = makeCursorReadoutDriver(
      { fetchCursorReadout, onState, sessionId: "s1", channelId: "front-fork" },
      100,
      timer
    );

    // Act
    driver.notify(VIEWPORT, 400);
    advance(50);
    driver.notify(VIEWPORT, 600);
    advance(100);
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(fetchCursorReadout).toHaveBeenCalledTimes(1);
    const [, , tUsRequested] = fetchCursorReadout.mock.calls[0];
    expect(tUsRequested).toBe(750_000); // pixelX 600 of 800 → 0.75 of the 1_000_000us span
    expect(onState).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenCalledWith({ kind: "rows", rows: [{ channel: "front-fork", label: "front-fork", value: 1 }] });
  });

  it("makeCursorReadoutDriver — dispatchNow — dispatches immediately with no debounce wait", async () => {
    // Arrange
    const onState = vi.fn();
    const fetchCursorReadout = vi.fn(
      (): Promise<CursorReadout> => Promise.resolve({ t_us: 0, values: { "front-fork": 2 } })
    );
    const driver = makeCursorReadoutDriver({ fetchCursorReadout, onState, sessionId: "s1", channelId: "front-fork" }, 150);

    // Act: no timer advance at all — dispatchNow must not wait out the debounce.
    driver.dispatchNow(VIEWPORT, 100);
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(fetchCursorReadout).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenCalledWith({ kind: "rows", rows: [{ channel: "front-fork", label: "front-fork", value: 2 }] });
  });

  it("makeCursorReadoutDriver — dispatchNow with pixelX null — clears the panel without fetching", () => {
    // Arrange
    const onState = vi.fn();
    const fetchCursorReadout = vi.fn();
    const driver = makeCursorReadoutDriver({ fetchCursorReadout, onState, sessionId: "s1", channelId: "front-fork" }, 150);

    // Act
    driver.dispatchNow(VIEWPORT, null);

    // Assert
    expect(fetchCursorReadout).not.toHaveBeenCalled();
    expect(onState).toHaveBeenCalledWith(null);
  });

  it("makeCursorReadoutDriver — move then leave — clears the panel and drops a late-resolving result", async () => {
    // Arrange
    const { timer, advance } = makeFakeTimer();
    const onState = vi.fn();
    let resolveFetch!: (readout: CursorReadout) => void;
    const fetchCursorReadout = vi.fn(
      (): Promise<CursorReadout> =>
        new Promise<CursorReadout>((resolve) => {
          resolveFetch = resolve;
        })
    );
    const driver = makeCursorReadoutDriver(
      { fetchCursorReadout, onState, sessionId: "s1", channelId: "front-fork" },
      100,
      timer
    );

    // Act: the pointer stops (settle fires, fetch dispatched but not yet
    // resolved), then leaves before that fetch resolves.
    driver.notify(VIEWPORT, 400);
    advance(100);
    driver.leave();
    resolveFetch({ t_us: 400, values: { "front-fork": 1 } });
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(onState).toHaveBeenCalledWith(null);
    expect(onState).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "rows" }));
  });

  it("makeCursorReadoutDriver — dispatchNow with a pixelX outside the plot — clears the panel without fetching", () => {
    // Arrange
    const onState = vi.fn();
    const fetchCursorReadout = vi.fn();
    const driver = makeCursorReadoutDriver({ fetchCursorReadout, onState, sessionId: "s1", channelId: "front-fork" }, 150);

    // Act
    driver.dispatchNow(VIEWPORT, 801);

    // Assert
    expect(fetchCursorReadout).not.toHaveBeenCalled();
    expect(onState).toHaveBeenCalledWith(null);
  });

  it("makeCursorReadoutDriver — a superseded dispatch's rejection — is dropped rather than shown", async () => {
    // Arrange
    const onState = vi.fn();
    let rejectFirst!: (error: unknown) => void;
    const fetchCursorReadout = vi
      .fn()
      .mockImplementationOnce(
        (): Promise<CursorReadout> =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          })
      )
      .mockImplementationOnce((): Promise<CursorReadout> => Promise.resolve({ t_us: 0, values: { "front-fork": 5 } }));
    const driver = makeCursorReadoutDriver({ fetchCursorReadout, onState, sessionId: "s1", channelId: "front-fork" }, 150);

    // Act: a newer dispatch fires before the older one's rejection arrives.
    driver.dispatchNow(VIEWPORT, 100);
    driver.dispatchNow(VIEWPORT, 200);
    rejectFirst({ kind: "invalid_argument", message: "stale" });
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(onState).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenCalledWith({ kind: "rows", rows: [{ channel: "front-fork", label: "front-fork", value: 5 }] });
  });

  it("makeCursorReadoutDriver — cancel — stops a pending debounce timer from notify", () => {
    // Arrange
    const { timer, advance } = makeFakeTimer();
    const onState = vi.fn();
    const fetchCursorReadout = vi.fn();
    const driver = makeCursorReadoutDriver({ fetchCursorReadout, onState, sessionId: "s1", channelId: "front-fork" }, 100, timer);

    // Act
    driver.notify(VIEWPORT, 400);
    driver.cancel();
    advance(1000);

    // Assert
    expect(fetchCursorReadout).not.toHaveBeenCalled();
  });

  it("makeCursorReadoutDriver — a rejected fetch — sets a readout-unavailable error state", async () => {
    // Arrange
    const onState = vi.fn();
    const fetchCursorReadout = vi.fn(
      (): Promise<CursorReadout> => Promise.reject({ kind: "invalid_argument", message: "unknown channel" })
    );
    const driver = makeCursorReadoutDriver({ fetchCursorReadout, onState, sessionId: "s1", channelId: "front-fork" }, 150);

    // Act
    driver.dispatchNow(VIEWPORT, 400);
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(onState).toHaveBeenCalledWith({ kind: "error", message: "readout unavailable: invalid_argument" });
  });
});
