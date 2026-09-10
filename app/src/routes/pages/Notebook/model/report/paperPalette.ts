/**
 * The paper view's palette, chosen by the user's own paper theme (ruling
 * R185 item 3): `"app"` follows the app's live tokens, `"light"` and
 * `"dark"` force one regardless of what the app is set to. Isaac's reason
 * for a second toggle at all is daylight: a dark notebook read on a phone
 * at a trailside is not the same problem as a dark notebook read indoors.
 *
 * **Never the print palette (R185 item 3).** `printPalette.ts` belongs to
 * the printed page and is frozen for it (R174: no live token reads, ever).
 * Paper's light values are its own, authored here, for the same reason
 * print's are authored there — a screen forced light and a sheet of A4 are
 * different media that happen to share a background colour today. The
 * duplication of "hues at contrast against white" between the two modules
 * is real and deliberate; unifying them would put one palette under two
 * rulings' constraints at once.
 *
 * **First pass, not brand-approved** — the same status R174 gives print's:
 * the eight light-mode series colours below are `tokens.css`'s own hues at
 * a lightness lowered until each clears {@link PAPER_LIGHT_CONTRAST_TARGET}
 * against white. Isaac is expected to retune them; nothing here needs
 * archaeology to change.
 *
 * Colour literals live in this module by the same exemption
 * `printPalette.ts` carries: defining a palette is its entire job.
 * DOM-free — the `CssVarReader` is injected, so every branch below is
 * testable with no browser.
 */
import type { PaperTheme } from "../../../Settings/theme";
import type { CssVarReader } from "../../theme/series";
import type { PlotThemeOptions } from "../../theme/plotTheme";
import type { PrintPalette } from "./printPalette";
import { buildScreenPalette } from "./screenPalette";

/** The two schemes paper can actually be drawn in — what {@link PaperTheme}
 *  resolves to once `"app"` has been followed. */
export type PaperScheme = "light" | "dark";

/** The WCAG 2.x contrast ratio every {@link PAPER_LIGHT_SERIES_COLOURS}
 *  entry meets or exceeds against white. 4.5:1 is WCAG AA for normal text;
 *  paper holds a chart stroke to the same floor its own body text must
 *  clear rather than inventing a laxer graphics-only threshold. */
export const PAPER_LIGHT_CONTRAST_TARGET = 4.5;

/** The eight light-mode series colours, in `--chart-1`…`--chart-8` slot
 *  order — `tokens.css`'s hues, darkened until each clears
 *  {@link PAPER_LIGHT_CONTRAST_TARGET} against white. Slot order and hue
 *  are preserved so a lap Isaac recognises in the dark app is the same lap
 *  in light paper. */
export const PAPER_LIGHT_SERIES_COLOURS: readonly string[] = [
  "#1477d8", // --chart-1 azure #5ba6f0, darkened
  "#24874c", // --chart-2 green #35c46e, darkened
  "#8c7408", // --chart-3 amber #f5d547, darkened
  "#b36117", // --chart-4 orange #e8964b, darkened
  "#9954db", // --chart-5 violet #b98ae6, darkened
  "#25837d", // --chart-6 teal #3fc9c0, darkened
  "#dd287a", // --chart-7 rose #e86fa6, darkened
  "#da3944", // --chart-8 coral #e05a63, darkened
];

/** Matches a `--chart-N` token — the only colour shape this codebase emits
 *  for a window (ruling R117 item 6). */
const CHART_TOKEN_RE = /^--chart-([1-8])$/;

/** An unresolvable token's colour: the surrounding text colour, so one bad
 *  token degrades a swatch rather than aborting the page. */
const FALLBACK_COLOUR = "currentColor";

/** Tick/axis-label font size, in pixels — `plotTheme.ts`'s own value, so a
 *  light-paper chart's type scale matches the app's even though its
 *  colours do not. */
const TICK_FONT_SIZE_PX = 11;

/** Left margin sized for six tabular digits, mirroring `plotTheme.ts`'s
 *  estimate at the same font size. */
const MARGIN_LEFT_PX = Math.round(6 * TICK_FONT_SIZE_PX * 0.6) + 12;

/** Axis text and rules on light paper — near-black, so a hairline grid at
 *  this colour does not read heavier than the body text beside it. */
const PAPER_LIGHT_AXIS_COLOUR = "#1a1a1a";

/** A grid line light enough to read through, dark enough to see on white. */
const PAPER_LIGHT_GRID_COLOUR = "#b3b3b3";

/** Light paper's mono stack, matching what `styles/paper.css` sets on the
 *  light scope. Hardcoded rather than read from `--font-mono`: a forced
 *  scheme reads no live token, or it would not be forced. */
const PAPER_LIGHT_FONT_FAMILY = '"IBM Plex Mono", monospace';

/** The plot theme light paper draws charts with. */
const PAPER_LIGHT_PLOT_THEME: PlotThemeOptions = {
  style: {
    background: "white",
    color: PAPER_LIGHT_AXIS_COLOUR,
    fontFamily: PAPER_LIGHT_FONT_FAMILY,
    fontVariantNumeric: "tabular-nums",
    fontSize: `${TICK_FONT_SIZE_PX}px`,
  },
  grid: PAPER_LIGHT_GRID_COLOUR,
  marginLeft: MARGIN_LEFT_PX,
};

/**
 * Which scheme `choice` is actually drawn in.
 *
 * `"app"` follows the app, and the app is dark: `tokens.css` authors no
 * light theme at all (decision 5's non-goal, asserted by
 * `styles/tokenSheet.test.ts`), so "follow the app" and "force dark" agree
 * today and will stop agreeing by themselves the day light tokens land —
 * which is why `"app"` is a stored choice rather than a synonym written
 * into the pref.
 *
 * @param choice - The user's stored paper theme.
 */
export function paperScheme(choice: PaperTheme): PaperScheme {
  return choice === "light" ? "light" : "dark";
}

/**
 * The palette paper draws with under `choice`.
 *
 * `"light"` gets this module's own fixed values. `"app"` and `"dark"` both
 * read the app's live tokens through `buildScreenPalette` — the app's own
 * palette *is* the dark one today ({@link paperScheme}), and reading it
 * live means a retuned `--chart-N` shows up on paper with no second edit
 * here.
 *
 * @param choice - The user's stored paper theme.
 * @param read - Resolves a CSS custom property (`documentVars()` in the app).
 */
export function buildPaperPalette(choice: PaperTheme, read: CssVarReader): PrintPalette {
  if (paperScheme(choice) === "dark") return buildScreenPalette(read);

  return {
    theme: PAPER_LIGHT_PLOT_THEME,
    seriesColours: PAPER_LIGHT_SERIES_COLOURS,
    resolve: (token: string) => {
      const match = CHART_TOKEN_RE.exec(token);
      if (match === null) return FALLBACK_COLOUR;
      return PAPER_LIGHT_SERIES_COLOURS[Number(match[1]) - 1];
    },
  };
}
