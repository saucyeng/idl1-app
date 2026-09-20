import { useCallback, useEffect, useRef } from "react";
import { DockviewReact, type DockviewApi, type DockviewReadyEvent, type IDockviewPanelProps, type DockviewTheme } from "dockview-react";

import { runCommand } from "./commandRegistry";
import {
  DOCK_PANEL_COMPONENT,
  DOCK_PANEL_IDS,
  DOCK_PANEL_TITLES,
  dockLayoutPanelIds,
  dockPanelDiff,
  dockPanelInsertion,
  isDockPanelId,
  type DockPanelId,
} from "./dockLayout";
import { useDockLayoutApplication, noteDockLayoutChanged } from "./layoutPreset";
import { MENU_COMMAND_IDS } from "./menuModel";
import { setEditorSlotNode } from "./editorSlot";
import { setGraphSlotNode } from "./graphSlot";
import { setOutputSlotNode } from "./outputSlot";
import { getStudioColumnVisible, subscribeStudioColumns } from "./studioColumns";

/** The `commandRegistry.ts` id whose handler shows or hides each panel —
 *  the Notebook page's own three ribbon/View-menu toggles. Closing a tab
 *  runs the same command the button does, so there is one path from "this
 *  panel should go away" to the page's stored visibility, and the ribbon
 *  can never be left pressed for a panel that is not on screen (R239,
 *  brief item 2: "toggles reflect panel presence"). */
const TOGGLE_COMMAND: Readonly<Record<DockPanelId, string>> = {
  graph: MENU_COMMAND_IDS.viewToggleGraph,
  properties: MENU_COMMAND_IDS.viewToggleProperties,
  cells: MENU_COMMAND_IDS.viewToggleCells,
};

/** Publishes each panel's container DOM node to that panel's slot store.
 *  `graphSlot`/`editorSlot` predate R239 (R109); `outputSlot` is its own
 *  file's doc comment. */
const PUBLISH_SLOT: Readonly<Record<DockPanelId, (node: HTMLDivElement | null) => void>> = {
  graph: setGraphSlotNode,
  properties: setEditorSlotNode,
  cells: setOutputSlotNode,
};

/** idl1's Dockview theme: the class `styles/dock.css` declares, plus the
 *  behavioural choices that are theme-level rather than CSS.
 *
 *  `colorScheme` is deliberately omitted — the app's palette is the
 *  document's (`tokens.css`), and naming one here would pin the dock to
 *  dark while the rest of the shell followed a light `data-theme`. */
const IDL1_THEME: DockviewTheme = {
  name: "idl1",
  className: "dockview-theme-idl1",
  dndPanelOverlay: "group",
  dndTabIndicator: "line",
};

/** How long the dock must sit still after a drag or resize before its
 *  layout is written to storage, in milliseconds. Dockview reports a
 *  layout change per pointer move during a sash drag; `aspectClass.ts`'s
 *  own settle window is reused so the two gestures feel the same and a
 *  `localStorage` write never lands mid-drag (R201: nothing blocks the
 *  main thread). */
const LAYOUT_SETTLE_MS = 200;

/**
 * One dock panel: an empty container that publishes its DOM node, nothing
 * more.
 *
 * All three panels are this component. Their content is portalled in by
 * `routes/pages/Notebook/index.tsx`, which stays mounted where
 * `RouteHost.tsx` has always rendered it — see `outputSlot.ts` on why the
 * Notebook panel had to join the other two in that arrangement rather than
 * holding the page itself.
 *
 * It is also what answers R239's brief item 4. Because a panel's React
 * subtree is one `<div>` with no state, Dockview may move it between
 * groups as freely as it likes: React re-renders nothing, the portal keeps
 * pointing at the same element, and the notebook's cells, the maths
 * canvas and the code editor never see a re-dock at all.
 */
function DockPanel(props: IDockviewPanelProps) {
  const id = props.api.id;
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isDockPanelId(id)) return;
    const publish = PUBLISH_SLOT[id];
    publish(ref.current);
    return () => publish(null);
  }, [id]);

  return <div ref={ref} className="h-full w-full overflow-auto" data-dock-panel={id} />;
}

const DOCK_COMPONENTS = { [DOCK_PANEL_COMPONENT]: DockPanel };

/**
 * The studio's tiling frame (ruling R239, closing R227): Notebook, Maths
 * and Code as Dockview panels in a split tree the user drags, splits,
 * resizes and closes, inside the shell body that R220 built — the activity
 * bar, sidebar, ribbon and status bar around it are untouched.
 *
 * This replaces `ColumnFrame.tsx`'s fixed left-to-right columns. What it
 * keeps from them: the three panels, their reference order, the per-aspect
 * -class memory, and the four named arrangements, which are now
 * `dockLayout.ts` documents rather than four writes over a visibility
 * record.
 *
 * ## The two directions
 *
 * Layout flows **in** from `layoutPreset.ts` whenever that store applies
 * something the user did not do here: a named layout picked from the
 * ribbon, or the viewport changing shape and recalling that class's stored
 * arrangement. Those are the only times `fromJSON` runs, which is why the
 * store carries an epoch rather than being compared by value — a layout
 * the dock itself just reported must never be pushed back into it, or a
 * sash drag would tear the grid down under the pointer.
 *
 * Layout flows **out** on every settled gesture, through
 * `noteDockLayoutChanged`, which decides whether the arrangement is still
 * one of the four named ones and persists it either way.
 *
 * Panel *presence* is a third, narrower channel, and it runs both ways:
 * the page's three toggles say which panels should exist
 * (`studioColumns.ts`), and a tab closed here runs the same command those
 * toggles do. Neither side writes the other's state directly, so a close
 * by either route converges to the same place in one round trip.
 */
export default function DockFrame() {
  const apiRef = useRef<DockviewApi | null>(null);
  const application = useDockLayoutApplication();
  // The epoch already pushed into the dock. Starts at -1 so the first
  // render always applies, whatever epoch the store is on by then.
  const appliedEpochRef = useRef(-1);
  // True while `fromJSON` is tearing the grid down and rebuilding it.
  // Dockview reports every panel of the old layout as removed during that,
  // and acting on those would toggle off panels the new layout is about to
  // re-add.
  const applyingRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** The panels the page's toggles currently ask for, in reference order. */
  const desiredPanels = useCallback(
    (): DockPanelId[] => DOCK_PANEL_IDS.filter((id) => getStudioColumnVisible(id)),
    []
  );

  /** The panels the dock actually holds, in reference order. */
  const presentPanels = useCallback((api: DockviewApi): DockPanelId[] => {
    const ids = new Set(api.panels.map((panel) => panel.id));
    return DOCK_PANEL_IDS.filter((id) => ids.has(id));
  }, []);

  /** Runs `id`'s toggle command unless the page already agrees — the
   *  commands are flips, not setters, so asking twice would undo the
   *  first. A command with no registration (the page unmounted, or the
   *  toggle unavailable at paper widths) simply does not run, and the next
   *  reconcile puts the dock back. */
  const requestVisibility = useCallback((id: DockPanelId, next: boolean) => {
    if (getStudioColumnVisible(id) === next) return;
    runCommand(TOGGLE_COMMAND[id]);
  }, []);

  /** Adds or removes panels until the dock holds exactly what the page's
   *  toggles ask for. A no-op in the common case, which is every
   *  notification about a panel that is already where it belongs. */
  const reconcile = useCallback(() => {
    const api = apiRef.current;
    if (api === null || applyingRef.current) return;

    const present = presentPanels(api);
    const { add, remove } = dockPanelDiff(present, desiredPanels());

    for (const id of remove) {
      const panel = api.getPanel(id);
      if (panel !== undefined) api.removePanel(panel);
    }
    // Re-read after the removals: an insertion's reference panel has to be
    // one that is still docked.
    let docked = presentPanels(api);
    for (const id of add) {
      const where = dockPanelInsertion(id, docked);
      api.addPanel({
        id,
        component: DOCK_PANEL_COMPONENT,
        title: DOCK_PANEL_TITLES[id],
        // See `dockLayout.ts`'s `panelStates`: overlay rendering is what
        // keeps a moved panel from being reparented, and with it the
        // scroll offsets and iframes inside.
        renderer: "always",
        ...(where.referencePanel === null
          ? {}
          : { position: { referencePanel: where.referencePanel, direction: where.direction } }),
      });
      docked = presentPanels(api);
    }
  }, [desiredPanels, presentPanels]);

  /**
   * Runs {@link reconcile} once the current task has finished.
   *
   * The safety net for a toggle the page *refuses*. `applyColumnToggleValue`
   * carries `notebookColumns.ts`'s never-all-off guard, which returns the
   * previous visibility **by reference** when a change would hide every
   * panel. Nothing then changes, so `studioColumns.ts` never notifies and
   * the subscription below never fires — and Dockview has meanwhile closed
   * the panel anyway. Closing the last panel by its tab used to strand the
   * dock empty with the ribbon still saying that panel was on, and with
   * its toggle a no-op for exactly the same reason (reviewer, 2026-09-20).
   *
   * Deferred rather than called straight away because the round trip runs
   * through React: `runCommand` sets page state, which is flushed at the
   * end of the dispatching event, and only then does the page publish the
   * new visibility. A reconcile in the same tick would read the *old*
   * desired set and put back a panel the user genuinely did close. A zero
   * timeout is a macrotask, so it lands after that flush; asking the model
   * again beats re-deriving its guard's rule here, which is how the dock
   * and the toggles came to hold two pictures of the same state in the
   * first place.
   */
  const scheduleReconcile = useCallback(() => {
    clearTimeout(reconcileTimerRef.current);
    reconcileTimerRef.current = setTimeout(reconcile, 0);
  }, [reconcile]);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    // The layout is applied by the effect below rather than here, so
    // start-up and a later change take exactly one path.
    appliedEpochRef.current = -1;
  }, []);

  // Layout in: only on a new epoch, only from the store.
  useEffect(() => {
    const api = apiRef.current;
    if (api === null || appliedEpochRef.current === application.epoch) return;
    appliedEpochRef.current = application.epoch;

    applyingRef.current = true;
    try {
      api.fromJSON(application.layout);
    } catch {
      // `sanitizeDockLayout` has already rejected everything this build
      // cannot construct, so reaching here means Dockview refused a
      // document that passed validation. The dock is left holding whatever
      // it had; losing a remembered arrangement is not worth a blank
      // studio, and the next gesture persists a good one over it.
    } finally {
      applyingRef.current = false;
    }

    // The applied layout is now the authority on which panels exist, so
    // the toggles follow it rather than the other way round — a stored
    // arrangement with Maths closed must leave the ribbon's Maths button
    // unpressed, not immediately re-open the panel.
    const applied = dockLayoutPanelIds(application.layout) ?? [];
    for (const id of DOCK_PANEL_IDS) requestVisibility(id, applied.includes(id));
  }, [application, requestVisibility]);

  // Panel presence in: the page's toggles.
  useEffect(() => subscribeStudioColumns(reconcile), [reconcile]);

  // Layout out: every settled gesture, and every panel closed by its tab.
  useEffect(() => {
    const api = apiRef.current;
    if (api === null) return;

    const persistSettled = () => {
      // Tested here, at *schedule* time, not inside the callback:
      // `applyingRef` is back to false within the same tick `fromJSON`
      // ran in, so a check 200 ms later would always pass and the guard
      // would guard nothing (reviewer, 2026-09-20). A layout change the
      // restore itself caused is not a gesture and must not be persisted
      // back over the document it came from.
      if (applyingRef.current) return;
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(() => {
        const live = apiRef.current;
        if (live === null) return;
        noteDockLayoutChanged(live.toJSON());
      }, LAYOUT_SETTLE_MS);
    };

    const disposables = [
      api.onDidLayoutChange(persistSettled),
      api.onDidRemovePanel((panel) => {
        if (applyingRef.current || !isDockPanelId(panel.id)) return;
        // A tab's close button, or a drag that emptied a group. The page
        // owns whether a panel is "on", so tell it rather than recording
        // it here — and then ask it again, because it is allowed to say
        // no (see `scheduleReconcile`).
        requestVisibility(panel.id, false);
        scheduleReconcile();
      }),
    ];

    return () => {
      clearTimeout(settleTimerRef.current);
      clearTimeout(reconcileTimerRef.current);
      for (const disposable of disposables) disposable.dispose();
    };
    // `apiRef.current` is set in `onReady`, which fires before this effect
    // on the mount that creates the dock; `application` re-runs it after,
    // which is harmless (the listeners are disposed above) and is what
    // gets them attached if `onReady` somehow lands later.
  }, [application, requestVisibility, scheduleReconcile]);

  return (
    <DockviewReact
      className="h-full w-full"
      components={DOCK_COMPONENTS}
      theme={IDL1_THEME}
      onReady={onReady}
      defaultRenderer="always"
      // R218, kept by R239: dock zones, not free windowing. Panels never
      // float, never pop out into their own window and never overlap.
      disableFloatingGroups
      hideBorders
      singleTabMode="fullwidth"
      noPanelsOverlay="emptyGroup"
    />
  );
}
