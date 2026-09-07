/**
 * The pure "what to show" decision for a failure {@link RouteErrorBoundary}
 * structurally cannot catch: a `window` `"error"` event (a throw inside a
 * raw `setTimeout`/`setInterval`/event-handler callback, never part of a
 * React commit) or a `"unhandledrejection"` event (a rejected promise
 * nothing `await`s/`.then`s into a render). `RouteErrorBoundary.tsx`'s own
 * doc comment names this exact gap: "an unhandled rejection never reaches a
 * component's render or commit phase, so no boundary in React can see it —
 * that class of failure needs its own `.catch`, not a boundary". This
 * module is that catch's decision half; `GlobalErrorBanner.tsx` registers
 * the two `window` listeners once and feeds their event into the matching
 * function here, so a failure of this class is named for the user (a
 * shell-level banner) instead of leaving a blank/black screen with nothing
 * but a console line only a developer would see (2026-09-07,
 * notebook-black task; moved from `AppShell.tsx` into its own separate
 * React root by the 2026-09-07 shell-unmount task so the banner survives
 * an app-root unmount -- see `GlobalErrorBanner.tsx`'s doc comment).
 */
import { describeRouteError, type RouteErrorDescription } from "./routeErrorFallback";

/** Which of the two listenable failure classes produced a {@link GlobalErrorInfo}. */
export type GlobalErrorSource = "window error" | "unhandled promise rejection";

/** A described global failure, shown by the shell-level banner. */
export interface GlobalErrorInfo extends RouteErrorDescription {
  /** Which listener produced this description — shown in the banner so a
   *  developer reading it over someone's shoulder knows which `.catch` is
   *  missing. */
  source: GlobalErrorSource;
}

/**
 * Describes a `window` `"error"` event. Browsers set `ErrorEvent.error` to
 * the thrown value for a same-origin script failure; it can be `null`
 * (e.g. a cross-origin script error, or a non-Error value thrown through a
 * path that loses it) with only `.message` surviving — this falls back to
 * that string rather than describing `null` itself, so the banner still
 * names something.
 *
 * @param event - The subset of `ErrorEvent` this decision needs.
 */
export function describeWindowError(event: { error?: unknown; message?: string }): GlobalErrorInfo {
  const thrown = event.error !== undefined && event.error !== null ? event.error : event.message;
  return { source: "window error", ...describeRouteError(thrown) };
}

/**
 * Describes an `"unhandledrejection"` event. `PromiseRejectionEvent.reason`
 * is whatever value the promise rejected with — not necessarily an `Error`,
 * same shape `describeRouteError` already handles for a React throw.
 *
 * @param reason - `PromiseRejectionEvent.reason`.
 */
export function describeUnhandledRejection(reason: unknown): GlobalErrorInfo {
  return { source: "unhandled promise rejection", ...describeRouteError(reason) };
}
