import { Component, type ReactNode } from "react";

import { describeRouteError } from "./routeErrorFallback";

/** Props for {@link RouteErrorBoundary}. */
export interface RouteErrorBoundaryProps {
  /** The route's display label (`routes/types.ts`'s `ROUTES[].label`),
   *  named in the fallback message so a user knows which tab failed. */
  routeLabel: string;
  /** The route's own subtree. */
  children: ReactNode;
}

/** Internal state: `null` while `children` renders normally, the caught
 *  throw once it hasn't. */
interface RouteErrorBoundaryState {
  thrown: { value: unknown } | null;
}

/**
 * Per-route error boundary (design charter: "a throwing cell, theme or page
 * must never blank the app"). `shell/RouteHost.tsx` mounts every
 * destination's element unconditionally, hiding the inactive ones with the
 * `hidden` attribute rather than unmounting them (R93's mount-and-hide) —
 * `hidden` does not stop an inactive route's own effects from running, so
 * without a boundary *per route* a throw in any one of the four (active or
 * not) had nothing to catch it and propagated to React's root, which
 * unmounts the entire tree with no fallback UI (confirmed live: a plain
 * `useEffect` throw in one always-mounted route blanked the whole shell,
 * nav bar included, not just that route's own content). Wrapping each
 * route's element individually here means the boundary that catches a
 * throw resets only that one route on `hidden` toggling back to it or on
 * the fallback's own Retry click — every other route, and the shell chrome
 * around `RouteHost`, is a sibling outside this boundary and keeps running.
 *
 * Catches render-phase throws and any throw surfacing during React's commit
 * of an effect (`componentDidCatch`); it cannot catch a rejected promise
 * that nothing `await`s/`.then`s into a render (an unhandled rejection
 * never reaches a component's render or commit phase, so no boundary in
 * React can see it — that class of failure needs its own `.catch`, not a
 * boundary, and is unchanged by this component).
 */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { thrown: null };

  static getDerivedStateFromError(error: unknown): RouteErrorBoundaryState {
    return { thrown: { value: error } };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }): void {
    // Logged, not shown — the fallback UI below is the one line a user
    // reads; the stack is for whoever reads the console/log file after.
    console.error(`[RouteErrorBoundary] ${this.props.routeLabel} threw:`, error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ thrown: null });
  };

  render(): ReactNode {
    const { thrown } = this.state;
    if (thrown === null) {
      return this.props.children;
    }

    const described = describeRouteError(thrown.value);

    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center font-mono text-body-small">
        <p className="text-fg">{this.props.routeLabel} hit an error and could not render.</p>
        <p className="text-brand-accent">
          {described.name}: {described.message}
        </p>
        <button
          type="button"
          onClick={this.handleRetry}
          className="rounded-[var(--radius-structural)] border border-rule px-3 py-1 font-medium text-fg-dim hover:text-fg"
        >
          Retry
        </button>
      </div>
    );
  }
}
