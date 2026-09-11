import { afterEach, describe, expect, it, vi } from "vitest";

import { getGraphColumnVisible, setGraphColumnVisible, subscribeGraphColumnVisible } from "./graphColumnVisible";

afterEach(() => {
  setGraphColumnVisible(true);
});

describe("graphColumnVisible", () => {
  it("getGraphColumnVisible — nothing published — true, so the column renders as it always did", () => {
    expect(getGraphColumnVisible()).toBe(true);
  });

  it("setGraphColumnVisible — the toggle turned off — reads false", () => {
    setGraphColumnVisible(false);

    expect(getGraphColumnVisible()).toBe(false);
  });

  it("setGraphColumnVisible — a change — notifies every subscriber", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeGraphColumnVisible(handler);

    setGraphColumnVisible(false);

    expect(handler).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("setGraphColumnVisible — the same value twice — notifies nobody the second time", () => {
    const handler = vi.fn();
    setGraphColumnVisible(false);
    const unsubscribe = subscribeGraphColumnVisible(handler);

    setGraphColumnVisible(false);

    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("subscribeGraphColumnVisible — an unsubscribed handler — stops being called", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeGraphColumnVisible(handler);

    unsubscribe();
    setGraphColumnVisible(false);

    expect(handler).not.toHaveBeenCalled();
  });
});
