import { afterEach, describe, expect, it, vi } from "vitest";

import { getStudioColumnVisible, setStudioColumnVisible, subscribeStudioColumns } from "./studioColumns";

afterEach(() => {
  setStudioColumnVisible("graph", true);
  setStudioColumnVisible("properties", true);
});

describe("studioColumns", () => {
  it("getStudioColumnVisible — nothing published — both true, so the columns render as they always did", () => {
    const both = [getStudioColumnVisible("graph"), getStudioColumnVisible("properties")];

    expect(both).toEqual([true, true]);
  });

  it("setStudioColumnVisible — one toggle turned off — only that column reads false", () => {
    setStudioColumnVisible("graph", false);

    expect([getStudioColumnVisible("graph"), getStudioColumnVisible("properties")]).toEqual([false, true]);
  });

  it("setStudioColumnVisible — a change — notifies every subscriber", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeStudioColumns(handler);

    setStudioColumnVisible("properties", false);

    expect(handler).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("setStudioColumnVisible — the same value twice — notifies nobody the second time", () => {
    setStudioColumnVisible("graph", false);
    const handler = vi.fn();
    const unsubscribe = subscribeStudioColumns(handler);

    setStudioColumnVisible("graph", false);

    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("subscribeStudioColumns — an unsubscribed handler — stops being called", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeStudioColumns(handler);

    unsubscribe();
    setStudioColumnVisible("graph", false);

    expect(handler).not.toHaveBeenCalled();
  });
});
