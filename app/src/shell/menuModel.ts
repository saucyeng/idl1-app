/**
 * The title bar's menu tree (ruling R220 item 1): File, Edit, View, Go,
 * Help, each a dropdown of the commands that actually exist in the app
 * today, each with its shortcut label.
 *
 * Pure and dependency-free (`aspectClass.ts`'s pattern): no `react`, no
 * DOM, no store import. The tree here names *command ids* only; whether a
 * command can run right now is the caller's question, answered by handing
 * {@link resolveMenus} the set of ids currently registered in
 * `shell/commandRegistry.ts`. That is what enforces R220 item 1's "nothing
 * invents a command that does not exist": an id with no registered handler
 * renders disabled (VS Code's own behaviour for a command whose context is
 * not active), and a menu whose every item is disabled still renders,
 * because a menu that appeared and disappeared with the active tab would be
 * a moving target.
 *
 * **Amended by ruling R225 item 1.** Every notebook command's id, label and
 * shortcut now come from `shell/commandTiers.ts`, the one table the ribbon
 * renders from too, so the menu bar cannot print a label or a keystroke the
 * ribbon disagrees with. Only Edit, Go and Help — which are the editor's
 * undo history, the activity bar's destinations and the About dialog, none
 * of them notebook commands — are still declared here.
 */
import { COMMAND_IDS, commandById, type CommandId, type Shortcut } from "./commandTiers";

export type { Shortcut };

/** One command entry in a menu. */
export interface MenuCommandItem {
  kind: "command";
  /** The `shell/commandRegistry.ts` id this entry runs. */
  id: string;
  /** Shown in the dropdown. Sentence case, active voice — the label names
   *  what happens, not the subsystem it happens in. */
  label: string;
  /** `null` for a command with no keyboard binding. */
  shortcut: Shortcut | null;
}

/** A horizontal rule between two groups of items. */
export interface MenuSeparatorItem {
  kind: "separator";
  /** Unique within its menu, so React has a key without an index. */
  id: string;
}

/** One entry in a menu: a command or a separator. */
export type MenuItem = MenuCommandItem | MenuSeparatorItem;

/** One top-level menu in the menu bar. */
export interface Menu {
  id: string;
  label: string;
  items: readonly MenuItem[];
}

/** A {@link MenuCommandItem} with its runnable state resolved. */
export interface ResolvedMenuCommandItem extends MenuCommandItem {
  /** True when `shell/commandRegistry.ts` currently holds a handler for
   *  {@link MenuCommandItem.id}. */
  enabled: boolean;
  /** The shortcut as the menu prints it, e.g. `"Ctrl+S"`; `null` when the
   *  command has no binding. */
  shortcutLabel: string | null;
}

/** A resolved menu entry. */
export type ResolvedMenuItem = ResolvedMenuCommandItem | MenuSeparatorItem;

/** A menu with every entry resolved. */
export interface ResolvedMenu {
  id: string;
  label: string;
  items: readonly ResolvedMenuItem[];
}

/** The command ids the menu bar names. One namespace, shared with the
 *  ribbon: `shell/commandTiers.ts`'s {@link COMMAND_IDS}, re-exported under
 *  the name the shell and the Notebook page already import (R225 item 1 —
 *  one table, not two that must be kept in step). */
export const MENU_COMMAND_IDS = COMMAND_IDS;

/** Every id in {@link MENU_COMMAND_IDS}. */
export type MenuCommandId = CommandId;

function command(id: MenuCommandId, label: string, shortcut: Shortcut | null): MenuCommandItem {
  return { kind: "command", id, label, shortcut };
}

/** A menu entry for a command the tier table already describes: its label
 *  and its shortcut are read from there rather than written a second time
 *  (R225 item 1). Throws at module load if the id is not in the table,
 *  which is a build-time failure, never a silently mislabelled item. */
function tiered(id: MenuCommandId): MenuCommandItem {
  const entry = commandById(id);
  if (entry === undefined) throw new Error(`menuModel: ${id} is not in COMMAND_TIERS`);
  return { kind: "command", id, label: entry.label, shortcut: entry.shortcut };
}

function separator(id: string): MenuSeparatorItem {
  return { kind: "separator", id };
}

/**
 * The menu bar, left to right (R220 item 1). Every command here is one the
 * app already performs from some other control: File's five are the
 * Notebook toolbar's document and actions groups plus the Data tab's
 * import buttons, View's are the toolbar's view group plus the sidebar and
 * the palette, Go's four are the activity bar's own destinations, and
 * Edit's two are the code editor's own undo history. Nothing here is a
 * feature this menu introduces.
 *
 * `Ctrl+1..4` for Go matches R220 item 1's activity-bar keys; `Ctrl+B` for
 * the sidebar and `Ctrl+K` for the palette are the bindings the shell
 * already owns.
 */
export const MENUS: readonly Menu[] = [
  {
    id: "file",
    label: "File",
    items: [
      tiered(MENU_COMMAND_IDS.workbookNew),
      tiered(MENU_COMMAND_IDS.workbookOpen),
      separator("file-1"),
      tiered(MENU_COMMAND_IDS.libraryImportFiles),
      tiered(MENU_COMMAND_IDS.libraryImportFolder),
      tiered(MENU_COMMAND_IDS.libraryRescan),
      tiered(MENU_COMMAND_IDS.libraryRebuild),
      separator("file-2"),
      tiered(MENU_COMMAND_IDS.workbookSave),
      tiered(MENU_COMMAND_IDS.workbookExportReport),
    ],
  },
  {
    id: "edit",
    label: "Edit",
    items: [
      command(MENU_COMMAND_IDS.editUndo, "Undo", { key: "z", mod: true }),
      command(MENU_COMMAND_IDS.editRedo, "Redo", { key: "z", mod: true, shift: true }),
    ],
  },
  {
    id: "view",
    label: "View",
    items: [
      tiered(MENU_COMMAND_IDS.viewToggleSidebar),
      separator("view-1"),
      // The three notebook panels, under the words R225 item 2 gives them:
      // the cells column is "Notebook", the graph is "Maths", the
      // properties/code column is "Code".
      tiered(MENU_COMMAND_IDS.viewToggleCells),
      tiered(MENU_COMMAND_IDS.viewToggleGraph),
      tiered(MENU_COMMAND_IDS.viewToggleProperties),
      tiered(MENU_COMMAND_IDS.viewToggleDense),
      tiered(MENU_COMMAND_IDS.viewCyclePreset),
      separator("view-2"),
      tiered(MENU_COMMAND_IDS.viewCommandPalette),
    ],
  },
  {
    id: "go",
    label: "Go",
    items: [
      command(MENU_COMMAND_IDS.goDevice, "Device", { key: "1", mod: true }),
      command(MENU_COMMAND_IDS.goData, "Data", { key: "2", mod: true }),
      command(MENU_COMMAND_IDS.goNotebook, "Notebook", { key: "3", mod: true }),
      command(MENU_COMMAND_IDS.goSettings, "Settings", { key: "4", mod: true }),
    ],
  },
  {
    id: "help",
    label: "Help",
    items: [command(MENU_COMMAND_IDS.helpAbout, "About idl1", null)],
  },
];

/** Whether this machine prints ⌘ rather than Ctrl. Read from a user-agent
 *  string rather than the deprecated `navigator.platform`, the same source
 *  `windowChrome.ts` already reads for the title bar. */
export function usesCommandGlyph(userAgent: string): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(userAgent);
}

/** Prints one key as a menu prints it: a single letter or digit
 *  upper-cased, a named key left as written. */
function keyLabel(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key;
}

/**
 * `shortcut` as the menu prints it — `"Ctrl+Shift+L"` on Windows/Linux,
 * `"⌘⇧L"` on macOS, where the glyphs are the platform convention and carry
 * no separator.
 *
 * @param shortcut The binding, or `null` for a command with none.
 * @param commandGlyph True on macOS ({@link usesCommandGlyph}).
 */
export function formatShortcut(shortcut: Shortcut | null, commandGlyph: boolean): string | null {
  if (shortcut === null) return null;
  if (commandGlyph) {
    return `${shortcut.mod === true ? "⌘" : ""}${shortcut.shift === true ? "⇧" : ""}${shortcut.alt === true ? "⌥" : ""}${keyLabel(shortcut.key)}`;
  }
  const parts: string[] = [];
  if (shortcut.mod === true) parts.push("Ctrl");
  if (shortcut.shift === true) parts.push("Shift");
  if (shortcut.alt === true) parts.push("Alt");
  parts.push(keyLabel(shortcut.key));
  return parts.join("+");
}

/**
 * Resolves {@link MENUS} against the commands that currently have handlers.
 *
 * @param available The registered command ids (`shell/commandRegistry.ts`'s
 *  `useRegisteredCommands`).
 * @param commandGlyph True on macOS, for the shortcut labels.
 */
export function resolveMenus(available: ReadonlySet<string>, commandGlyph: boolean): ResolvedMenu[] {
  return MENUS.map((menu) => ({
    id: menu.id,
    label: menu.label,
    items: menu.items.map((item) =>
      item.kind === "separator"
        ? item
        : {
            ...item,
            enabled: available.has(item.id),
            shortcutLabel: formatShortcut(item.shortcut, commandGlyph),
          }
    ),
  }));
}

/**
 * The command id `event` is bound to in {@link MENUS}, or `null` when no
 * menu entry claims it. The shell's one keydown handler asks this instead
 * of carrying a second copy of the bindings, so a shortcut printed in a
 * menu and the shortcut that actually fires can never drift apart.
 *
 * Matching is exact on every modifier: `Ctrl+Shift+I` never fires
 * `Ctrl+I`'s command, which a "has the modifiers it needs" test would
 * allow.
 */
export function commandForEvent(
  event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }
): string | null {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  for (const menu of MENUS) {
    for (const item of menu.items) {
      if (item.kind !== "command" || item.shortcut === null) continue;
      const s = item.shortcut;
      if (s.key !== key) continue;
      if ((s.mod === true) !== mod) continue;
      if ((s.shift === true) !== event.shiftKey) continue;
      if ((s.alt === true) !== event.altKey) continue;
      return item.id;
    }
  }
  return null;
}
