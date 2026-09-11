import { COMMAND_TIERS, type CommandTier } from "./commandTiers";
import { ROUTES, type RouteId } from "../routes/types";

/**
 * One entry in the command palette (`CommandPalette.tsx`). A later lane
 * registers more commands by building its own `ShellCommand[]` and
 * concatenating it with this module's list at the call site — nothing here
 * needs editing (UI-4 brief "The shell itself": "type it so a lane can
 * register commands without editing this file").
 */
export interface ShellCommand {
  /** Stable, unique across every command source. */
  id: string;
  /** Shown in the palette list. */
  label: string;
  /** `cmdk`'s `CommandGroup` heading this command sits under. */
  group: string;
  /** Invoked when the command is chosen; the palette closes itself. */
  run: () => void;
}

/**
 * The four tab-switch commands (UI-4 brief "The shell itself": "populated
 * with the four tab-switch commands and nothing else"), one per
 * `routes/types.ts`'s `ROUTES`, in that order.
 */
export function tabSwitchCommands(onNavigate: (route: RouteId) => void): ShellCommand[] {
  return ROUTES.map((route) => ({
    id: `nav:${route.id}`,
    label: `Go to ${route.label}`,
    group: "Navigate",
    run: () => onNavigate(route.id),
  }));
}

/**
 * Every notebook command as a palette entry, from the one tier table
 * (ruling R225 item 1: "the ribbon, the menu bar and the palette all render
 * from this table").
 *
 * Grouped by tier rather than by ribbon group, because that is the question
 * a palette answers: someone who knows the command reaches for it by name,
 * and someone who does not is scanning for what the app can do at all. A
 * dropdown root with no action of its own (the View button) is not an entry
 * — there is nothing to run — and neither is a command nothing has
 * registered, which in the palette means it is absent rather than listed and
 * inert, the one place where R220's "disabled, never hidden" would put a row
 * in a filtered list that cannot be chosen.
 *
 * @param available The registered command ids (`commandRegistry.ts`'s `useRegisteredCommands`).
 * @param run Invokes one command id; normally `commandRegistry.ts`'s `runCommand`.
 */
export function tieredPaletteCommands(available: ReadonlySet<string>, run: (id: string) => void): ShellCommand[] {
  const groups: Record<CommandTier, string> = {
    core: "Notebook",
    occasional: "Notebook — more",
    rare: "Notebook — maintenance",
  };

  return COMMAND_TIERS.filter((entry) => entry.command !== null && available.has(entry.command)).map((entry) => ({
    id: entry.id,
    label: entry.label,
    group: groups[entry.tier],
    run: () => run(entry.command as string),
  }));
}
