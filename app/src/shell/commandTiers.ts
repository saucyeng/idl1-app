/**
 * The one command-tier table (ruling R225 item 1). Isaac, 2026-09-11: "the
 * save, export, new, create, rescan, mouse, time/distance buttons all
 * overlap; a CAD-style deal where they can be both big buttons and
 * dropdowns that extend to other big buttons, small buttons and nested
 * dropdowns; think through the tiers: what gets used all the time,
 * occasionally, and the bare minimum that won't overwhelm a new user".
 *
 * Every notebook command is declared here exactly once, with the tier that
 * decides where it appears:
 *
 * - **core** — a big labelled button, always on the ribbon. This is also
 *   the new-user minimum (R225 item 4): open a document, save it, import
 *   data, see which windows are selected, show or hide the three panels.
 * - **occasional** — one level down, inside the dropdown half of the core
 *   button it hangs off ({@link TieredCommand.parent}). Promoted to
 *   visible small buttons by the "Show occasional commands as buttons"
 *   preference (`shell/ribbonPrefs.ts`).
 * - **rare** — maintenance, diagnostics and dev toggles, nested one level
 *   further inside the same dropdown.
 *
 * The ribbon (`Notebook/components/NotebookToolbar.tsx`), the menu bar
 * (`shell/menuModel.ts`, R220) and the command palette (`shell/commands.ts`)
 * all render from this table, so a command's label, icon and shortcut are
 * written once and cannot drift between the three places it appears.
 *
 * Pure and dependency-free (`toolbarLayout.ts`'s pattern): no `react`, no
 * DOM, no store import. Whether a command can run *right now* is not a
 * property of the table — it is whether `shell/commandRegistry.ts` holds a
 * handler for the id, which is R220 item 1's rule: a command with no
 * registration renders disabled rather than absent, so "this does not exist
 * yet" is said out loud instead of by a control that silently does nothing.
 */

/** A keyboard binding, as a menu or a ribbon tooltip prints it. `key` is a
 *  `KeyboardEvent.key` value, lower-cased for letters — the same form
 *  `AppShell.tsx`'s own handlers compare against. */
export interface Shortcut {
  key: string;
  /** Ctrl on Windows/Linux, ⌘ on macOS — the app's one accelerator
   *  modifier, matching the existing `e.metaKey || e.ctrlKey` tests. */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/**
 * Every command id this table names, as one namespace. Values rather than a
 * bare `string`, so a typo in a ribbon button, a menu entry or a
 * registration is a compile error instead of a permanently greyed-out
 * control.
 *
 * `view.menu` is the one entry that is not a registry id: it is the View
 * dropdown's own root, a container with nothing to run
 * ({@link TieredCommand.command} is `null` for it).
 */
export const COMMAND_IDS = {
  workbookNew: "workbook.new",
  workbookOpen: "workbook.open",
  workbookSave: "workbook.save",
  workbookExportReport: "workbook.exportReport",
  libraryImportFiles: "library.importFiles",
  libraryImportFolder: "library.importFolder",
  libraryRescan: "library.rescan",
  libraryRebuild: "library.rebuild",
  editUndo: "edit.undo",
  editRedo: "edit.redo",
  viewMenu: "view.menu",
  viewToggleSidebar: "view.toggleSidebar",
  viewToggleGraph: "view.toggleGraph",
  viewToggleProperties: "view.toggleProperties",
  viewToggleCells: "view.toggleCells",
  viewToggleDense: "view.toggleDense",
  viewCyclePreset: "view.cyclePreset",
  viewCommandPalette: "view.commandPalette",
  viewXAxisTime: "view.xAxisTime",
  viewXAxisDistance: "view.xAxisDistance",
  viewPointerMode: "view.pointerMode",
  goDevice: "go.device",
  goData: "go.data",
  goNotebook: "go.notebook",
  goSettings: "go.settings",
  helpAbout: "help.about",
  helpCheckForUpdates: "help.checkForUpdates",
  /** Ruling R244: opens the Welcome panel from the Help menu. The **one**
   *  id this ruling adds, and it had to be added — R244's "no new command
   *  surface" is about the panel's own buttons, every one of which runs an
   *  id that already existed, and it also asks for the panel to be
   *  "reachable from Help", which is a command by definition. */
  helpWelcome: "help.welcome",
} as const;

/** Every id in {@link COMMAND_IDS}. */
export type CommandId = (typeof COMMAND_IDS)[keyof typeof COMMAND_IDS];

/** How often a command is reached for, and therefore how prominent it is
 *  (R225 item 2). */
export type CommandTier = "core" | "occasional" | "rare";

/** The ribbon's four command groups, left to right. The window chip and the
 *  playback transport are not groups of commands and are not in this table;
 *  they are the ribbon's two non-collapsing regions
 *  (`shell/toolbarLayout.ts`). */
export type RibbonGroupId = "panels" | "file" | "library" | "view";

/** {@link RibbonGroupId}'s members in ribbon order. Panels sit leftmost,
 *  under the activity bar's own column, because "what am I looking at" is
 *  read before "what do I do to it". */
export const RIBBON_GROUP_ORDER: readonly RibbonGroupId[] = ["panels", "file", "library", "view"];

/** One command, in the single place it is declared. */
export interface TieredCommand {
  /** Unique within this table. Equal to {@link command} for everything but
   *  a dropdown root. */
  id: CommandId;
  /** Shown on the button and in the menus. Full words, sentence case,
   *  active voice — R225 item 2: "Graph/Properties/Cells deserve full
   *  words: Maths, Code, Notebook". */
  label: string;
  /** A `lucide-react` icon name. Resolved to a component by the ribbon
   *  (`Notebook/components/ribbonIcons.ts`); kept a string here so this
   *  module stays free of `react`. */
  icon: string;
  tier: CommandTier;
  group: RibbonGroupId;
  /** The core command whose dropdown this hangs inside, or `null` for a
   *  core command (which is itself a dropdown root). */
  parent: CommandId | null;
  /** The `shell/commandRegistry.ts` id this entry runs, or `null` when the
   *  entry only opens its own dropdown. */
  command: CommandId | null;
  /** `null` for a command with no keyboard binding. */
  shortcut: Shortcut | null;
  /** True when this entry opens a nested submenu whose items are not
   *  static — the pointer-mode presets, which come from
   *  `Notebook/interaction/inputMap.ts` at runtime. */
  submenu?: boolean;
  /** Why this entry is a toggle rather than a one-shot action: the ribbon
   *  renders it with a pressed state and the menus with a checkmark. */
  toggle?: boolean;
}

/**
 * Every notebook command, in ribbon order within each group.
 *
 * Two entries name work the app does not perform yet and therefore have no
 * registration: `library.rebuild` (the `start_rebuild_job` background
 * reimport, which no page registers as a command today) and the pointer-mode
 * submenu when no chart is mounted. Both render disabled, which is R220
 * item 1's own convention — the alternative, omitting them, would make the
 * dropdown's shape depend on state and hide that the capability exists.
 */
export const COMMAND_TIERS: readonly TieredCommand[] = [
  // --- panels: the three columns, in full words (R225 item 2) ---
  {
    id: COMMAND_IDS.viewToggleCells,
    label: "Notebook",
    icon: "Rows3",
    tier: "core",
    group: "panels",
    parent: null,
    command: COMMAND_IDS.viewToggleCells,
    shortcut: null,
    toggle: true,
  },
  {
    id: COMMAND_IDS.viewToggleGraph,
    label: "Maths",
    icon: "Workflow",
    tier: "core",
    group: "panels",
    parent: null,
    command: COMMAND_IDS.viewToggleGraph,
    shortcut: null,
    toggle: true,
  },
  {
    id: COMMAND_IDS.viewToggleProperties,
    label: "Code",
    icon: "Code2",
    tier: "core",
    group: "panels",
    parent: null,
    command: COMMAND_IDS.viewToggleProperties,
    shortcut: null,
    toggle: true,
  },

  // --- file: the document itself ---
  {
    id: COMMAND_IDS.workbookOpen,
    label: "Open",
    icon: "FolderOpen",
    tier: "core",
    group: "file",
    parent: null,
    command: COMMAND_IDS.workbookOpen,
    shortcut: { key: "o", mod: true },
  },
  {
    id: COMMAND_IDS.workbookNew,
    label: "New workbook",
    icon: "FilePlus2",
    tier: "occasional",
    group: "file",
    parent: COMMAND_IDS.workbookOpen,
    command: COMMAND_IDS.workbookNew,
    shortcut: { key: "n", mod: true },
  },
  {
    id: COMMAND_IDS.workbookSave,
    label: "Save",
    icon: "Save",
    tier: "core",
    group: "file",
    parent: null,
    command: COMMAND_IDS.workbookSave,
    shortcut: { key: "s", mod: true },
  },
  {
    id: COMMAND_IDS.workbookExportReport,
    label: "Export report",
    icon: "FileOutput",
    tier: "occasional",
    group: "file",
    parent: COMMAND_IDS.workbookSave,
    command: COMMAND_IDS.workbookExportReport,
    shortcut: { key: "e", mod: true, shift: true },
  },

  // --- library: getting data in ---
  {
    id: COMMAND_IDS.libraryImportFiles,
    label: "Import",
    icon: "Import",
    tier: "core",
    group: "library",
    parent: null,
    command: COMMAND_IDS.libraryImportFiles,
    shortcut: { key: "i", mod: true },
  },
  {
    id: COMMAND_IDS.libraryRescan,
    label: "Rescan library",
    icon: "RefreshCw",
    tier: "occasional",
    group: "library",
    parent: COMMAND_IDS.libraryImportFiles,
    command: COMMAND_IDS.libraryRescan,
    shortcut: null,
  },
  {
    id: COMMAND_IDS.libraryRebuild,
    label: "Rebuild catalog",
    icon: "DatabaseBackup",
    tier: "occasional",
    group: "library",
    parent: COMMAND_IDS.libraryImportFiles,
    command: COMMAND_IDS.libraryRebuild,
    shortcut: null,
  },
  {
    id: COMMAND_IDS.libraryImportFolder,
    label: "Import folder",
    icon: "FolderInput",
    tier: "rare",
    group: "library",
    parent: COMMAND_IDS.libraryImportFiles,
    command: COMMAND_IDS.libraryImportFolder,
    shortcut: { key: "i", mod: true, shift: true },
  },

  // --- view: how the notebook is drawn ---
  {
    id: COMMAND_IDS.viewMenu,
    label: "View",
    icon: "Eye",
    tier: "core",
    group: "view",
    parent: null,
    command: null,
    shortcut: null,
  },
  {
    id: COMMAND_IDS.viewXAxisTime,
    label: "Time axis",
    icon: "Clock",
    tier: "occasional",
    group: "view",
    parent: COMMAND_IDS.viewMenu,
    command: COMMAND_IDS.viewXAxisTime,
    shortcut: null,
    toggle: true,
  },
  {
    id: COMMAND_IDS.viewXAxisDistance,
    label: "Distance axis",
    icon: "Ruler",
    tier: "occasional",
    group: "view",
    parent: COMMAND_IDS.viewMenu,
    command: COMMAND_IDS.viewXAxisDistance,
    shortcut: null,
    toggle: true,
  },
  {
    id: COMMAND_IDS.viewPointerMode,
    label: "Pointer mode",
    icon: "MousePointer2",
    tier: "occasional",
    group: "view",
    parent: COMMAND_IDS.viewMenu,
    command: null,
    shortcut: null,
    submenu: true,
  },
  {
    id: COMMAND_IDS.viewToggleDense,
    label: "Dense output",
    icon: "AlignJustify",
    tier: "rare",
    group: "view",
    parent: COMMAND_IDS.viewMenu,
    command: COMMAND_IDS.viewToggleDense,
    shortcut: null,
    toggle: true,
  },
  {
    id: COMMAND_IDS.viewCyclePreset,
    label: "Next layout preset",
    icon: "LayoutGrid",
    tier: "rare",
    group: "view",
    parent: COMMAND_IDS.viewMenu,
    command: COMMAND_IDS.viewCyclePreset,
    shortcut: { key: "l", mod: true, shift: true },
  },
  {
    id: COMMAND_IDS.viewToggleSidebar,
    label: "Sidebar",
    icon: "PanelLeft",
    tier: "rare",
    group: "view",
    parent: COMMAND_IDS.viewMenu,
    command: COMMAND_IDS.viewToggleSidebar,
    shortcut: { key: "b", mod: true },
    toggle: true,
  },
  {
    id: COMMAND_IDS.viewCommandPalette,
    label: "Command palette",
    icon: "Terminal",
    tier: "rare",
    group: "view",
    parent: COMMAND_IDS.viewMenu,
    command: COMMAND_IDS.viewCommandPalette,
    shortcut: { key: "k", mod: true },
  },
];

/** The table indexed by id, built once. */
const BY_ID: ReadonlyMap<string, TieredCommand> = new Map(COMMAND_TIERS.map((entry) => [entry.id, entry]));

/** `id`'s entry, or `undefined` when the table does not name it. */
export function commandById(id: string): TieredCommand | undefined {
  return BY_ID.get(id);
}

/** The core commands of `group`, in table order — the ribbon's big labelled
 *  buttons for that group, and (across every group) R225 item 4's new-user
 *  minimum. */
export function coreCommands(group: RibbonGroupId): TieredCommand[] {
  return COMMAND_TIERS.filter((entry) => entry.group === group && entry.tier === "core");
}

/** Every core command, in ribbon group order — the exact set a first run
 *  shows as buttons (R225 item 4). */
export function coreTier(): TieredCommand[] {
  return RIBBON_GROUP_ORDER.flatMap((group) => coreCommands(group));
}

/** The entries hanging inside `parent`'s dropdown at `tier`, in table
 *  order. `"occasional"` is the dropdown's first block, `"rare"` the nested
 *  one below it (R225 item 2). */
export function childrenOf(parent: CommandId, tier: Exclude<CommandTier, "core">): TieredCommand[] {
  return COMMAND_TIERS.filter((entry) => entry.parent === parent && entry.tier === tier);
}

/** True when `parent` has anything behind its chevron at all — a core
 *  button with no children renders as a plain button, never as a split
 *  button with an empty menu. */
export function hasChildren(parent: CommandId): boolean {
  return COMMAND_TIERS.some((entry) => entry.parent === parent);
}
