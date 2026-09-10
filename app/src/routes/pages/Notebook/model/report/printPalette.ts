/**
 * The report's own print palette and plot theme (ruling R174). `ReportView`
 * renders onto a page `styles/report-print.css` forces to `color: black;
 * background: white` — the screen's dark-theme `seriesPalette`/`plotTheme`
 * (`theme/series.ts`, `theme/plotTheme.ts`), read from `tokens.css` via
 * `documentVars()`, are illegible there: amber `--chart-3` is a highlighter
 * stroke on white, a `#353a32` grid disappears, `#9a968a` axis text washes
 * out. This module supplies the report's own, static replacements. **No
 * `documentVars()` here, or anywhere on the report path** — these values do
 * not read the live document's custom properties; that is the point (R174
 * item 1).
 *
 * The eight series colours below are **derived from `tokens.css`'s
 * `--chart-1`…`--chart-8` hues, not replaced** (R174 item 3): same hue, same
 * slot order, lightness lowered until each clears {@link
 * PRINT_CONTRAST_TARGET} against white. This is a **first pass chosen for
 * contrast, not a brand-approved palette** (R174 item 4) — Isaac is expected
 * to retune these; nothing here should require archaeology to change.
 *
 * **One call site, one value, both consumers (R174's expensive half).**
 * `ReportView` calls {@link buildPrintPalette} exactly once per report
 * render and threads the single {@link PrintPalette} it returns to both the
 * `chartSlot` charts (`theme`/`seriesColours`, fed straight to
 * `renderChart`) and every `--chart-N` swatch/border it draws (`resolve`).
 * There is deliberately no second way to turn a `--chart-N` token into a
 * colour on the report path — if there were, a future edit could update one
 * without the other, and the report's own colour key (the selection block,
 * ruling R173) would silently start lying about which line is which.
 *
 * Colour literals are permitted in this module only — the same exemption
 * `tokens.css` and `report-print.css` already carry, because this module's
 * entire job is defining a palette (`tokenSheet.test.ts` bans hex/rgb
 * literals everywhere else). The eight series colours themselves now live
 * in `seriesOnWhite.ts` (R186); what is left here is print's own page
 * furniture.
 */
import type { PlotThemeOptions } from "../../theme/plotTheme";
import { SERIES_ON_WHITE, WHITE_CONTRAST_TARGET } from "./seriesOnWhite";

/** The contrast ratio {@link PRINT_SERIES_COLOURS} is tuned to against
 *  white — `seriesOnWhite.ts`'s own target, re-exported under print's
 *  established name (ruling R186: one module owns these values, tested
 *  once; this name is what print's existing callers and tests already
 *  say). */
export const PRINT_CONTRAST_TARGET = WHITE_CONTRAST_TARGET;

/**
 * The eight print series colours, in `--chart-1`…`--chart-8` slot order —
 * `seriesOnWhite.ts`'s shared values (ruling R186), which that module's
 * own doc comment explains the derivation of. Not print's own copy any
 * more: the paper view forced light draws the same eight, and two
 * hand-tuned copies of the same hues is exactly the drift R186 exists to
 * stop.
 *
 * What stays print's below is the page furniture those colours sit on —
 * the grid, the axis text, the white page.
 */
export const PRINT_SERIES_COLOURS: readonly string[] = SERIES_ON_WHITE;

/** Matches a `--chart-N` token (`theme/series.ts`'s own token names,
 *  `renderChart.ts`'s `CHART_TOKEN_RE`) — the only shape this codebase ever
 *  emits for a window's colour (ruling R117 item 6). */
const CHART_TOKEN_RE = /^--chart-([1-8])$/;

/** Returned for a token {@link resolvePrintColour} does not recognise —
 *  `report-print.css`'s own black-on-white convention, so an unresolvable
 *  token degrades to "plain text colour" rather than throwing and losing
 *  the whole report over one bad token. */
const FALLBACK_PRINT_COLOUR = "#000000";

/**
 * Resolves one `--chart-N` token to its print colour. A token this codebase
 * never emits (malformed, or outside `--chart-1`…`--chart-8`, ruling R117
 * item 6) returns {@link FALLBACK_PRINT_COLOUR} rather than throwing — the
 * same "degrade, don't abort" choice `renderChart.ts`'s `windowColour`
 * makes for the screen path.
 */
export function resolvePrintColour(token: string): string {
  const match = CHART_TOKEN_RE.exec(token);
  if (match === null) return FALLBACK_PRINT_COLOUR;
  const index = Number(match[1]) - 1;
  return PRINT_SERIES_COLOURS[index];
}

/** Tick/axis-label font size, in pixels — matches `plotTheme.ts`'s own
 *  `TICK_FONT_SIZE_PX` so a report chart's type scale matches the screen's,
 *  even though its colours do not. */
const TICK_FONT_SIZE_PX = 11;

/** Left margin sized for six tabular digits, mirroring `plotTheme.ts`'s own
 *  `MARGIN_LEFT_PX` estimate (same font size, same rule-of-thumb digit
 *  width and gutter) — recomputed here rather than imported, since this
 *  module takes no dependency on `plotTheme.ts` beyond its option type. */
const MARGIN_LEFT_PX = Math.round(6 * TICK_FONT_SIZE_PX * 0.6) + 12;

/** Near-black — `report-print.css`'s own `color: black` convention for the
 *  page, applied to chart axis text and rules (R174 item 2: match the
 *  stylesheet's existing black/white/gray convention, do not invent a
 *  third). Not pure black, so a hairline grid at this colour does not read
 *  as heavier than the page's own body text. */
const PRINT_AXIS_COLOUR = "#1a1a1a";

/** A grid line colour light enough to read through, dark enough to still be
 *  visible against white paper (R174 item 2) — `report-print.css`'s table
 *  borders already use CSS `gray` (`#808080`) at this same "present but
 *  quiet" register; this is one step lighter so the grid recedes further
 *  behind the trace than a table rule needs to. */
const PRINT_GRID_COLOUR = "#b3b3b3";

/** The report's mono font stack — the same literal `styles/report-print.css`
 *  already sets on `.report-view` (`font-family: "IBM Plex Mono",
 *  monospace`). Hardcoded, not read from `--font-mono` (`tokens.css`): this
 *  module never reads document custom properties (module doc comment). */
const PRINT_FONT_FAMILY = '"IBM Plex Mono", monospace';

/**
 * The report's static print plot theme (R174 item 1/2) — near-black axis
 * text and rules, a visible-but-quiet grid, no frame (same "plot area is
 * the page background, not a bordered panel" choice `plotTheme.ts` makes
 * for the screen).
 */
const PRINT_PLOT_THEME: PlotThemeOptions = {
  style: {
    background: "white",
    color: PRINT_AXIS_COLOUR,
    fontFamily: PRINT_FONT_FAMILY,
    fontVariantNumeric: "tabular-nums",
    fontSize: `${TICK_FONT_SIZE_PX}px`,
  },
  grid: PRINT_GRID_COLOUR,
  marginLeft: MARGIN_LEFT_PX,
};

/**
 * The one bundle `ReportView` resolves once per report render and threads
 * everywhere a `--chart-N` token needs a concrete colour (module doc
 * comment). `theme`/`seriesColours` feed `renderChart` directly (its
 * `theme`/`palette` parameters); `resolve` is what every swatch and border
 * style calls instead of `var(--chart-N)`.
 */
export interface PrintPalette {
  /** Fed to `renderChart`'s `theme` parameter for every `chartSlot`. */
  readonly theme: PlotThemeOptions;
  /** Fed to `renderChart`'s `palette` parameter — all eight colours, in
   *  `--chart-1`…`--chart-8` order, exactly as `theme/series.ts`'s
   *  `seriesPalette` shapes the screen's own palette array. */
  readonly seriesColours: readonly string[];
  /** Resolves one `--chart-N` token to a concrete colour, for every
   *  swatch/border the report draws outside a chart (selection chips,
   *  window-section borders, comparison-table chips). */
  readonly resolve: (token: string) => string;
}

/**
 * Builds the report's {@link PrintPalette}. Every field is a static
 * constant of this module — calling this more than once always yields
 * equal values — but `ReportView` still calls it exactly once per render
 * and passes the one result down, so there is only ever one place in the
 * report that turns a `--chart-N` token into a colour (module doc
 * comment's "one call site" rule).
 */
export function buildPrintPalette(): PrintPalette {
  return {
    theme: PRINT_PLOT_THEME,
    seriesColours: PRINT_SERIES_COLOURS,
    resolve: resolvePrintColour,
  };
}
