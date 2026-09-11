# Brief: shell polish -- custom title bar, edge-to-edge plots, dense stacking (R216)

Lean owner, TypeScript + `app/src-tauri/tauri.conf.json` + capabilities JSON, never cargo
(a `cargo check -p app` at the end is allowed because the capability file changes what the
app crate embeds; run it from the app worktree's `app/src-tauri` when the slot rule allows).
Worktree `../idl1-app-worktrees/shell-polish`. Read CLAUDE.md, rulings R161, R209, R210,
R212, R216; `docs/UI-DIRECTION.md`; `app/src/shell/{AppShell.tsx,TopBar.tsx,ToolbarSlotRow.tsx}`,
`app/src-tauri/tauri.conf.json`, `app/src-tauri/capabilities/default.json`,
`Notebook/components/{CellFrame.tsx,JsCellFrame.tsx,ChartCell.tsx,CellList.tsx}`.
Isaac: "the outermost shell with minimize/maximize/close inline with the File/Edit
dropdowns, like VS Code, to save the 10 px and look nicer"; "stack plots right on top of
each other with 0 px spacing; the (JS 01 · Settled · Show code) shell should merge into
the plot so the plot is as big as possible".

## Rulings (R216; do not ask)
1. **Custom title bar, Windows first.** `decorations: false` in `tauri.conf.json` for the
   main window; the shell's top bar becomes the title bar: 32 px, `data-tauri-drag-region`
   across its empty space, app navigation on the left, window controls (minimize,
   maximize/restore, close) on the far right drawn by us at the density scale, double-click
   on the drag region toggles maximize. Capabilities: `core:window:allow-minimize`,
   `allow-toggle-maximize`, `allow-close`, `allow-start-dragging`, `allow-is-maximized`.
   Known cost, accepted: Windows Snap Layouts on hover of the maximize button are lost with
   custom decorations; note it in CHANGELOG. macOS/Linux keep native decorations until a
   platform lane (`#[cfg]`/conf overlay) tests them; do not break them.
2. **Plot chrome merges into the plot.** The "JS 01 · Settled · Show code" strip stops
   existing as a row:
   - **Status is a glyph only**, no word: red ✕ (error), spinner (evaluating/queued),
     green ✓ (settled), 12 px, top-left corner overlay of the plot, fading out 2 s after a
     settle and shown persistently for error; the R210 gutter band goes away for chart
     cells (it stays for non-chart cells). **Hovering the ✕ shows the error text** in a
     tooltip (full message, mono, selectable); clicking pins it open.
   - **"Show code" moves to the right-click context menu** of the plot (with "Properties",
     "Tidy in graph", "Copy as PNG" if cheap; otherwise the first two only), and to a
     keyboard shortcut; no button on the plot.
   - **Title.** "JS 01" is the cell's ordinal by kind and is not a title; it stays only in
     the code column gutter and tooltips. The plot shows a **centred title at the top** only
     when the cell has a `# label:` (C2 §2.4) or the plot form's title field is set; the
     plot's own top margin absorbs it; no label = no title row.
   - **Legend.** When a plot has more than one series (channels or windows), a compact
     legend inside the plot's top-right at the density scale, series named by the channel
     or definition label with its unit (`CellDefResult.unit`), colours from `--chart-N`
     tokens; single-series plots show no legend. Plot's own legend facility where it fits
     the print palette rule (R174).
3. **Dense stacking option.** A notebook toggle "Dense" (toolbar `view` group, remembered
   per machine beside `notebookColumns`): cell gap 0 px, cell padding 0, chrome overlay-only,
   and adjacent time-series charts share their x-axis visually (the lower chart hides its
   top margin; axes still computed per chart, no data change). Off = today's spacing.
4. **Toolbar overlap bug (first task, before the rest).** After the presets lane added its
   picker and the density lane its `document` group, tools on the right of the toolbar
   overlap: `toolbarLayout.ts` collapses groups using fixed per-group widths that no longer
   match. Fix: measure each group's rendered width with one ResizeObserver per group
   (rAF-deferred, per the ResizeObserver rule) and feed real widths to the pure layout
   function; add a test that a group set whose sum exceeds the row width never yields two
   inline groups whose spans overlap. Verify at 1100, 1300 and 1600 px.
5. No spec change needed (say so). Pure modules for the chrome-visibility decision and the
   dense-mode geometry, tested; window-control wiring not unit-tested.

## Gates
From `app/`: `npx tsc --noEmit`, `npx vitest run` (baseline: read from main at start),
`npx vite build`; `cargo check -p app` from the worktree's `app/src-tauri` when the cargo
rule allows. One reviewer (sonnet). Merge `--no-ff` into main (main into branch first),
CHANGELOG, retire in the R171 order (`rmdir node_modules` from cmd inside the worktree's
`app/`, confirm gone, remove worktree, delete branch, verify 136). Lanes never create
branches in the main checkout. Never push. Report 10 lines or fewer.
