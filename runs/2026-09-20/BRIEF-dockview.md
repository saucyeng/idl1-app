# Brief: Dockview tiling window manager (R239, closes R227)

Lean owner, TypeScript only, never cargo. Worktree `../idl1-app-worktrees/dockview` (branch
`dockview`, junction `app/node_modules` to main's). Read CLAUDE.md, the digest entries R218,
R221, R225, R227, R239, `docs/UI-DIRECTION.md` shell sections, then `app/src/shell/`
(`layoutPresets.ts`, `aspectClass.ts`, `stackingLayers.ts`, the Notebook page's pane layout and
its Notebook/Maths/Code toggles in the ribbon and View menu).

## Do (commit after every task)
1. Add `dockview` (the React package, exact version pinned) to `app/package.json`. R171: an
   `npm install` inside a junctioned worktree replaces the junction, so instead remove the
   junction first (`cmd /c "rmdir node_modules"`, confirm main's `.bin/vite` still exists),
   run a real `npm install` in the worktree's `app/`, and tell the lead the same install must
   run in main at merge. Bundled CSS imported locally, no CDN.
2. Notebook, Maths (graph) and Code become Dockview panels inside the existing shell body
   (activity bar, sidebar, ribbon, status bar unchanged). Drag a tab to split, drag edges to
   resize, close/reopen from the ribbon toggles and View menu (toggles reflect panel presence).
3. Pure module `shell/dockLayout.ts` (+ tests): serialise/restore layout JSON, versioned,
   validated (a corrupt or older layout falls back to the default, never throws); persisted
   per machine (the store the presets use today). Presets from `layoutPresets.ts` become named
   layouts expressed in the same JSON and applied through the same path; the aspect-class
   default still picks the initial one.
4. Theme Dockview from the shell tokens (light/dark), inside the single stacking layer of R221;
   panels keep their scroll positions and the notebook cells do not remount on a re-dock if
   Dockview allows it (say what you found). Nothing blocks the main thread (R201).
5. `docs/UI-DIRECTION.md` amended (spec-during), CHANGELOG `[docs]`.

## Gates
From `app/`: tsc, vitest (baseline from main), the madge cycle scan
(`npx --yes madge@8 --no-spinner --circular --extensions ts,tsx --ts-config tsconfig.json src`),
vite build. One reviewer (sonnet). Do NOT merge: stop with the branch committed and report;
the lead merges (the dependency install touches main's node_modules). Never push. Lanes never
create branches or edit files in the main checkout. Escalate with "ESCALATION:" + a proposal.
Report 10 lines or fewer.
