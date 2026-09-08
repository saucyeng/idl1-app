import { describe, expect, it } from "vitest";

import { createCursorBus } from "./cursorBus";

describe("createCursorBus", () => {
  it("createCursorBus — a fresh bus — starts with no cursor shown and unpinned", () => {
    const bus = createCursorBus();

    expect(bus.getState()).toEqual({ tUs: null, pinned: false });
  });

  it("publish — a hover move — updates tUs and notifies subscribers, leaving pinned unchanged", () => {
    const bus = createCursorBus();
    const seen: Array<{ tUs: number | null; pinned: boolean }> = [];
    bus.subscribe((state) => seen.push(state));

    bus.publish(1_500);

    expect(bus.getState()).toEqual({ tUs: 1_500, pinned: false });
    expect(seen).toEqual([{ tUs: 1_500, pinned: false }]);
  });

  it("publish — the pointer leaves every chart (null) — hides the cursor", () => {
    const bus = createCursorBus();
    bus.publish(1_000);

    bus.publish(null);

    expect(bus.getState()).toEqual({ tUs: null, pinned: false });
  });

  it("pin — a click — sets tUs and pinned together", () => {
    const bus = createCursorBus();

    bus.pin(2_500);

    expect(bus.getState()).toEqual({ tUs: 2_500, pinned: true });
  });

  it("unpin — a pinned cursor — clears tUs and pinned, matching today's onClearCursor", () => {
    const bus = createCursorBus();
    bus.pin(2_500);

    bus.unpin();

    expect(bus.getState()).toEqual({ tUs: null, pinned: false });
  });

  it("subscribe — the returned unsubscribe — stops further notifications without affecting other subscribers", () => {
    const bus = createCursorBus();
    const a: Array<number | null> = [];
    const b: Array<number | null> = [];
    const unsubscribeA = bus.subscribe((state) => a.push(state.tUs));
    bus.subscribe((state) => b.push(state.tUs));

    bus.publish(100);
    unsubscribeA();
    bus.publish(200);

    expect(a).toEqual([100]);
    expect(b).toEqual([100, 200]);
  });
});
