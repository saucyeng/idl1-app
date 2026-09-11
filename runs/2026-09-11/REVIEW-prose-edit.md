# Review: prose edits in place (R226)

Commit: b445d3c748c646107b3e8a64307b9f8ab4b99a04 (branch `prose-edit`)
Files touched: `CHANGELOG.md`, `app/src/routes/pages/Notebook/components/CellList.tsx`,
`app/src/routes/pages/Notebook/components/ProseBlock.tsx`,
`app/src/routes/pages/Notebook/components/ProseEditor.tsx`,
`app/src/routes/pages/Notebook/index.tsx`,
`app/src/routes/pages/Notebook/model/proseEdit.ts` (+ `.test.ts`)

Test command (run once, from `app/`):
`npx vitest run src/routes/pages/Notebook/model/proseEdit.test.ts`
Result: **1 test file passed, 18 tests passed** (573ms). Non-zero passed count confirmed.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No blocking findings. | — |

## R226 item-by-item

1. **Click-to-edit, not WYSIWYG.** `ProseBlock.tsx` adds `role="button"`, `tabIndex=0`, click and
   Enter handlers (Enter only fires when `event.target === event.currentTarget`, so it doesn't
   fire from inside a nested focusable child) that call `onEdit`. `clickMeansEdit` correctly
   excludes clicks that land on a link or that end an active text selection (`selection.isCollapsed`
   check), so selecting text in a prose block does not accidentally open the editor. `ProseEditor.tsx`
   uses CodeMirror over `model/proseEdit.ts`'s `source`; the JSDoc on the module explains why a
   rich-text/WYSIWYG layer is rejected (lossy Markdown round-trip). Ctrl/Cmd+Enter and Esc are bound
   via CodeMirror's keymap; blur is bound via `EditorView.domEventHandlers`. Compliant.

2. **Both surfaces / narrow fallback.** The brief text says "works in … the paper view on desktop",
   but `model/paperView.ts` (`paperViewActive`, unchanged by this commit) ties paper to width only —
   there is no "desktop paper view" anywhere in the codebase; paper *is* the narrow layout (R184/R185,
   quoted verbatim in that file's doc comment: "the narrow `sheet` placement *is* the paper view").
   The lane's reading — enable click-to-edit in the Cells column at wide and medium widths
   (`onEditProseBlock={paperActive ? undefined : openProseBlockEditor}` in `index.tsx`), leave the
   narrow paper surface on the existing R185 tap-to-sheet path — is the only reading the code's actual
   state supports; there is no "desktop paper view" to wire this into. This is correctly diagnosed
   and documented in-line (`index.tsx`'s comment on `proseEditorElement`: "Never offered at paper
   widths: there the whole editor opens in the narrow sheet instead"). Accept as the right call; worth
   the lead correcting the brief's wording for future reference, not worth a rework.

3. **Status and safety.** `ProseEditor` renders the R210 status glyph (`cellStatusFor`, the same
   4-state switch used elsewhere) next to the editor. A rejected commit
   (`commitProseEdit` → `{status:"rejected", session}`) keeps `proseEdit` non-null with `session.error`
   set, so the editor stays open and `showError` renders the message under it. `index.tsx`'s
   `commitProseBlockEdit` dispatches `editCell` with the *new* full markdown, which is the same path
   every other cell edit already goes through, so R214's whole-workbook code column updates via the
   shared document/state, not a bespoke channel. Compliant.

4. **Pure module + tests, no spec change.** `model/proseEdit.ts` imports only `./cells`; no React, DOM,
   or IPC import — verified by reading the full file. `proseEdit.test.ts` has 18 cases, each named
   `thing — condition — result`, each with Arrange/Act (sometimes merged into one `const` line, as the
   convention in this codebase's other test files does) separated from Assert by a blank line. Coverage
   is thorough: null returns for a missing cell, a malformed block id, a stale-range commit, a fence
   rejection, an unchanged draft, a document edited elsewhere while open, and a UTF-8-offset case
   (`Über — µ`). `CHANGELOG.md` carries the `[docs]` entry under Added, dated 2026-09-11, R226. No SPEC
   file was touched, consistent with "no spec change needed"; that declaration itself lives in the
   lane's report to the lead, not in the diff, which is where CLAUDE.md §6 expects it said out loud —
   not visible to this review, flagged as informational only, not a code finding.

## Correctness spot-checks

- **Byte→char offsets.** `byteToChar` encodes the whole document once per call and decodes the byte
  prefix with `TextDecoder`; `cells.ts` confirms `proseBeforeRange`/`proseAfterRange`/`bodyRange` are
  UTF-8 byte offsets (`totalBytes`, `segmentStart` are byte-space), so the JS-string-index claim in the
  module doc comment is accurate. `proseEditTarget` builds `from`/`to` from this and slices `markdown`
  with them directly — the non-ASCII test (`Über — µ`) exercises exactly this path.
- **Splice.** `commitProseEdit` re-resolves the target's range from the `markdown` argument passed at
  commit time (not from `session.target`, which was captured at open time), so a document mutated
  while the editor was open is spliced at the block's *current* location — test "the document edited
  elsewhere while the editor was open" confirms this directly. The trailing-newline restoration
  (`target.source.endsWith("\n") && !draft.endsWith("\n")`) prevents a dropped final newline from
  gluing prose onto the next fence-open line; covered by its own test.
- **Structural safety net.** `cellBodiesChanged` first compares a cheap key (id + infoLine + body
  byte-length per cell, in order) and, only if that matches, falls back to a byte-exact body comparison
  per cell — this catches same-length-but-different-content tampering that the cheap key alone would
  miss. A commit that would change any cell's id or body is rejected rather than written.
- **Double-commit / stale-blur.** `ProseEditor`'s `settledRef` is set to `true` synchronously inside
  the Mod-Enter and Escape handlers *before* calling `onCommit`/`onCancel`; the blur handler checks
  `settledRef.current` first and no-ops if already settled, so an explicit commit or cancel cannot be
  followed by a second commit from the blur that unmounting/focus-loss causes. On a *rejected* commit
  the `useEffect` keyed on `error` resets `settledRef.current = false` and refocuses the view, correctly
  re-arming blur/Esc/Mod-Enter for the next attempt. No double-commit or dead-blur path found.
- **No untyped errors.** `ProseCommit`'s `rejected` status carries a `string` message, but it is a
  discriminated union member for UI display (same pattern as other cell-edit validation in this
  codebase), not a substitute for a typed error channel — `openProseEdit`/`proseEditTarget` return
  `null` (not throw, not `Err(String)`) for the "doesn't exist" case. Acceptable.
- **No renderer-only parameters.** The module operates purely on the document string (already the
  source of truth in this layer via `editCell`); nothing here duplicates state that belongs in Rust.
- **Doc comments.** Every exported type/function in `proseEdit.ts` and the new props on
  `ProseEditorProps`/`ProseBlockProps`/`CellListProps` carry doc comments with units/rationale where
  relevant (byte vs. char offsets called out explicitly).
- **No stray reformatting.** The `CellList.tsx`/`ProseBlock.tsx`/`index.tsx` diffs touch only the lines
  needed to wire the new props/handlers; no unrelated line noise.

## Verdict rationale

The module is genuinely pure, the tests are AAA-formatted, correctly named, and exercise the byte-offset
conversion, the re-resolve-at-commit-time splice, the structural safety net, and the rejection/re-arm
path with real assertions rather than smoke checks. The component wiring correctly guards against
double-commit on blur-after-explicit-action and correctly re-arms after a rejected commit. The one
apparent brief/code mismatch (item 2's "paper view on desktop") is not a lane deviation — the codebase
has no such view (R184/R185 pin paper to narrow width only) — and the lane's reading is the only one
consistent with the existing architecture, documented inline. No renderer-only parameters, no untyped
failure paths, no undocumented public symbols, no unrelated reformatting. Targeted vitest run reports
18/18 passed, non-zero.

VERDICT: CLEAN
