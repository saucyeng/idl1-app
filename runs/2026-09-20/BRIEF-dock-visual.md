# Brief: Dockview visual verification and fixes (R239/R244 follow-up)

Lean owner (Opus), TypeScript/CSS only, never cargo. The Dockview lane merged unverified by eye.
The dev app is RUNNING now from the main checkout (`npm run tauri dev`, vite HMR on port 1420),
so, as a granted exception, you edit `app/src` directly in the MAIN checkout
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` on `main` and see each change hot-reload.
Do not switch branches, do not touch `rust/`, `docs/superpowers/specs/` (another session has
an uncommitted edit there), `.claude/worktrees/`, or the other lanes' worktrees. Do not stop or
restart the dev app; if it dies, say so and carry on with gates only. Never push.

You can see the app: `powershell -NoProfile -File runs/2026-09-20/capture-app.ps1 -Out <png>
-Width 2400 -Height 1500` resizes the window without stealing focus and writes a half-scale
PNG; Read the PNG. Save shots in your scratch dir, not the repo. You cannot click; to exercise
states use what hot reload gives you (temporarily change a default, capture, revert) and the
persisted per-machine layout store. Keep captures few (each costs tokens): one per hypothesis.

Read CLAUDE.md, digest entries R221, R225, R239, R244, the Dockview lane's CHANGELOG entry and
`app/src/shell/DockFrame.tsx`, `dock.css`, `dockLayout.ts`, `WelcomePanel.tsx`, the
`outputSlot`/`graphSlot`/`editorSlot` portals.

## What the lead saw in the first capture (2400x1500, MX day workbook open, no session)
1. **Notebook panel content does not wrap and is clipped at the right edge.** Prose paragraphs
   run past the visible panel ("... in session 1. The sum of" cut off). Either the dock or the
   overlay render container (`renderer: "always"`) is wider than its host, or the portaled
   notebook lost its width constraint / max-width column. Find the cause; the notebook must wrap
   to its panel at every panel width.
2. **Notebook typography looks flattened**: headings ("1. The day in numbers") render as body
   text, paragraphs have no spacing, math-cell labels and their error text run together
   ("km/hmath_unknown_channel: ..."). Compare with how the page rendered before the merge
   (`git show 4c0f620:<file>` for the old column components): if styles were scoped to an
   ancestor that the portal no longer sits under, restore them. If it always looked like this
   in the error state, say so and leave it.
3. **Ribbon, left cluster**: the Notebook / Maths / Code toggle labels look squashed or
   overlapping under their icons. Check at 2400 and at 1400 wide.
4. **Banner**: "The function reference is out of date with the engine (5 mismatches)". Find
   which five functions and why (the TS-side signature table vs the engine catalog after
   today's PR #1 and the laps-shapes builtins). If the fix is TS-side or a regenerated file,
   fix it; if it needs a Rust change, report the exact five and stop on that item.
5. Then verify by capture, fixing what is wrong: dock tab strip and sash theming in dark
   (and light if reachable), the Welcome panel (empty dock and no-workbook states), Help >
   Welcome dialog if reachable, status bar and activity bar unaffected, nothing painting over
   the ribbon (R221 single stacking layer).

## Gates and finish
Commit after each fix on `main` (plain messages, no AI attribution). From `app/`: `npx tsc
--noEmit`, `npx vitest run`, the madge cycle scan, `npx vite build`. CHANGELOG `[no-docs]`
entries under Fixed. No reviewer needed for CSS-only fixes; one Sonnet reviewer if you change
logic. Report 12 lines or fewer: each of items 1-5 with cause and fix (or "as designed"),
commits, gate counts, and anything you could not reach without clicking.
