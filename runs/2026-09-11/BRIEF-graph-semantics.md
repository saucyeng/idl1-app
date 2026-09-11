# Brief: graph semantics -- node kinds, subgraph names, whole-workbook code panel (R214)

Lean owner, TypeScript only, never cargo. Worktree `../idl1-app-worktrees/graph-semantics`.
Read CLAUDE.md, rulings R160, R161, R212, R214; C2 §2.4 (`# label:`), §3.7.3 (cell display
name: `# label:` else the cell id), §5.1; `docs/UI-DIRECTION.md`; the graph module
(`Notebook/graph/*`), the code pane (`Notebook/components/CodePane.tsx`, `editor/`), and the
properties/code column wiring in `Notebook/index.tsx`. Isaac: "the flow diagram can have
some sort of coding to show channels, maths/synthetic channels, and charts; colour coding
user-selectable; other ways, can be subtle"; "sub-blocks have weird names 1a000006";
"can the code panel be the whole workbook, and selecting anything in the flow chart or an
output plot just highlights that section of the code?"

## Rulings (R214; do not ask)
1. **Node kind is carried by shape and glyph, colour is optional.** Three kinds: *source*
   (device channel), *derived* (maths definition), *chart* (js cell output). Cues, all at the
   R212 density: source cards have a square-cornered left edge and a small waveform glyph
   in the header with the channel name in mono; derived cards are rounded with an `ƒ` glyph
   and the definition name in the body face; chart cards have a chart-type icon (from
   `chartTypeIcons.tsx`) and a thin bottom rule. Ports keep their shape encoding. A Settings
   toggle "Colour-code graph nodes" (off by default, in the existing prefs store) adds a
   4 px left stripe per kind using `--chart-N` tokens; nothing depends on it. Legend: a
   one-line key in the palette rail footer.
2. **Subgraph names.** Per C2 §3.7.3 a cell's display name is its `# label:`; the fallback
   is the id, which is what Isaac saw. New fallback: **"Cell N"** by document order, with
   the id as a tooltip and in the properties pane; never the bare hex in the frame title.
   Double-clicking a frame title (or an inline "Rename" in the properties pane) writes the
   `# label: <text>` line as the cell's first line through the ordinary cell-edit path
   (§3.7.3: an ordinary body edit, touches no `graph` key, moves nothing). Pure module
   `graph/cellDisplayName.ts` with tests.
3. **The code column is the whole workbook.** The Properties/Code column's code pane shows
   the entire `.idl1wb` document in one CodeMirror instance (the file is the truth), with
   folding per cell. Selecting a graph node, a subgraph frame, an output chart, or a cell in
   the Cells column **scrolls the document to that cell and highlights its range** (a
   subtle line-gutter band, not a selection); the highlight follows selection both ways:
   placing the caret inside a cell's range selects that cell in the graph and outputs.
   Edits go through the existing save/evaluate path with the same debounce as per-cell
   edits today; the per-cell JsCellFrame editors stay in the Cells column unchanged.
   Pure module `model/documentRanges.ts` (markdown -> cell id -> [from, to] offsets, and the
   inverse) with tests, built on the existing parser/front-matter utilities, never a second
   parser.
4. No spec change needed for 1 and 3 (say so). Item 2's rename uses existing C2 semantics.

## Gates
From `app/`: `npx tsc --noEmit`, `npx vitest run` (baseline: read from main at start),
`npx vite build`. One reviewer (sonnet). Merge `--no-ff` into main (main into branch first),
CHANGELOG, retire in the R171 order (`rmdir node_modules` from cmd inside the worktree's `app/`,
confirm gone, remove worktree, delete branch, verify 136). Lanes never create branches in the
main checkout. Never push. Report 10 lines or fewer.
