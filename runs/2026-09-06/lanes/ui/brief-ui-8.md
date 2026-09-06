# UI-8 — Plot theme: charts as app chrome

Charts are chrome, not paper (decision 25): near-black plot area, `--rule`
grid, mono tabular ticks, the 8-hue series cycle, Turbo for continuous data.
One theme function applied everywhere Plot is called — **host side and inside
the sandbox bundle**. ONE commit.

Worktree: `…/idl1-app-worktrees/ui-8` — this is R92's "Notebook worktree";
UI-9, UI-10 and UI-11 run in it after this task, one writer at a time.
**Depends on UI-4 on `main`.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-8"
git merge-base --is-ancestor <UI-4 merge hash on main> HEAD && echo GATE-OK
grep -c "\-\-chart-1" app/src/styles/tokens.css
```
Must print `GATE-OK` and `>= 1` (UI-1 defined the eight series tokens).
Otherwise merge `main` (R19 pattern); conflicts outside `CHANGELOG.md` are STOP
and report.

## Files to read first

This lane's `PLAN.md`; `UI-DIRECTION.md` decisions 25–27 and the whole "Chart
style rules for Plot" section; `FLUTTER-UI-SURVEY.md` §1 (the eight hues and
the Turbo note), §8 (empty and error states); `app/src/styles/tokens.css`;
`docs/vendor/observable-plot/` (`features/` for `style`, `marks/`,
`getting-started.md`); `app/src/routes/pages/Notebook/sandbox/main.ts` and
`sandbox/index.html`; `app/src/routes/pages/Notebook/host/SandboxHost.ts`'s
`SANDBOX_PATH` doc comment (why the sandbox is a real second Vite entry, R56);
every host-side `Plot.plot` call site (`components/ChartCell.tsx`,
`RasterUnderlay.tsx`, `plotForm/generate.ts` — grep for `Plot.`).

## Where

- **New:** `app/src/routes/pages/Notebook/theme/plotTheme.ts` + test,
  `theme/series.ts` + test, `theme/turbo.ts` + test, `theme/slotStates.ts` + test.
  (The direction writes these as `app/src/notebook/**`; the real tree has no
  such directory — the Notebook lives under `app/src/routes/pages/Notebook/`,
  and `theme/` sits beside `model/`, `host/` and `sandbox/` so the sandbox
  entry can import it without reaching outside the page directory.)
- **Edited:** the host-side `Plot.plot` call sites, `sandbox/main.ts` (theme
  application + the stylesheet import).
- Do not touch `vite.config.ts`; the existing two-entry build already emits the
  sandbox's CSS once `main.ts` imports it.

## Interfaces

```ts
// theme/series.ts
/** idl0's `brandChartPalette`, by series order, wrapped with `% length`
 *  (FLUTTER-UI-SURVEY §1). The values live in `tokens.css` as `--chart-1`…
 *  `--chart-8`; this module resolves them through an injected getter so it is
 *  pure and testable without a DOM, and so no hex is written outside
 *  `tokens.css`. */
export type CssVarReader = (name: string) => string;
export function seriesColor(index: number, read: CssVarReader): string;
export function seriesPalette(read: CssVarReader): string[];
/** The document's computed values; the one impure adapter, used at call sites. */
export function documentVars(doc?: Document): CssVarReader;

// theme/turbo.ts
/** Turbo (blue → cyan → green → yellow → red) as the degree-5 polynomial
 *  idl0 uses (`tabs/analyze/turbo_colormap.dart`), ported to TS for
 *  continuous rasters (decision 26). Input clamped to [0, 1]. */
export function turbo(t: number): [number, number, number];
export function turboCss(t: number): string;

// theme/plotTheme.ts
/** The single Plot option object every `Plot.plot` call merges in — host side
 *  and inside the sandbox realm. Plot area = page background, grid and axes
 *  `--rule`, 11 px `--fg-dim` tick labels, uppercase tracked axis titles, no
 *  frame, `marginLeft` sized for six tabular digits. */
export function plotTheme(read: CssVarReader): PlotThemeOptions;

// theme/slotStates.ts
/** A chart slot is never blank (FLUTTER-UI-SURVEY §8): one dim mono sentence
 *  naming the next action when empty, `--accent` mono text in place on error. */
export function emptySlotMessage(reason: EmptyReason): string;
export function errorSlotMessage(error: { message: string }): string;
```

## Applying it

- Every host-side `Plot.plot` merges `plotTheme(documentVars())`. Do not
  duplicate the option object at a call site.
- **The sandbox is a different document.** CSS custom properties do not cross
  an iframe boundary, so `var(--rule)` inside the sandbox resolves to nothing
  unless the sandbox document defines the tokens itself. `sandbox/main.ts`
  therefore imports `../../../../styles/tokens.css` (Vite emits and links it
  for that HTML entry) and calls `plotTheme(documentVars())` against its own
  document. Verify by grepping the built output, or state that you could not
  build and why.
- Selected/best lap uses `--good`; deltas use `--accent` for slower and
  `--good` for faster, as idl0's lap table does.
- Cursor lines are 1 px `--fg-dim`; readout chips are mono tabular on
  `--surface-2` with a hairline. UI-11 owns the cursor's behaviour — here, only
  its colours.

## Tests

`seriesColor — index 0..7 — the eight tokens in cycle order`;
`seriesColor — index 8 and 15 — wraps to 0 and 7`;
`seriesPalette — a reader returning empty strings — throws or returns the
documented fallback` (decide and document which; a silently blank chart is the
failure mode to avoid); `turbo — 0, 0.5, 1 — the documented endpoints`;
`turbo — outside [0,1] — clamped, never NaN`; `turbo — 64 samples —
monotonically varying, no repeated colour`; `plotTheme — a stub reader — grid
and axis colours are the rule token, tick font is mono, no frame`;
`emptySlotMessage — each reason — one sentence naming an action`.

## Gate

```bash
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Notebook
```
Non-zero `passed`; every pre-existing Notebook test unchanged.

## Steps

- [ ] 1. Entry gate. 2. `turbo.ts` + tests (pure maths first). 3. `series.ts`
      + tests. 4. `plotTheme.ts` + tests. 5. `slotStates.ts` + tests.
      6. Host call sites. 7. Sandbox: stylesheet import + theme application.
      8. Gate. 9. `tokenSheet.test.ts` green — the palette stays in
      `tokens.css`, not in `series.ts`. 10. NUL check. 11. CHANGELOG.
      12. Commit `app: Plot theme, series cycle and Turbo on the brand tokens (UI-8)`.

## Do not

- Do not write a hex literal in any `.ts` file; read the tokens.
- Do not change what any chart plots, any tile/raster fetch, or any settle path.
- Do not add figure export (decision 28, non-goal).
- Do not add a Plot plugin or a new dependency.
- Do not touch `vite.config.ts`, the shell, or another page.

## Spec discipline

**No spec change needed.**

## Report back (≤15 lines)

Commit hash + `git show --stat`; `tsc` result; the filter's `passed` count and
that pre-existing counts are unchanged; every `Plot.plot` call site now merging
the theme (file list); how the sandbox document gets the tokens, and whether
you verified it in a build or only by reading; the fallback behaviour chosen
when a CSS variable reads empty; parity gaps; anything needing a ruling.

## Open questions

1. **Fonts inside the sandbox iframe.** The iframe has no
   `allow-same-origin`, so its origin is opaque and a `@font-face` fetch is
   cross-origin. *Recommendation:* import `tokens.css` (colours and metrics all
   work) and let the sandbox fall back to the generic mono stack if Plex will
   not load; record the observed behaviour. Do not weaken the sandbox flags to
   fix a font — the isolation is worth more than the typeface.
2. **`marginLeft` for six tabular digits.** *Recommendation:* compute it from
   the tick font size as a constant in `plotTheme` (≈ 6 × 0.6em + padding)
   rather than measuring text at runtime; a measurement pass on every plot is
   interaction-path work for a cosmetic gain.
3. **Turbo in Rust vs. TS.** The survey offers both. *Recommendation:* TS here,
   as decision 26 and the lane split say; the Rust rasters already carry values,
   and moving the colormap across the IPC boundary would make the palette a
   contract change.
