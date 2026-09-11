import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { BookOpen, PanelLeftClose } from "lucide-react";

import { cn } from "@/lib/utils";
import { ROUTES, type RouteId } from "../routes/types";
import DocsPanel from "./DocsPanel";
import { useDocsPanel } from "./docsPanelStore";
import { setSidebarSlotNode } from "./sidebarSlot";
import { clampSidebarWidth, SIDEBAR_MAX_WIDTH_PX, SIDEBAR_MIN_WIDTH_PX } from "./sidebarPrefs";

/** Props for {@link Sidebar}. */
export interface SidebarProps {
  activeRoute: RouteId;
  widthPx: number;
  /** Called on every pointer move during a drag — the sidebar tracks the
   *  pointer live, because a panel that only jumped to its new width on
   *  release would be unusable. The *write* to `localStorage` happens on
   *  settle only, which is the caller's job (`AppShell.tsx`). */
  onWidthChange: (widthPx: number) => void;
  /** Called once when a drag ends, with the width to persist. */
  onWidthSettled: (widthPx: number) => void;
  onCollapse: () => void;
  /** The label printed beside the collapse button, e.g. `"Ctrl+B"`. */
  collapseShortcut: string | null;
}

/** One activity's sidebar panel: an empty container that publishes its DOM
 *  node for that route's page to portal its navigation into
 *  (`sidebarSlot.ts`). Hidden rather than unmounted when its activity is
 *  not the current one, so the list inside keeps its scroll position and
 *  selection across an activity switch (R93's rule, applied one level
 *  down). */
function SidebarPanel({ route, active }: { route: RouteId; active: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSidebarSlotNode(route, ref.current);
    return () => setSidebarSlotNode(route, null);
  }, [route]);

  return <div ref={ref} hidden={!active} className="shell-route-panel h-full min-h-0 overflow-auto" />;
}

/**
 * The resizable sidebar (ruling R220 item 1): 200–480 px, collapsible with
 * `Ctrl+B`, holding the active activity's own list and navigation.
 *
 * The divider is a 1 px rule with a 5 px pointer target straddling it — the
 * rule is what you see, the target is what you hit. That is the whole
 * visual treatment: no grip dots, no hover fill. The panel beside it is
 * already bounded by `--rule` on two sides, and a divider that announces
 * itself would be the third piece of chrome competing with the content it
 * separates.
 *
 * Keyboard resizing is deliberately present (`ArrowLeft`/`ArrowRight` on
 * the focused separator, 16 px a press, `Home`/`End` for the bounds): a
 * drag handle reachable only by pointer is a control that some users simply
 * do not have.
 */
export default function Sidebar({
  activeRoute,
  widthPx,
  onWidthChange,
  onWidthSettled,
  onCollapse,
  collapseShortcut,
}: SidebarProps) {
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const latestWidth = useRef(widthPx);
  latestWidth.current = widthPx;

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: latestWidth.current };
    },
    []
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (drag === null || drag.pointerId !== event.pointerId) return;
      onWidthChange(clampSidebarWidth(drag.startWidth + (event.clientX - drag.startX)));
    },
    [onWidthChange]
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (drag === null) return;
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(drag.pointerId)) {
        event.currentTarget.releasePointerCapture(drag.pointerId);
      }
      onWidthSettled(latestWidth.current);
    },
    [onWidthSettled]
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = 16;
      let next: number | null = null;
      if (event.key === "ArrowLeft") next = latestWidth.current - step;
      if (event.key === "ArrowRight") next = latestWidth.current + step;
      if (event.key === "Home") next = SIDEBAR_MIN_WIDTH_PX;
      if (event.key === "End") next = SIDEBAR_MAX_WIDTH_PX;
      if (next === null) return;
      event.preventDefault();
      const clamped = clampSidebarWidth(next);
      onWidthChange(clamped);
      onWidthSettled(clamped);
    },
    [onWidthChange, onWidthSettled]
  );

  const activeLabel = ROUTES.find((route) => route.id === activeRoute)?.label ?? "";
  // The Docs panel takes the sidebar's content area while it is open
  // (ruling R222 item 2). The route panels stay mounted and hidden beneath
  // it, so closing Docs returns each list with its scroll position and
  // selection intact -- the same reason they are hidden rather than
  // unmounted on an activity switch.
  const docs = useDocsPanel();

  return (
    <div className="shell-chrome flex shrink-0" style={{ width: `${widthPx}px` }}>
      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        <div className="flex h-[var(--shell-status-bar-h)] shrink-0 items-center justify-between gap-2 pr-1 pl-3">
          <h2 className="flex min-w-0 items-center gap-1.5 truncate font-mono text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase">
            {docs.open && <BookOpen aria-hidden size={12} strokeWidth={1.5} />}
            {docs.open ? "Workbook reference" : activeLabel}
          </h2>
          <button
            type="button"
            onClick={onCollapse}
            aria-label={collapseShortcut === null ? "Hide sidebar" : `Hide sidebar (${collapseShortcut})`}
            title={collapseShortcut === null ? "Hide sidebar" : `Hide sidebar — ${collapseShortcut}`}
            className="rounded-[var(--radius-structural)] p-1 text-fg-faint hover:text-fg"
          >
            <PanelLeftClose aria-hidden size={14} strokeWidth={1.5} />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {ROUTES.map((route) => (
            <SidebarPanel key={route.id} route={route.id} active={!docs.open && route.id === activeRoute} />
          ))}
          {docs.open && <DocsPanel />}
        </div>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuenow={widthPx}
        aria-valuemin={SIDEBAR_MIN_WIDTH_PX}
        aria-valuemax={SIDEBAR_MAX_WIDTH_PX}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          "-mr-0.5 w-[5px] shrink-0 cursor-col-resize touch-none border-r border-rule outline-none",
          "focus-visible:border-r-2 focus-visible:border-focus",
        )}
      />
    </div>
  );
}
