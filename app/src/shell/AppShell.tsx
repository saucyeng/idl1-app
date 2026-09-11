import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchEngineVersion } from "../ipc/engine";
import { useAppState } from "../state/AppState";
import { useImportQueue } from "../state/ImportQueue";
import type { RouteId } from "../routes/types";
import { ROUTES } from "../routes/types";
import { navPlacement, resolveLayout } from "./layout";
import { ASPECT_CLASS_DEBOUNCE_MS, resolveAspectClass, type AspectClass } from "./aspectClass";
import { cycleLayoutPreset, setAspectClass, useActiveLayoutPreset } from "./layoutPreset";
import { readColumnPrefs, writeColumnPrefs } from "./columnPrefs";
import { activityBadges } from "./activityBadges";
import { useDeviceLink } from "./deviceLink";
import ActivityBar from "./ActivityBar";
import AboutDialog from "./AboutDialog";
import Sidebar from "./Sidebar";
import StatusBar from "./StatusBar";
import TitleBar from "./TitleBar";
import BottomBar from "./BottomBar";
import RouteHost from "./RouteHost";
import { ToolbarSlotRow } from "./ToolbarSlotRow";
import { usesCustomTitleBar } from "./windowChrome";
import CommandPalette from "./CommandPalette";
import { registerCommand, runCommand, unregisterCommand } from "./commandRegistry";
import { commandForEvent, formatShortcut, MENU_COMMAND_IDS, MENUS, usesCommandGlyph } from "./menuModel";
import { DEFAULT_SIDEBAR_STATE, withSidebarState, type SidebarState } from "./sidebarPrefs";
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
 * The viewport's aspect class, both published into `shell/layoutPreset.ts`
 * (so a window moved to a differently-shaped monitor recalls that shape's
 * layout preset, R213 item 2) and returned, because the sidebar's width and
 * collapsed state are remembered per class too (R220 item 2).
 *
 * The debounce is the ruling's own ("re-evaluated on resize with a 200 ms
 * debounce and never flips during a gesture"): a window dragged between
 * monitors, or a maximise animation, crosses several ratios on the way, and
 * only where it comes to rest names the arrangement the user wants back.
 * Measured once on mount un-debounced, so the first frame is already the
 * right class rather than a default that then flips.
 */
function useAspectClass(): AspectClass {
  const [cls, setCls] = useState<AspectClass>(() =>
    typeof window === "undefined" ? "wide" : resolveAspectClass(window.innerWidth, window.innerHeight)
  );

  useEffect(() => {
    const publish = () => {
      const next = resolveAspectClass(window.innerWidth, window.innerHeight);
      setCls(next);
      setAspectClass(next);
    };
    publish();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(publish, ASPECT_CLASS_DEBOUNCE_MS);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return cls;
}

/**
 * The app frame, VS Code's anatomy at R212's density (ruling R220): a title
 * bar carrying the menus and the window controls, a 48 px activity bar of
 * four icons, a resizable sidebar holding the active activity's own
 * navigation, the editor area (the Notebook toolbar row plus `RouteHost`),
 * and a 22 px status bar.
 *
 * Narrow layouts (R220 item 3) keep the paper/sheet behaviour R184 set:
 * no activity bar and no sidebar, the four activities as a bottom tab bar
 * with the status folded into it, and the menus behind one "⋯" button in
 * the title strip.
 *
 * The shell registers only the commands it owns — navigation, the sidebar,
 * the preset cycle, the palette, About. Everything else in the menus is
 * registered by the page that owns the state it acts on
 * (`shell/commandRegistry.ts`), so a menu entry is enabled exactly when the
 * thing behind it can actually run.
 */
export default function AppShell() {
  const [state, dispatch] = useAppState();
  const [importQueue] = useImportQueue();
  const width = useWindowWidth();
  const layout = resolveLayout(width);
  const placement = navPlacement(layout);
  const narrow = placement === "bottom";
  const aspectClass = useAspectClass();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const customTitleBar = typeof navigator !== "undefined" && usesCustomTitleBar(navigator.userAgent);
  const commandGlyph = typeof navigator !== "undefined" && usesCommandGlyph(navigator.userAgent);
  const activePreset = useActiveLayoutPreset();
  const deviceLink = useDeviceLink();

  // The sidebar's state for *this* viewport shape (R220 item 2). Held in
  // React state and mirrored to `localStorage`, rather than read from
  // storage on every render: a drag moves it sixty times a second and a
  // write per frame is a write per frame.
  const [sidebar, setSidebar] = useState<SidebarState>(DEFAULT_SIDEBAR_STATE);
  useEffect(() => {
    setSidebar(readColumnPrefs().sidebar[aspectClass]);
  }, [aspectClass]);

  const persistSidebar = useCallback(
    (next: SidebarState) => {
      const prefs = readColumnPrefs();
      writeColumnPrefs({ ...prefs, sidebar: withSidebarState(prefs.sidebar, aspectClass, next) });
    },
    [aspectClass]
  );

  const badges = useMemo(
    () =>
      activityBadges({
        pendingImports: importQueue.items.filter((item) => item.status === "queued" || item.status === "running").length,
        deviceLink,
      }),
    [importQueue, deviceLink]
  );

  // Engine version fetch (C3 §3.1): a mount-only fetch, not width- or
  // route-dependent, so it lives at the shell's root regardless of layout.
  useEffect(() => {
    fetchEngineVersion().then((v) => dispatch({ type: "SET_ENGINE_VERSION", version: v }));
  }, [dispatch]);

  const onNavigate = useCallback(
    (route: RouteId): void => {
      dispatch({ type: "NAVIGATE", route });
      const prefs = readColumnPrefs();
      writeColumnPrefs({ ...prefs, lastRoute: route });
    },
    [dispatch]
  );

  const toggleSidebar = useCallback(() => {
    setSidebar((current) => {
      const next = { ...current, collapsed: !current.collapsed };
      persistSidebar(next);
      return next;
    });
  }, [persistSidebar]);

  // The shell's own commands. Registered imperatively in one effect rather
  // than through eleven `useCommand` calls: they are all stable callbacks
  // owned by this component, and one registration site is easier to check
  // against `menuModel.ts`'s tree than eleven scattered ones.
  useEffect(() => {
    const owned: [string, () => void][] = [
      [MENU_COMMAND_IDS.goDevice, () => onNavigate("device")],
      [MENU_COMMAND_IDS.goData, () => onNavigate("data")],
      [MENU_COMMAND_IDS.goNotebook, () => onNavigate("notebook")],
      [MENU_COMMAND_IDS.goSettings, () => onNavigate("settings")],
      [MENU_COMMAND_IDS.viewToggleSidebar, toggleSidebar],
      [MENU_COMMAND_IDS.viewCyclePreset, cycleLayoutPreset],
      [MENU_COMMAND_IDS.viewCommandPalette, () => setPaletteOpen((open) => !open)],
      [MENU_COMMAND_IDS.helpAbout, () => setAboutOpen(true)],
    ];
    for (const [id, handler] of owned) registerCommand(id, handler);
    return () => {
      for (const [id, handler] of owned) unregisterCommand(id, handler);
    };
  }, [onNavigate, toggleSidebar]);

  // The View menu's three toggles (maths graph, properties, dense output)
  // are *not* registered here. They are the Notebook toolbar's own
  // controls, and its handlers carry R213 item 3's bookkeeping — a column
  // thrown by hand moves the active preset to `"custom"`. Registering a
  // bare `setStudioColumnVisible` from the shell would let the status bar
  // print a preset name the columns no longer match. The Notebook page
  // registers all three (`routes/pages/Notebook/index.tsx`), which is also
  // where the state they read lives (R109).

  // One keydown handler for every menu shortcut, resolved through
  // `menuModel.ts` so the key a menu prints and the key that fires can
  // never drift apart. Undo and redo are deliberately excluded: they belong
  // to whichever editor has focus and its own keymap already handles them,
  // so intercepting them here would break typing in the code pane.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const id = commandForEvent(e);
      if (id === null || id === MENU_COMMAND_IDS.editUndo || id === MENU_COMMAND_IDS.editRedo) return;
      if (!runCommand(id)) return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const commands = useMemo(() => tabSwitchCommands(onNavigate), [onNavigate]);

  const shortcutLabels = useMemo(() => {
    const labels = {} as Record<RouteId, string | null>;
    const byRoute: Record<RouteId, string> = {
      device: MENU_COMMAND_IDS.goDevice,
      data: MENU_COMMAND_IDS.goData,
      notebook: MENU_COMMAND_IDS.goNotebook,
      settings: MENU_COMMAND_IDS.goSettings,
    };
    const items = MENUS.flatMap((menu) => menu.items);
    for (const route of ROUTES) {
      const item = items.find((entry) => entry.kind === "command" && entry.id === byRoute[route.id]);
      labels[route.id] = item !== undefined && item.kind === "command" ? formatShortcut(item.shortcut, commandGlyph) : null;
    }
    return labels;
  }, [commandGlyph]);

  const sidebarShortcut = formatShortcut({ key: "b", mod: true }, commandGlyph);

  return (
    <div className="flex h-screen w-screen flex-col bg-bg text-fg">
      {/* Narrow layouts have no menu bar beside the window controls (R220
          item 3), but a window with `decorations: false` still needs
          somewhere to drag, maximize and close. The same 32 px title bar
          serves both: at this width its menus collapse into one "⋯"
          button. Mounted on every platform when wide, and when narrow only
          where the app draws its own decorations — no platform with a
          native caption pays for a second one. */}
      {(!narrow || customTitleBar) && <TitleBar collapsed={narrow} />}

      <div className="flex min-h-0 flex-1">
        {!narrow && (
          <ActivityBar activeRoute={state.route} onNavigate={onNavigate} badges={badges} shortcutLabels={shortcutLabels} />
        )}
        {!narrow && !sidebar.collapsed && (
          <Sidebar
            activeRoute={state.route}
            widthPx={sidebar.widthPx}
            onWidthChange={(widthPx) => setSidebar((current) => ({ ...current, widthPx }))}
            onWidthSettled={(widthPx) => persistSidebar({ ...sidebar, widthPx })}
            onCollapse={toggleSidebar}
            collapseShortcut={sidebarShortcut}
          />
        )}
        {/* The editor area: the window-wide Notebook toolbar row above
            `RouteHost`'s content, both inside the area the activity bar and
            sidebar leave — R220 item 2's "dock zones dock into the editor
            area only, never into the chrome". The row itself carries no
            size until the active route portals real content into it
            (`ToolbarSlotRow.tsx`), so Data, Device and Settings never show
            an empty bar. */}
        <div className="flex min-w-0 min-h-0 flex-1 flex-col">
          <ToolbarSlotRow />
          <div className="min-h-0 flex-1">
            <RouteHost layout={layout} />
          </div>
        </div>
      </div>

      {narrow ? (
        <BottomBar activeRoute={state.route} onNavigate={onNavigate} badges={badges} />
      ) : (
        <StatusBar
          selection={state.selection}
          activePreset={activePreset}
          onCyclePreset={cycleLayoutPreset}
          onNavigate={onNavigate}
        />
      )}

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} engineVersion={state.engineVersion} />
      <Toaster />
    </div>
  );
}
