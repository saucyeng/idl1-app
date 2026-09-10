import { afterEach, describe, expect, it, vi } from "vitest";

import { getGraphSlotNode, setGraphSlotNode, subscribeGraphSlot } from "./graphSlot";

/** A stand-in for the column's container element — the store only ever
 *  holds the reference, never touches the DOM API on it. */
function fakeNode(): HTMLDivElement {
  return {} as HTMLDivElement;
}

afterEach(() => {
  setGraphSlotNode(null);
});

describe("graphSlot", () => {
  it("getGraphSlotNode — nothing published — null", () => {
    expect(getGraphSlotNode()).toBeNull();
  });

  it("setGraphSlotNode — a node published — that node is readable", () => {
    const node = fakeNode();

    setGraphSlotNode(node);

    expect(getGraphSlotNode()).toBe(node);
  });

  it("setGraphSlotNode — the same node twice — the second call notifies nobody", () => {
    const node = fakeNode();
    const handler = vi.fn();
    setGraphSlotNode(node);
    subscribeGraphSlot(handler);

    setGraphSlotNode(node);

    expect(handler).not.toHaveBeenCalled();
  });

  it("setGraphSlotNode — a different node — subscribers are notified once", () => {
    const handler = vi.fn();
    subscribeGraphSlot(handler);

    setGraphSlotNode(fakeNode());

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("setGraphSlotNode — null after a node (column unmounted) — the slot clears and notifies", () => {
    const handler = vi.fn();
    setGraphSlotNode(fakeNode());
    subscribeGraphSlot(handler);

    setGraphSlotNode(null);

    expect(getGraphSlotNode()).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("subscribeGraphSlot — unsubscribed handler — no longer notified", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeGraphSlot(handler);

    unsubscribe();
    setGraphSlotNode(fakeNode());

    expect(handler).not.toHaveBeenCalled();
  });
});
