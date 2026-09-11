import { describe, expect, it } from "vitest";

import {
  childrenOf,
  commandById,
  COMMAND_IDS,
  COMMAND_TIERS,
  coreCommands,
  coreTier,
  hasChildren,
  RIBBON_GROUP_ORDER,
} from "./commandTiers";
import { MENUS } from "./menuModel";

describe("the tier table", () => {
  it("table — every id — appears exactly once", () => {
    const ids = COMMAND_TIERS.map((entry) => entry.id);

    const unique = new Set(ids);

    expect(unique.size).toBe(ids.length);
  });

  it("table — every id — is one of COMMAND_IDS", () => {
    const known = new Set<string>(Object.values(COMMAND_IDS));

    const unknown = COMMAND_TIERS.filter((entry) => !known.has(entry.id));

    expect(unknown).toEqual([]);
  });

  it("table — a non-core command — always names a parent that is core", () => {
    const parents = COMMAND_TIERS.filter((entry) => entry.tier !== "core").map((entry) => entry.parent);

    const cores = new Set(COMMAND_TIERS.filter((entry) => entry.tier === "core").map((entry) => entry.id));

    expect(parents.every((parent) => parent !== null && cores.has(parent))).toBe(true);
  });

  it("table — a core command — never hangs off another command", () => {
    const cores = COMMAND_TIERS.filter((entry) => entry.tier === "core");

    const parented = cores.filter((entry) => entry.parent !== null);

    expect(parented).toEqual([]);
  });

  it("table — a child — sits in the same ribbon group as its parent", () => {
    const strays = COMMAND_TIERS.filter((entry) => {
      if (entry.parent === null) return false;
      return commandById(entry.parent)?.group !== entry.group;
    });

    expect(strays).toEqual([]);
  });

  it("table — a command with no registry action — is either a dropdown root or a runtime submenu", () => {
    const actionless = COMMAND_TIERS.filter((entry) => entry.command === null);

    const explained = actionless.filter((entry) => entry.tier === "core" || entry.submenu === true);

    expect(explained.length).toBe(actionless.length);
  });
});

describe("the core tier", () => {
  it("core tier — the new-user minimum — is open, save, import, view and the three panels", () => {
    const labels = coreTier().map((entry) => entry.label);

    expect(labels).toEqual(["Notebook", "Maths", "Code", "Open", "Save", "Import", "View"]);
  });

  it("core tier — the three panels — use R225's full words, never Graph, Properties or Cells", () => {
    const panels = coreCommands("panels").map((entry) => entry.label);

    expect(panels).toEqual(["Notebook", "Maths", "Code"]);
  });

  it("core tier — every group — contributes at least one big button", () => {
    const empty = RIBBON_GROUP_ORDER.filter((group) => coreCommands(group).length === 0);

    expect(empty).toEqual([]);
  });

  it("core tier — the View button — has no action of its own, only a menu", () => {
    const view = commandById(COMMAND_IDS.viewMenu);

    expect(view?.command).toBeNull();
    expect(hasChildren(COMMAND_IDS.viewMenu)).toBe(true);
  });
});

describe("the dropdowns", () => {
  it("dropdown — Open — carries New workbook", () => {
    const occasional = childrenOf(COMMAND_IDS.workbookOpen, "occasional").map((entry) => entry.id);

    expect(occasional).toEqual([COMMAND_IDS.workbookNew]);
  });

  it("dropdown — Save — carries Export report", () => {
    const occasional = childrenOf(COMMAND_IDS.workbookSave, "occasional").map((entry) => entry.id);

    expect(occasional).toEqual([COMMAND_IDS.workbookExportReport]);
  });

  it("dropdown — Import — carries Rescan and Rebuild, with Import folder nested below", () => {
    const occasional = childrenOf(COMMAND_IDS.libraryImportFiles, "occasional").map((entry) => entry.id);
    const rare = childrenOf(COMMAND_IDS.libraryImportFiles, "rare").map((entry) => entry.id);

    expect(occasional).toEqual([COMMAND_IDS.libraryRescan, COMMAND_IDS.libraryRebuild]);
    expect(rare).toEqual([COMMAND_IDS.libraryImportFolder]);
  });

  it("dropdown — View — carries the axis choice and pointer mode, with the toggles nested below", () => {
    const occasional = childrenOf(COMMAND_IDS.viewMenu, "occasional").map((entry) => entry.id);
    const rare = childrenOf(COMMAND_IDS.viewMenu, "rare");

    expect(occasional).toEqual([COMMAND_IDS.viewXAxisTime, COMMAND_IDS.viewXAxisDistance, COMMAND_IDS.viewPointerMode]);
    expect(rare.length).toBeGreaterThan(0);
  });

  it("dropdown — a core button with children — is a split button, one without is not", () => {
    expect(hasChildren(COMMAND_IDS.workbookOpen)).toBe(true);
    expect(hasChildren(COMMAND_IDS.viewToggleCells)).toBe(false);
  });
});

describe("one table, three renderers", () => {
  it("menu bar — a notebook command it names — takes its label from the tier table, never its own", () => {
    const items = MENUS.flatMap((menu) => menu.items).filter((item) => item.kind === "command");

    const drifted = items.filter((item) => {
      const entry = commandById(item.id);
      return entry !== undefined && entry.label !== item.label;
    });

    expect(drifted).toEqual([]);
  });

  it("menu bar — a notebook command it names — takes its shortcut from the tier table too", () => {
    const items = MENUS.flatMap((menu) => menu.items).filter((item) => item.kind === "command");

    const drifted = items.filter((item) => {
      const entry = commandById(item.id);
      if (entry === undefined) return false;
      return JSON.stringify(entry.shortcut) !== JSON.stringify(item.shortcut);
    });

    expect(drifted).toEqual([]);
  });

  it("menu bar — the three panel toggles — are all reachable, not just two of them", () => {
    const ids = MENUS.flatMap((menu) => menu.items).map((item) => (item.kind === "command" ? item.id : ""));

    expect(ids).toContain(COMMAND_IDS.viewToggleCells);
    expect(ids).toContain(COMMAND_IDS.viewToggleGraph);
    expect(ids).toContain(COMMAND_IDS.viewToggleProperties);
  });
});
