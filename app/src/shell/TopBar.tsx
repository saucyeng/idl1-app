import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { listSessions } from "../ipc/catalog";
import { ROUTES, type RouteId } from "../routes/types";
import type { Selection } from "../state/AppState";
import { windowsKey } from "../state/selection";
import { StatusDot } from "@/components/brand/StatusDot";
import { collapsedChipLabel, removeWindowAt, selectionChips, sessionLabel, shouldCollapseChips } from "./topBarSelection";

/** Props for {@link TopBar}. */
export interface TopBarProps {
  activeRoute: RouteId;
  onNavigate: (route: RouteId) => void;
  selection: Selection;
  /** Dispatches `SET_WINDOWS` — a chip's dismiss button's whole effect
   *  (S1 Task 13). */
  onWindowsChange: (windows: Selection) => void;
  onOpenPalette: () => void;
}

/**
 * The medium/wide-layout top bar (UI-DIRECTION "App shell and navigation",
 * "Top bar contents"): a typeset wordmark (no logo, decision 4), the
 * destination tabs, the selection chips (S1 Task 13 — one dismissable chip
 * per selected window, collapsing to a count past
 * `topBarSelection.ts`'s `CHIP_COLLAPSE_THRESHOLD`; nothing when the
 * selection is empty, decision 48), a placeholder slot for UI-11's playback
 * transport, the `Ctrl/⌘-K` palette trigger, and a device status dot. The
 * dot is fed from existing app state only (no IPC call belongs in the
 * shell); today's `AppState` carries no device-connection slice, so it
 * reads as unknown/neutral until a later lane lifts that state up
 * (reported as a gap — see the UI-4 report).
 *
 * Chip labels need each window's session name, which `AppState.selection`
 * does not carry (only `sessionId` — a raw 32-char id must never reach a
 * label, R117 item 6). This component is the label's caller
 * (`topBarSelection.ts`'s `selectionChips` contract), so it holds its own
 * `list_sessions` fetch and refetches whenever the selection's window set
 * changes (`state/selection.ts`'s `windowsKey`, a stable data key — never
 * a function-prop dependency, operating brief §4's tightening) — a session
 * created after mount (e.g. by an import elsewhere in the app) still gets a
 * real name the next time it is selected. A brand-new session picked before
 * this fetch resolves falls back to its bare id for one render.
 */
export default function TopBar({ activeRoute, onNavigate, selection, onWindowsChange, onOpenPalette }: TopBarProps) {
  const [sessionNamesById, setSessionNamesById] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    listSessions()
      .then((sessions) => {
        if (cancelled) return;
        setSessionNamesById(new Map(sessions.map((s) => [s.session_id, sessionLabel(s)])));
      })
      .catch(() => {
        // No error state here: a chip falling back to a bare session id
        // (see sessionNameFor below) is a degraded label, not a failure the
        // bar needs to report — the Data tab's own `list_sessions` fetch
        // already surfaces a real error banner for the same call.
      });
    return () => {
      cancelled = true;
    };
  }, [windowsKey(selection)]);

  const sessionNameFor = (sessionId: string) => sessionNamesById.get(sessionId) ?? sessionId;
  const chips = selectionChips(selection, sessionNameFor);
  const collapsed = shouldCollapseChips(chips.length);

  return (
    <header className="flex h-11 items-center gap-4 border-b border-rule bg-surface px-4 text-body-small">
      <span className="font-mono text-title-2 font-semibold tracking-[var(--tracking-kicker)] text-fg">idl1</span>

      <nav className="flex items-center gap-1" aria-label="Primary">
        {ROUTES.map((route) => {
          const active = route.id === activeRoute;
          return (
            <button
              key={route.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(route.id)}
              className={cn(
                "rounded-[var(--radius-structural)] px-3 py-1 text-title-2 font-medium",
                active ? "bg-surface-2 text-fg" : "text-fg-dim hover:text-fg",
              )}
            >
              {route.label}
            </button>
          );
        })}
      </nav>

      {chips.length > 0 && (
        <div className="flex items-center gap-1.5" aria-label="Selection">
          {collapsed ? (
            <span className="rounded-[var(--radius-structural)] border border-rule bg-surface-2 px-2 py-0.5 font-mono text-label-2 text-fg-dim">
              {collapsedChipLabel(chips.length)}
            </span>
          ) : (
            chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1 rounded-[var(--radius-structural)] border border-rule bg-surface-2 py-0.5 pr-1 pl-2 font-mono text-label-2 text-fg-dim"
              >
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: `var(${chip.colour})` }} />
                {chip.label}
                <button
                  type="button"
                  aria-label={`Remove ${chip.label} from the selection`}
                  onClick={() => onWindowsChange(removeWindowAt(selection, chip.index))}
                  className="rounded-[var(--radius-structural)] px-1 text-fg-faint hover:text-fg"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
      )}

      {/* UI-11's PlaybackTransport (play/pause, live-speed cursor) portals
          into this node by id from `Notebook/interaction/PlaybackTransport.tsx`
          — `TopBar` itself holds no playback state (R99: that state lives in
          `Notebook/index.tsx`, the worksheet's own orchestration file). */}
      <div className="flex flex-1 items-center justify-end pr-2" id="playback-transport-slot" data-slot="playback-transport-placeholder" />

      <button
        type="button"
        onClick={onOpenPalette}
        className="rounded-[var(--radius-structural)] border border-rule px-2 py-1 font-mono text-label-2 text-fg-dim hover:text-fg"
      >
        ⌘K
      </button>

      <StatusDot className="text-fg-faint" title="Device status is not wired into the shell yet">
        DEVICE
      </StatusDot>
    </header>
  );
}
