import { Component, type ReactNode } from "react";

import { describeRouteError } from "./routeErrorFallback";

/** Props for {@link RootErrorBoundary}. */
export interface RootErrorBoundaryProps {
  /** The whole app shell (`shell/AppShell.tsx`, via `App.tsx`). */
  children: ReactNode;
}

/** Internal state: `null` while `children` renders normally, the caught
 *  throw once it hasn't. */
interface RootErrorBoundaryState {
  thrown: { value: unknown } | null;
}

/**
 * Catches a render/commit throw from anywhere above `shell/RouteHost.tsx`'s
 * per-route boundaries — `AppShell` itself, `TitleBar`, `ActivityBar`,
 * `ColumnFrame`, `RouteHost`'s own body/effects, `CommandPalette`, the
 * `Toaster` — none of which had any boundary of their own (2026-09-07,
 * shell-unmount task: Isaac observed the *nav bar* disappear a few seconds
 * after launch, not just the Notebook column, proving a throw at this level
 * takes the whole root down with nothing to catch it; `RouteErrorBoundary`
 * only ever protected the space *inside* `RouteHost`'s `.map`, per its own
 * doc comment).
 *
 * This is the outermost boundary in the tree — `main.tsx` wraps `<App />`
 * in it directly, nothing sits between this and the DOM. Its fallback is a
 * full-window message (not a per-route one), because at this level there is
 * no shell chrome left standing to show a smaller message inside: if
 * `AppShell` itself threw, the nav bar is part of what came down and cannot
 * be assumed to still exist. `shell/GlobalErrorBanner.tsx` is mounted as a
 * *separate* React root, not a child of this tree, precisely so an
 * async failure this boundary structurally cannot catch (a raw timer/event
 * callback or an unhandled rejection — `RouteErrorBoundary`'s own doc
 * comment explains why no boundary can) still has somewhere to report even
 * while this boundary's own fallback (or nothing at all) occupies `#root`.
 */
export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = { thrown: null };

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    return { thrown: { value: error } };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }): void {
    // Logged, not shown — the fallback UI below is the one line a user
    // reads; the stack is for whoever reads the console/log file after.
    console.error("[RootErrorBoundary] the app shell threw:", error, info.componentStack);
  }

  render(): ReactNode {
    const { thrown } = this.state;
    if (thrown === null) {
      return this.props.children;
    }

    const described = describeRouteError(thrown.value);

    return (
      <div
        role="alert"
        className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-bg p-6 text-center font-mono text-body-small text-fg"
      >
        <p>idl1 hit an error outside any tab and could not stay open.</p>
        <p className="text-brand-accent">
          {described.name}: {described.message}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-[var(--radius-structural)] border border-rule px-3 py-1 font-medium text-fg-dim hover:text-fg"
        >
          Reload
        </button>
      </div>
    );
  }
}
