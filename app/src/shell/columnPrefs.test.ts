import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_COLUMN_PREFS, readColumnPrefs, sanitizeColumnPrefs, writeColumnPrefs } from "./columnPrefs";
import { dockLayoutDocument, namedDockLayout } from "./dockLayout";

/** A minimal `Storage`-shaped stub — vitest's `node` test environment has no
 *  real `window.localStorage` (matching `Settings/prefsStore.test.ts` and
 *  `Notebook/model/notebookPrefs.test.ts`'s `fakeLocalStorage` shape). */
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

describe("readColumnPrefs", () => {
  it("readColumnPrefs — nothing stored yet — returns the defaults", () => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };

    const prefs = readColumnPrefs();

    expect(prefs).toEqual(DEFAULT_COLUMN_PREFS);
  });

  it("readColumnPrefs — a written value — round-trips through write then read", () => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };
    const written = {
      widths: { ...DEFAULT_COLUMN_PREFS.widths, library: 300 },
      collapsed: ["properties" as const],
      lastRoute: "data" as const,
      presets: { ...DEFAULT_COLUMN_PREFS.presets, wide: "custom" as const },
      sidebar: { ...DEFAULT_COLUMN_PREFS.sidebar, wide: { widthPx: 360, collapsed: true } },
      dock: { wide: dockLayoutDocument(namedDockLayout("split")) },
    };

    writeColumnPrefs(written);
    const prefs = readColumnPrefs();

    expect(prefs).toEqual(written);
  });

  it("readColumnPrefs — corrupt JSON stored under the key — falls back to defaults", () => {
    const storage = fakeLocalStorage();
    storage.setItem("idl1.shell.columns.v1", "{not json");
    (globalThis as { window?: unknown }).window = { localStorage: storage };

    expect(readColumnPrefs()).toEqual(DEFAULT_COLUMN_PREFS);
  });

  it("readColumnPrefs — getItem throws — returns defaults rather than throwing", () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: fakeLocalStorage({
        getItem: () => {
          throw new Error("storage refused");
        },
      }),
    };

    expect(readColumnPrefs()).toEqual(DEFAULT_COLUMN_PREFS);
  });
});

describe("writeColumnPrefs", () => {
  it("writeColumnPrefs — setItem throws — does not throw, drops the write silently", () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: fakeLocalStorage({
        setItem: () => {
          throw new Error("storage refused");
        },
      }),
    };

    expect(() => writeColumnPrefs(DEFAULT_COLUMN_PREFS)).not.toThrow();
  });
});

describe("sanitizeColumnPrefs", () => {
  it("sanitizeColumnPrefs — not an object — returns the defaults", () => {
    expect(sanitizeColumnPrefs("nope")).toEqual(DEFAULT_COLUMN_PREFS);
    expect(sanitizeColumnPrefs(null)).toEqual(DEFAULT_COLUMN_PREFS);
    expect(sanitizeColumnPrefs(42)).toEqual(DEFAULT_COLUMN_PREFS);
  });

  it("sanitizeColumnPrefs — a width below the column's minimum — clamps to the minimum", () => {
    const raw = { widths: { ...DEFAULT_COLUMN_PREFS.widths, library: 1 }, collapsed: [], lastRoute: null };

    expect(sanitizeColumnPrefs(raw).widths.library).toBeGreaterThanOrEqual(DEFAULT_COLUMN_PREFS.widths.library === 0 ? 0 : 1);
  });

  it("sanitizeColumnPrefs — a width above the column's maximum — clamps to the maximum", () => {
    const raw = { widths: { ...DEFAULT_COLUMN_PREFS.widths, library: 999_999 }, collapsed: [], lastRoute: null };

    const sanitized = sanitizeColumnPrefs(raw);

    expect(sanitized.widths.library).toBeLessThan(999_999);
  });

  it("sanitizeColumnPrefs — a missing column width — falls back to that column's default", () => {
    const raw = { widths: { library: 300 }, collapsed: [], lastRoute: null };

    const sanitized = sanitizeColumnPrefs(raw);

    expect(sanitized.widths.properties).toBe(DEFAULT_COLUMN_PREFS.widths.properties);
  });

  it("sanitizeColumnPrefs — an unknown collapsed id — dropped, known ids kept", () => {
    const raw = { widths: DEFAULT_COLUMN_PREFS.widths, collapsed: ["library", "not-a-column"], lastRoute: null };

    const sanitized = sanitizeColumnPrefs(raw);

    expect(sanitized.collapsed).toEqual(["library"]);
  });

  it("sanitizeColumnPrefs — output listed as collapsed — dropped, output is never collapsible", () => {
    const raw = { widths: DEFAULT_COLUMN_PREFS.widths, collapsed: ["output"], lastRoute: null };

    const sanitized = sanitizeColumnPrefs(raw);

    expect(sanitized.collapsed).toEqual([]);
  });

  it("sanitizeColumnPrefs — a stale preset id for one class — that class falls back to its own default", () => {
    const raw = { widths: DEFAULT_COLUMN_PREFS.widths, collapsed: [], lastRoute: null, presets: { ultrawide: "studio", wide: "output" } };

    const sanitized = sanitizeColumnPrefs(raw);

    expect(sanitized.presets).toEqual({ ultrawide: DEFAULT_COLUMN_PREFS.presets.ultrawide, wide: "output", narrow: DEFAULT_COLUMN_PREFS.presets.narrow });
  });

  it("sanitizeColumnPrefs — a class last thrown by hand — keeps the custom state", () => {
    const raw = { widths: DEFAULT_COLUMN_PREFS.widths, collapsed: [], lastRoute: null, presets: { narrow: "custom" } };

    expect(sanitizeColumnPrefs(raw).presets.narrow).toBe("custom");
  });

  it("sanitizeColumnPrefs — an unknown lastRoute value — falls back to null", () => {
    const raw = { widths: DEFAULT_COLUMN_PREFS.widths, collapsed: [], lastRoute: "not-a-route" };

    expect(sanitizeColumnPrefs(raw).lastRoute).toBeNull();
  });

  it("sanitizeColumnPrefs — a valid lastRoute value — kept", () => {
    const raw = { widths: DEFAULT_COLUMN_PREFS.widths, collapsed: [], lastRoute: "settings" };

    expect(sanitizeColumnPrefs(raw).lastRoute).toBe("settings");
  });
});
