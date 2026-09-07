import { useSyncExternalStore } from "react";
import type { RouteId } from "../routes/types";

/** True when a route's page should behave as "on screen": the window is
 *  visible AND this route is the active one. Under mount-and-hide every page
 *  stays mounted, so `document.visibilityState` alone is no longer the whole
 *  answer — a hidden tab still has `visibilityState === "visible"` when the
 *  window itself is focused (`brief-ui-4.md` "Mount-and-hide vs. the Device
 *  poll"). Pure; the module-scope store below (feeding
 *  {@link useRouteVisible}/{@link subscribeRouteVisible}) is not. */
export function composeVisibility(windowVisible: boolean, routeActive: boolean): boolean {
  return windowVisible && routeActive;
}

/** The shell's current active route, set by {@link setActiveRoute}. `null`
 *  before the shell has mounted (nothing is "the active route" yet, so
 *  every route reads as inactive). */
let activeRoute: RouteId | null = null;

/** Whether the document is visible right now. Read once at module load and
 *  kept current by the single `visibilitychange` listener registered below
 *  — there is exactly one such listener for the whole app, shared by every
 *  route's visibility subscription, rather than one per route. */
let windowVisible = typeof document === "undefined" ? true : document.visibilityState === "visible";

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Called by the shell (`RouteHost`) whenever the active route changes. A
 *  module-scope stable function, safe to call from an effect keyed on
 *  route data alone. */
export function setActiveRoute(route: RouteId): void {
  if (activeRoute === route) return;
  activeRoute = route;
  notify();
}

/** The active route as of the last {@link setActiveRoute} call, for
 *  non-React call sites (e.g. `Device/index.tsx`'s `StatusPollDeps`) that
 *  need a synchronous read rather than a subscription. */
export function getActiveRoute(): RouteId | null {
  return activeRoute;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    const next = document.visibilityState === "visible";
    if (next === windowVisible) return;
    windowVisible = next;
    notify();
  });
}

/** Subscribes `handler` to be called whenever the active route or the
 *  window's visibility changes (a superset of `routeId`'s own composed
 *  visibility changing, which is enough: a spurious extra call only causes
 *  a redundant recheck, never a missed one). Returns an unsubscribe
 *  function. `routeId` is accepted for symmetry with {@link useRouteVisible}
 *  and to keep the call site self-describing; the underlying store is
 *  shared across every route. */
export function subscribeRouteVisible(_routeId: RouteId, handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook: `true` exactly when `routeId` is the active route and the
 *  window is visible, re-rendering on either changing. */
export function useRouteVisible(routeId: RouteId): boolean {
  return useSyncExternalStore(
    (onStoreChange) => subscribeRouteVisible(routeId, onStoreChange),
    () => composeVisibility(windowVisible, activeRoute === routeId),
  );
}
