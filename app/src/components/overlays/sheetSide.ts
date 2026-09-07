/** Sheets are a bottom sheet on narrow and a right-docked panel on wide
 *  (UI-DIRECTION "App shell and navigation"). One function so every caller
 *  agrees on the breakpoint, and so the rule is testable without a DOM. */
export type SheetSide = "bottom" | "right";

/** Picks the sheet's docking side for a viewport width in CSS pixels.
 *  Below 600 px (exclusive) docks to the bottom; 600 px and above docks
 *  right. Callers own the resize listener — this stays a pure function. */
export function sheetSideFor(widthPx: number): SheetSide {
  return widthPx < 600 ? "bottom" : "right";
}
