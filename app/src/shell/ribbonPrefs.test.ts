import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SHOW_OCCASIONAL, readShowOccasional, subscribeShowOccasional, writeShowOccasional } from "./ribbonPrefs";

/** Installs a `window.localStorage` double for one test. The `node`
 *  environment has no `window` at all, so this creates it rather than
 *  patching one — `Notebook/model/denseMode.test.ts`'s own helper, for the
 *  module this one is a sibling of. */
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

const KEY = "idl1.ribbon.showOccasional.v1";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ribbonPrefs — the ribbon's occasional-commands switch", () => {
  it("read — a machine that has never set it — is off, the new-user minimum", () => {
    stubStorage(new Map());

    const show = readShowOccasional();

    expect(show).toBe(DEFAULT_SHOW_OCCASIONAL);
    expect(show).toBe(false);
  });

  it("write then read — the value set — comes back", () => {
    const store = new Map<string, string>();
    stubStorage(store);

    writeShowOccasional(true);

    expect(store.get(KEY)).toBe("true");
    expect(readShowOccasional()).toBe(true);
  });

  it("read — a value no build ever wrote — falls back to the default rather than guessing", () => {
    stubStorage(new Map([[KEY, "yes please"]]));

    const show = readShowOccasional();

    expect(show).toBe(DEFAULT_SHOW_OCCASIONAL);
  });

  it("read — storage that throws — is the default, never an exception", () => {
    stubStorage(new Map(), true);

    const show = readShowOccasional();

    expect(show).toBe(DEFAULT_SHOW_OCCASIONAL);
  });

  it("write — storage that throws — still tells the ribbon, so the row updates this session", () => {
    stubStorage(new Map(), true);
    const listener = vi.fn();
    const unsubscribe = subscribeShowOccasional(listener);

    writeShowOccasional(true);

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("subscribe — an unsubscribed listener — hears nothing more", () => {
    stubStorage(new Map());
    const listener = vi.fn();
    const unsubscribe = subscribeShowOccasional(listener);

    unsubscribe();
    writeShowOccasional(true);

    expect(listener).not.toHaveBeenCalled();
  });
});
