# Brief: notebook density, infinite graph canvas, one-row toolbar, properties controls (R212)

Lean owner, TypeScript only, never cargo. Worktree `../idl1-app-worktrees/density` (junctioned
node_modules). Read CLAUDE.md, rulings R160, R161 (+ amendment), R208.2, R212 (digest), and
`docs/UI-DIRECTION.md` (the design language; its decisions are binding unless R212 says
otherwise). Load the `frontend-design:frontend-design` skill before the toolbar pass; the
brief is the structure, the skill is the craft. Isaac's words: "everything needs to be
compact on the notebook"; the graph: "everything's stacked on top of each other", "extend
the canvas boundary, infinite canvas CAD style, canvas space is cheap if we can reset the
zoom easily"; the toolbar: "two rows tall despite not having tools all the way across, then
the 'more' button just makes it scrollable, ridiculous all around, take a pass at it".

## Rulings (R212; do not ask)
1. **Density.** One notebook density scale in `app/src/styles/tokens.css` (or the existing
   token file): control height 22 px, label/mono text 11 px, body 12 px, 4 px inner padding,
   6 px gaps, applied to the graph's node cards, palette rail, sliders, buttons and the
   toolbar. The Data/Device/Settings pages are untouched. No per-component ad-hoc sizes.
2. **Infinite canvas.** The graph canvas pans (drag on empty space, or space+drag) and
   zooms about the cursor (wheel) without bounds; the column is a viewport, not the world.
   Corner cluster, bottom-right: Fit (F), Reset 100 % (0), and the existing minimap, which
   now shows the viewport rectangle over the whole node extent. Keyboard: F / 0 / +/-.
3. **Layout.** Nodes get an automatic layered layout on first open of a workbook (sources
   left, derived middle, charts right, by dependency depth; simple longest-path layering
   plus barycentre ordering, no new dependency) with 32 px node gaps and 96 px layer gaps,
   and a "Tidy" button that re-runs it. Node positions are **renderer state, per machine**
   (a sibling of `notebookColumns.ts`, keyed by workbook id + cell id), never written to
   the workbook file (§3 "the workbook is a file"; positions are not maths). Dragging a node
   persists its position; Tidy overwrites.
4. **Toolbar: one row, 32 px, never wraps, never scrolls.** Groups left to right:
   column toggles (Graph | Properties | Cells) · view (Paper | Studio) · window chip
   (session + laps, always visible) · playback transport (centre) · actions (right).
   When the width cannot hold every group, groups collapse **whole**, right to left
   (actions first, then view, then column toggles), into a single "⋯" dropdown menu that
   lists them with their labels; the window chip and transport never collapse. Icons carry
   text labels at 11 px; at the tightest width labels drop before groups do. Delete the
   scroll strip. Pure module `toolbarLayout.ts` (width → which groups are inline) with tests;
   measure with a ResizeObserver on the row, not window width.
5. **Chart properties controls.** The Properties form's controls become proper components
   at the same density: labelled number inputs with unit suffix and drag-to-scrub, compact
   select, colour swatch picker (the existing `ColourPicker`), toggle switches, and a
   section header per group. Reuse `components/ui/*` where a matching primitive exists;
   add only what is missing under `components/ui/`. No change to what the form edits.
6. **Order:** 1, 4, 2, 3, 5. Commit per task. If the graph library in `graph/` cannot do
   (2) without a rewrite, escalate with the smallest change that can.

## Gates
From `app/`: `npx tsc --noEmit`, `npx vitest run` (baseline 198 files / 2014). One reviewer
(sonnet) over the whole diff at the end; also a **visual self-check**: run `npx vite build`
to prove the bundle compiles. Merge `--no-ff` into main (main into branch first), CHANGELOG
lines, retire in the R171 order (`rmdir node_modules` inside the worktree's `app/` from cmd,
`Test-Path` False, then worktree remove, branch delete, verify 136). Never push. Report
12 lines or fewer.
