import { useEffect } from "react";

import { ROUTES } from "../routes/types";
import DevicePage from "../routes/pages/Device";
import DataPage from "../routes/pages/Data";
import NotebookPage from "../routes/pages/Notebook";
import SettingsPage from "../routes/pages/Settings";
import { useAppState } from "../state/AppState";
import { setActiveRoute } from "./routeVisibility";
import { usesColumns, type ShellLayout } from "./layout";
import ColumnFrame from "./ColumnFrame";
import { EditorSlotColumn } from "./EditorSlotColumn";
import { GraphSlotColumn } from "./GraphSlotColumn";
import { useStudioColumnVisible } from "./studioColumns";
import { useActiveLayoutPreset, useMathsOrientation } from "./layoutPreset";
import { presetLayout } from "./layoutPresets";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

/** Every destination's element, built once per render but reconciled by
 *  React against the same position (`RouteHost`'s `.map` below) every time
 *  — a route's page component instance survives a tab switch because
 *  neither its element type nor its position in the tree ever changes. */
const ROUTE_ELEMENTS = {
  device: <DevicePage />,
  data: <DataPage />,
  notebook: <NotebookPage />,
  settings: <SettingsPage />,
} as const;

/**
 * Renders every destination's page, always mounted, and hides every page but
 * the active one with the `hidden` attribute (UI-DIRECTION "Persistence":
 * "every destination and column keeps its state while hidden (mount-and-hide,
 * not unmount)" — decision 13, R93). `hidden` (plus the `[hidden]` CSS rule
 * in `shell.css`, needed because a page's own layout classes can otherwise
 * out-specificity the attribute's UA style) removes the inactive subtree
 * from the accessibility tree and tab order for free (R93 open question 1).
 *
 * Also keeps `shell/routeVisibility.tsx`'s module-scope "active route" store
 * current, so `Device/index.tsx`'s `STATUS_POLL_DEPS` composition (and any
 * later route-visibility consumer) can read it. This is a local state sync,
 * not an IPC effect — its dependency array is the route id alone (a string),
 * matching the effects rule's "data only" requirement.
 *
 * On the `wide` layout, the active Notebook route additionally docks inside
 * `ColumnFrame` — the "studio" layout (UI-DIRECTION decision 20's model:
 * "Notebook = maths graph + properties + output columns; Data docks left of
 * it"). The Notebook page element is still the single instance this
 * function always renders; `ColumnFrame` only changes where it sits. The
 * maths and properties columns are both empty containers that publish
 * their DOM node (`graphSlot.ts`, `editorSlot.ts`) for the Notebook page
 * to portal its real `GraphCanvas`/`EditorPanes` into — R109's rule, since
 * every value either one needs lives in that page. Every
 * other route fills the full width, unchanged, at every layout (Device is
 * explicitly single-column at every width per its per-tab direction).
 *
 * Each route's element is wrapped in its own {@link RouteErrorBoundary}
 * (mount-and-hide keeps every route's effects running whether or not it is
 * the active tab, so a throw in an *inactive* route had nothing to catch it
 * either — confirmed live, an uncaught effect throw in one always-mounted
 * route blanked the whole shell). The boundary is per route, not one
 * boundary around the whole `.map`, so one tab's failure never takes any
 * other tab, or the shell chrome around this component, down with it.
 */
export default function RouteHost({ layout }: { layout: ShellLayout }) {
  const [state] = useAppState();
  // R208 item 2: the Notebook toolbar's Graph toggle reaches the frame
  // here, so turning it off drops the `maths` panel and its divider
  // outright (`shell/columnVisibility.ts`'s `undefined` content rule,
  // R107's) instead of leaving a full-width column holding a placeholder
  // that explains where the toggle is.
  const graphColumnVisible = useStudioColumnVisible("graph");
  // R213 item 1: the Output preset takes the properties column away too —
  // "notebook output full width" cannot mean a placeholder panel beside it.
  const propertiesColumnVisible = useStudioColumnVisible("properties");
  // The frame's geometry half of a preset (the visibility half arrives
  // through the two toggles above, which the preset writes — R213 item 3:
  // "the toggles and the preset never disagree"). A `"custom"` class pins
  // no width; the orientation it kept is the store's, not the preset's.
  const activePreset = useActiveLayoutPreset();
  const mathsOrientation = useMathsOrientation();
  const outputWidthPx = activePreset === "custom" ? null : presetLayout(activePreset).outputWidthPx;

  useEffect(() => {
    setActiveRoute(state.route);
  }, [state.route]);

  const notebookInColumns = state.route === "notebook" && usesColumns(layout);

  return (
    <>
      {ROUTES.map((r) => {
        const isActive = state.route === r.id;
        const content =
          r.id === "notebook" && notebookInColumns ? (
            <ColumnFrame
              maths={graphColumnVisible ? <GraphSlotColumn /> : undefined}
              properties={propertiesColumnVisible ? <EditorSlotColumn /> : undefined}
              output={ROUTE_ELEMENTS.notebook}
              mathsOrientation={mathsOrientation}
              outputWidthPx={outputWidthPx}
            />
          ) : (
            ROUTE_ELEMENTS[r.id]
          );
        return (
          <div key={r.id} hidden={!isActive} data-route={r.id} className="shell-route-panel h-full">
            <RouteErrorBoundary routeLabel={r.label}>{content}</RouteErrorBoundary>
          </div>
        );
      })}
    </>
  );
}
