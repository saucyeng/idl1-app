/** The three shell layouts (UI-DIRECTION "App shell and navigation").
 *  Breakpoints are 600 px and 1200 px, in CSS px, matching idl0's 600 dp
 *  bottom-bar switch (FLUTTER-UI-SURVEY §5). */
export type ShellLayout = "narrow" | "medium" | "wide";

/** Narrow below 600 px, medium from 600 px up to (not including) 1200 px,
 *  wide from 1200 px up (UI-DIRECTION "App shell and navigation"). */
export function resolveLayout(widthPx: number): ShellLayout {
  if (widthPx < 600) return "narrow";
  if (widthPx < 1200) return "medium";
  return "wide";
}

/** Where navigation lives in a layout: bottom bar on narrow, top bar above
 *  (UI-DIRECTION "App shell and navigation"). */
export function navPlacement(layout: ShellLayout): "bottom" | "top" {
  return layout === "narrow" ? "bottom" : "top";
}

/** Whether the wide dockable column frame is used at all — only the `wide`
 *  layout gets the multi-column studio (UI-DIRECTION decision 11). */
export function usesColumns(layout: ShellLayout): boolean {
  return layout === "wide";
}
