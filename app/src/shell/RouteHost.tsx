import { useEffect } from "react";

import { ROUTES } from "../routes/types";
import DevicePage from "../routes/pages/Device";
import DataPage from "../routes/pages/Data";
import NotebookPage from "../routes/pages/Notebook";
import SettingsPage from "../routes/pages/Settings";
import { useAppState } from "../state/AppState";
import { setActiveRoute } from "./routeVisibility";
import { usesColumns, type ShellLayout } from "./layout";
import ColumnFrame, { ColumnPlaceholder } from "./ColumnFrame";
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
 * function always renders; `ColumnFrame` only changes where it sits. Every
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
              maths={<ColumnPlaceholder>Maths graph — reserved (UI-DIRECTION decision 11)</ColumnPlaceholder>}
              properties={<ColumnPlaceholder>Cell properties — reserved for a later lane</ColumnPlaceholder>}
              output={ROUTE_ELEMENTS.notebook}
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
