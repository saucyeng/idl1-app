import { describe, expect, it } from "vitest";
import { composeVisibility, setActiveRoute, subscribeRouteVisible } from "./routeVisibility";

describe("composeVisibility", () => {
  it("composeVisibility — window visible, route inactive — false", () => {
    expect(composeVisibility(true, false)).toBe(false);
  });

  it("composeVisibility — window hidden, route active — false", () => {
    expect(composeVisibility(false, true)).toBe(false);
  });

  it("composeVisibility — both true — true", () => {
    expect(composeVisibility(true, true)).toBe(true);
  });

  it("composeVisibility — both false — false", () => {
    expect(composeVisibility(false, false)).toBe(false);
  });
});

describe("subscribeRouteVisible", () => {
  it("subscribeRouteVisible — a listener that re-subscribes while notified — runs once per change, never loops", () => {
    // Arrange: the syncPoll.ts pattern while its route stays hidden, which
    // froze the webview at startup in nightly build 95.
    let calls = 0;
    let unsubscribe = (): void => {};
    const listener = (): void => {
      calls += 1;
      if (calls > 100) throw new Error("listener re-ran without end");
      unsubscribe();
      unsubscribe = subscribeRouteVisible("settings", listener);
    };
    unsubscribe = subscribeRouteVisible("settings", listener);

    // Act
    setActiveRoute("data");

    // Assert
    expect(calls).toBe(1);
    unsubscribe();
  });

  it("subscribeRouteVisible — after unsubscribing — not called", () => {
    // Arrange
    let calls = 0;
    const unsubscribe = subscribeRouteVisible("settings", () => {
      calls += 1;
    });
    unsubscribe();

    // Act
    setActiveRoute("notebook");

    // Assert
    expect(calls).toBe(0);
  });
});
