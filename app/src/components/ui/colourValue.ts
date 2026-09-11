/**
 * Translating between a chart **token name** (`--chart-1`, what
 * `ColourPicker` deals in) and the **colour string** stored on a Plot mark
 * (`var(--chart-1)`, what Plot receives). Two lines of logic, in their own
 * module so a test can reach them: `vitest.config.ts` runs the `node`
 * environment and includes `src/**\/*.test.ts` only, and its resolver has no
 * `@/` alias, so nothing a `.tsx` component file imports is testable from
 * there.
 */

/** The CSS a chart token name resolves to when stored as a colour —
 *  `--chart-1` becomes `var(--chart-1)`. A bare token name is not a colour,
 *  so writing one straight onto a mark would silently produce no stroke. */
export function colourValueFor(token: string): string {
  return `var(${token})`;
}

/** The chart token inside a `var(--chart-N)` value, or `""` for anything
 *  else (a hand-typed `red`, a hex, an empty field) — what the swatch row
 *  needs to know which of the eight, if any, is currently pressed. */
export function tokenInColourValue(value: string | undefined): string {
  const match = value?.match(/^var\((--chart-[1-8])\)$/);
  return match?.[1] ?? "";
}
