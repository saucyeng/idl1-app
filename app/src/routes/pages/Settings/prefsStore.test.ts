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
  it("createPrefsStore — a memory backend with no seed — get returns defaults", async () => {
    // Arrange
    const store = createPrefsStore(memoryBackend());

    // Act
    const prefs = await store.get();

    // Assert
    expect(prefs).toEqual(DEFAULT_PREFS);
  });

  it("createPrefsStore — set then get — the patch applied, untouched fields preserved", async () => {
    // Arrange
    const store = createPrefsStore(memoryBackend());

    // Act
    await store.set({ engine: { ...DEFAULT_PREFS.engine, rider_name: "Isaac" } });
    const prefs = await store.get();

    // Assert
    expect(prefs.engine.rider_name).toBe("Isaac");
    expect(prefs.ui).toEqual(DEFAULT_PREFS.ui);
  });

  it("createPrefsStore — set — subscribers are notified once with the new value", async () => {
    // Arrange
    const store = createPrefsStore(memoryBackend());
    const listener = vi.fn();
    store.subscribe(listener);

    // Act
    await store.set({ engine: { ...DEFAULT_PREFS.engine, rider_name: "Isaac" } });

    // Assert
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ engine: expect.objectContaining({ rider_name: "Isaac" }) }));
  });

  it("createPrefsStore — a backend whose read rejects — get returns defaults, no rejection escapes", async () => {
    // Arrange
    const backend: PrefsBackend = {
      read: () => Promise.reject(new Error("storage disabled")),
      write: () => Promise.resolve(),
    };

    // Act
    const store = createPrefsStore(backend);
    const prefs = await store.get();

    // Assert
    expect(prefs).toEqual(DEFAULT_PREFS);
  });

  it("createPrefsStore — a backend whose write rejects — set reports the failure, and get still shows the in-memory value so the user's typing is not discarded", async () => {
    // Arrange
    const backend: PrefsBackend = {
      read: () => Promise.resolve(null),
      write: () => Promise.reject(new Error("storage full")),
    };
    const store = createPrefsStore(backend);

    // Act
    const result = await store.set({ engine: { ...DEFAULT_PREFS.engine, rider_name: "Isaac" } });

    // Assert
    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect((await store.get()).engine.rider_name).toBe("Isaac");
  });

  it("createPrefsStore — a backend holding corrupt JSON — get returns defaults rather than propagating a parse error", async () => {
    // Arrange
    const backend = memoryBackend();
    await backend.write("not json{{{");
    const store = createPrefsStore(backend);

    // Act
    const prefs = await store.get();

    // Assert
    expect(prefs).toEqual(DEFAULT_PREFS);
  });
});

describe("localStorageBackend", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it("localStorageBackend — a working localStorage — read and write round-trip", async () => {
    // Arrange
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };
    const backend = localStorageBackend();

    // Act
    await backend.write("hello");
    const read = await backend.read();

    // Assert
    expect(read).toBe("hello");
  });

  it("localStorageBackend — a missing key — read resolves null", async () => {
    // Arrange
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };
    const backend = localStorageBackend();

    // Act
    const read = await backend.read();

    // Assert
    expect(read).toBeNull();
  });

  it("localStorageBackend — getItem throws — read resolves null rather than rejecting", async () => {
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
    const read = await backend.read();

    // Assert
    expect(read).toBeNull();
  });

  it("localStorageBackend — setItem throws — write's rejection propagates to the caller", async () => {
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
    await expect(backend.write("x")).rejects.toThrow("storage full");
  });
});
