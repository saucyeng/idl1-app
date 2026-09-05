import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFS } from "./prefs";
import { createPrefsStore, memoryBackend, type PrefsBackend } from "./prefsStore";

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
