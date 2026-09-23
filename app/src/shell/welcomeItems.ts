/**
 * What the Welcome panel offers (ruling R244), as a value.
 *
 * R244's hard rule is that **every button runs an existing command id from
 * the one command registry**: no new command surface, and no logic in the
 * panel. This module is where that rule is enforceable — it builds the
 * sections and their items from `commandTiers.ts`'s id table and from the
 * registry's own view of what is registered *right now*, and
 * `WelcomePanel.tsx` does nothing but render what comes back.
 *
 * An item whose command has no handler registered is kept and marked
 * {@link WelcomeItem.enabled} `false` rather than dropped, which is R220
 * item 1's own convention: a capability that exists but cannot run right
 * now says so, instead of the panel's shape changing under the user.
 *
 * Pure and dependency-free (`layoutPresets.ts`'s pattern): no `react`
 * import, no DOM, no storage. The caller passes the registry snapshot, the
 * recent list and the data root in; nothing is read from the world here.
 *
 * ## The four items R244 named that the dockview lane left out
 *
 * "Open library folder", "Workbook reference", "CLI reference" and
 * "Release notes" had no command id when the dockview lane shipped (see the
 * dockview lane's completion report) — this lane (Welcome-commands, R249)
 * adds the four: `library.revealFolder` (`AppShell.tsx`, the opener plugin's
 * `revealItemInDir`), `help.workbookReference`/`help.cliReference`
 * (`AppShell.tsx`, `docsPanelStore.ts`'s two documents) and
 * `help.releaseNotes` (`AppShell.tsx`, `openUpdatePanel` alone — no check).
 * "Ask an agent" is still not in this table: it is an existing *component*
 * (`AskAnAgentButton.tsx`) with its own IPC and busy state, and the panel
 * embeds that component directly.
 */

import { COMMAND_IDS, type CommandId } from "./commandTiers";
import type { RecentWorkbook } from "./recentWorkbooks";

/** The sections R244 names, in the order the panel stacks them. */
export type WelcomeSectionId = "start" | "recent" | "panels" | "learn";

/** One clickable row. */
export interface WelcomeItem {
  /** Unique within the panel; also the React key. */
  id: string;
  /** The words on the row. */
  label: string;
  /** One line under the label saying what it does, or `null` for a row
   *  whose label is the whole story. */
  detail: string | null;
  /** A `lucide-react` icon name, resolved to a component by the panel —
   *  kept a string here so this module stays free of `react`, exactly as
   *  `commandTiers.ts` keeps its own icons. */
  icon: string;
  /** The `commandRegistry.ts` id this row runs. Typed as {@link CommandId}
   *  rather than `string` so R244's "an id that already exists" is a
   *  compile error to break, not only a test failure. */
  command: CommandId;
  /** Passed through `runCommand(command, arg)` — `workbook.openPath`'s one
   *  use, a Recent row's catalog id. `undefined` for every other row,
   *  which every other handler ignores. */
  arg?: string;
  /** False when nothing has registered {@link command} right now; the row
   *  renders disabled with its reason as a tooltip. */
  enabled: boolean;
}

/** One section and its rows. A section with no rows is not returned at
 *  all — an empty heading says nothing the user can act on. */
export interface WelcomeSection {
  id: WelcomeSectionId;
  /** The heading above the rows. */
  label: string;
  items: WelcomeItem[];
}

/** Everything the panel renders. */
export interface WelcomeContent {
  sections: WelcomeSection[];
  /** The `<data>` root in use, or `null` before `DataRootGate` has
   *  resolved it. R244 asks for the path; the session count is deliberately
   *  absent — it lives in the Data page's own state and reaching it from
   *  the shell would mean either a new IPC call or a new cross-page store,
   *  and R244 scopes both out ("if already available"). */
  dataRootPath: string | null;
}

/** The rows of the Start section, before the registry is consulted.
 *  `library.importFiles` is R244's "Import sessions" — the id the Data
 *  tab's own Import button already registers. */
const START_ITEMS: readonly Omit<WelcomeItem, "enabled">[] = [
  {
    id: "start.new",
    label: "New workbook",
    detail: "Start an empty notebook in the library.",
    icon: "FilePlus2",
    command: COMMAND_IDS.workbookNew,
  },
  {
    id: "start.open",
    label: "Open workbook",
    detail: "Pick one of the library's existing notebooks.",
    icon: "FolderOpen",
    command: COMMAND_IDS.workbookOpen,
  },
  {
    id: "start.importFiles",
    label: "Import sessions",
    detail: "Bring `.idl0` files into the library.",
    icon: "FileDown",
    command: COMMAND_IDS.libraryImportFiles,
  },
  {
    id: "start.importFolder",
    label: "Import a folder",
    detail: "Scan a folder and import everything in it.",
    icon: "FolderDown",
    command: COMMAND_IDS.libraryImportFolder,
  },
  {
    id: "start.revealFolder",
    label: "Open library folder",
    detail: "Reveal the data root in the file manager.",
    icon: "FolderSearch2",
    command: COMMAND_IDS.libraryRevealFolder,
  },
];

/** The rows of the Panels section: R244's "reopen Notebook, Maths, Code",
 *  which are the same three toggle commands the ribbon's panel buttons and
 *  the View menu run. Labels are R225 item 2's full words, taken from the
 *  same place the ribbon takes them so a panel cannot be called two
 *  things. */
const PANEL_ITEMS: readonly Omit<WelcomeItem, "enabled">[] = [
  {
    id: "panels.cells",
    label: "Notebook",
    detail: "The cells and their output.",
    icon: "Rows3",
    command: COMMAND_IDS.viewToggleCells,
  },
  {
    id: "panels.graph",
    label: "Maths",
    detail: "The workbook's maths graph.",
    icon: "Workflow",
    command: COMMAND_IDS.viewToggleGraph,
  },
  {
    id: "panels.properties",
    label: "Code",
    detail: "The selected cell's properties and code.",
    icon: "Code2",
    command: COMMAND_IDS.viewToggleProperties,
  },
];

/** The rows of the Learn section: R244's "Workbook reference, CLI
 *  reference, Ask an agent, Release notes", in that order, plus the two
 *  that were already here. "Ask an agent" is the embedded component the
 *  caller renders after this section (see the module doc), not a row. */
const LEARN_ITEMS: readonly Omit<WelcomeItem, "enabled">[] = [
  {
    id: "learn.workbookReference",
    label: "Workbook reference",
    detail: "Every math builtin, annotation and host variable.",
    icon: "BookOpen",
    command: COMMAND_IDS.helpWorkbookReference,
  },
  {
    id: "learn.cliReference",
    label: "CLI reference",
    detail: "The idl-rs command-line grammar.",
    icon: "Terminal",
    command: COMMAND_IDS.helpCliReference,
  },
  {
    id: "learn.releaseNotes",
    label: "Release notes",
    detail: "What changed in this build.",
    icon: "FileText",
    command: COMMAND_IDS.helpReleaseNotes,
  },
  {
    id: "learn.updates",
    label: "Check for updates",
    detail: "See what is new, and install it.",
    icon: "Download",
    command: COMMAND_IDS.helpCheckForUpdates,
  },
  {
    id: "learn.about",
    label: "About idl1",
    detail: "Version, engine build and licences.",
    icon: "Info",
    command: COMMAND_IDS.helpAbout,
  },
];

/** `items` with each row's {@link WelcomeItem.enabled} decided by whether
 *  its command has a handler right now. */
function withAvailability(items: readonly Omit<WelcomeItem, "enabled">[], registered: ReadonlySet<string>): WelcomeItem[] {
  return items.map((item) => ({ ...item, enabled: registered.has(item.command) }));
}

/**
 * One row per recent workbook, newest first.
 *
 * Each runs `workbook.openPath` with the entry's catalog id (ruling
 * R244/R249) — the id argument the registry now carries through
 * `runCommand`, rather than `workbook.open`'s bare picker dialog a Recent
 * row would otherwise have to reopen and then click through. The row's
 * detail carries the file name so the user can tell two same-named
 * workbooks apart, and a workbook whose file is missing renders disabled
 * with a reason rather than vanishing (R244: "missing files greyed").
 *
 * @param entries The stored list, newest first (`recentWorkbooks.ts`).
 * @param missingIds Ids whose file is known to be gone. Callers that have
 *   not checked pass an empty set, and every row is enabled.
 * @param registered The command registry's current ids.
 */
export function recentWorkbookItems(
  entries: readonly RecentWorkbook[],
  missingIds: ReadonlySet<string>,
  registered: ReadonlySet<string>
): WelcomeItem[] {
  const openAvailable = registered.has(COMMAND_IDS.workbookOpenPath);
  return entries.map((entry) => ({
    id: `recent.${entry.id}`,
    label: entry.name,
    detail: missingIds.has(entry.id) ? `Missing — ${entry.fileName}` : entry.fileName,
    icon: "NotebookPen",
    command: COMMAND_IDS.workbookOpenPath,
    arg: entry.id,
    enabled: openAvailable && !missingIds.has(entry.id),
  }));
}

/** What {@link welcomeContent} needs from the world. */
export interface WelcomeInputs {
  /** `commandRegistry.ts`'s current ids. */
  registered: ReadonlySet<string>;
  /** This machine's recent list, newest first. */
  recent: readonly RecentWorkbook[];
  /** Recent ids whose file is known to be gone. */
  missingIds: ReadonlySet<string>;
  /** The resolved `<data>` root, or `null` if not known yet. */
  dataRootPath: string | null;
}

/**
 * The whole panel's content.
 *
 * Sections come back in R244's own order — Start, Recent workbooks,
 * Panels, Learn — and a section with no rows is omitted, so a machine that
 * has never opened a workbook simply has no Recent heading rather than an
 * empty one.
 */
export function welcomeContent(inputs: WelcomeInputs): WelcomeContent {
  const sections: WelcomeSection[] = [
    { id: "start", label: "Start", items: withAvailability(START_ITEMS, inputs.registered) },
    { id: "recent", label: "Recent workbooks", items: recentWorkbookItems(inputs.recent, inputs.missingIds, inputs.registered) },
    { id: "panels", label: "Panels", items: withAvailability(PANEL_ITEMS, inputs.registered) },
    { id: "learn", label: "Learn", items: withAvailability(LEARN_ITEMS, inputs.registered) },
  ];
  return { sections: sections.filter((section) => section.items.length > 0), dataRootPath: inputs.dataRootPath };
}
