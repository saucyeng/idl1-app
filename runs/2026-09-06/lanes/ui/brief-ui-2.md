# UI-2 — primitives: shadcn set + the twelve hand-rolled brand widgets

The component vocabulary every page will use. Generate the shadcn primitives,
restyle them onto UI-1's tokens, and hand-roll the six idl0 widgets no library
provides. Nothing is wired into a page here. TDD for the pure modules; ONE commit.

Worktree: `…/idl1-app-worktrees/ui-2`. **Depends on UI-1 on `main`.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-2"
git merge-base --is-ancestor <UI-1 merge hash on main> HEAD && echo GATE-OK
test -f app/src/styles/tokens.css && grep -c "\-\-hivis" app/src/styles/tokens.css
```
Must print `GATE-OK` and `>= 1`. Otherwise merge `main` (R19 pattern) and retry;
any conflict outside `CHANGELOG.md` is STOP and report.

## Files to read first

This lane's `PLAN.md`; `UI-DIRECTION.md` "Component approach" and "Design
tokens to adopt"; `FLUTTER-UI-SURVEY.md` §7 (the twelve widgets, quoted from
idl0 code — this is the parity list) and §2 (tracking); `app/src/styles/tokens.css`;
`docs/vendor/shadcn/` (the component pages UI-1 vendored) and
`docs/vendor/react-19/`; `docs/vendor/shadcn/SOURCES.md` for the pinned CLI version.

## Where

- **New:** `app/src/components/ui/**` (generated), `app/src/components/brand/**`
  (hand-rolled + tests).
- **Lead-owned, allowed here:** `app/package.json` + lockfile — only the Radix
  packages the generator adds, plus the icon library (question 1), at exact pins.
- **Also:** `CHANGELOG.md`.

## Generate (`npx shadcn@<pinned> add …`)

`button` `badge` `input` `select` `checkbox` `switch` `toggle-group` `tabs`
`collapsible` `tooltip` `scroll-area` `table`.

Restyle each onto tokens, in the component file itself (the theme is
`tokens.css` only; components carry structure, not colour literals):
- **`button`** — five emphases mapping idl0's `ButtonEmphasis`
  (`FLUTTER-UI-SURVEY.md` §7): `default`/`outline` (normal), `accent`
  (destructive `--accent`), `good` (go `--good`), `hivis` (live `--hivis`),
  `info` (connect `--info`); outline and filled families at
  `--radius` (7 px). Filled-normal is the one primary action per screen.
- **`badge`** = `BrandChip`: mono pill, optional trailing `×` slot.
- **`toggle-group`** = `BrandSegmented`: hairline border, `--control` resting,
  `--control-active` selected, `tight` density variant.
- **`table`**: dense, 6 px row rhythm, a **reserved** 3 px inset selection bar
  (always occupied, transparent when unselected, `--good` when selected — idl0
  reserves the width so selection never shifts layout).
- Every component: strip `box-shadow` and `rounded-lg`-style radii, set
  card/dialog-like surfaces to `--radius-card` (0) with a 1 px `--rule` border,
  add the `--focus` ring (1 px outline, 2 px offset) to every focusable.
- Remove the animation utility classes if UI-1 dropped `tw-animate-css`.

## Hand-roll on tokens (`app/src/components/brand/`)

`SectionHead` (uppercase tracked kicker + hairline to the right edge, optional
flush-right trailing slot), `SpecRow` (`KEY .... VALUE`, leader dots via a
repeating radial gradient, not a border-dashed hack), `StatusDot` (`● LABEL`,
colour owned by the call site), `PulsingDot` (~0.9 s opacity pulse — this is one
of idl0's two permitted animations, decision 18), `NoteBlock` (1 px left rule
callout, colour carries semantics), `DenseRow` + `TableHeader` (6 px rhythm,
caller-sized cells, the reserved selection bar). Also `StatusIcon` and
`ToolGroup`/`IconBtn` if they fall out cheaply; otherwise list them as parity gaps.

## Pure modules (the tested half)

```ts
// app/src/components/brand/emphasis.ts
/** idl0's ButtonEmphasis (FLUTTER-UI-SURVEY §7) as the class map every
 *  emphasis-taking component shares. Total over the union — a new emphasis
 *  is a compile error, not a silent fallback. */
export type Emphasis = "normal" | "accent" | "good" | "hivis" | "info";
export function emphasisClasses(e: Emphasis, filled: boolean): string;

// app/src/components/brand/labels.ts
/** Uppercase mono labels never wrap (UI-DIRECTION "Type", new rule): a label
 *  longer than `maxChars` is replaced by its known abbreviation
 *  (IMPERIAL → IMP, …); an unknown long label is returned unchanged and
 *  reported by `unabbreviated()` so the table can be extended, never broken
 *  mid-word by the browser. */
export function abbreviateLabel(label: string, maxChars: number): string;
export function unabbreviated(labels: string[], maxChars: number): string[];
```

Tests: `emphasisClasses — every emphasis, filled and outline — a distinct
class string`; `emphasisClasses — accent filled — carries the --accent token
class`; `abbreviateLabel — IMPERIAL at 8 chars — IMP`; `abbreviateLabel — a
short label — unchanged`; `abbreviateLabel — an unknown long label —
unchanged and listed by unabbreviated`.

## Gate

```bash
cd app && npx tsc --noEmit && npx vitest run src/components
```
Non-zero `passed` required.

## Steps

- [ ] 1. Entry gate. 2. Generate the twelve shadcn components at the pinned CLI
      version; commit the generated files unmodified in one step so the restyle
      diff is readable. 3. Restyle onto tokens (colours via classes that resolve
      to `var(--…)`; no hex anywhere). 4. Hand-roll the six brand widgets.
      5. Pure modules + tests. 6. Gate. 7. `tokenSheet.test.ts` still green
      (no new hex). 8. NUL check. 9. CHANGELOG. 10. Commit
      `app: shadcn primitives and brand widgets on the design tokens (UI-2)`.

## Do not

- Do not wire a component into a page — UI-5/6/7/10 do that.
- Do not add `dialog`, `sheet`, `dropdown-menu`, `context-menu`, `popover`,
  `sonner`, `resizable`, `command` — UI-3 and UI-4 own those.
- Do not add a shadow, a second radius family, or a light-theme value.
- Do not unit-test rendering (CLAUDE.md §4). Test the pure maps only.

## Spec discipline

**No spec change needed.** If a widget in `FLUTTER-UI-SURVEY.md` §7 has no
sensible web form (`ColorGridPicker`, `StatusDropdownTrigger`), list it as a
parity gap with the task that should own it — do not invent an approximation.

## Report back (≤15 lines)

Commit hash + `git show --stat`; `tsc` result; the filter's `passed` count;
which shadcn components were generated and which needed a non-cosmetic edit;
which brand widgets shipped and which are parity gaps; the icon library
decision and its pinned version; whether stripping animations broke any Radix
primitive; anything needing a ruling.

## Open questions

1. **Icon set.** idl0 uses ~25 stock Material glyphs (`FLUTTER-UI-SURVEY.md`
   §4); the direction file is silent. *Recommendation:* `lucide-react` at an
   exact pin — shadcn's default, plain npm package, tree-shaken per-icon
   imports, no CDN. Alternative if bundle size bites: hand-copy ~25 SVGs into
   `app/src/components/icons/`.
2. **`SpecRow` leader dots.** *Recommendation:* a `repeating-radial-gradient`
   on the flexible middle element (the direction file names this). idl0 paints
   them with `CustomPaint`; exact alignment parity is not required.
3. **Does `table` earn its shadcn generation?** The dense row/selection-bar
   rules are entirely ours. *Recommendation:* generate it anyway for the
   semantics and header stickiness, and put the density in `DenseRow`.
