# Brief: errors and staleness (W3.3 lane E, plan items 58–63)

Lean owner, TypeScript only, never cargo. Worktree `../idl1-app-worktrees/errors-staleness`.
Read CLAUDE.md, `docs/UI-DIRECTION.md` (decisions 58–63 as the plan cites them), `runs/2026-09-07/
WAVE3-PLAN.md` §W3.3 row E, and the rulings that already landed parts of this: R210 (per-cell
status), R216 (glyph status, hover error), R221 (decode progress ring, `resource_exhausted`
toasts), R226 (prose edit keeps the error under the editor). Then the notebook's cell frames,
`model/cellStatus.ts`, the sandbox message protocol's error shape, the selection store, and the
prose `${…}` inline-value renderer. Isaac's standing wish: nothing ever blanks or freezes; state is
always visible.

## Do, per plan item, one commit each; where a ruling already covers part, extend, never fork
58. **Empty slot + message + Fix.** A chart or value whose binding cannot resolve (channel gone,
    definition renamed, session lacks the channel) renders an empty slot the size the chart
    would be, a one-line message naming the missing thing, and a Fix button that opens the
    Properties form (or the code, for prose) at the offending field. Never a blank.
59. **Staleness = greyed with spinner.** While a cell re-evaluates after an upstream change, its
    last output stays visible, greyed, with the R216 spinner glyph; it never blanks (decision 59).
    Extend `cellStatus.ts` with a `stale` flag distinct from `evaluating`-from-scratch.
60. **Gap/burst hatching, soft.** Time-series charts hatch spans where the source has no samples
    (recorded gaps, burst seams from C1 §3.3) using a subtle diagonal pattern from the chart
    tokens; data from the engine's existing gap/seam metadata if exposed, else escalate with the
    C3 field needed.
61. **Selection empties everything.** Clearing the session/window selection puts every cell into
    the item-58 empty state with the message "no session selected" and no Fix button (the fix is
    the Data tab); nothing keeps showing stale data for a selection that no longer exists.
62. **Version-change banner.** When the engine or app version differs from the one that last
    evaluated the workbook (front matter records it; if not, add an advisory front-matter key
    like C2 §3.7's `graph`, advisory only), show a dismissible banner "Evaluated with idl1
    X.Y; you are on X.Z" with a Re-evaluate action; never auto-rewrite the file.
63. **Inline `${…}` error marker.** A prose inline value whose expression fails renders a small
    ✕ marker with the message on hover, in place, instead of empty text or the raw expression.
Pure modules and tests for every decision; components not unit-tested. UI-DIRECTION amended where
a decision's wording no longer matches (spec-during); CHANGELOG `[docs]`.

## Gates
From `app/`: tsc, vitest (baseline from main), vite build. One reviewer (sonnet). Merge --no-ff
(main into branch first), retire in the R171 order with the tightened check. Lanes never create
branches or edit files in the main checkout. Never push. Report 10 lines or fewer.
