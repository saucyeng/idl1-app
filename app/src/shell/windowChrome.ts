/**
 * Whether this platform's window is drawn by us or by the operating system,
 * and what the window-control cluster contains when it is ours (ruling
 * R216 item 1). Isaac, 2026-09-11: "the outermost shell with
 * minimize/maximize/close inline with the File/Edit dropdowns, like VS
 * Code, to save the 10 px and look nicer".
 *
 * Pure and dependency-free (`toolbarLayout.ts`'s pattern): no `react`
 * import, no DOM, no Tauri. The caller passes the user agent in and wires
 * the buttons; this module only decides.
 */

/**
 * The title bar's height in CSS px — R216 item 1's own number, and the
 * whole point of the exercise: the native Windows caption is 32 px and the
 * old top bar was 44 px *below* it, so folding one into the other gives the
 * notebook back a caption's worth of vertical space.
 *
 * Matches `--space-8` in `tokens.css`; stated here as a number because the
 * layout decisions in this module are arithmetic, not CSS.
 */
export const TITLE_BAR_HEIGHT_PX = 32;

/**
 * True when this build draws its own title bar, which today means Windows
 * only (ruling R216 item 1: "Windows first ... macOS/Linux keep native
 * decorations until a platform lane tests them").
 *
 * The platform is read from the user agent rather than from
 * `@tauri-apps/plugin-os`, because the decision is a rendering one — which
 * pixels the shell paints — and adding a plugin, a capability and an async
 * round trip to answer it would be all three in the wrong layer. The
 * matching `decorations: false` lives in `tauri.windows.conf.json`, which
 * Tauri merges over `tauri.conf.json` on Windows and nowhere else, so the
 * two halves of this decision are made by the same platform test.
 *
 * A non-Tauri browser (`npm run dev` in a plain tab) on Windows also
 * reports Windows and gets the custom bar. That is deliberate: the layout
 * is what is being developed, and the buttons degrade to no-ops rather than
 * throwing (`WindowControls.tsx`).
 *
 * @param userAgent Normally `navigator.userAgent`.
 */
export function usesCustomTitleBar(userAgent: string): boolean {
  return /\bWindows\b/i.test(userAgent);
}

/** The three window controls, left to right, in the order Windows places
 *  them. `maximize` is a toggle: it restores a maximized window. */
export type WindowControlId = "minimize" | "maximize" | "close";

/** {@link WindowControlId}'s members in rendering order. */
export const WINDOW_CONTROL_ORDER: readonly WindowControlId[] = ["minimize", "maximize", "close"];

/**
 * The accessible name for one control. `maximize` is the only one that
 * changes with state — a maximized window's middle button restores it, and
 * saying "Maximize" there would be a lie to a screen reader even though the
 * glyph already flips.
 *
 * @param id Which control.
 * @param maximized Whether the window is currently maximized.
 */
export function windowControlLabel(id: WindowControlId, maximized: boolean): string {
  switch (id) {
    case "minimize":
      return "Minimize";
    case "maximize":
      return maximized ? "Restore down" : "Maximize";
    case "close":
      return "Close";
  }
}
