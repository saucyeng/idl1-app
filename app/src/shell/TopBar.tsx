import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { listSessions } from "../ipc/catalog";
import { ROUTES, type RouteId } from "../routes/types";
import type { Selection } from "../state/AppState";
import { sessionLabel, windowsKey } from "../state/selection";
import { StatusDot } from "@/components/brand/StatusDot";
import { collapsedChipLabel, removeWindowAt, selectionChips, shouldCollapseChips } from "./topBarSelection";
import WindowControls from "./WindowControls";
import { usesCustomTitleBar } from "./windowChrome";

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

  // Ruling R216 item 1. Read once per render from the user agent, which
  // never changes for the life of the window; `windowChrome.ts` explains
  // why that rather than the OS plugin. `undefined` rather than `false` for
  // the attribute, because Tauri tests for the attribute's *presence*:
  // `data-tauri-drag-region="false"` would still drag.
  const customTitleBar = typeof navigator !== "undefined" && usesCustomTitleBar(navigator.userAgent);
  const dragRegion = customTitleBar ? "" : undefined;

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
    /* `relative z-10` and the opaque `bg-surface` are the same treatment
       the Notebook toolbar row carries (`routes/pages/Notebook/index.tsx`'s
       `toolbarElement`, R161's bug fix): the notebook's sandbox iframe host
       is `position: fixed` with an explicit `zIndex: 0`, so a chart scrolled
       up the page paints above every static in-flow element. Only a
       positioned element with a higher stated z-index clips it, so this bar
       states one too (R209 item 1 -- charts were painting over the top bar
       even after the toolbar row was fixed). */
    <header
      className={cn(
        "relative z-10 flex items-center gap-3 border-b border-rule bg-surface pl-3 text-body-small",
        // 32 px, not 44 (ruling R216 item 1): on Windows this bar *is* the
        // title bar, so it replaces the native caption rather than sitting
        // under it. The height is the same on every platform — a bar that
        // changed height with the OS would change every downstream layout
        // measurement with it — only the drag region and the controls are
        // Windows-only.
        "h-[var(--space-8)]",
        customTitleBar ? "pr-0" : "pr-3",
      )}
    >
      <span data-tauri-drag-region={dragRegion} className="font-mono text-title-2 font-semibold tracking-[var(--tracking-kicker)] text-fg">
        idl1
      </span>

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

      {/* The playback transport used to portal into a reserved slot here.
          Ruling R212 item 4 moves it into the Notebook toolbar's centre
          group, so the slot is gone and this is now plain spacing pushing
          the command-palette trigger to the right edge.

          On Windows this same empty space is the window's drag handle
          (R216 item 1): `data-tauri-drag-region` makes a press here move
          the window and a double-click toggle maximize, both handled by
          Tauri itself. It is on the spacer and the wordmark, never on the
          header, so a press that lands on a tab, a chip's dismiss button or
          the palette trigger is a click on that control and not a drag. */}
      <div data-tauri-drag-region={dragRegion} className="h-full flex-1" />

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

      {/* Far right, flush to the window edge, where Windows puts them. */}
      {customTitleBar && <WindowControls className="-mr-px ml-1" />}
    </header>
  );
}
