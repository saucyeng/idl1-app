import { afterEach, describe, expect, it } from "vitest";

import {
  RECENT_WORKBOOK_LIMIT,
  getRecentWorkbooks,
  noteWorkbookOpened,
  readRecentWorkbooks,
  resetRecentWorkbooksCache,
  sanitizeRecentWorkbooks,
  subscribeRecentWorkbooks,
  withRecentWorkbook,
  writeRecentWorkbooks,
  type RecentWorkbook,
} from "./recentWorkbooks";

/** A minimal `Storage`-shaped stub — vitest's `node` environment has no
 *  real `window.localStorage` (`shell/columnPrefs.test.ts`'s own shape). */
function fakeLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
}

/** One entry, with the fields a test does not care about filled in. */
function entry(overrides: Partial<RecentWorkbook> = {}): RecentWorkbook {
  return { id: "wb-1", name: "Silverstone", fileName: "silverstone.idl1wb", openedAtMs: 1_000, ...overrides };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  // The store caches its snapshot for `useSyncExternalStore`'s sake, and
  // every case here swaps `window.localStorage` under it.
  resetRecentWorkbooksCache();
});

describe("withRecentWorkbook", () => {
  it("withRecentWorkbook — a workbook never opened before — first in the list", () => {
    const before = [entry({ id: "wb-2", openedAtMs: 500 })];

    const after = withRecentWorkbook(before, entry({ id: "wb-1", openedAtMs: 900 }));

    expect(after.map((item) => item.id)).toEqual(["wb-1", "wb-2"]);
  });

  it("withRecentWorkbook — a workbook already in the list — moved to the front, not duplicated", () => {
    const before = [entry({ id: "wb-2" }), entry({ id: "wb-1" })];

    const after = withRecentWorkbook(before, entry({ id: "wb-1", openedAtMs: 2_000 }));

    expect(after.map((item) => item.id)).toEqual(["wb-1", "wb-2"]);
  });

  it("withRecentWorkbook — a workbook renamed since it was last opened — the new name wins", () => {
    const before = [entry({ id: "wb-1", name: "Old name" })];

    const after = withRecentWorkbook(before, entry({ id: "wb-1", name: "New name" }));

    expect(after[0]!.name).toBe("New name");
  });

  it("withRecentWorkbook — more opens than the limit — the oldest falls off", () => {
    const before = Array.from({ length: RECENT_WORKBOOK_LIMIT }, (_, index) =>
      entry({ id: `wb-${index}`, openedAtMs: RECENT_WORKBOOK_LIMIT - index })
    );

    const after = withRecentWorkbook(before, entry({ id: "newest", openedAtMs: 9_999 }));

    expect(after).toHaveLength(RECENT_WORKBOOK_LIMIT);
    expect(after[0]!.id).toBe("newest");
    expect(after.some((item) => item.id === `wb-${RECENT_WORKBOOK_LIMIT - 1}`)).toBe(false);
  });
});

describe("sanitizeRecentWorkbooks", () => {
  it("sanitizeRecentWorkbooks — a well-formed list — newest first", () => {
    const raw = [entry({ id: "old", openedAtMs: 1 }), entry({ id: "new", openedAtMs: 2 })];

    const entries = sanitizeRecentWorkbooks(raw);

    expect(entries.map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("sanitizeRecentWorkbooks — one malformed entry — costs only itself", () => {
    const raw = [entry({ id: "good" }), { id: "bad", name: 7 }, null];

    const entries = sanitizeRecentWorkbooks(raw);

    expect(entries.map((item) => item.id)).toEqual(["good"]);
  });

  it("sanitizeRecentWorkbooks — the same id twice — kept once", () => {
    const raw = [entry({ id: "wb-1", openedAtMs: 2 }), entry({ id: "wb-1", openedAtMs: 1 })];

    const entries = sanitizeRecentWorkbooks(raw);

    expect(entries).toHaveLength(1);
  });

  it("sanitizeRecentWorkbooks — a stored list longer than the limit — cut to it", () => {
    const raw = Array.from({ length: RECENT_WORKBOOK_LIMIT + 5 }, (_, index) => entry({ id: `wb-${index}`, openedAtMs: index }));

    const entries = sanitizeRecentWorkbooks(raw);

    expect(entries).toHaveLength(RECENT_WORKBOOK_LIMIT);
  });

  it("sanitizeRecentWorkbooks — anything that is not an array — an empty list, no throw", () => {
    for (const raw of [null, undefined, 0, "nope", {}, true]) {
      expect(sanitizeRecentWorkbooks(raw)).toEqual([]);
    }
  });
});

describe("readRecentWorkbooks / writeRecentWorkbooks", () => {
  it("writeRecentWorkbooks then readRecentWorkbooks — round-trips", () => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };

    writeRecentWorkbooks([entry()]);

    expect(readRecentWorkbooks()).toEqual([entry()]);
  });

  it("readRecentWorkbooks — nothing stored yet — an empty list", () => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };

    expect(readRecentWorkbooks()).toEqual([]);
  });

  it("readRecentWorkbooks — unparsable JSON in storage — an empty list, no throw", () => {
    const storage = fakeLocalStorage();
    storage.setItem("idl1.shell.recentWorkbooks.v1", "{not json");
    (globalThis as { window?: unknown }).window = { localStorage: storage };

    expect(readRecentWorkbooks()).toEqual([]);
  });

  it("writeRecentWorkbooks — storage refused — dropped silently, no throw", () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        ...fakeLocalStorage(),
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    };

    expect(() => writeRecentWorkbooks([entry()])).not.toThrow();
  });

  it("readRecentWorkbooks — no window at all — an empty list, no throw", () => {
    expect(readRecentWorkbooks()).toEqual([]);
  });
});

describe("the live store", () => {
  it("getRecentWorkbooks — called twice with nothing opened between — the same array by reference", () => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };
    resetRecentWorkbooksCache();

    const first = getRecentWorkbooks();
    const second = getRecentWorkbooks();

    // `useSyncExternalStore` re-renders for ever if the snapshot is a
    // fresh array each call, which a bare `readRecentWorkbooks` would be.
    expect(second).toBe(first);
  });

  it("noteWorkbookOpened — a workbook opened — the snapshot changes and every subscriber is told", () => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };
    resetRecentWorkbooksCache();
    let notifications = 0;
    const unsubscribe = subscribeRecentWorkbooks(() => {
      notifications += 1;
    });

    noteWorkbookOpened(entry({ id: "wb-9", name: "Cadwell" }));

    expect(notifications).toBe(1);
    expect(getRecentWorkbooks().map((item) => item.id)).toEqual(["wb-9"]);
    unsubscribe();
  });

  it("noteWorkbookOpened — after unsubscribing — the former subscriber is not called", () => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };
    resetRecentWorkbooksCache();
    let notifications = 0;
    subscribeRecentWorkbooks(() => {
      notifications += 1;
    })();

    noteWorkbookOpened(entry());

    expect(notifications).toBe(0);
  });

  it("noteWorkbookOpened — storage refused — the in-memory snapshot still updates", () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        ...fakeLocalStorage(),
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    };
    resetRecentWorkbooksCache();

    noteWorkbookOpened(entry({ id: "wb-3" }));

    expect(getRecentWorkbooks().map((item) => item.id)).toEqual(["wb-3"]);
  });
});
