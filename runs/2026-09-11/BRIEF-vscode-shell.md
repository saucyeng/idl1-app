# Brief: the VS Code shell -- menu bar, activity bar, sidebar, editor area, status bar (R220)

Lean owner, TypeScript only, never cargo (the title-bar config already landed in R216).
Worktree `../idl1-app-worktrees/vscode-shell`. Read CLAUDE.md, `docs/UI-DIRECTION.md` (its
"App shell and navigation" section is superseded by this brief where they differ; amend that
section in the same lane, spec-during), rulings R161, R201, R212, R213, R216, R218, R220;
`app/src/shell/*` (AppShell, TopBar, RouteHost, ColumnFrame, GraphSlotColumn, toolbar slot,
the import/index/rebuild chip), `app/src/routes/pages/*/index.tsx` for what each route shows.
Load the `frontend-design:frontend-design` skill before laying out the chrome. Isaac: "steal
the whole outer shell and windowing behaviour from VS Code, since it's so well tuned:
standard File, Edit, etc. dropdowns on the top bar, and Device, Data, Notebook, Settings as
icons on the left".

## Rulings (R220; do not ask)
1. **Anatomy, top to bottom, left to right** (all at the R212 density; widths in CSS px):
   - **Title bar (32)** = R216's custom bar: app glyph, then a **menu bar** (File, Edit, View,
     Go, Help) rendered by us as dropdowns (Radix/`components/ui` menu primitive if present,
     else a small accessible menu component), drag region in the empty space, window controls
     right. Menus list the real commands that exist today (open/new workbook, import file,
     import folder, save, undo/redo via the editor, toggle columns/presets/Dense, cycle
     preset, go to each activity, About), each with its shortcut label; nothing invents a
     command that does not exist.
   - **Activity bar (48, left)** with four icons: Device, Data, Notebook, Settings; the active
     one carries a left accent bar; badges for live counts (import queue length, device
     connected dot, sync pending). Keyboard Ctrl+1..4.
   - **Sidebar (resizable, 200-480, collapsible with Ctrl+B)** whose content is the active
     activity's list/navigation: Data → the session list and library tools; Device → device
     list/status; Notebook → the workbook picker, worksheet tabs and the Cells list; Settings
     → its section list. The main area shows the activity's primary surface (Data → session
     detail; Notebook → the studio columns as today, minus whatever moved into the sidebar).
   - **Editor area** = today's RouteHost content with the notebook's toolbar row as its own
     toolbar (unchanged from R212).
   - **Status bar (22, bottom)**: session chip (moved here from the toolbar), sync status,
     the import/index/rebuild chip (moved here from AppShell), memory budget use as a small
     meter, and the layout preset name; click targets where sensible.
2. **Presets and dock zones map onto this**: R213 presets arrange the editor area's columns
   as today; the sidebar's width and collapsed state are per aspect class like presets;
   R218 dock zones (queued) will dock panels into the editor area only, never into the
   activity/sidebar/status chrome.
3. **Narrow (phone) layouts** keep the R184 paper/sheet behaviour: no activity bar; the four
   activities become a bottom tab bar (48) and the status bar is folded into it; the menu
   bar is absent (commands live in a "⋯" menu in the title strip).
4. **Nothing moves off the main thread rule**: all chrome is static; badges update from the
   existing stores; no new polling.
5. Pure modules, tested: `shell/menuModel.ts` (menu tree → commands + shortcuts, every entry
   resolving to an existing action or being absent), `shell/activityBadges.ts`, `shell/
   sidebarPrefs.ts`. UI-DIRECTION "App shell and navigation" amended in the same lane.

## Gates
From `app/`: `npx tsc --noEmit`, `npx vitest run` (baseline: read from main at start), `npx
vite build`. One reviewer (sonnet). Merge `--no-ff` into main (main into branch first; main
has `merge.renormalize`), CHANGELOG, retire in the R171 order (`rmdir node_modules` from cmd
inside the worktree's `app/`, confirm gone, remove worktree, delete branch; node_modules
non-empty and unchanged). Lanes never create branches or edit files in the main checkout.
Never push. Report 10 lines or fewer.
