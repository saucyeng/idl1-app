import { cn } from "@/lib/utils";
import { ROUTES, type RouteId } from "../routes/types";
import { ACTIVITY_ICONS } from "./activityIcons";
import { badgeLabel, type ActivityBadges } from "./activityBadges";

/** Props for {@link ActivityBar}. */
export interface ActivityBarProps {
  activeRoute: RouteId;
  onNavigate: (route: RouteId) => void;
  badges: ActivityBadges;
  /** The shortcut printed in each icon's tooltip, by route — `Ctrl+1`
   *  through `Ctrl+4`, resolved for this platform by `menuModel.ts` so the
   *  strip and the Go menu can never print different keys. */
  shortcutLabels: Readonly<Record<RouteId, string | null>>;
}

const BADGE_TONE_CLASS = {
  neutral: "bg-surface-2 text-fg-dim border-rule",
  good: "bg-good text-bg border-good",
  warn: "bg-hivis text-bg border-hivis",
} as const;

/**
 * The 48 px activity bar down the left edge (ruling R220 item 1): four
 * icons, the active one carrying a left accent bar, and live badges from
 * `shell/activityBadges.ts`.
 *
 * The accent bar is the load-bearing piece of the whole strip — at 48 px
 * there is no room for a label, so "which activity am I in" has to be
 * carried by one high-contrast mark. It is `--hivis`, the same amber
 * `BottomBar.tsx` already uses for the active destination, so the wide and
 * narrow layouts agree about what "active" looks like.
 *
 * Badges are decided in the pure module; this component only maps a tone to
 * a token and prints the number.
 */
export default function ActivityBar({ activeRoute, onNavigate, badges, shortcutLabels }: ActivityBarProps) {
  return (
    <nav
      aria-label="Activities"
      className="shell-chrome flex w-[var(--shell-activity-bar-w)] shrink-0 flex-col items-stretch border-r border-rule bg-surface"
    >
      {ROUTES.map((route) => {
        const Icon = ACTIVITY_ICONS[route.id];
        const active = route.id === activeRoute;
        const badge = badges[route.id];
        const shortcut = shortcutLabels[route.id];
        return (
          <button
            key={route.id}
            type="button"
            aria-current={active ? "page" : undefined}
            aria-label={shortcut === null ? route.label : `${route.label} (${shortcut})`}
            title={shortcut === null ? route.label : `${route.label} — ${shortcut}`}
            onClick={() => onNavigate(route.id)}
            className={cn(
              "relative flex h-[var(--shell-activity-bar-w)] items-center justify-center outline-none",
              "focus-visible:ring-1 focus-visible:ring-focus focus-visible:ring-inset",
              active ? "text-fg" : "text-fg-faint hover:text-fg-dim",
            )}
          >
            {active && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-hivis" />}
            <Icon aria-hidden size={22} strokeWidth={1.5} />
            {badge !== null && (
              <span
                title={badge.title}
                className={cn(
                  "absolute border",
                  badge.kind === "dot"
                    ? "right-2 bottom-2 size-2 rounded-full"
                    : "right-1 bottom-1 min-w-4 rounded-full px-1 text-center font-mono text-[length:var(--nb-text-label)] leading-4",
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
