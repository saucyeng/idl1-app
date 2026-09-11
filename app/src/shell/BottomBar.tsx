import { cn } from "@/lib/utils";
import { ROUTES, type RouteId } from "../routes/types";
import { ACTIVITY_ICONS } from "./activityIcons";
import { badgeLabel, type ActivityBadges } from "./activityBadges";

/** Props for {@link BottomBar}. */
export interface BottomBarProps {
  activeRoute: RouteId;
  onNavigate: (route: RouteId) => void;
  /** The same badges the wide layout's activity bar shows — R220 item 3
   *  folds the status bar into this bar, and a background job's progress
   *  and the device's link are what the status bar had to say. */
  badges: ActivityBadges;
}

const BADGE_TONE_CLASS = {
  neutral: "bg-surface-2 text-fg-dim border-rule",
  good: "bg-good text-bg border-good",
  warn: "bg-hivis text-bg border-hivis",
} as const;

/**
 * The narrow-layout (< 600 px) navigation bar (ruling R220 item 3): the
 * four activities as a 48 px bottom tab bar, with the status bar folded
 * into it.
 *
 * "Folded in" is literal: at this width there is no second bottom band. The
 * two things the status bar actually reports — a background job running and
 * the device's link — ride on the Data and Device tabs as the same badges
 * `shell/activityBadges.ts` computes for the wide layout's activity bar.
 * The status bar's other items have nothing to report here: there are no
 * columns at this width, so no layout preset, and the chart memory meter
 * belongs beside the charts it describes.
 *
 * Each tab keeps the amber (`--hivis`) hairline box over `--surface-2` that
 * has marked the active destination since `FLUTTER-UI-SURVEY.md` §5 — a
 * box, not a pill — and the `--hit-target` minimum that makes it a
 * touch-first control.
 */
export default function BottomBar({ activeRoute, onNavigate, badges }: BottomBarProps) {
  return (
    <nav
      className="shell-chrome flex h-[var(--shell-activity-bar-w)] shrink-0 items-stretch border-t border-rule bg-surface"
      aria-label="Primary"
    >
      {ROUTES.map((route) => {
        const active = route.id === activeRoute;
        const Icon = ACTIVITY_ICONS[route.id];
        const badge = badges[route.id];
        return (
          <button
            key={route.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(route.id)}
            className={cn(
              "relative flex min-h-[var(--hit-target)] flex-1 flex-col items-center justify-center gap-0.5 text-nav font-medium uppercase tracking-[var(--tracking-label)]",
              active ? "text-fg" : "text-fg-dim",
            )}
          >
            <Icon aria-hidden size={16} strokeWidth={1.5} />
            <span className={cn("rounded-[var(--radius-structural)] px-3", active && "border border-hivis bg-surface-2")}>
              {route.label}
            </span>
            {badge !== null && (
              <span
                title={badge.title}
                className={cn(
                  "absolute top-1 right-[22%] border",
                  badge.kind === "dot"
                    ? "size-2 rounded-full"
                    : "min-w-4 rounded-full px-1 text-center font-mono text-[length:var(--nb-text-label)] leading-4",
                  BADGE_TONE_CLASS[badge.tone],
                )}
              >
                <span className="sr-only">{badge.title}</span>
                {badge.kind === "count" && <span aria-hidden>{badgeLabel(badge)}</span>}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
