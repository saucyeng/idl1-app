# Brief: layout presets per aspect class (R213)

Lean owner, TypeScript only, never cargo. Worktree `../idl1-app-worktrees/presets`. Read
CLAUDE.md, rulings R107, R161 (+ amendment), R184, R212, R213; `app/src/shell/{layout.ts,
columnPrefs.ts, columnVisibility.ts, ColumnFrame.tsx, RouteHost.tsx, graphSlot.ts}` and
`Notebook/model/notebookColumns.ts`. Isaac: "hop back to having the output notebook
fullscreen when I'm done with maths; different setups on my ultrawide vs 16:9; stack the
sources and maths map vertically on 16:9."

## Rulings (R213; do not ask)
1. **Four presets, over the existing column mechanism**, no new window manager:
   - *Output*: notebook output full width; graph, properties, cells collapsed.
   - *Maths*: graph + properties + cells shown; output narrow (min width, still live).
   - *Split*: today's studio arrangement.
   - *Stacked*: the graph column becomes a **row above the output** (ColumnFrame gains a
     `row` orientation for that one panel); properties and cells as in Split.
   Paper/Studio (R184) stays an independent switch and is not part of a preset.
2. **Remembered per aspect class.** Class = viewport width / height: `ultrawide` ≥ 2.1,
   `wide` ≥ 1.5, `narrow` otherwise. The active preset is stored per class in the existing
   per-machine prefs store (beside `columnPrefs`), so the same laptop on a different monitor
   recalls its own preset automatically; the class is re-evaluated on resize with a 200 ms
   debounce and never flips during a gesture. Defaults: ultrawide → Split, wide → Stacked,
   narrow → Output.
3. **One shortcut cycles presets** (Ctrl+Shift+L, Output → Maths → Split → Stacked → …) and
   the toolbar's `view` group gains a compact preset picker (four icons with labels at the
   density scale; folds with its group per R212). Applying a preset writes the column
   visibility the R161 toggles already read, so the toggles and the preset never disagree:
   toggling a column by hand moves the class to a "custom" state until a preset is picked.
4. Pure modules: `shell/aspectClass.ts` (size → class), `shell/layoutPresets.ts` (preset →
   column visibility + orientation, cycle order, custom detection), both tested. Component
   wiring not unit-tested. No IPC, no spec change ("no spec change needed", say so).

## Gates
From `app/`: `npx tsc --noEmit`, `npx vitest run` (baseline 204 files / 2070), `npx vite build`.
One reviewer (sonnet). Merge `--no-ff` into main (main into branch first), CHANGELOG, retire in
the R171 order (`rmdir node_modules` from cmd inside the worktree's `app/`, confirm gone, then
remove, delete branch, verify 136). Lanes never create branches in the main checkout. Never
push. Report 10 lines or fewer.
