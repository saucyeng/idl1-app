/**
 * The single Observable Plot option object every `Plot.plot` call merges in
 * — host side and inside the sandbox realm (`UI-DIRECTION.md` "Chart style
 * rules for Plot", decision 25: charts are chrome, not paper). Type-only
 * import of `@observablehq/plot`'s own `PlotOptions` (erased at build time,
 * `plotForm/spectrumKey.ts`'s pattern) keeps this module runtime-dependency-
 * free so it can be imported from both the host bundle and the sandbox's
 * separate Vite entry (R56) with no risk of pulling the real Plot library
 * into the host build.
 *
 * Colour scope, and a documented limitation: Plot's public options surface
 * (`docs/vendor/observable-plot/features/plots.md`, `marks/axis.md`,
 * `features/scales.md`) exposes the cross-plot **grid** line colour as a
 * top-level shorthand independent of everything else, but does *not* expose
 * the implicit axis mark's own tick-vector stroke as a top-level or scale
 * option (`marks/axis.md`'s axis options list has no top-level equivalent
 * for "color", "stroke" or "fill" — only `axis`, `ticks`, `tickFormat`,
 * etc. forward from a scale option to the implicit axis). Both the tick
 * vector and every text element (tick labels, axis titles) inherit
 * `style.color` via SVG's normal `currentColor` cascade. This theme sets
 * `style.color` to `--fg-dim` (matching "tick labels 11 px --fg-dim") and
 * `grid` to `--rule` independently (matching "grid ... --rule"); the
 * consequence is that the short tick-vector marks end up `--fg-dim` rather
 * than the direction doc's `--rule`, since separating the two would require
 * declaring an explicit `Plot.axisX`/`Plot.axisY` mark at every call site
 * (out of this task's "one theme options object" scope, and not required by
 * this task's own test list). Recorded here rather than silently guessed.
 *
 * A second, unrelated gap: `UI-DIRECTION.md`'s chart rules also call for
 * "uppercase tracked axis titles" (0.1em letter-spacing, 11 px, `--fg-dim`).
 * This theme does not implement that. It is not merely out of this theme's
 * one-options-object scope the way the tick-vector colour split is — Plot's
 * public API has **no** `textTransform`/`letterSpacing` option anywhere on
 * its text-rendering marks (`docs/vendor/observable-plot/marks/text.md`'s
 * full option list has no such entries, nor does `marks/axis.md`'s, which
 * only adds **fontVariant**, **color**, and the **textStroke** family on top
 * of the text mark's list). The top-level `style` object here *is* typed as
 * `Partial<CSSStyleDeclaration>` and could carry `textTransform`/
 * `letterSpacing`, but `style` cascades to every text element inside the
 * plot's SVG (ticks and title alike, the same `currentColor`-style
 * inheritance documented above for `color`), so setting it here would
 * uppercase and track the tick labels too, not just the title — the
 * opposite of what the direction asks for. Reaching only the title text
 * would need a CSS selector scoped to the axis-label `<text>` specifically
 * (Plot's generated SVG structure is not part of its documented public
 * surface, so no such selector is documented in `docs/vendor/`) or an
 * explicit per-call axis mark with a title-only style hook, which this
 * mark's own option list does not offer either. Not implemented; not a
 * silent gap (see `CHANGELOG.md`'s UI-8 entry).
 */
import type { PlotOptions } from "@observablehq/plot";

/** A CSS custom property reader (`theme/series.ts`'s `CssVarReader`),
 *  injected so this module needs no DOM to test. */
export type CssVarReader = (name: string) => string;

/** The subset of Plot's own options this theme sets. */
export type PlotThemeOptions = Pick<PlotOptions, "style" | "grid" | "marginLeft">;

/** The tick/label font size, in pixels (`UI-DIRECTION.md`: "tick labels 11
 *  px"). Also the basis for {@link MARGIN_LEFT_PX}'s six-tabular-digit
 *  estimate below. */
const TICK_FONT_SIZE_PX = 11;

/** A tabular-numeral digit's approximate advance width, as a fraction of its
 *  font size — a standard monospace-digit rule of thumb, not measured per
 *  font (open question 2 in `brief-ui-8.md`: a runtime text-measurement pass
 *  on every plot is interaction-path work for a cosmetic gain). */
const TABULAR_DIGIT_WIDTH_EM = 0.6;

/** Padding reserved outside the six digits for the axis's own tick mark and
 *  a small gutter before the plot area, in pixels. */
const MARGIN_LEFT_PADDING_PX = 12;

/** `marginLeft` sized for six tabular digits (`UI-DIRECTION.md`; brief-ui-8.md
 *  open question 2) — `6 × TICK_FONT_SIZE_PX × TABULAR_DIGIT_WIDTH_EM`, plus
 *  {@link MARGIN_LEFT_PADDING_PX}, rounded to a whole pixel. */
const MARGIN_LEFT_PX = Math.round(6 * TICK_FONT_SIZE_PX * TABULAR_DIGIT_WIDTH_EM) + MARGIN_LEFT_PADDING_PX;

/** The theme's mono font stack, read from `--font-mono` (`tokens.css`, UI-1)
 *  so no font name is hardcoded outside the token sheet. */
function monoFontFamily(read: CssVarReader): string {
  return read("--font-mono");
}

/**
 * Builds the theme options object every `Plot.plot` call merges in. `read`
 * is the injected {@link CssVarReader} (`theme/series.ts`'s `documentVars()`
 * at real call sites, host or sandbox). No `marks` field, and no top-level
 * option that would add a frame mark — this theme never draws a frame
 * (decision 25: plot area is the page background, not a bordered panel).
 */
export function plotTheme(read: CssVarReader): PlotThemeOptions {
  return {
    style: {
      background: read("--bg"),
      color: read("--fg-dim"),
      fontFamily: monoFontFamily(read),
      fontVariantNumeric: "tabular-nums",
      fontSize: `${TICK_FONT_SIZE_PX}px`,
    },
    grid: read("--rule"),
    marginLeft: MARGIN_LEFT_PX,
  };
}
