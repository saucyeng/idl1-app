import { describe, expect, it } from "vitest";

import {
  commandForEvent,
  formatShortcut,
  MENU_COMMAND_IDS,
  MENUS,
  resolveMenus,
  usesCommandGlyph,
} from "./menuModel";

/** Every command id the tree names, for the "all ids are known" checks. */
const ALL_IDS = new Set<string>(Object.values(MENU_COMMAND_IDS));

function keyEvent(key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}) {
  return {
    key,
    ctrlKey: mods.ctrl === true,
    metaKey: mods.meta === true,
    shiftKey: mods.shift === true,
    altKey: mods.alt === true,
  };
}

describe("MENUS", () => {
  it("menu bar — every command entry — names an id from MENU_COMMAND_IDS", () => {
    const ids = MENUS.flatMap((menu) => menu.items.filter((item) => item.kind === "command").map((item) => item.id));

    const unknown = ids.filter((id) => !ALL_IDS.has(id));

    expect(unknown).toEqual([]);
  });

  it("menu bar — the five top-level menus — are File, Edit, View, Go, Help in that order", () => {
    const labels = MENUS.map((menu) => menu.label);

    expect(labels).toEqual(["File", "Edit", "View", "Go", "Help"]);
  });

  it("menu bar — command ids — are never repeated across menus", () => {
    const ids = MENUS.flatMap((menu) => menu.items.filter((item) => item.kind === "command").map((item) => item.id));

    const unique = new Set(ids);

    expect(unique.size).toBe(ids.length);
  });

  it("menu bar — every shortcut — is unique across the whole tree", () => {
    const printed = MENUS.flatMap((menu) =>
      menu.items
        .filter((item) => item.kind === "command" && item.shortcut !== null)
        .map((item) => formatShortcut(item.kind === "command" ? item.shortcut : null, false))
    );

    const unique = new Set(printed);

    expect(unique.size).toBe(printed.length);
  });

  it("menu bar — no menu — ends on a separator", () => {
    const trailing = MENUS.filter((menu) => menu.items[menu.items.length - 1]?.kind === "separator").map((m) => m.id);

    expect(trailing).toEqual([]);
  });
});

describe("formatShortcut", () => {
  it("shortcut — a modified letter on Windows — prints Ctrl+Shift+L", () => {
    const label = formatShortcut({ key: "l", mod: true, shift: true }, false);

    expect(label).toBe("Ctrl+Shift+L");
  });

  it("shortcut — the same binding on macOS — prints the glyph run with no separators", () => {
    const label = formatShortcut({ key: "l", mod: true, shift: true }, true);

    expect(label).toBe("⌘⇧L");
  });

  it("shortcut — a command with no binding — prints nothing", () => {
    const label = formatShortcut(null, false);

    expect(label).toBeNull();
  });

  it("shortcut — a digit key — is printed as written", () => {
    const label = formatShortcut({ key: "1", mod: true }, false);

    expect(label).toBe("Ctrl+1");
  });
});

describe("usesCommandGlyph", () => {
  it("platform — a macOS user agent — uses the command glyph", () => {
    const mac = usesCommandGlyph("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");

    expect(mac).toBe(true);
  });

  it("platform — a Windows user agent — spells the modifiers out", () => {
    const windows = usesCommandGlyph("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

    expect(windows).toBe(false);
  });
});

describe("resolveMenus", () => {
  it("resolution — a registered command — is enabled", () => {
    const menus = resolveMenus(new Set([MENU_COMMAND_IDS.workbookSave]), false);

    const save = menus
      .flatMap((menu) => menu.items)
      .find((item) => item.kind === "command" && item.id === MENU_COMMAND_IDS.workbookSave);

    expect(save).toMatchObject({ enabled: true, shortcutLabel: "Ctrl+S" });
  });

  it("resolution — a command with no handler — is disabled rather than absent", () => {
    const menus = resolveMenus(new Set(), false);

    const items = menus.flatMap((menu) => menu.items).filter((item) => item.kind === "command");

    expect(items.every((item) => item.kind === "command" && item.enabled === false)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  it("resolution — separators — survive untouched", () => {
    const menus = resolveMenus(new Set(), false);

    const file = menus.find((menu) => menu.id === "file");

    expect(file?.items.some((item) => item.kind === "separator")).toBe(true);
  });
});

describe("commandForEvent", () => {
  it("shortcut — Ctrl+S — resolves to the save command", () => {
    const id = commandForEvent(keyEvent("s", { ctrl: true }));

    expect(id).toBe(MENU_COMMAND_IDS.workbookSave);
  });

  it("shortcut — the command key on macOS — resolves the same binding", () => {
    const id = commandForEvent(keyEvent("s", { meta: true }));

    expect(id).toBe(MENU_COMMAND_IDS.workbookSave);
  });

  it("shortcut — Ctrl+Shift+I — never resolves to Ctrl+I's command", () => {
    const id = commandForEvent(keyEvent("i", { ctrl: true, shift: true }));

    expect(id).toBe(MENU_COMMAND_IDS.libraryImportFolder);
  });

  it("shortcut — a bare letter — resolves to nothing, so typing is never a command", () => {
    const id = commandForEvent(keyEvent("s"));

    expect(id).toBeNull();
  });

  it("shortcut — an upper-case key from a shifted press — still matches its binding", () => {
    const id = commandForEvent(keyEvent("L", { ctrl: true, shift: true }));

    expect(id).toBe(MENU_COMMAND_IDS.viewCyclePreset);
  });
});
