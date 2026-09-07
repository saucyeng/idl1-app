import { cn } from "@/lib/utils";
import { ROUTES, type RouteId } from "../routes/types";

/** Props for {@link BottomBar}. */
export interface BottomBarProps {
  activeRoute: RouteId;
  onNavigate: (route: RouteId) => void;
}

/**
 * The narrow-layout (< 600 px) navigation bar: the four destinations in
 * `ROUTES` order, 10 px uppercase tracked labels, a `44px` minimum hit
 * target (UI-DIRECTION "Spacing", touch-first surfaces), and the active
 * destination marked with an amber (`--hivis`) hairline box over a
 * `--surface-2` fill at `--radius-structural` (2 px) — a box, not a pill
 * (`FLUTTER-UI-SURVEY.md` §5).
 */
export default function BottomBar({ activeRoute, onNavigate }: BottomBarProps) {
  return (
    <nav
      className="flex items-stretch border-t border-rule bg-surface"
      aria-label="Primary"
    >
      {ROUTES.map((route) => {
        const active = route.id === activeRoute;
        return (
          <button
            key={route.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(route.id)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-1 text-nav font-medium uppercase tracking-[var(--tracking-label)]",
              "min-h-[var(--hit-target)]",
              active ? "text-fg" : "text-fg-dim",
            )}
          >
            <span
              className={cn(
                "rounded-[var(--radius-structural)] px-3 py-0.5",
                active && "border border-hivis bg-surface-2",
              )}
            >
              {route.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
