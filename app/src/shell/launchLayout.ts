import type { RouteId } from "../routes/types";

/** Which destination the app opens on (UI-DIRECTION Open questions, ruled
 *  R92): Device below 1200 px (the launch tab, decision 8), the studio
 *  layout (the Notebook route, whose wide layout docks Data to its left —
 *  UI-DIRECTION decision 20) above it, and the last layout is remembered
 *  across launches. `remembered` is `null` on a first run, in which case the
 *  width-based default applies; once a route has been remembered it wins
 *  regardless of the current width, so a deliberate switch to a narrow
 *  window does not silently bounce the user back to Device. */
export function initialRoute(widthPx: number, remembered: RouteId | null): RouteId {
  if (remembered !== null) return remembered;
  return widthPx < 1200 ? "device" : "notebook";
}
