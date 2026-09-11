# Brief: the ribbon -- tiered commands, big buttons, split dropdowns, full words (R225)

Lean owner, TypeScript only, never cargo. Worktree `../idl1-app-worktrees/ribbon`. Read
CLAUDE.md, `docs/UI-DIRECTION.md`, rulings R161, R212 (toolbar groups, density), R216, R220
(menu bar, command registry), R225; `Notebook/components/NotebookToolbar.tsx`,
`model/toolbarLayout.ts` and its tests, `shell/commandRegistry.ts`, `shell/menuModel.ts`, the
toolbar slot, and the notebook's actions (save, export, new, create, rescan, pointer mode,
time/distance axis). Load the `frontend-design:frontend-design` skill before laying out the
ribbon. Isaac: "the save, export, new, create, rescan, mouse, time/distance buttons all
overlap; a CAD-style deal where they can be both big buttons and dropdowns that extend to
other big buttons, small buttons and nested dropdowns; think through the tiers: what gets
used all the time, occasionally, and the bare minimum that won't overwhelm a new user; the
toolbar and its buttons can be bigger; Graph/Properties/Cells deserve full words: Maths,
Code, Notebook."

## Rulings (R225; do not ask)
1. **One command-tier table**, `shell/commandTiers.ts` (tested): every notebook command
   with `id`, label, icon, tier (`core` | `occasional` | `rare`), group, parent (for split
   dropdowns), shortcut, and the registry action it invokes. The ribbon, the menu bar
   (R220) and the palette all render from this table; nothing is registered twice.
2. **Tiers.** Core (big labelled buttons, always visible): Open, Save, Import, the
   session/window chip, the three panel toggles renamed **Notebook**, **Maths**, **Code**
   (full words; the Cells column is "Notebook", the graph is "Maths", properties/code is
   "Code"). Occasional (a split-button dropdown attached to its core action): New from
   template and Create under Open; Export under Save; Rescan and Rebuild under Import;
   time vs distance axis and pointer mode under a "View" split button. Rare (nested one
   level inside the relevant dropdown): maintenance, diagnostics, dev toggles.
3. **Ribbon geometry.** One row, 40 px; big buttons are icon-over-label 36 × 36 at the
   density scale's 11 px label; split buttons have a 16 px chevron half; dropdowns are the
   R220 menu primitive with nested submenus. Groups keep R212's collapse-whole-into-"⋯"
   behaviour, measured widths, `shrink-0`, and the overlap test. **Fix the actions-group
   overlap at its root**: buttons inside a group must lay out with `flex-nowrap` and
   measured widths like the groups do; add a test that two sibling buttons never overlap.
4. **New-user minimum** is exactly the core tier; a Settings toggle "Show occasional
   commands as buttons" (default off) promotes tier 2 to visible small buttons for people
   who want everything on screen.
5. Paper/Studio and the layout picker stay in the ribbon's view group until R227 replaces
   presets; do not redesign them. No spec change needed; UI-DIRECTION's toolbar paragraph
   amended in the same lane (spec-during for the design doc). CHANGELOG `[docs]`.

## Gates
From `app/`: `npx tsc --noEmit`, `npx vitest run` (baseline: read from main), `npx vite build`.
One reviewer (sonnet). Merge `--no-ff` into main (main into branch first; `merge.renormalize`
is set), retire in the R171 order (`rmdir node_modules` from cmd inside the worktree's `app/`,
confirm gone, remove, delete branch; node_modules non-empty and unchanged). Lanes never
create branches or edit files in the main checkout. Never push. Report 10 lines or fewer.
