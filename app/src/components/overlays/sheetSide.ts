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

/** The height cap a sheet on `side` needs so its body scrolls. A bottom
 *  sheet is `h-auto`: without a cap, content taller than the screen pushed
 *  the title row and close control off the top, the body never overflowed,
 *  and the modal blocked every other scroll, so the screen looked frozen
 *  (a session detail with ~40 channels on a phone, 2026-11-03). A
 *  right-docked sheet is already `h-full`. */
export function sheetHeightClassFor(side: SheetSide): string {
  return side === "bottom" ? "max-h-dvh" : "";
}
