/**
 * Paper's palette: the **app's own theme**, not print's black-on-white
 * (ruling R184 item 7 — "theme is inherited"; daylight readability is
 * Isaac's call, not a guess made here). The screen counterpart of
 * `printPalette.ts`, built to the same {@link PrintPalette} shape so the
 * shared block renderer (`components/reportBlocks.tsx`) takes one palette
 * type and neither view is the special case.
 *
 * Where print freezes its colours (R174: `tokens.css`'s dark palette is
 * illegible on white paper), paper is drawn *in* the app, on the app's own
 * background, so it reads the live document's `--chart-N` custom
 * properties exactly as every on-screen chart already does — a lap that is
 * azure in the notebook is azure on paper.
 *
 * DOM-free itself: the `CssVarReader` is injected (`theme/series.ts`'s
 * `documentVars()` at the real call site), which is what makes this
 * module's fallback behaviour testable with no browser.
 */
import type { CssVarReader } from "../../theme/series";
import { seriesPalette } from "../../theme/series";
import { plotTheme } from "../../theme/plotTheme";
import type { PrintPalette } from "./printPalette";

/** Matches a `--chart-N` token — the only colour shape this codebase emits
 *  for a window (ruling R117 item 6). Same expression `printPalette.ts` and
 *  `renderChart.ts` each keep for their own resolver. */
const CHART_TOKEN_RE = /^--chart-([1-8])$/;

/** What an unresolvable token, or a document with no `tokens.css` loaded,
 *  resolves to — the surrounding text colour. A swatch in the body colour
 *  is a smaller failure than a thrown error taking the whole paper view
 *  down with it, the same "degrade, don't abort" choice `renderChart.ts`'s
 *  `windowColour` already makes for the screen. */
const FALLBACK_COLOUR = "currentColor";

/**
 * Builds paper's {@link PrintPalette}-shaped palette from `read`.
 *
 * `seriesPalette` throws {@link MissingChartTokenError} when a `--chart-N`
 * token resolves empty (a document that never imported `tokens.css`). Paper
 * catches that and carries on with an empty colour list: every chart line
 * and every swatch then draws in {@link FALLBACK_COLOUR}. A viewer that
 * shows a monochrome lap is still readable; one that throws mid-render
 * shows nothing at all, and on a phone there is no second window to read
 * the failure in.
 *
 * @param read - Resolves a CSS custom property name to its value
 *   (`theme/series.ts`'s `documentVars()` in the app).
 */
export function buildScreenPalette(read: CssVarReader): PrintPalette {
  let seriesColours: readonly string[];
  try {
    seriesColours = seriesPalette(read);
  } catch {
    seriesColours = [];
  }

  return {
    theme: plotTheme(read),
    seriesColours,
    resolve: (token: string) => {
      const match = CHART_TOKEN_RE.exec(token);
      if (match === null || seriesColours.length === 0) return FALLBACK_COLOUR;
      const index = Number(match[1]) - 1;
      return seriesColours[index % seriesColours.length];
    },
  };
}
