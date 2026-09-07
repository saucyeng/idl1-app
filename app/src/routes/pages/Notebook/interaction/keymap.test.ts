import { describe, expect, it } from "vitest";

import { actionForKey, type KeyLike } from "./keymap";

function key(k: Partial<KeyLike> & { key: string }): KeyLike {
  return { ctrlKey: false, metaKey: false, shiftKey: false, ...k };
}

describe("actionForKey", () => {
  it("actionForKey — each binding — its action", () => {
    expect(actionForKey(key({ key: "ArrowUp" }))).toBe("zoomIn");
    expect(actionForKey(key({ key: "ArrowDown" }))).toBe("zoomOut");
    expect(actionForKey(key({ key: "ArrowLeft" }))).toBe("panLeft");
    expect(actionForKey(key({ key: "ArrowRight" }))).toBe("panRight");
    expect(actionForKey(key({ key: "0" }))).toBe("resetZoom");
    expect(actionForKey(key({ key: "z" }))).toBe("zoomToSelection");
    expect(actionForKey(key({ key: "Z" }))).toBe("zoomToSelection");
    expect(actionForKey(key({ key: "c", ctrlKey: true, shiftKey: true }))).toBe("copyValue");
    expect(actionForKey(key({ key: "C", ctrlKey: true, shiftKey: true }))).toBe("copyValue");
  });

  it("actionForKey — a bound key with an unexpected modifier — null", () => {
    expect(actionForKey(key({ key: "ArrowUp", ctrlKey: true }))).toBeNull();
    expect(actionForKey(key({ key: "ArrowLeft", shiftKey: true }))).toBeNull();
    expect(actionForKey(key({ key: "0", metaKey: true }))).toBeNull();
    expect(actionForKey(key({ key: "z", shiftKey: true }))).toBeNull();
    expect(actionForKey(key({ key: "c", ctrlKey: true, shiftKey: false }))).toBeNull();
    expect(actionForKey(key({ key: "c", ctrlKey: true, shiftKey: true, metaKey: true }))).toBeNull();
  });

  it("actionForKey — an unbound key — null", () => {
    expect(actionForKey(key({ key: "a" }))).toBeNull();
    expect(actionForKey(key({ key: "Enter" }))).toBeNull();
  });
});
