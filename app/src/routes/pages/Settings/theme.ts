/** This machine's appearance preferences. Both are `ui` keys: they live in
 *  `localStorage` through `prefsStore.ts`'s `PrefsBackend`, never in
 *  `settings.json` (R78 L7c Task 8 — `ui` keys stay local). */
export type ThemeChoice = "dark" | "system";

/** The Notebook paper view's own theme (ruling R185 item 3): a second
 *  toggle beside the app's, because paper is read in daylight where the
 *  app's dark palette can be unreadable, and the two choices are genuinely
 *  independent. `"app"` follows whatever the app theme resolves to;
 *  `"light"` and `"dark"` force one regardless of it. Like
 *  {@link ThemeChoice} this is a `ui` key -- per machine, never synced.
 *
 *  Where it is applied: `Notebook/model/report/paperPalette.ts` (the chart
 *  and swatch colours) and `styles/paper.css`'s `[data-paper-theme]` scope
 *  (the page's own text and rules). Never the print palette (R174), which
 *  belongs to the printed document alone. */
export type PaperTheme = "app" | "light" | "dark";

/** The notebook output register (UI-DIRECTION decision 31, R92/R93):
 *  `paper` is prose-oriented, `studio` is dense chrome. Switchable here and
 *  in the worksheet bar (UI-10); this module only decides the value, it
 *  never renders either register. */
export type OutputRegister = "paper" | "studio";

/** Width, in pixels, at and above which {@link resolveRegister} picks
 *  `studio` when the user has made no explicit choice — the same "wide"
 *  threshold the app shell uses for its desktop column layout
 *  (UI-DIRECTION "App shell and navigation"). */
const WIDE_REGISTER_BREAKPOINT_PX = 1200;

/** The `data-theme` attribute value for `choice`, or `null` when nothing
 *  should be stamped on the document.
 *
 * Dark is authored and is the default: `choice === "dark"` always stamps
 * `"dark"`. `"system"` follows the OS: when the OS prefers a light scheme
 * (`prefersLight`) this returns `null` rather than a `"light"` value,
 * because no light tokens exist yet (decision 5, non-goal) — the dark
 * `:root` values keep applying by simply not being overridden. When the OS
 * does not prefer light (i.e. it is dark, or has no preference), `"system"`
 * also stamps `"dark"`.
 *
 * @param choice - The user's stored theme choice.
 * @param prefersLight - The live `(prefers-color-scheme: light)` match, for
 *  `"system"`. Ignored when `choice` is `"dark"`.
 * @returns `"dark"`, or `null` when nothing should be stamped. */
export function themeAttribute(choice: ThemeChoice, prefersLight: boolean): string | null {
  if (choice === "dark") {
    return "dark";
  }
  return prefersLight ? null : "dark";
}

/** Resolves the effective output register for a viewport, applying R92/R93's
 *  default (paper on narrow, studio on wide) only when the user has made no
 *  explicit choice.
 *
 * @param stored - The user's saved choice (`UiPrefs.output_register`), or
 *  `null` when they have not chosen one yet.
 * @param widthPx - The current viewport width, in pixels.
 * @returns `stored` unchanged when set; otherwise `"studio"` at or above
 *  {@link WIDE_REGISTER_BREAKPOINT_PX} and `"paper"` below it. */
export function resolveRegister(stored: OutputRegister | null, widthPx: number): OutputRegister {
  if (stored !== null) {
    return stored;
  }
  return widthPx >= WIDE_REGISTER_BREAKPOINT_PX ? "studio" : "paper";
}
