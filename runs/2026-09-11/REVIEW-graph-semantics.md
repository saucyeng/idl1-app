# Review: graph-semantics (R214)

Commits reviewed: `58b6cae` (notebook: graph node kinds, subgraph names,
whole-workbook code pane), `eacc9b1` (changelog). `1e8ebbf` is a merge of
main, not reviewed as a diff.

Files touched: CHANGELOG.md; Notebook/components/{CodePane,EditorPanes,
WorkbookCodePane}.tsx; Notebook/editor/idl1Language.ts (new); Notebook/graph/
{GraphCanvas,NodeCard,SourcePaletteRail,SubgraphCollapsedNode,
SubgraphFrameNode,cellDisplayName(+.test),nodeKind(+.test)}.tsx/.ts;
Notebook/index.tsx; Notebook/model/{documentRanges(+.test),graphAutoLayout.
test,graphModel(+.test),graphStatus(+.test)}.ts; Settings/{ThemeSection,
prefs,prefsMigration.test,settingsBackend.test}.

Test command (from `app/`, run once):
`npx vitest run src/routes/pages/Notebook/model/documentRanges.test.ts
src/routes/pages/Notebook/graph/cellDisplayName.test.ts
src/routes/pages/Notebook/graph/nodeKind.test.ts
src/routes/pages/Notebook/model/graphModel.test.ts
src/routes/pages/Notebook/model/graphStatus.test.ts`

Result: **5 test files passed, 58 tests passed.**

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `graph/SubgraphFrameNode.tsx` (rename gesture) | Brief item 2 offers rename via frame title *or* an inline "Rename" in the properties pane; only the frame-title gesture was implemented. Acceptable per the brief's "or" wording, but properties-pane parity (and the "id... in the properties pane" clause) was not verified to be wired — properties pane itself wasn't touched by this diff. | If the properties pane doesn't already show the cell id/rename affordance, confirm with the lead whether that half of R214 item 2 is satisfied elsewhere or deferred. |
| Minor | commit `58b6cae` | Brief item 4 ("say so" — no spec change needed for items 1 and 3) is not stated explicitly in the commit message or CHANGELOG; it's implicit from the fact no SPEC file is touched. | Not a functional issue; note for process compliance only. |
| Minor | `graph/NodeCard.tsx:238` (approx, `nameFaceClass` span) | `cue.nameFaceClass` for source is `font-mono`; fine. Derived/chart use `""` (inherits body face) — correct per R214, no issue, listed only because it was double-checked and confirmed correct (no finding). | — |

No Critical or Important findings.

**Correctness spot-checks performed:**
- `documentRanges.ts`: byte→char offset table (`buildByteToChar`) walks
  code points, correctly handles surrogate pairs (2 UTF-16 units) vs. 1–4
  UTF-8 bytes, and the exclusive-end convention is verified against
  `model/cells.ts`'s own UTF-8-byte convention (`scanCells`,
  `replaceCellBody`). Tests include a non-ASCII-before-cell case exercising
  the byte/char divergence. `cellIdAtOffset` is inclusive on both ends,
  matching the fold/band-range semantics used downstream.
- `WorkbookCodePane.tsx`: the caret→selection and selection→band effects
  are one-directional by construction — the "selection in" effect
  (`selectedCellId` prop) only dispatches `setBandedRange`/`scrollIntoView`
  effects, never a text-selection change, so it cannot re-trigger the
  `selectionSet` branch of the update listener; the caret→selection
  direction guards with `cellId === selectedCellIdRef.current` before
  calling back out. No echo loop found. The external-`markdown`→full-text
  -replace effect uses the same "compare live doc to prop" guard already
  present in `CodePane.tsx` pre-lane, so the debounce race it could in
  theory hit (a stale prop clobbering an in-flight edit) is a pre-existing,
  accepted pattern, not new.
- `graphModel.ts`/`graphStatus.ts`: the new `"chart"` node/edge branch
  correctly scopes to `js` cells with a resolved id, resolves
  `channel()`/`spectrum()` reads against the same document-wide definition
  namespace math references use, and `chartMarkOf` degrades to `null`
  (never a guessed pictogram) outside `plotForm`'s grammar, matching the
  doc comment and tests. `chartPerWindow`'s aggregation mirrors
  `definitionPerWindow`'s decision-44 grey-eligibility handling, reading
  `CellOutput.errors` since a `js` cell has no `CellDefResult`.
- `EditorPanes.tsx` prop widening (`cellId`/`kind`/`code` → nullable) and
  its reuse across the four placements (`panes`, `inline`, `sheet`,
  portal): `wholeDocumentCode = placement !== "sheet"` correctly keeps the
  per-cell editor only in the narrow sheet, and `BrandSheet`'s `open` now
  additionally requires `openCellId !== null`, so the whole-document branch
  inside `EditorPanes` for `kind === null` never actually renders inside
  the sheet in practice.
- `index.tsx`'s `handleDocumentChange`: reuses the pre-existing `editCell`
  reducer action's "no `markdown` field ⇒ dirty-mark only" contract
  (already covered by `workbookState.test.ts`) rather than inventing new
  reducer behaviour; falls back to `editFrontMatter` when no cell body
  changed. Matches the doc comment and R214 item 3's dirty-cell rule.

**CLAUDE.md spot-checks:** doc comments present on all new public symbols
(`documentCellRanges`, `cellIdAtOffset`, `rangeForCell`, `changedCellIds`,
`nodeKindOf`, `cellDisplayNames`, `displayNameFor`, `setCellLabelLine`,
`WorkbookCodePane`, etc.); units N/A (no bare numeric domain values beyond
existing `CODE_CHANGE_DEBOUNCE_MS`, unchanged); no `unwrap()`-equivalent
unsafe access — array/map lookups use `??`/optional chaining throughout;
test names consistently follow `thing — condition — result` with
Arrange/Act/Assert (blank-line separated, comments present in
`graphStatus.test.ts`, implicit blank-line separation elsewhere); no stray
reformatting beyond the deliberate `CodePane.tsx`→`idl1Language.ts`
extraction (content moved verbatim, diff confirms no logic change beyond
adding the new document-language builder).

**Verdict rationale:** The diff implements all three R214 rulings as
specified — structural (non-colour) node-kind encoding with an opt-in
colour stripe and palette-footer legend (item 1), "Cell N" display-name
fallback with hex-id demoted to tooltip and a working rename-through-body
-edit gesture (item 2), and a genuine whole-document CodeMirror instance
with byte-safe range mapping, per-cell folding, and a one-directional
(non-echoing) two-way selection tie (item 3). The new `chart` node kind in
the graph model/status modules is scoped correctly and tested. No source
of the previously-flagged bug classes (byte/char confusion, stale-closure
echo loops, incorrect widening) was found. Only process-level minor gaps
(explicit "no spec change" statement, properties-pane rename parity
unverified) were noted. Targeted vitest gate passed with a non-zero count
(58 passed).

VERDICT: CLEAN
