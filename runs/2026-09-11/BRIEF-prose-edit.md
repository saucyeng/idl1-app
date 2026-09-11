# Brief: prose edits in place (R226)

Lean owner, TypeScript only, never cargo. Worktree `../idl1-app-worktrees/prose-edit`. Read
CLAUDE.md, rulings R210, R214 (document-range map, `editCell`), R216, R226; `Notebook/model/
documentRanges.ts`, the prose block renderer in `Notebook/components/` (whatever renders
Markdown cells and `${…}` inline values), `CellFrame.tsx`, `editor/` (CodeMirror setup), and the
save/evaluate debounce path. Isaac: "what would it take to get the notebook text synced to
being edited from within the notebook?"

## Rulings (R226; do not ask)
1. **Click-to-edit, not WYSIWYG.** Clicking a rendered prose block (or pressing Enter with it
   selected) replaces it in place with a CodeMirror mini-editor holding that cell's Markdown
   source; Ctrl/Cmd+Enter or blur commits, Esc cancels; commit writes through `editCell` using
   the R214 range map and re-renders. Inline `${…}` values are edited as source. No rich-text
   layer; the file is the truth and a Markdown round-trip through a WYSIWYG is lossy.
2. **Both surfaces.** Works in the Cells column and in the paper view on desktop; on the narrow
   sheet it opens the existing whole-editor sheet instead (R185).
3. **Status and safety.** The editing block shows the R210 status glyph while its re-evaluation
   settles; a commit that fails validation keeps the editor open with the error under it; the
   whole-workbook code column (R214) reflects the change immediately via the shared document.
4. Pure module `model/proseEdit.ts` (open/commit/cancel state and the range → source → new
   document transform) with tests; component wiring not unit-tested. No spec change needed
   (say so). CHANGELOG `[docs]`.

## Gates
From `app/`: tsc, vitest (baseline from main), vite build. One reviewer (sonnet). Merge --no-ff
(main into branch first), retire in the R171 order. Lanes never create branches or edit files in
the main checkout. Never push. Report 8 lines or fewer.
