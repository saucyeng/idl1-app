import { useEffect, useState } from "react";

import { fetchEngineVersion } from "../ipc/engine";
import { useAppState } from "../state/AppState";
import type { RouteId } from "../routes/types";
import { navPlacement, resolveLayout } from "./layout";
import { readColumnPrefs, writeColumnPrefs } from "./columnPrefs";
import { describeUnhandledRejection, describeWindowError, type GlobalErrorInfo } from "./globalErrorFallback";
import TopBar from "./TopBar";
import BottomBar from "./BottomBar";
import RouteHost from "./RouteHost";
import CommandPalette from "./CommandPalette";
import { tabSwitchCommands } from "./commands";
import { Toaster } from "../components/Toaster";
import { NoteBlock } from "../components/brand/NoteBlock";

/** The current `window.innerWidth`, updated on `resize` (width-dependent
 *  layout is decided by the pure `shell/layout.ts`; this hook is only the
 *  resize listener that feeds it, the same pattern `Toaster.tsx`'s
 *  `usePosition` already uses for `sheetSideFor`). */
function useWindowWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1200 : window.innerWidth));

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return width;
}

/**
 * The app frame: top bar or bottom bar (`shell/layout.ts`'s `navPlacement`),
 * every destination mounted via `RouteHost`, the `Ctrl/⌘-K` command palette,
 * and the `Toaster` (UI-3), mounted once here (UI-DIRECTION "App shell and
 * navigation").
 */
export default function AppShell() {
  const [state, dispatch] = useAppState();
  const width = useWindowWidth();
  const layout = resolveLayout(width);
  const placement = navPlacement(layout);
  const [paletteOpen, setPaletteOpen] = useState(false);

  /** Set by the two listeners below the moment a failure `RouteErrorBoundary`
   *  structurally cannot see (window-error/unhandledrejection,
   *  `globalErrorFallback.ts`'s own doc comment) happens anywhere in the
   *  app — a boundary reset cannot fix this class of failure (nothing threw
   *  during a render/commit for React to retry), so the banner below offers
   *  a full reload rather than a `Retry` that re-renders the same broken
   *  state. Never cleared automatically: a second, different failure while
   *  one banner is already showing still updates the message (the two
   *  listeners always call `setGlobalError`, replacing rather than
   *  appending), but the banner itself only goes away on reload. */
  const [globalError, setGlobalError] = useState<GlobalErrorInfo | null>(null);

  // Registered once for the whole app's lifetime (2026-09-07,
  // notebook-black task) — the one place a throw inside a raw timer/event
  // callback or a rejected promise nothing `.catch`es gets named for the
  // user instead of silently leaving whatever the failure already blanked
  // (CLAUDE.md's "a throwing cell, theme or page must never blank the
  // app"). `event.preventDefault()` on the rejection listener stops the
  // browser's own "Uncaught (in promise)" console noise from doubling up
  // with this banner; the window-error listener does not call
  // `preventDefault()` — suppressing it would hide the error from devtools
  // entirely, and the banner is additive here, not a replacement for the
  // console trace a developer needs.
  useEffect(() => {
    function onWindowError(event: ErrorEvent): void {
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

  // Engine version fetch (C3 §3.1) — carried over unchanged from the
  // previous `Shell` component; a mount-only fetch, not width- or
  // route-dependent, so it lives at the shell's root regardless of layout.
  useEffect(() => {
    fetchEngineVersion().then((v) => dispatch({ type: "SET_ENGINE_VERSION", version: v }));
  }, [dispatch]);

  function onNavigate(route: RouteId): void {
    dispatch({ type: "NAVIGATE", route });
    const prefs = readColumnPrefs();
    writeColumnPrefs({ ...prefs, lastRoute: route });
  }

  // `Ctrl/⌘-K` opens the palette from anywhere in the shell.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const commands = tabSwitchCommands(onNavigate);

  return (
    <div className="flex h-screen w-screen flex-col bg-bg text-fg">
      {globalError !== null && (
        <NoteBlock
          role="alert"
          className="border-brand-accent text-brand-accent fixed inset-x-0 top-0 z-[9999] flex items-center justify-between gap-3 bg-bg"
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
      )}
      {placement === "top" && (
        <TopBar activeRoute={state.route} onNavigate={onNavigate} selection={state.selection} onOpenPalette={() => setPaletteOpen(true)} />
      )}
      <div className="min-h-0 flex-1">
        <RouteHost layout={layout} />
      </div>
      {placement === "bottom" && <BottomBar activeRoute={state.route} onNavigate={onNavigate} />}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
      <Toaster />
    </div>
  );
}
