import { cn } from "@/lib/utils";
import MenuBar from "./MenuBar";
import WindowControls from "./WindowControls";
import { usesCustomTitleBar } from "./windowChrome";

/** Props for {@link TitleBar}. */
export interface TitleBarProps {
  /** True on narrow layouts (R220 item 3): the five menu titles collapse
   *  into one "⋯" button and there is no room for anything else. */
  collapsed?: boolean;
}

/**
 * The window's title bar (ruling R216 item 1, extended by R220 item 1): the
 * app glyph, the menu bar, the drag region, and the window controls, 32 px
 * tall on every platform.
 *
 * This replaces the old `TopBar`, whose four jobs all moved on: the
 * destination tabs became the activity bar, the selection chips and the
 * device dot went to the status bar, and the palette trigger became
 * `View ▸ Command palette` with the same `Ctrl/⌘-K` it always had. What is
 * left is what a title bar is for — the window's identity, its menus, and
 * its controls.
 *
 * `data-tauri-drag-region` sits on the glyph and the spacer only, never on
 * the header itself, so a press that lands on a menu title or a window
 * control is a click on that control and not a drag. The attribute is
 * present or absent, never `"false"` — Tauri tests for presence.
 */
export default function TitleBar({ collapsed = false }: TitleBarProps) {
  const customTitleBar = typeof navigator !== "undefined" && usesCustomTitleBar(navigator.userAgent);
  const dragRegion = customTitleBar ? "" : undefined;

  return (
    /* `shell-chrome` is the whole stacking story now (ruling R221.1): one
       class, one z-index, shared by every chrome region. It replaces the
       `relative z-10` this bar carried since R209 — the patch that started
       the one-element-at-a-time habit R221.1 ends. */
    <header
      className={cn(
        "shell-chrome flex h-[var(--shell-title-bar-h)] shrink-0 items-center border-b border-rule bg-surface pl-3 text-body-small",
        customTitleBar ? "pr-0" : "pr-3",
      )}
    >
      <span
        data-tauri-drag-region={dragRegion}
        className="mr-2 font-mono text-title-2 font-semibold tracking-[var(--tracking-kicker)] text-fg"
      >
        idl1
      </span>

      <MenuBar collapsed={collapsed} />

      <div data-tauri-drag-region={dragRegion} className="h-full flex-1" />

      {customTitleBar && <WindowControls className="-mr-px ml-1" />}
    </header>
  );
}
