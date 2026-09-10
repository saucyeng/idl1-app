/**
 * The eight series colours for a **white ground**, shared by every view
 * that draws one (ruling R186): the printed report
 * (`printPalette.ts`) and the paper view forced light
 * (`paperPalette.ts`). One module owns the values, tested once, so a print
 * chart and a paper chart can never disagree about what series 3 is.
 *
 * What is *not* shared is each view's own page furniture — print's grid,
 * axis text and black-on-white page belong to print, paper's to paper.
 * R185 item 3's "never the print palette" means paper does not call
 * `buildPrintPalette`; the series hues themselves are data, not one view's
 * property (R186).
 *
 * **Derived from `tokens.css`, not replaced** (R174 item 3): each entry is
 * that slot's own `--chart-N` hue at a lightness lowered until its WCAG
 * relative-luminance contrast ratio against white first reached
 * {@link WHITE_CONTRAST_TARGET} — a numeric search, since WCAG's formula
 * has no closed-form inverse for lightness. Keeping hue and slot order
 * means a chart Isaac recognises on screen is recognisably the same chart
 * on white.
 *
 * **A first pass chosen for contrast, not a brand-approved palette** (R174
 * item 4). Isaac is expected to retune these; nothing here should require
 * archaeology to change.
 *
 * Colour literals are permitted in this module for the same reason
 * `tokens.css` and `printPalette.ts` carry the exemption: defining a
 * palette is its entire job.
 */

/**
 * The WCAG 2.x contrast ratio every {@link SERIES_ON_WHITE} entry meets or
 * exceeds against white (`#ffffff`). 4.5:1 is the WCAG AA floor for normal
 * text; a chart stroke is thinner than body text, but there is no
 * chart-specific standard to reach for, so these are held to the same
 * floor the page's own text must clear rather than a laxer graphics-only
 * threshold.
 */
export const WHITE_CONTRAST_TARGET = 4.5;

/**
 * The eight colours, in `--chart-1`…`--chart-8` slot order. Each actually
 * clears ~4.51–4.55:1 against white — the search stopped at the first
 * lightness that met {@link WHITE_CONTRAST_TARGET}, it did not aim past it.
 */
export const SERIES_ON_WHITE: readonly string[] = [
  "#1477d8", // --chart-1 azure #5ba6f0, darkened
  "#24874c", // --chart-2 green #35c46e, darkened
  "#8c7408", // --chart-3 amber #f5d547, darkened
  "#b36117", // --chart-4 orange #e8964b, darkened
  "#9954db", // --chart-5 violet #b98ae6, darkened
  "#25837d", // --chart-6 teal #3fc9c0, darkened
  "#dd287a", // --chart-7 rose #e86fa6, darkened
  "#da3944", // --chart-8 coral #e05a63, darkened
];
