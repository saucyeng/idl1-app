import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { ShellCommand } from "./commands";

/** Props for {@link CommandPalette}. */
export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: ShellCommand[];
}

/**
 * The `Ctrl/⌘-K` command palette scaffold (UI-DIRECTION decision 14): a
 * `cmdk` dialog (shadcn's `Command`/`CommandDialog`) grouped by
 * `ShellCommand.group`, running the chosen command and closing itself.
 * `commands` is a plain array the caller assembles (`commands.ts`'s
 * `tabSwitchCommands` today; a later lane's own commands are concatenated
 * in by the caller, not by editing this file).
 */
export default function CommandPalette({ open, onOpenChange, commands }: CommandPaletteProps) {
  const groups = new Map<string, ShellCommand[]>();
  for (const command of commands) {
    const group = groups.get(command.group) ?? [];
    group.push(command);
    groups.set(command.group, group);
  }

  function runAndClose(command: ShellCommand): void {
    onOpenChange(false);
    command.run();
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Search for a command">
      <CommandInput placeholder="Type a command…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {[...groups.entries()].map(([group, groupCommands]) => (
          <CommandGroup key={group} heading={group}>
            {groupCommands.map((command) => (
              <CommandItem key={command.id} onSelect={() => runAndClose(command)}>
                {command.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
