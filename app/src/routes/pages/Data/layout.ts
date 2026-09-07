import { resolveLayout } from "../../../shell/layout";

/** How one pane (the filter rail or the detail pane) is presented at a given
 *  shell layout: a fixed-width docked column on wide, a flexible docked
 *  panel on medium (no fixed width — it shares the row with the results
 *  panel), or a `Sheet` overlay on narrow (UI-DIRECTION "Data"). */
export type PaneMode = "docked" | "panel" | "sheet";

/** The Data tab's own arrangement for a viewport width, derived from the
 *  shell's `resolveLayout` boundaries (600 px / 1200 px) so the two never
 *  drift apart. */
export interface DataLayout {
  rail: PaneMode;
  detail: PaneMode;
  /** 280 px on wide, `null` on medium/narrow (no fixed rail width there). */
  railWidthPx: number | null;
  /** 320 px on wide, `null` on medium/narrow (no fixed detail width there). */
  detailWidthPx: number | null;
}

/** The wide layout's fixed rail width, in CSS px (UI-DIRECTION "Data"). */
const RAIL_WIDTH_PX = 280;

/** The wide layout's fixed detail-pane width, in CSS px (UI-DIRECTION "Data"). */
const DETAIL_WIDTH_PX = 320;

/** How the Data tab arranges itself at a given width (UI-DIRECTION "Data").
 *  The rail is a docked column on wide, a docked panel on medium and a bottom
 *  sheet on narrow; the detail pane follows the same ladder. Pure so the
 *  breakpoints are tested without a DOM, and so the rail and the detail pane
 *  cannot drift apart. */
export function dataLayout(widthPx: number): DataLayout {
  const shell = resolveLayout(widthPx);

  if (shell === "wide") {
    return { rail: "docked", detail: "docked", railWidthPx: RAIL_WIDTH_PX, detailWidthPx: DETAIL_WIDTH_PX };
  }

  if (shell === "medium") {
    return { rail: "panel", detail: "panel", railWidthPx: null, detailWidthPx: null };
  }

  return { rail: "sheet", detail: "sheet", railWidthPx: null, detailWidthPx: null };
}
