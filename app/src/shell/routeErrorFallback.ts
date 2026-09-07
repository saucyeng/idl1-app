/**
 * Turns whatever a route's render/effect threw into a short, safe-to-render
 * `{ name, message }` pair for {@link ../shell/RouteErrorBoundary.tsx}'s
 * fallback UI. `React.ErrorInfo`'s own `componentStack` is not surfaced here
 * (it is logged, not shown) — this is only the one line a user reads.
 *
 * Never throws itself: a boundary's fallback path is the last line of
 * defence (CLAUDE.md's "a throwing cell, theme or page must never blank the
 * app" rule, this task's own charter) — a formatter that itself throws on a
 * malformed thrown value would defeat the point.
 */
export interface RouteErrorDescription {
  /** The thrown value's constructor name (`error.name` for an `Error`),
   *  or `"Error"` for anything thrown that is not an `Error` instance. */
  name: string;
  /** A human-readable one-line description of what was thrown. */
  message: string;
}

/**
 * Describes `thrown` (React's `componentDidCatch`/`getDerivedStateFromError`
 * pass whatever value the failing code threw, not necessarily an `Error`).
 *
 * @param thrown - The value caught by {@link ../shell/RouteErrorBoundary.tsx}.
 */
export function describeRouteError(thrown: unknown): RouteErrorDescription {
  if (thrown instanceof Error) {
    return { name: thrown.name, message: thrown.message };
  }
  if (typeof thrown === "string") {
    return { name: "Error", message: thrown };
  }
  if (thrown === undefined || thrown === null) {
    return { name: "Error", message: String(thrown) };
  }
  try {
    return { name: "Error", message: JSON.stringify(thrown) };
  } catch {
    return { name: "Error", message: String(thrown) };
  }
}
