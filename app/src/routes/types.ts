/** The app's top-level tabs (design §10 L6/L7 scope: notebook viewer,
 *  device connection, data/catalog browser, settings; the drivetrain
 *  simulator added 2026-11-19). No nested routing in
 *  v1 — a flat tab switch is sufficient for a four-screen desktop/mobile
 *  shell and needs no routing library (see this plan's Open Questions). */
export type RouteId = "notebook" | "device" | "data" | "simulate" | "settings";

/** Tab order per UI-DIRECTION decision 10 (also the shell's bottom-bar/
 *  top-bar order): Device the field tool, Data the library, Notebook the
 *  workspace, Settings last. */
export const ROUTES: readonly { id: RouteId; label: string }[] = [
  { id: "device", label: "Device" },
  { id: "data", label: "Data" },
  { id: "notebook", label: "Notebook" },
  // after the notebook (Isaac, 2026-11-19; drivetrain sim spec §7)
  { id: "simulate", label: "Simulate" },
  { id: "settings", label: "Settings" },
];
