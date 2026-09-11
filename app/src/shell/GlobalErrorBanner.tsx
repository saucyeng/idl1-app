import { useEffect, useState } from "react";

import { NoteBlock } from "../components/brand/NoteBlock";
import { describeUnhandledRejection, describeWindowError, type GlobalErrorInfo } from "./globalErrorFallback";
import { isBenignWindowError } from "./isBenignWindowError";

/**
 * The shell-level banner for a failure {@link "./RouteErrorBoundary"} and
 * {@link "./RootErrorBoundary"} structurally cannot catch: a throw inside a
 * raw timer/event callback (`window` `"error"`) or a rejected promise
 * nothing `.catch`es (`"unhandledrejection"`) — `globalErrorFallback.ts`'s
 * own doc comment names the gap. Originally lived inline in
 * `shell/AppShell.tsx` (2026-09-07, notebook-black task); moved out to its
 * own **separate React root** (`main.tsx` renders it into its own DOM node,
 * a sibling of `#root`, not a child or a portal target inside it) by the
 * 2026-09-07 shell-unmount task, because Isaac's evidence was that the
 * *whole shell* — nav bar included — can unmount a few seconds after
 * launch. A banner rendered by `AppShell` is a child of the exact tree that
 * failure kills; a portal does not help either (a portal's content is still
 * part of the source root's fiber tree, so the source root unmounting takes
 * portalled content down with it even though its DOM node lives elsewhere).
 * Only a genuinely separate `ReactDOM.createRoot` call, over its own DOM
 * node, keeps running — and keeps its own `window` listeners registered —
 * regardless of what happens to the app root.
 *
 * Registered once for the whole app's lifetime. `event.preventDefault()` on
 * the rejection listener stops the browser's own "Uncaught (in promise)"
 * console noise from doubling up with this banner; the window-error
 * listener does not call `preventDefault()` — suppressing it would hide the
 * error from devtools entirely, and this banner is additive, not a
 * replacement for the console trace a developer needs.
 */
export default function GlobalErrorBanner() {
  /** Never cleared automatically: a second, different failure while one
   *  banner is already showing still updates the message (both listeners
   *  always call `setGlobalError`, replacing rather than appending), but
   *  the banner itself only goes away on reload — a boundary reset cannot
   *  fix this class of failure (nothing threw during a render/commit for
   *  React to retry). */
  const [globalError, setGlobalError] = useState<GlobalErrorInfo | null>(null);

  useEffect(() => {
    function onWindowError(event: ErrorEvent): void {
      // The browser's own benign ResizeObserver notice — not a real
      // failure, never worth the banner (see `isBenignWindowError`'s doc
      // comment).
      if (isBenignWindowError(event.message)) {
        console.debug("[GlobalErrorBanner] ignored benign window error:", event.message);
        return;
      }
      setGlobalError(describeWindowError(event));
    }
    function onUnhandledRejection(event: PromiseRejectionEvent): void {
      event.preventDefault();
      setGlobalError(describeUnhandledRejection(event.reason));
    }
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  if (globalError === null) return null;

  return (
    <NoteBlock
      role="alert"
      className="border-brand-accent text-brand-accent shell-alert fixed inset-x-0 top-0 flex items-center justify-between gap-3 bg-bg"
    >
      <span>
        An unrecoverable error happened outside any tab ({globalError.source}): {globalError.name}: {globalError.message}
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-[var(--radius-structural)] border border-rule px-2 py-1 font-mono text-label-2 text-fg-dim hover:text-fg"
      >
        Reload
      </button>
    </NoteBlock>
  );
}
