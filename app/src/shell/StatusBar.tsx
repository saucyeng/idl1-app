import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { listSessions } from "../ipc/catalog";
import type { RouteId } from "../routes/types";
import type { Selection } from "../state/AppState";
import { sessionLabel, windowsKey } from "../state/selection";
import { useDeviceLink } from "./deviceLink";
import ImportStatusChip from "./ImportStatusChip";
import { LAYOUT_PRESETS, type ActivePreset } from "./layoutPresets";
import { memoryLabel, useMemoryUse } from "./memoryBudget";
import { collapsedChipLabel, selectionChips, shouldCollapseChips } from "./topBarSelection";

/** Props for {@link StatusBar}. */
export interface StatusBarProps {
  selection: Selection;
  /** The preset the current viewport shape is on — printed by name, so the
   *  bar says which of R213's arrangements is live. */
  activePreset: ActivePreset;
  /** Cycles to the next preset; the preset item is a button, like VS Code's
   *  own status-bar items. */
  onCyclePreset: () => void;
  onNavigate: (route: RouteId) => void;
}

/** How the device's link reads in the status bar. Words, not a bare dot:
 *  the bar has room for them and "Device: connected" needs no legend. */
const DEVICE_TEXT = {
  disconnected: "No device",
  connected: "Device connected",
  lost: "Device not answering",
} as const;

const DEVICE_TONE = {
  disconnected: "text-fg-faint",
  connected: "text-good",
  lost: "text-hivis",
} as const;

/** One status-bar item: a button when it does something, a plain span when
 *  it only reports. Both are the same height and padding, so the band reads
 *  as one row of items rather than a mix of controls and text. */
function StatusItem({
  children,
  onClick,
  title,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  const shared = cn("flex h-full items-center gap-1.5 px-2 font-mono text-label-2", className);
  if (onClick === undefined) {
    return (
      <span className={shared} title={title}>
        {children}
      </span>
    );
  }
  return (
    <button type="button" onClick={onClick} title={title} className={cn(shared, "hover:bg-surface-2")}>
      {children}
    </button>
  );
}

/**
 * The 22 px status bar along the bottom (ruling R220 item 1): the session
 * chip moved down from the toolbar, the device link, the background-job
 * chip moved down from the shell's own strip, the chart memory meter, and
 * the layout preset's name.
 *
 * Reading order is VS Code's, and the reason is the same: what you are
 * working *on* sits on the left, and what the machine is doing sits on the
 * right, so a job starting or finishing never shifts the thing you are
 * reading. Everything here is one line, ellipsised rather than wrapped —
 * the band's height is a layout constant the rest of the shell measures
 * against.
 *
 * Sync has no item. R220 item 1 names one, but there is no sync state in
 * the app to read (see `activityBadges.ts`'s note); an item that always
 * said the same thing would be furniture, not status.
 */
export default function StatusBar({ selection, activePreset, onCyclePreset, onNavigate }: StatusBarProps) {
  const [sessionNamesById, setSessionNamesById] = useState<Map<string, string>>(new Map());
  const deviceLink = useDeviceLink();
  const memory = useMemoryUse();

  // The same fetch `TopBar` used to hold, moved with the chips it feeds
  // (R220 item 1). Chip labels need each window's session name, which
  // `AppState.selection` carries only as a `sessionId` — a raw 32-char id
  // must never reach a label (R117 item 6). Refetched whenever the
  // selection's window set changes (`state/selection.ts`'s `windowsKey`, a
  // stable data key), so a session imported after launch still gets a real
  // name the first time it is selected.
  useEffect(() => {
    let cancelled = false;
    listSessions()
      .then((sessions) => {
        if (cancelled) return;
        setSessionNamesById(new Map(sessions.map((s) => [s.session_id, sessionLabel(s)])));
      })
      .catch(() => {
        // A chip falling back to a bare id is a degraded label, not a
        // failure this bar reports — the Data tab's own `list_sessions`
        // call already surfaces the real error.
      });
    return () => {
      cancelled = true;
    };
  }, [windowsKey(selection)]);

  const chips = selectionChips(selection, (sessionId) => sessionNamesById.get(sessionId) ?? sessionId);
  const collapsed = shouldCollapseChips(chips.length);
  const presetLabel = LAYOUT_PRESETS.find((preset) => preset.id === activePreset)?.label ?? "Custom";

  return (
    <footer
      aria-label="Status"
      className="flex h-[var(--shell-status-bar-h)] shrink-0 items-stretch border-t border-rule bg-surface text-fg-dim"
    >
      {chips.length > 0 && (
        <StatusItem
          onClick={() => onNavigate("data")}
          title="The sessions currently selected — open the Data tab"
          className="min-w-0"
        >
          {collapsed ? (
            <span className="truncate">{collapsedChipLabel(chips.length)}</span>
          ) : (
            chips.map((chip) => (
              <span key={chip.key} className="flex min-w-0 items-center gap-1">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: `var(${chip.colour})` }} />
                <span className="max-w-[24ch] truncate">{chip.label}</span>
              </span>
            ))
          )}
        </StatusItem>
      )}

      <span className="flex-1" />

      <ImportStatusChip onOpenImportPanel={() => onNavigate("data")} />

      <StatusItem onClick={() => onNavigate("device")} title="Open the Device tab" className={DEVICE_TONE[deviceLink]}>
        {DEVICE_TEXT[deviceLink]}
      </StatusItem>

      {memory.capBytes > 0 && (
        <StatusItem title={memoryLabel(memory)}>
          <span className="sr-only">{memoryLabel(memory)}</span>
          <span aria-hidden className="h-1 w-10 bg-surface-2">
            <span
              className={cn("block h-full", memory.fraction > 0.9 ? "bg-hivis" : "bg-good")}
              style={{ width: `${Math.round(memory.fraction * 100)}%` }}
            />
          </span>
        </StatusItem>
      )}

      <StatusItem onClick={onCyclePreset} title="Layout preset — click for the next one">
        {presetLabel}
      </StatusItem>
    </footer>
  );
}
