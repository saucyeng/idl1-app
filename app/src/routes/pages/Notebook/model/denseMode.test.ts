import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_DENSE, DENSE_GEOMETRY, denseChromeMode, denseGeometry, LOOSE_GEOMETRY, readDenseMode, sharesXAxisAbove, writeDenseMode } from "./denseMode";

/** Installs a `window.localStorage` double for one test. The `node`
 *  environment has no `window` at all, so this creates it rather than
 *  patching one. */
function stubStorage(store: Map<string, string>, throwing = false): void {
  const storage = {
    getItem: (key: string) => {
      if (throwing) throw new Error("blocked");
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (throwing) throw new Error("blocked");
      store.set(key, value);
    },
  };
  vi.stubGlobal("window", { localStorage: storage });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readDenseMode — nothing stored — is today's spacing", () => {
  it("defaults to off, and stays off when storage itself throws", () => {
    // Arrange
    stubStorage(new Map());
    const empty = readDenseMode();
    stubStorage(new Map([["idl1.notebook.dense.v1", "true"]]), true);

    // Act
    const blocked = readDenseMode();

    // Assert
    expect(empty).toBe(DEFAULT_DENSE);
    expect(blocked).toBe(DEFAULT_DENSE);
  });

  it("reads back what was written, and treats anything else as the default", () => {
    // Arrange
    const store = new Map<string, string>();
    stubStorage(store);

    // Act
    writeDenseMode(true);
    const on = readDenseMode();
    writeDenseMode(false);
    const off = readDenseMode();
    store.set("idl1.notebook.dense.v1", "yes please");
    const nonsense = readDenseMode();

    // Assert
    expect([on, off, nonsense]).toEqual([true, false, DEFAULT_DENSE]);
  });
});

describe("denseGeometry — dense stacking — removes every gap and every pad", () => {
  it("is all zeroes on, and today's spacing off", () => {
    // Arrange
    const modes = [true, false];

    // Act
    const geometries = modes.map(denseGeometry);

    // Assert
    expect(geometries).toEqual([DENSE_GEOMETRY, LOOSE_GEOMETRY]);
    expect(DENSE_GEOMETRY).toEqual({ gapPx: 0, paddingXPx: 0, paddingYPx: 0 });
  });
});

describe("denseChromeMode — dense stacking — overlays every kind's chrome", () => {
  it("overlays math and table too, which keep their band when dense is off", () => {
    // Arrange
    const kinds = ["js", "math", "table"];

    // Act
    const dense = kinds.map((kind) => denseChromeMode(true, kind));
    const loose = kinds.map((kind) => denseChromeMode(false, kind));

    // Assert
    expect(dense).toEqual(["overlay", "overlay", "overlay"]);
    expect(loose).toEqual(["overlay", "band", "band"]);
  });
});

describe("sharesXAxisAbove — two stacked charts — read as one x axis", () => {
  it("is true only for a js cell directly under another js cell, in dense mode", () => {
    // Arrange
    const kinds = ["js", "js", "math", "js"];

    // Act
    const dense = kinds.map((_, index) => sharesXAxisAbove(kinds, index, true));

    // Assert
    expect(dense).toEqual([false, true, false, false]);
  });

  it("is never true with dense off, however the cells are arranged", () => {
    // Arrange
    const kinds = ["js", "js", "js"];

    // Act
    const loose = kinds.map((_, index) => sharesXAxisAbove(kinds, index, false));

    // Assert
    expect(loose).toEqual([false, false, false]);
  });
});
