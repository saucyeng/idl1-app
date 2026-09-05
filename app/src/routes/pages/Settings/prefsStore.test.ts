import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFS } from "./prefs";
import { createPrefsStore, localStorageBackend, memoryBackend, type PrefsBackend } from "./prefsStore";

/** A minimal `Storage`-shaped stub for exercising `localStorageBackend()` in
 *  vitest's `node` test environment, which has no real `window.localStorage`. */
function fakeLocalStorage(overrides?: Partial<Storage>): Storage {
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
    ...overrides,
  } as Storage;
}

describe("createPrefsStore", () => {
  it("createPrefsStore — a memory backend with no seed — get returns defaults", () => {
    // Arrange
    const store = createPrefsStore(memoryBackend());

    // Act
    const prefs = store.get();

    // Assert
    expect(prefs).toEqual(DEFAULT_PREFS);
  });

  it("createPrefsStore — set then get — the patch applied, untouched fields preserved", () => {
    // Arrange
    const store = createPrefsStore(memoryBackend());

    // Act
    store.set({ engine: { ...DEFAULT_PREFS.engine, rider_name: "Isaac" } });
    const prefs = store.get();

    // Assert
    expect(prefs.engine.rider_name).toBe("Isaac");
    expect(prefs.ui).toEqual(DEFAULT_PREFS.ui);
  });

  it("createPrefsStore — set — subscribers are notified once with the new value", () => {
    // Arrange
    const store = createPrefsStore(memoryBackend());
    const listener = vi.fn();
    store.subscribe(listener);

    // Act
    store.set({ engine: { ...DEFAULT_PREFS.engine, rider_name: "Isaac" } });

    // Assert
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ engine: expect.objectContaining({ rider_name: "Isaac" }) }));
  });

  it("createPrefsStore — a backend whose read throws — get returns defaults, no throw escapes", () => {
    // Arrange
    const backend: PrefsBackend = {
      read: () => {
        throw new Error("storage disabled");
      },
      write: () => {},
    };

    // Act
    const store = createPrefsStore(backend);
    const prefs = store.get();

    // Assert
    expect(prefs).toEqual(DEFAULT_PREFS);
  });

  it("createPrefsStore — a backend whose write throws — set reports the failure, and get still shows the in-memory value so the user's typing is not discarded", () => {
    // Arrange
    const backend: PrefsBackend = {
      read: () => null,
      write: () => {
        throw new Error("storage full");
      },
    };
    const store = createPrefsStore(backend);

    // Act
    const result = store.set({ engine: { ...DEFAULT_PREFS.engine, rider_name: "Isaac" } });

    // Assert
    expect(result.ok).toBe(false);
    expect(store.get().engine.rider_name).toBe("Isaac");
  });

  it("createPrefsStore — a backend holding corrupt JSON — get returns defaults rather than propagating a parse error", () => {
    // Arrange
    const backend = memoryBackend();
    backend.write("not json{{{");
    const store = createPrefsStore(backend);

    // Act
    const prefs = store.get();

    // Assert
    expect(prefs).toEqual(DEFAULT_PREFS);
  });
});

describe("localStorageBackend", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it("localStorageBackend — a working localStorage — read and write round-trip", () => {
    // Arrange
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };
    const backend = localStorageBackend();

    // Act
    backend.write("hello");
    const read = backend.read();

    // Assert
    expect(read).toBe("hello");
  });

  it("localStorageBackend — a missing key — read returns null", () => {
    // Arrange
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };
    const backend = localStorageBackend();

    // Act
    const read = backend.read();

    // Assert
    expect(read).toBeNull();
  });

  it("localStorageBackend — getItem throws — read returns null rather than throwing", () => {
    // Arrange
    (globalThis as { window?: unknown }).window = {
      localStorage: fakeLocalStorage({
        getItem: () => {
          throw new Error("storage disabled");
        },
      }),
    };
    const backend = localStorageBackend();

    // Act
    const read = backend.read();

    // Assert
    expect(read).toBeNull();
  });

  it("localStorageBackend — setItem throws — write's error propagates to the caller", () => {
    // Arrange
    (globalThis as { window?: unknown }).window = {
      localStorage: fakeLocalStorage({
        setItem: () => {
          throw new Error("storage full");
        },
      }),
    };
    const backend = localStorageBackend();

    // Act / Assert
    expect(() => backend.write("x")).toThrow("storage full");
  });
});
