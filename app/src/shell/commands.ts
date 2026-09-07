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
