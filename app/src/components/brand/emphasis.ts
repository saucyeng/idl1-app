/** idl0's ButtonEmphasis (FLUTTER-UI-SURVEY §7) as the class map every
 *  emphasis-taking component shares. Total over the union — a new emphasis
 *  is a compile error, not a silent fallback.
 *
 *  Colour mapping (R94: `--accent` is the brand alert colour, never
 *  shadcn's `--shadcn-accent`):
 *  - `normal` has no semantic colour of its own; filled uses `--fg` on
 *    `--bg` (the brightest available surface, "the one primary action per
 *    screen" per UI-DIRECTION "Component approach"), outline uses a
 *    `--rule` border with `--fg` text.
 *  - `accent`/`good`/`hivis`/`info` filled use their token as the fill with
 *    `--bg` text (all four tokens are light/saturated enough for dark text
 *    to read); outline uses the token as border and text colour.
 */
export type Emphasis = "normal" | "accent" | "good" | "hivis" | "info";

/** Tailwind utility classes (all resolving to `var(--…)` tokens, never a
 *  literal) for one emphasis in its filled or outline family. */
export function emphasisClasses(emphasis: Emphasis, filled: boolean): string {
  if (emphasis === "normal") {
    return filled
      ? "bg-fg text-bg hover:bg-fg/90"
      : "border border-rule text-fg bg-transparent hover:bg-control";
  }

  const token = emphasis === "accent" ? "brand-accent" : emphasis;

  return filled
    ? `bg-${token} text-bg hover:bg-${token}/90`
    : `border border-${token} text-${token} bg-transparent hover:bg-${token}/10`;
}
