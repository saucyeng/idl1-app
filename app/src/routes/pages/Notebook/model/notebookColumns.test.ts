import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_NOTEBOOK_COLUMN_VISIBILITY,
  notebookColumnVisibilityFrom,
  readNotebookColumnVisibility,
  sanitizeNotebookColumnVisibility,
  toggleNotebookColumn,
  visibleNotebookColumnIds,
  writeNotebookColumnVisibility,
} from "./notebookColumns";

/** A minimal `Storage`-shaped stub — vitest's `node` test environment has no
 *  real `window.localStorage` (matching `shell/columnPrefs.test.ts`'s own
 *  `fakeLocalStorage` shape). */
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

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("toggleNotebookColumn", () => {
  it("toggleNotebookColumn — a pane currently off — turns it on, others unchanged", () => {
    const next = toggleNotebookColumn(DEFAULT_NOTEBOOK_COLUMN_VISIBILITY, "graph");

    expect(next).toEqual({ graph: true, properties: true, cells: true });
  });

  it("toggleNotebookColumn — a pane currently on, others also on — turns it off", () => {
    const next = toggleNotebookColumn({ graph: true, properties: true, cells: true }, "cells");

    expect(next).toEqual({ graph: true, properties: true, cells: false });
  });

  it("toggleNotebookColumn — turning off the only visible pane — no-op, never leaves every pane hidden", () => {
    const onlyGraph = { graph: true, properties: false, cells: false };

    const next = toggleNotebookColumn(onlyGraph, "graph");

    expect(next).toBe(onlyGraph);
  });
});

describe("visibleNotebookColumnIds", () => {
  it("visibleNotebookColumnIds — every pane visible and available — all three, in toolbar order", () => {
    const ids = visibleNotebookColumnIds({ graph: true, properties: true, cells: true }, { graph: true, properties: true, cells: true });

    expect(ids).toEqual(["graph", "properties", "cells"]);
  });

  it("visibleNotebookColumnIds — visible but unavailable (e.g. graph on a narrow layout) — excluded", () => {
    const ids = visibleNotebookColumnIds({ graph: true, properties: true, cells: true }, { graph: false, properties: true, cells: true });

    expect(ids).toEqual(["properties", "cells"]);
  });

  it("visibleNotebookColumnIds — available but toggled off — excluded", () => {
    const ids = visibleNotebookColumnIds({ graph: false, properties: true, cells: true }, { graph: true, properties: true, cells: true });

    expect(ids).toEqual(["properties", "cells"]);
  });
});

describe("sanitizeNotebookColumnVisibility", () => {
  it("sanitizeNotebookColumnVisibility — a well-formed document — passes through", () => {
    const sanitized = sanitizeNotebookColumnVisibility({ graph: true, properties: false, cells: true });

    expect(sanitized).toEqual({ graph: true, properties: false, cells: true });
  });

  it("sanitizeNotebookColumnVisibility — not an object — every id falls back to its own default", () => {
    expect(sanitizeNotebookColumnVisibility(null)).toEqual(DEFAULT_NOTEBOOK_COLUMN_VISIBILITY);
    expect(sanitizeNotebookColumnVisibility("nope")).toEqual(DEFAULT_NOTEBOOK_COLUMN_VISIBILITY);
    expect(sanitizeNotebookColumnVisibility([])).toEqual(DEFAULT_NOTEBOOK_COLUMN_VISIBILITY);
  });

  it("sanitizeNotebookColumnVisibility — a value of the wrong type for one id — that id falls back, others keep their value", () => {
    const sanitized = sanitizeNotebookColumnVisibility({ graph: "yes", properties: false, cells: true });

    expect(sanitized).toEqual({ graph: DEFAULT_NOTEBOOK_COLUMN_VISIBILITY.graph, properties: false, cells: true });
  });
});

describe("readNotebookColumnVisibility / writeNotebookColumnVisibility", () => {
  it("readNotebookColumnVisibility — nothing stored yet — the default", () => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };

    expect(readNotebookColumnVisibility()).toEqual(DEFAULT_NOTEBOOK_COLUMN_VISIBILITY);
  });

  it("writeNotebookColumnVisibility then readNotebookColumnVisibility — round-trips", () => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };

    writeNotebookColumnVisibility({ graph: true, properties: true, cells: false });

    expect(readNotebookColumnVisibility()).toEqual({ graph: true, properties: true, cells: false });
  });

  it("readNotebookColumnVisibility — unparsable JSON in storage — the default, no throw", () => {
    const storage = fakeLocalStorage();
    storage.setItem("idl1.notebook.columns.v1", "{not json");
    (globalThis as { window?: unknown }).window = { localStorage: storage };

    expect(readNotebookColumnVisibility()).toEqual(DEFAULT_NOTEBOOK_COLUMN_VISIBILITY);
  });
});

describe("notebookColumnVisibilityFrom", () => {
  it("notebookColumnVisibilityFrom — a set naming two columns — turns exactly those on", () => {
    const prev = { graph: true, properties: false, cells: false } as const;

    const next = notebookColumnVisibilityFrom(prev, ["properties", "cells"]);

    expect(next).toEqual({ graph: false, properties: true, cells: true });
  });

  it("notebookColumnVisibilityFrom — an empty set — keeps the previous visibility rather than blanking the preview", () => {
    const prev = { graph: false, properties: false, cells: true } as const;

    const next = notebookColumnVisibilityFrom(prev, []);

    expect(next).toEqual(prev);
  });

  it("notebookColumnVisibilityFrom — an unknown id alongside a real one — ignores the unknown id", () => {
    const prev = DEFAULT_NOTEBOOK_COLUMN_VISIBILITY;

    const next = notebookColumnVisibilityFrom(prev, ["graph", "library"]);

    expect(next).toEqual({ graph: true, properties: false, cells: false });
  });
});
