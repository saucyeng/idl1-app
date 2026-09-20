import { describe, expect, it } from "vitest";

import {
  DOCK_LAYOUT_VERSION,
  DOCK_PANEL_IDS,
  DOCK_PANEL_TITLES,
  defaultDockLayoutFor,
  dockLayoutDocument,
  dockLayoutPanelIds,
  dockPanelDiff,
  dockPanelInsertion,
  isDockPanelId,
  matchingNamedLayout,
  namedDockLayout,
  NOMINAL_GRID_HEIGHT_PX,
  NOMINAL_GRID_WIDTH_PX,
  sanitizeDockLayout,
  STACKED_MATHS_ROW_HEIGHT_PX,
} from "./dockLayout";
import { LAYOUT_PRESET_CYCLE, OUTPUT_COLUMN_MIN_WIDTH_PX } from "./layoutPresets";

/** A layout every test can fall back to, distinguishable from any named
 *  one by identity. */
const FALLBACK = namedDockLayout("split");

describe("namedDockLayout", () => {
  it("namedDockLayout — output — the Notebook alone", () => {
    const layout = namedDockLayout("output");

    const ids = dockLayoutPanelIds(layout);

    expect(ids).toEqual(["cells"]);
  });

  it("namedDockLayout — maths — all three, Notebook at the minimum width", () => {
    const layout = namedDockLayout("maths");

    const ids = dockLayoutPanelIds(layout);
    const leaves = layout.grid.root.data as { data: { views: string[] }; size: number }[];

    expect(ids).toEqual(["graph", "properties", "cells"]);
    expect(leaves[2]!.data.views).toEqual(["cells"]);
    expect(leaves[2]!.size).toBe(OUTPUT_COLUMN_MIN_WIDTH_PX);
  });

  it("namedDockLayout — split — three columns left to right in reference order", () => {
    const layout = namedDockLayout("split");

    const leaves = layout.grid.root.data as { type: string; data: { views: string[] } }[];

    expect(leaves.map((node) => node.type)).toEqual(["leaf", "leaf", "leaf"]);
    expect(leaves.flatMap((node) => node.data.views)).toEqual(["graph", "properties", "cells"]);
  });

  it("namedDockLayout — stacked — Maths is a row above the Notebook, Code beside", () => {
    const layout = namedDockLayout("stacked");

    const top = layout.grid.root.data as { type: string; data: unknown; size: number }[];
    const nested = top[1]!.data as { data: { views: string[] }; size: number }[];

    expect(top.map((node) => node.type)).toEqual(["leaf", "branch"]);
    expect(nested.map((node) => node.data.views[0])).toEqual(["graph", "cells"]);
    expect(nested[0]!.size).toBe(STACKED_MATHS_ROW_HEIGHT_PX);
  });

  it("namedDockLayout — every preset — a panel entry per panel the grid names", () => {
    for (const id of LAYOUT_PRESET_CYCLE) {
      const layout = namedDockLayout(id);

      const ids = dockLayoutPanelIds(layout);

      expect(ids).not.toBeNull();
      expect(Object.keys(layout.panels).sort()).toEqual([...ids!].sort());
      for (const panelId of ids!) expect(layout.panels[panelId]!.title).toBe(DOCK_PANEL_TITLES[panelId]);
    }
  });

  it("namedDockLayout — every preset — panels render always so a move never reparents them", () => {
    for (const id of LAYOUT_PRESET_CYCLE) {
      const layout = namedDockLayout(id);

      const renderers = Object.values(layout.panels).map((panel) => panel.renderer);

      expect(renderers.every((renderer) => renderer === "always")).toBe(true);
    }
  });

  it("namedDockLayout — every preset — sibling sizes fill the nominal grid", () => {
    for (const id of LAYOUT_PRESET_CYCLE) {
      const layout = namedDockLayout(id);

      const total = (layout.grid.root.data as { size: number }[]).reduce((sum, node) => sum + node.size, 0);

      expect(total).toBe(NOMINAL_GRID_WIDTH_PX);
      expect(layout.grid.height).toBe(NOMINAL_GRID_HEIGHT_PX);
    }
  });
});

describe("defaultDockLayoutFor", () => {
  it("defaultDockLayoutFor — the three classes — R213's per-class defaults", () => {
    const ultrawide = defaultDockLayoutFor("ultrawide");
    const wide = defaultDockLayoutFor("wide");
    const narrow = defaultDockLayoutFor("narrow");

    expect(ultrawide).toEqual(namedDockLayout("split"));
    expect(wide).toEqual(namedDockLayout("stacked"));
    expect(narrow).toEqual(namedDockLayout("output"));
  });
});

describe("dockLayoutPanelIds", () => {
  it("dockLayoutPanelIds — panels out of reference order — reported in reference order", () => {
    const layout = namedDockLayout("split");
    const reversed = { ...layout, grid: { ...layout.grid, root: { ...layout.grid.root, data: [...(layout.grid.root.data as unknown[])].reverse() } } };

    const ids = dockLayoutPanelIds(reversed);

    expect(ids).toEqual([...DOCK_PANEL_IDS]);
  });

  it("dockLayoutPanelIds — a view no build has — null", () => {
    const layout = namedDockLayout("output");
    const alien = structuredClone(layout) as { grid: { root: { data: { data: { views: string[] } }[] } } };
    alien.grid.root.data[0]!.data.views = ["telemetry"];

    const ids = dockLayoutPanelIds(alien);

    expect(ids).toBeNull();
  });

  it("dockLayoutPanelIds — the same panel in two leaves — null", () => {
    const layout = namedDockLayout("split");
    const duplicated = structuredClone(layout) as { grid: { root: { data: { data: { views: string[] } }[] } } };
    duplicated.grid.root.data[1]!.data.views = ["graph"];

    const ids = dockLayoutPanelIds(duplicated);

    expect(ids).toBeNull();
  });

  it("dockLayoutPanelIds — a grid naming a panel with no panels entry — null", () => {
    const layout = namedDockLayout("split");
    const orphaned = { ...layout, panels: { cells: layout.panels.cells! } };

    const ids = dockLayoutPanelIds(orphaned);

    expect(ids).toBeNull();
  });

  it("dockLayoutPanelIds — an empty branch — null", () => {
    const layout = { grid: { root: { type: "branch", data: [], size: 100 }, width: 100, height: 100, orientation: "HORIZONTAL" }, panels: {} };

    const ids = dockLayoutPanelIds(layout);

    expect(ids).toBeNull();
  });

  it("dockLayoutPanelIds — a cyclic tree — null rather than a hang", () => {
    const node: Record<string, unknown> = { type: "branch", size: 100 };
    node.data = [node];
    const layout = { grid: { root: node, width: 100, height: 100, orientation: "HORIZONTAL" }, panels: {} };

    const ids = dockLayoutPanelIds(layout);

    expect(ids).toBeNull();
  });

  it("dockLayoutPanelIds — a grid with no size — null", () => {
    const layout = namedDockLayout("output");
    const sizeless = { ...layout, grid: { ...layout.grid, width: 0 } };

    const ids = dockLayoutPanelIds(sizeless);

    expect(ids).toBeNull();
  });

  it("dockLayoutPanelIds — not an object at all — null", () => {
    for (const raw of [null, undefined, 3, "split", [], true]) {
      expect(dockLayoutPanelIds(raw)).toBeNull();
    }
  });
});

describe("sanitizeDockLayout", () => {
  it("sanitizeDockLayout — a document this build wrote — the layout back, unchanged", () => {
    const layout = namedDockLayout("stacked");

    const restored = sanitizeDockLayout(dockLayoutDocument(layout), FALLBACK);

    expect(restored).toEqual(layout);
  });

  it("sanitizeDockLayout — an older version — the fallback", () => {
    const stale = { version: DOCK_LAYOUT_VERSION - 1, layout: namedDockLayout("stacked") };

    const restored = sanitizeDockLayout(stale, FALLBACK);

    expect(restored).toBe(FALLBACK);
  });

  it("sanitizeDockLayout — a newer version — the fallback", () => {
    const future = { version: DOCK_LAYOUT_VERSION + 1, layout: namedDockLayout("stacked") };

    const restored = sanitizeDockLayout(future, FALLBACK);

    expect(restored).toBe(FALLBACK);
  });

  it("sanitizeDockLayout — a corrupt layout at the right version — the fallback, no throw", () => {
    const corrupt = { version: DOCK_LAYOUT_VERSION, layout: { grid: { root: { type: "leaf" } } } };

    const restored = sanitizeDockLayout(corrupt, FALLBACK);

    expect(restored).toBe(FALLBACK);
  });

  it("sanitizeDockLayout — anything that is not a document — the fallback, no throw", () => {
    for (const raw of [null, undefined, "", 0, [], { version: DOCK_LAYOUT_VERSION }]) {
      expect(sanitizeDockLayout(raw, FALLBACK)).toBe(FALLBACK);
    }
  });
});

describe("matchingNamedLayout", () => {
  it("matchingNamedLayout — each named layout — names itself", () => {
    for (const id of LAYOUT_PRESET_CYCLE) {
      const match = matchingNamedLayout(namedDockLayout(id), [id, ...LAYOUT_PRESET_CYCLE]);

      expect(match).toBe(id);
    }
  });

  it("matchingNamedLayout — Split and Stacked — told apart by tree shape", () => {
    const split = matchingNamedLayout(namedDockLayout("split"), ["stacked", "split"]);
    const stacked = matchingNamedLayout(namedDockLayout("stacked"), ["split", "stacked"]);

    expect(split).toBe("split");
    expect(stacked).toBe("stacked");
  });

  it("matchingNamedLayout — a resized layout — still the layout it was", () => {
    const layout = structuredClone(namedDockLayout("split")) as { grid: { root: { data: { size: number }[] } } };
    layout.grid.root.data[0]!.size = 900;

    const match = matchingNamedLayout(layout, ["split"]);

    expect(match).toBe("split");
  });

  it("matchingNamedLayout — a panel closed by hand — no named layout", () => {
    const layout = namedDockLayout("split");
    const withoutCode = {
      ...layout,
      grid: { ...layout.grid, root: { ...layout.grid.root, data: (layout.grid.root.data as { data: { views: string[] } }[]).filter((node) => node.data.views[0] !== "properties") } },
    };

    const match = matchingNamedLayout(withoutCode, LAYOUT_PRESET_CYCLE);

    expect(match).toBeNull();
  });

  it("matchingNamedLayout — an unusable layout — null", () => {
    expect(matchingNamedLayout({ grid: null }, LAYOUT_PRESET_CYCLE)).toBeNull();
  });
});

describe("dockPanelInsertion", () => {
  it("dockPanelInsertion — Maths into a Notebook-only dock — left of the Notebook", () => {
    const where = dockPanelInsertion("graph", ["cells"]);

    expect(where).toEqual({ referencePanel: "cells", direction: "left" });
  });

  it("dockPanelInsertion — Code between Maths and the Notebook — left of the Notebook", () => {
    const where = dockPanelInsertion("properties", ["graph", "cells"]);

    expect(where).toEqual({ referencePanel: "cells", direction: "left" });
  });

  it("dockPanelInsertion — the Notebook last — right of the rightmost panel before it", () => {
    const where = dockPanelInsertion("cells", ["graph", "properties"]);

    expect(where).toEqual({ referencePanel: "properties", direction: "right" });
  });

  it("dockPanelInsertion — into an empty dock — no reference panel", () => {
    const where = dockPanelInsertion("properties", []);

    expect(where).toEqual({ referencePanel: null, direction: "right" });
  });

  it("dockPanelInsertion — a panel already docked — never beside itself", () => {
    const where = dockPanelInsertion("graph", ["graph", "cells"]);

    expect(where.referencePanel).not.toBe("graph");
  });
});

describe("dockPanelDiff", () => {
  it("dockPanelDiff — present and desired agree — nothing to do", () => {
    const diff = dockPanelDiff(["graph", "cells"], ["cells", "graph"]);

    expect(diff).toEqual({ add: [], remove: [] });
  });

  it("dockPanelDiff — one on, one off — one add and one remove, in reference order", () => {
    const diff = dockPanelDiff(["graph", "cells"], ["properties", "cells"]);

    expect(diff).toEqual({ add: ["properties"], remove: ["graph"] });
  });

  it("dockPanelDiff — an empty dock and all three wanted — three adds in reference order", () => {
    const diff = dockPanelDiff([], DOCK_PANEL_IDS);

    expect(diff).toEqual({ add: ["graph", "properties", "cells"], remove: [] });
  });
});

describe("isDockPanelId", () => {
  it("isDockPanelId — the three ids and some strangers — only the three", () => {
    expect(DOCK_PANEL_IDS.every(isDockPanelId)).toBe(true);
    expect(isDockPanelId("library")).toBe(false);
    expect(isDockPanelId("output")).toBe(false);
    expect(isDockPanelId(null)).toBe(false);
  });
});
