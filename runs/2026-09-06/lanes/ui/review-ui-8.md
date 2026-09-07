# UI-8 review — Plot theme, series cycle, Turbo

Commit: `9b1b9ff` on branch `ui-notebook`, worktree
`C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-notebook`.

Files touched: `CHANGELOG.md`; new `Notebook/theme/{turbo,series,plotTheme,slotStates}.ts`
+ their `*.test.ts`; edited `Notebook/sandbox/main.ts`. No host-side `Plot.plot`
call site exists in the tree (R97) — confirmed by grep, `plotForm/generate.ts`
and `parse.ts` only emit/parse `Plot.plot(...)` as source text for the sandbox
to `eval`, they never call it. `SandboxHost.ts`, `sandbox/index.html`,
`app/vite.config.ts` are unchanged (`git diff main...9b1b9ff` on those paths is
empty) — sandbox flags (`sandbox="allow-scripts"`, no `allow-same-origin`)
untouched.

## Gate result

- `cd app && npx tsc --noEmit` — clean, no output.
- `cd app && npx vitest run` (whole suite, not the filter the implementer used)
  — **115 files / 1061 passed**. Prior main suite (R97's own UI-6 landing note)
  was 111 files / 1023 passed → **38 new tests**, matching the implementer's
  report exactly.
- `cd app && npx vite build` — succeeded, both entries emitted
  (`dist/index.html`, `dist/src/routes/pages/Notebook/sandbox/index.html`).
  Verified in the real build output before deleting `dist/`:
  `notebookSandbox-*.css` defines `--chart-1`…`--chart-8` at the documented
  hexes, plus `--bg:#121412`, `--rule:#353a32`, `--font-mono:"IBM Plex Mono"…`;
  `notebookSandbox-*.js` contains `getPropertyValue`, `tabular-nums` and
  `marginLeft` — the theme is really wired into the sandbox bundle, not just
  claimed. `dist/` deleted after inspection.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `app/src/routes/pages/Notebook/theme/plotTheme.ts` (whole file), `CHANGELOG.md` UI-8 entry | `plotTheme`'s own doc comment quotes the brief's interface verbatim — "…11 px `--fg-dim` tick labels, uppercase tracked axis titles, no frame…" — but the implementation never sets `text-transform`/`letter-spacing` for axis titles, and axis titles are a live feature (`plotForm/generate.ts` renders `x.label`/`y.label` into every generated `Plot.plot` call, not hypothetical). The doc comment discloses one Plot-API limitation in detail (no top-level knob to colour the tick vector separately from tick-label text) but is silent about this second, equally real gap, and the CHANGELOG's UI-8 entry and "Parity gap" line don't mention it either. Silence is not deferral (this lane's own `PLAN.md`). A per-call `Plot.axisX`/`Plot.axisY` mark would be needed to style titles distinctly from tick labels (same reasoning the author already used for the colour split), which is legitimately out of a single merged options object's reach — but that should have been stated, not omitted. | State the gap explicitly in `plotTheme.ts`'s doc comment (next to the existing tick-vector-colour paragraph) and in the CHANGELOG's parity-gap line, or implement it via an explicit axis mark if the lead wants it now. |
| Minor | `app/src/styles/tokenSheet.test.ts:150` | The colour-literal scan (`listFiles(SRC_DIR, [".css", ".tsx"])`) only reads `.css`/`.tsx` files. All four new `theme/*.ts` modules and the edited `sandbox/main.ts` are plain `.ts` and are invisible to this gate — not a regression introduced by UI-8 (the scan's extension list predates this task), but worth flagging since this task is exactly the kind of change (new `.ts` files touching colour) the test exists to catch, and it currently doesn't reach the sandbox entry at all. No literal was actually written outside `tokens.css` in this diff (checked by hand: `turbo.ts` computes an `rgb()` string from numeric channels, never a literal; `series.ts`/`plotTheme.ts` only read tokens) — this is a coverage gap, not a live violation. | Broaden `listFiles`'s extensions to include `.ts`, in a follow-up task (touches shared test infra, not UI-8's own files). |

## Verification detail

- **Turbo port correctness (spot-check).** The polynomial coefficients in
  `turbo.ts` are byte-identical to the published Turbo GLSL polynomial
  (Mikhailov 2019, `kRedVec4/kGreenVec4/kBlueVec4` + the two-term tails).
  Hand-computed `t=0 → [35,23,27]`, `t=0.5 → [150,250,80]`, `t=1 → [144,13,0]`
  from the coefficients myself and they match the test's asserted values
  exactly — not a copy of the implementer's numbers, an independent recompute.
- **Series cycle.** `seriesColor`/`seriesPalette` resolve `--chart-1`…`--chart-8`
  through an injected `CssVarReader`, wrap by `% 8` (tested at indices 0–7, 8,
  15), and throw `MissingChartTokenError` — never a guessed hex — on an empty
  read; test asserts both the throw and the error message naming the token.
  This matches the brief's own instruction to "decide and document which" of
  throw-or-fallback, and documents why (any hardcoded fallback would itself be
  a hex literal outside `tokens.css`).
- **`plotTheme`.** Grid/axis = `--rule`, tick style = `--fg-dim` mono
  `tabular-nums` at 11 px, no `marks`/frame, `marginLeft` a documented fixed
  constant (not a runtime text-measurement pass, per the brief's own
  recommendation on open question 2) — all match `UI-DIRECTION.md` except the
  axis-title gap above.
- **`themedPlot` merge (`sandbox/main.ts`).** Top-level shallow merge lets a
  cell's own `grid`/`marginLeft` win; `style` merges key-by-key so a cell that
  sets only `style.fontWeight` keeps the theme's `background`/`color`/
  `fontFamily`, and a cell's own `style.color` wins over the theme's if the
  cell sets it explicitly — documented in the function's own comment, a
  reasonable and disclosed precedence choice.
- **R69 boundary.** `sandbox/main.ts` imports `../../../../styles/tokens.css`
  — a stylesheet for the sandbox's own document, not a new channel. No
  `postMessage`/IPC surface added; `documentVars(document)` inside the
  constructor reads the sandbox's own `document` global, never the host's.
  `themedPlot` spreads the sandbox's own bundled `@observablehq/plot` module
  (a separate copy via the separate Vite entry, R56) — no host object or
  reference crosses into cell-code scope. `SandboxHost.ts` and
  `sandbox/index.html` are byte-identical to `main` (no diff), so
  `sandbox="allow-scripts"` with no `allow-same-origin` is untouched.
- **Behaviour scope.** No gesture/settle/binding file changed (`ChartCell.tsx`,
  `RasterUnderlay.tsx`, `hostVariables.ts`, `protocol.ts` all absent from the
  commit's file list) — no chart interaction behaviour touched, matching "Do
  not change what any chart plots… or any settle path."
- **Tests.** All four new test files use Arrange/Act/Assert with blank lines
  and `thing — condition — result` names; each assertion checks what its
  `describe` block claims (spot-checked, not just read for shape).
- **CHANGELOG.** The UI-8 entry accurately describes what landed, correctly
  restates R97's own finding that no host-side `Plot.plot` call site exists,
  and honestly discloses `slotStates.ts` as unwired — but omits the axis-title
  gap (Important finding above).
- **Commit hygiene.** Single-line commit message, no AI attribution trailer,
  no bare `// TODO`, no NUL bytes in any touched file.

## Verdict rationale

The maths (Turbo, series cycle) is exact and independently verified; the
sandbox/host security boundary (R69) is unweakened and correctly reasoned
through; the build genuinely proves the sandbox carries the tokens, not just
claims it; tests are real Arrange/Act/Assert with correct names and correct
assertions; the gate (tsc + full vitest + one vite build) is clean at the
counts claimed. The one real defect is a silent, undisclosed gap against a
requirement the task's own interface doc-comment quotes verbatim (uppercase
tracked axis titles) — a genuine spec-compliance miss under this lane's own
"silence is not deferral" rule, but cosmetic in effect and cheap to disclose
or fix. Nothing here rises to Critical; nothing blocks merge, but the gap
should be named before the lead calls this done.

VERDICT: NEEDS_FIXES
