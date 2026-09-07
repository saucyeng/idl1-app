/**
 * The 8-hue chart series cycle (idl0's `brandChartPalette`,
 * `FLUTTER-UI-SURVEY.md` §1; `UI-DIRECTION.md` "Chart style rules for
 * Plot"): azure, green, amber, orange, violet, teal, rose, coral, assigned
 * by series order and wrapped `% length` — a per-channel override persists
 * in the workbook (out of this module's scope; this is only the default
 * cycle). The eight hues live in `app/src/styles/tokens.css` as `--chart-1`
 * … `--chart-8` (UI-1); this module never writes a hex literal itself and
 * resolves every colour through an injected {@link CssVarReader} so it stays
 * pure and DOM-free for testing, and so the palette can never drift from the
 * token sheet `tokenSheet.test.ts` enforces.
 */

/** Reads one CSS custom property's resolved value (e.g. `getComputedStyle`
 *  against a document's root). Injected so {@link seriesColor}/{@link
 *  seriesPalette} need no DOM to test. */
export type CssVarReader = (name: string) => string;

/** The eight chart token names, in cycle order (UI-1, `tokens.css`). */
const CHART_TOKEN_NAMES = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--chart-6",
  "--chart-7",
  "--chart-8",
] as const;

/**
 * Thrown when {@link CssVarReader} returns an empty string for a chart
 * token. A silently blank chart (rendering a data line in `""`, which SVG/
 * CSS treats as "no paint") is the failure mode this guards against — a
 * missing token is a build-time wiring bug (the token sheet not loaded, or a
 * renamed variable), not a value this module could sensibly default,
 * because any hardcoded fallback colour would itself be a hex literal
 * written outside `tokens.css`, the one thing this module exists to avoid.
 */
export class MissingChartTokenError extends Error {
  /** The CSS custom property name that resolved to an empty string. */
  readonly tokenName: string;

  constructor(tokenName: string) {
    super(`Chart token "${tokenName}" resolved to an empty value — is tokens.css loaded in this document?`);
    this.name = "MissingChartTokenError";
    this.tokenName = tokenName;
  }
}

/**
 * Resolves the series colour for `index`, wrapping by `% 8` (idl0's
 * `brandChartPalette` behaviour, `FLUTTER-UI-SURVEY.md` §1) — series 8 reuses
 * series 0's colour, series 15 reuses series 7's, and so on. `index` may be
 * any non-negative integer; a negative or non-integer index is out of this
 * function's contract (callers only ever pass a series's ordinal position).
 */
export function seriesColor(index: number, read: CssVarReader): string {
  const tokenName = CHART_TOKEN_NAMES[index % CHART_TOKEN_NAMES.length];
  const value = read(tokenName).trim();
  if (value === "") {
    throw new MissingChartTokenError(tokenName);
  }
  return value;
}

/** The eight chart colours, in cycle order, resolved through `read`. Throws
 *  {@link MissingChartTokenError} (via {@link seriesColor}) on the first
 *  empty token — see that error's doc comment for why this never falls back
 *  to a silently blank chart. */
export function seriesPalette(read: CssVarReader): string[] {
  return CHART_TOKEN_NAMES.map((_, index) => seriesColor(index, read));
}

/**
 * The one impure adapter: reads `doc`'s (default `document`) own computed
 * root custom properties. Used at real call sites — host-side components
 * call `documentVars()`, and the sandbox document (a separate realm with its
 * own `tokens.css` import, R56) calls `documentVars(document)` against
 * itself, since CSS custom properties do not cross an iframe boundary.
 */
export function documentVars(doc: Document = document): CssVarReader {
  const style = getComputedStyle(doc.documentElement);
  return (name: string) => style.getPropertyValue(name);
}
