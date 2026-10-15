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

/** Filled and outline classes per emphasis, written out in full. Tailwind
 *  generates only class names it finds literally in the source, so a name
 *  built at runtime (`bg-${token}`) exists only if some other file happens
 *  to spell it. `bg-info` never was, and the filled info button drew as
 *  black text on nothing (2026-10-15). */
const EMPHASIS_CLASSES: Record<Emphasis, { filled: string; outline: string }> = {
  normal: { filled: "bg-fg text-bg hover:bg-fg/90", outline: "border border-rule text-fg bg-transparent hover:bg-control" },
  accent: {
    filled: "bg-brand-accent text-bg hover:bg-brand-accent/90",
    outline: "border border-brand-accent text-brand-accent bg-transparent hover:bg-brand-accent/10",
  },
  good: { filled: "bg-good text-bg hover:bg-good/90", outline: "border border-good text-good bg-transparent hover:bg-good/10" },
  hivis: { filled: "bg-hivis text-bg hover:bg-hivis/90", outline: "border border-hivis text-hivis bg-transparent hover:bg-hivis/10" },
  info: { filled: "bg-info text-bg hover:bg-info/90", outline: "border border-info text-info bg-transparent hover:bg-info/10" },
};

/** Tailwind utility classes (all resolving to `var(--…)` tokens, never a
 *  literal) for one emphasis in its filled or outline family. */
export function emphasisClasses(emphasis: Emphasis, filled: boolean): string {
  const classes = EMPHASIS_CLASSES[emphasis];
  return filled ? classes.filled : classes.outline;
}
