import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { runCommand, useRegisteredCommands } from "./commandRegistry";
import { resolveMenus, usesCommandGlyph } from "./menuModel";

/**
 * The title bar's menu bar (ruling R220 item 1): File, Edit, View, Go,
 * Help, each a dropdown of commands that exist today, each with its
 * shortcut label.
 *
 * The tree, the shortcut labels and the enabled/disabled decision all come
 * from the pure `shell/menuModel.ts` resolved against
 * `shell/commandRegistry.ts`; this component owns the pixels, the open
 * state and the click, and nothing else (CLAUDE.md §2, and the same split
 * `ImportStatusChip.tsx` already makes against `importStatus.ts`).
 *
 * One behaviour is copied from VS Code deliberately rather than taken from
 * Radix's defaults: once any menu is open, moving the pointer across a
 * neighbouring title lets go of the first and opens that one, with no click.
 * A menu bar where each title needs its own click is the single clearest
 * tell that a bar is not a real one.
 */
export default function MenuBar({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const available = useRegisteredCommands();
  const commandGlyph = typeof navigator !== "undefined" && usesCommandGlyph(navigator.userAgent);
  const menus = resolveMenus(available, commandGlyph);

  // Narrow layouts (R220 item 3): five titles do not fit beside the window
  // controls on a phone, so the whole bar becomes one "⋯" button and each
  // menu keeps its identity as a labelled section inside it. Same tree,
  // same resolution, same handlers — only the disclosure changes.
  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Menu"
          className={cn(
            "h-[var(--shell-title-bar-h)] px-2 text-body-small text-fg-dim outline-none hover:text-fg",
            className,
          )}
        >
          ⋯
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={0} className="min-w-56">
          {menus.map((menu, menuIndex) => (
            <DropdownMenuGroup key={menu.id}>
              {menuIndex > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{menu.label}</DropdownMenuLabel>
              {menu.items.map((item) =>
                item.kind === "separator" ? null : (
                  <DropdownMenuItem
                    key={item.id}
                    disabled={!item.enabled}
                    onSelect={() => {
                      runCommand(item.id);
                    }}
                  >
                    {item.label}
                    {item.shortcutLabel !== null && <DropdownMenuShortcut>{item.shortcutLabel}</DropdownMenuShortcut>}
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className={cn("flex items-center", className)} role="menubar" aria-label="Application">
      {menus.map((menu) => (
        <DropdownMenu
          key={menu.id}
          open={openMenuId === menu.id}
          onOpenChange={(open) => setOpenMenuId(open ? menu.id : null)}
        >
          <DropdownMenuTrigger
            className={cn(
              "h-[var(--shell-title-bar-h)] px-2 text-body-small text-fg-dim outline-none",
              "hover:text-fg focus-visible:text-fg",
              openMenuId === menu.id && "bg-surface-2 text-fg",
            )}
            // The cross-title hover hand-off. Guarded on "some menu is
            // already open", so a pointer merely crossing the title bar on
            // its way to the window controls never opens anything.
            onPointerEnter={() => setOpenMenuId((current) => (current === null ? current : menu.id))}
          >
            {menu.label}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={0} className="min-w-56">
            {menu.items.map((item) =>
              item.kind === "separator" ? (
                <DropdownMenuSeparator key={item.id} />
              ) : (
                <DropdownMenuItem
                  key={item.id}
                  disabled={!item.enabled}
                  onSelect={() => {
                    runCommand(item.id);
                  }}
                >
                  {item.label}
                  {item.shortcutLabel !== null && <DropdownMenuShortcut>{item.shortcutLabel}</DropdownMenuShortcut>}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </div>
  );
}
