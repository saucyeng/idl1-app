# UI-1 — tokens, fonts, Tailwind v4 + shadcn wiring

The foundation everything else in the lane reads: bundled Plex woff2, one
`tokens.css` carrying idl0's 13 colours and the type/spacing/radius scale, and
a Tailwind v4 + shadcn build that fetches nothing at runtime. No component is
restyled here. TDD where there is logic; ONE commit.

Worktree: `C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-1`.
**No dependency.** UI-2 cannot start until this is on `main`.

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-1"
git merge-base --is-ancestor f411bf3 HEAD && echo GATE-OK
test -f app/src/App.css && echo CSS-OK
```
Both must print. If either fails, merge `main` first (R19 pattern); if the
merge conflicts anywhere but `CHANGELOG.md`, STOP and report.

## Files to read first

`CLAUDE.md` §2–§4, §7; this lane's `PLAN.md`; `runs/2026-09-06/ui/UI-DIRECTION.md`
"Design tokens to adopt" + "Component approach" (the authority for every value
below); `runs/2026-09-06/RULINGS-DIGEST.md` (process rules block);
`runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §2; `docs/vendor/README.md`
(how a vendored doc snapshot is recorded); `app/package.json`,
`app/vite.config.ts`, `app/src/main.tsx`, `app/src/App.tsx`, `app/src/App.css`.

## Where

- **New:** `app/src/styles/index.css`, `app/src/styles/tokens.css`,
  `app/src/styles/fonts.css`, `app/src/styles/tokenSheet.test.ts`,
  `app/src/assets/fonts/*.woff2` (6 files), `app/src/lib/utils.ts` (shadcn's
  `cn`), `components.json` (shadcn config), `docs/vendor/tailwind-v4/`,
  `docs/vendor/shadcn/` (each with `SOURCES.md`).
- **Lead-owned, allowed here:** `app/package.json` + lockfile,
  `app/vite.config.ts`, `app/src/main.tsx`, `app/src/App.css` (deleted),
  `app/src/App.tsx` (delete the `import "./App.css";` line only — nothing else).
- **Also:** `CHANGELOG.md`.

## Step 1 — vendor the docs first (operating brief §7.5, `docs/vendor/README.md`)

Tailwind v4 and shadcn/Radix docs are **not** in `docs/vendor/` today. Before
writing code, add pinned offline snapshots:
- `docs/vendor/tailwind-v4/` — the Vite install guide, the `@theme` /
  `@import "tailwindcss"` reference, and the v3→v4 differences page.
- `docs/vendor/shadcn/` — the "Vite" install page, `components.json` reference,
  the theming/CSS-variables page, and the component pages for everything
  UI-2/UI-3/UI-4 generate (`button`, `badge`, `input`, `select`, `checkbox`,
  `switch`, `toggle-group`, `tabs`, `collapsible`, `tooltip`, `scroll-area`,
  `dialog`, `sheet`, `dropdown-menu`, `context-menu`, `popover`, `sonner`,
  `table`, `resizable`, `command`).
Each directory gets a `SOURCES.md` in the existing format: file, URL, fetch
date (2026-09-06), upstream version. A page that will not fetch is recorded as
a failure line, never silently substituted.

## Step 2 — dependencies (pin exact versions, no `^`)

`tailwindcss` v4 + `@tailwindcss/vite` (devDependencies), `clsx`,
`tailwind-merge`, `tw-animate-css` (or omit animations entirely — say which),
`class-variance-authority`. Radix packages arrive as shadcn adds components;
after generating, **rewrite every added dependency to an exact version** and
record the resolved versions in the report.

**Offline safety of `npx shadcn add`:** the CLI downloads component source from
`ui.shadcn.com` at authoring time and writes plain `.tsx` files into the repo.
That is an authoring-time fetch, like `npm install` — the shipped bundle fetches
nothing (CLAUDE.md §3 is about the running app). Requirements: run
`npx shadcn@latest --version` once, record the exact version in
`docs/vendor/shadcn/SOURCES.md`, and use `npx shadcn@<that version> …` in this
and every later task so UI-2/3/4 generate from the same source. Commit every
generated file. If the CLI cannot reach the network, hand-write the component
from the vendored page and say so in the report.

## Step 3 — Tailwind wiring

`@tailwindcss/vite` in `app/vite.config.ts`'s `plugins` array, before/after
`react()` (order is not significant; keep the existing two-entry
`build.rollupOptions.input` untouched — the sandbox entry must keep working,
R56). `app/src/styles/index.css`:

```css
@import "tailwindcss";
@import "./fonts.css";
@import "./tokens.css";
```
`app/src/main.tsx` imports `./styles/index.css` (replacing nothing else).
Delete `app/src/App.css` and its import line in `App.tsx`. Grep for
`idl1-root` / `idl1-error` first and re-express any rule still referenced as a
token-driven rule in `index.css`'s base layer — do not silently drop a used class.

## Step 4 — fonts

Six woff2 files: IBM Plex Mono 400/500/600 and IBM Plex Sans 400/500/600, latin
subset. **Source, in order of preference:** the npm packages `@ibm/plex-mono`
and `@ibm/plex-sans` at a pinned exact version — install, copy the six files
into `app/src/assets/fonts/`, commit them, then keep or drop the packages (say
which); failing that, the IBM Plex GitHub release
`https://github.com/IBM/plex/releases` at a pinned tag. Record package/tag,
URL and date in `docs/vendor/` — a short `FONTS.md` beside the font files is
acceptable if it is linked from the CHANGELOG bullet. No CDN, no
`fonts.googleapis.com`, ever. `fonts.css` holds the six `@font-face` blocks
with `font-display: swap` and relative `url()`s so Vite fingerprints them.

## Step 5 — `tokens.css`

One file, the only place a hex literal may appear in the repo. Contents:

- **Palette** on `:root`, exactly the direction's values: `--bg #121412`,
  `--surface #1A1E18`, `--surface-2 #161915`, `--control #20251D`,
  `--control-active #2D3327`, `--fg #EFEAE0`, `--fg-dim #9A968A`,
  `--fg-faint #6C6A60`, `--rule #353A32`, `--accent #E63946`, `--good #35C46E`,
  `--hivis #F5D547`, `--info #3B92E8`; `--focus: var(--hivis)`.
- **Chart series** `--chart-1 #5BA6F0` · `--chart-2 #35C46E` · `--chart-3 #F5D547`
  · `--chart-4 #E8964B` · `--chart-5 #B98AE6` · `--chart-6 #3FC9C0`
  · `--chart-7 #E86FA6` · `--chart-8 #E05A63` (UI-8 reads these; define them here).
- **Type:** `--font-mono` "IBM Plex Mono" + fallback stack, `--font-sans`
  "IBM Plex Sans" + fallback; the scale as custom properties
  (display 48/36/28 @600 lh 1.0; headline 24/20/18 @600 lh 1.0; title 16/600,
  14/500, 12/500 dim tracked; body 14; body-small 12 dim; label 12/500, 11/500
  dim; nav 10 uppercase). Weights 400/500/600 only. Tracking
  `--tracking-label: 0.1em`, `--tracking-kicker: 0.14em`.
- **Spacing** `--space-1 4px` through the scale 4 · 6 · 8 · 12 · 14 · 16 · 24 ·
  32; `--row-rhythm: 6px`; `--hit-target: 44px`.
- **Radii** `--radius-structural: 2px`, `--radius: 7px`, `--radius-card: 0`.
- **Elevation:** none. Do not define a shadow token.
- **shadcn mapping** in the same file: `--background: var(--bg)`,
  `--card: var(--surface)`, `--popover: var(--surface-2)`,
  `--muted: var(--control)`, `--accent: var(--control-active)`,
  `--foreground: var(--fg)`, `--muted-foreground: var(--fg-dim)`,
  `--border`/`--input`/`--ring` as the direction dictates
  (`--ring: var(--focus)`), `--destructive: var(--accent)`. Every shadcn
  variable is a `var(...)` reference, never a repeated hex.
- Tailwind v4 `@theme inline { … }` exposing the tokens as utility names
  (`--color-surface`, `--font-mono`, …) so components use `bg-surface`,
  not arbitrary values.
- A `:root` base rule: `font-variant-numeric: tabular-nums`, `--font-mono` as
  the default family, `color-scheme: dark`, `background: var(--bg)`,
  `color: var(--fg)`.
- Comment at the top: dark is authored; a later `[data-theme="light"]` block
  re-declares these same names and nothing else. Write **no light values**.

## Step 6 — the enforcement test

`app/src/styles/tokenSheet.test.ts` (pure, `node:fs`, no DOM):

- `tokens.css — the 13 idl0 palette tokens — present with the exact idl0 hex`
  (table-driven, one assertion per token).
- `tokens.css — the 8 chart series tokens — present in cycle order`.
- `tokens.css — every shadcn variable — resolves to a var(), not a literal`.
- `tokens.css — no light-theme block — first pass authors dark only`.
- `stylesheets — hex colour literals — appear only in tokens.css`: walk
  `app/src/**/*.css` and `app/src/**/*.tsx`, match `#[0-9a-fA-F]{3,8}` outside
  `tokens.css`, assert the match list is empty. Known offenders
  (`Settings/settings.css`'s `rgba(0,0,0,0.08)`) must be listed in an explicit
  `KNOWN_EXCEPTIONS` array with the task that removes each (UI-7), so the test
  passes today and fails the day an exception is added without one.
- `fonts.css — every @font-face — points at a committed local woff2` (assert
  each `url()` target exists on disk; catches a CDN URL sneaking in).

## Gate

```bash
cd app && npx tsc --noEmit && npx vitest run src/styles
```
Non-zero `passed` required. Then `npx vitest run` once (whole suite) to prove
the stylesheet swap broke nothing, and report both numbers.

## Steps

- [ ] 1. Entry gate. 2. Vendor Tailwind v4 + shadcn docs with `SOURCES.md`.
- [ ] 3. Install deps at exact pins; `shadcn init` (`components.json`,
      `lib/utils.ts`); record the CLI version.
- [ ] 4. Tailwind plugin in `vite.config.ts`; `styles/index.css`; `main.tsx`
      import; delete `App.css` + its import line.
- [ ] 5. Fonts copied, committed, `@font-face` written, source recorded.
- [ ] 6. `tokens.css` in full, including the shadcn mapping and `@theme inline`.
- [ ] 7. `tokenSheet.test.ts` written first where possible, then green.
- [ ] 8. Gate + whole suite. 9. NUL check every touched file.
      10. CHANGELOG bullet. 11. Commit `app: design tokens, Plex fonts,
      Tailwind v4 + shadcn wiring (UI-1)`.

## Do not

- Do not restyle a component, a page, or the shell. This task changes what is
  *available*, not what anything looks like beyond the root background/font.
- Do not touch `app/src/routes/`, `app/src/state/`, `app/src-tauri/`, `rust/`.
- Do not add a light-theme value, a shadow, or a third radius.
- Do not edit the sandbox entry (`Notebook/sandbox/**`) — UI-8 owns it.
- Do not add an icon library here (UI-2's question).

## Spec discipline

**No spec change needed** — R92 adopted the direction file; this is its first
implementation. If a token value in `UI-DIRECTION.md` conflicts with
`FLUTTER-UI-SURVEY.md` §1, the direction file wins; report the conflict.

## Report back (≤15 lines)

Commit hash + `git show --stat`; `tsc` result; the `src/styles` filter's
`passed` count and the whole-suite `passed` count; the exact resolved versions
of `tailwindcss`, `@tailwindcss/vite`, the shadcn CLI, `clsx`,
`tailwind-merge`, `class-variance-authority`; the font source actually used
(package+version or release tag) and the six filenames; whether the shadcn CLI
reached the network; the `KNOWN_EXCEPTIONS` list left in `tokenSheet.test.ts`;
parity gaps; anything needing a ruling.

## Open questions (answer with the recommendation unless the lead says otherwise)

1. **`tw-animate-css`?** shadcn v4 templates reference it for enter/exit
   animations. Direction decision 18 allows no decorative animation.
   *Recommendation:* skip the package; strip the animation classes from
   generated components in UI-2/UI-3. Report if a Radix primitive breaks without it.
2. **Keep the `@ibm/plex-*` npm packages after copying the woff2?**
   *Recommendation:* copy the six files, commit them, and remove the packages —
   the repo then has no build-time dependency on a font registry.
3. **Latin subset only?** *Recommendation:* yes, latin + latin-ext; the app is
   English-only and six full files would add ~1 MB for nothing.
