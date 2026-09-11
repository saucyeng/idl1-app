import type { RouteId } from "../routes/types";

/**
 * The activity bar's badges (ruling R220 item 1: "badges for live counts —
 * import queue length, device connected dot, sync pending").
 *
 * Pure and dependency-free (`aspectClass.ts`'s pattern): the caller reads
 * the stores and hands the numbers here, and this module decides what each
 * activity shows. Nothing polls — R220 item 4: every input below is
 * already produced by something the app runs anyway (the import queue's own
 * reducer, the Device tab's existing 1 Hz status poll).
 *
 * Sync has no badge. R220 item 1 names one, but no sync state exists in the
 * app today — there is no LAN peer store to read a "pending" count from, and
 * a badge fed by nothing would be a number the shell made up (CLAUDE.md §5,
 * and the same call `TopBar.tsx`'s device dot already made out loud). The
 * badge lands with the sync lane that produces the state; {@link
 * ActivityBadgeInput} is where its field goes.
 */

/** How a badge draws: a number in a pill, or a bare status dot. */
export type BadgeKind = "count" | "dot";

/** A badge's colour role, resolved to a token by the component. */
export type BadgeTone = "neutral" | "good" | "warn";

/** One activity's badge. */
export interface ActivityBadge {
  kind: BadgeKind;
  /** The number shown, for `kind: "count"`; `null` for a dot. */
  count: number | null;
  tone: BadgeTone;
  /** The badge's accessible name — a whole phrase, since a bare "3" beside
   *  an icon says nothing to a screen reader. */
  title: string;
}

/** The device's link, as the Device tab already knows it: no device
 *  connected, one connected and answering, or one connected whose status
 *  poll has stopped answering (`Device/statusPoll.ts`'s `isLinkLost`). */
export type DeviceLink = "disconnected" | "connected" | "lost";

/** Everything the badges are computed from. */
export interface ActivityBadgeInput {
  /** Import items not yet finished — queued plus running. Zero shows no
   *  badge at all, rather than a "0" pill. */
  pendingImports: number;
  deviceLink: DeviceLink;
}

/** A badge per activity, `null` for an activity with nothing to report.
 *  Keyed by `routes/types.ts`'s `RouteId`, so a new destination is a type
 *  error here rather than a silently badge-less icon. */
export type ActivityBadges = Readonly<Record<RouteId, ActivityBadge | null>>;

const DEVICE_BADGE: Readonly<Record<DeviceLink, ActivityBadge | null>> = {
  disconnected: null,
  connected: { kind: "dot", count: null, tone: "good", title: "Device connected" },
  lost: { kind: "dot", count: null, tone: "warn", title: "Device not answering" },
};

/**
 * The activity bar's badges for `input`.
 *
 * A disconnected device shows nothing rather than a grey dot: the activity
 * bar is four icons in a 48 px strip, and a dot that is always present
 * stops being a signal. The same rule gives an empty import queue no pill.
 *
 * @param input The live counts, read from the app's existing stores.
 */
export function activityBadges(input: ActivityBadgeInput): ActivityBadges {
  const pending = Number.isFinite(input.pendingImports) ? Math.max(0, Math.trunc(input.pendingImports)) : 0;
  return {
    device: DEVICE_BADGE[input.deviceLink],
    data:
      pending === 0
        ? null
        : {
            kind: "count",
            count: pending,
            tone: "neutral",
            title: `${pending} file${pending === 1 ? "" : "s"} waiting to import`,
          },
    notebook: null,
    settings: null,
  };
}

/** The badge's printed number: counts above 99 print `"99+"`, so a folder
 *  import of ten thousand files cannot widen the 48 px activity bar. */
export function badgeLabel(badge: ActivityBadge): string {
  if (badge.count === null) return "";
  return badge.count > 99 ? "99+" : String(badge.count);
}
