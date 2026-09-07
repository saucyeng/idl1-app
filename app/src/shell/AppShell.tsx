import { useEffect, useState } from "react";

import { fetchEngineVersion } from "../ipc/engine";
import { useAppState } from "../state/AppState";
import type { RouteId } from "../routes/types";
import { navPlacement, resolveLayout } from "./layout";
import { readColumnPrefs, writeColumnPrefs } from "./columnPrefs";
import TopBar from "./TopBar";
import BottomBar from "./BottomBar";
import RouteHost from "./RouteHost";
import CommandPalette from "./CommandPalette";
import { tabSwitchCommands } from "./commands";
import { Toaster } from "../components/Toaster";

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
      {/* Mount-and-hide (R93), not conditional mount/unmount — matching
          `shell/RouteHost.tsx`'s own pattern for the same reason: `TopBar`
          owns `#playback-transport-slot`, the DOM node
          `Notebook/interaction/PlaybackTransport.tsx` portals into for the
          whole app's lifetime (it is a sibling of `RouteHost`, rendered
          unconditionally since Notebook is always mounted). Actually
          unmounting `TopBar` on every breakpoint crossing destroys that
          node; `PlaybackTransport`'s own `usePlaybackSlot` only re-checks
          `document.getElementById` on a `resize` event, and because
          `useWindowWidth`'s listener (registered by this component, higher
          in the tree) fires *after* `usePlaybackSlot`'s (registered by a
          deeper component — React commits child effects before parent
          effects on mount) on the very `resize` that crosses a breakpoint,
          `TopBar`'s unmount (and the slot div's destruction) happens on a
          later, unlistened render — `usePlaybackSlot` is left holding a
          stale, already-detached node with nothing left to tell it to
          recheck (2026-09-07, shell-unmount task: confirmed by reading the
          effect registration order and React 18+'s automatic batching of a
          native-event-triggered `setState`, not reproduced live). Neither
          bar has any effect of its own (`TopBar.tsx`/`BottomBar.tsx` are
          both plain presentational components), so keeping both mounted
          costs nothing. */}
      <div hidden={placement !== "top"}>
        <TopBar activeRoute={state.route} onNavigate={onNavigate} selection={state.selection} onOpenPalette={() => setPaletteOpen(true)} />
      </div>
      <div className="min-h-0 flex-1">
        <RouteHost layout={layout} />
      </div>
      <div hidden={placement !== "bottom"}>
        <BottomBar activeRoute={state.route} onNavigate={onNavigate} />
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
      <Toaster />
    </div>
  );
}
