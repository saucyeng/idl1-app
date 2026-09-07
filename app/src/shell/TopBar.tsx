import { cn } from "@/lib/utils";
import { ROUTES, type RouteId } from "../routes/types";
import type { Selection } from "../state/AppState";
import { StatusDot } from "@/components/brand/StatusDot";

/** Props for {@link TopBar}. */
export interface TopBarProps {
  activeRoute: RouteId;
  onNavigate: (route: RouteId) => void;
  selection: Selection;
  onOpenPalette: () => void;
}

/** `Session <id> · Lap <n>` (`+k overlay` when overlay laps are chosen), or
 *  `null` when nothing is selected — an empty chip is chrome that teaches
 *  nothing (UI-4 brief Open question 4; idl0 shows an empty-state sentence
 *  instead, owned by the Data/Notebook pages, not the shell). */
function selectionChipLabel(selection: Selection): string | null {
  if (selection.sessionId === null) return null;
  const lap = selection.lapContext;
  if (lap === null) return `Session ${selection.sessionId}`;
  const overlay = lap.overlayLaps.length > 0 ? ` +${lap.overlayLaps.length} overlay` : "";
  return `Session ${selection.sessionId} · Lap ${lap.mainLap}${overlay}`;
}

/**
 * The medium/wide-layout top bar (UI-DIRECTION "App shell and navigation",
 * "Top bar contents"): a typeset wordmark (no logo, decision 4), the
 * destination tabs, the active session/lap chip (nothing when unselected),
 * a placeholder slot for UI-11's playback transport, the `Ctrl/⌘-K` palette
 * trigger, and a device status dot. The dot is fed from existing app state
 * only (no IPC call belongs in the shell); today's `AppState` carries no
 * device-connection slice, so it reads as unknown/neutral until a later
 * lane lifts that state up (reported as a gap — see the UI-4 report).
 */
export default function TopBar({ activeRoute, onNavigate, selection, onOpenPalette }: TopBarProps) {
  const chipLabel = selectionChipLabel(selection);

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

      {chipLabel !== null && (
        <span className="rounded-[var(--radius-structural)] border border-rule bg-surface-2 px-2 py-0.5 font-mono text-label-2 text-fg-dim">
          {chipLabel}
        </span>
      )}

      {/* Reserved for UI-11's PlaybackTransport (play/pause, live-speed
          cursor) — out of scope here (UI-DIRECTION decision 18, Suggested
          lane split UI-11). */}
      <div className="flex-1" data-slot="playback-transport-placeholder" />

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
