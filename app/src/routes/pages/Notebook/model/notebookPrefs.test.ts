import { afterEach, describe, expect, it } from "vitest";

import { readNotebookPrefs, writeNotebookPrefs } from "./notebookPrefs";

/** A minimal `Storage`-shaped stub, matching `Settings/prefsStore.test.ts`'s
 *  `fakeLocalStorage` shape — vitest's `node` test environment has no real
 *  `window.localStorage`. */
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

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("readNotebookPrefs", () => {
  it("readNotebookPrefs — nothing stored yet — returns the default (both fields null)", () => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };

    const prefs = readNotebookPrefs();

    expect(prefs).toEqual({ last_workbook_id: null, input_map_preset_id: null });
  });

  it("readNotebookPrefs — a written value — round-trips through write then read", () => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };

    writeNotebookPrefs({ last_workbook_id: "wb-1", input_map_preset_id: "basic-mouse" });
    const prefs = readNotebookPrefs();

    expect(prefs).toEqual({ last_workbook_id: "wb-1", input_map_preset_id: "basic-mouse" });
  });

  it("readNotebookPrefs — a document written before input_map_preset_id existed — normalized to null, not undefined", () => {
    const storage = fakeLocalStorage();
    storage.setItem("idl1.notebook.ui.v1", JSON.stringify({ last_workbook_id: "wb-1" }));
    (globalThis as { window?: unknown }).window = { localStorage: storage };

    const prefs = readNotebookPrefs();

    expect(prefs).toEqual({ last_workbook_id: "wb-1", input_map_preset_id: null });
  });

  it("readNotebookPrefs — corrupt JSON stored under the key — falls back to defaults", () => {
    const storage = fakeLocalStorage();
    storage.setItem("idl1.notebook.ui.v1", "{not json");
    (globalThis as { window?: unknown }).window = { localStorage: storage };

    const prefs = readNotebookPrefs();

    expect(prefs).toEqual({ last_workbook_id: null, input_map_preset_id: null });
  });

  it("readNotebookPrefs — a value of the wrong shape — falls back to defaults", () => {
    const storage = fakeLocalStorage();
    storage.setItem("idl1.notebook.ui.v1", JSON.stringify({ something_else: 1 }));
    (globalThis as { window?: unknown }).window = { localStorage: storage };

    const prefs = readNotebookPrefs();

    expect(prefs).toEqual({ last_workbook_id: null, input_map_preset_id: null });
  });

  it("readNotebookPrefs — getItem throws — returns defaults rather than throwing", () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: fakeLocalStorage({
        getItem: () => {
          throw new Error("storage refused");
        },
      }),
    };

    const prefs = readNotebookPrefs();

    expect(prefs).toEqual({ last_workbook_id: null, input_map_preset_id: null });
  });
});

describe("writeNotebookPrefs", () => {
  it("writeNotebookPrefs — setItem throws — does not throw, drops the write silently", () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: fakeLocalStorage({
        setItem: () => {
          throw new Error("storage refused");
        },
      }),
    };

    expect(() => writeNotebookPrefs({ last_workbook_id: "wb-1", input_map_preset_id: null })).not.toThrow();
  });
});
