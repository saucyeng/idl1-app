# Review: L9 "paper" lane, tasks 3, 4, 5

**Commits:** `7c3ce5e`, `bcd1a56`, `b23d933` (range `1e4cff3..b23d933`), worktree
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\paper`, branch `paper`.

**Files touched:**
- `app/src/routes/pages/Notebook/components/ReportView.tsx` (extraction, task 3)
- `app/src/routes/pages/Notebook/components/reportBlocks.tsx` (new, task 3)
- `app/src/routes/pages/Notebook/components/PaperView.tsx` (new, task 4)
- `app/src/routes/pages/Notebook/model/report/screenPalette.ts` (+test) (task 4)
- `app/src/routes/pages/Notebook/model/report/paperDocument.ts` (+test, `blockCellId` added) (task 4)
- `app/src/styles/paper.css` (new), `app/src/styles/index.css` (registration) (task 4)
- `app/src/routes/pages/Notebook/index.tsx` (wiring) (task 5)
- `app/src/routes/pages/Notebook/model/paperLive.ts` (+test, new) (task 5)

**Test command:** `npx tsc --noEmit && npx vitest run` (run once, from `app/`).
**Result:** `tsc --noEmit` — no output, clean. `vitest run` — **183 files passed
(183), 1843 tests passed (1843)**, matches the expected count exactly.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `app/src/routes/pages/Notebook/index.tsx:2757` | `columnsToggleAvailable && (...)` block's inner `<div role="group"...>` is indented two extra spaces relative to its sibling JSX (`{(entry === null...)}` at :2770), a pre-existing indentation glitch this diff did not introduce but also did not fix while touching the surrounding lines. | Not worth a separate task; note only. No fix required of this lane. |

No Critical or Important findings.

## Correctness questions, answered

1. **Rebuild effect dependencies (`index.tsx:2135-2186`).** Correct and non-looping.
   `paperDocRef` (the "is a last-good document held" check) and
   `combinedChannelDataRef` (the retained chart arrays) are both refs, deliberately
   excluded from the dependency array with a documented `eslint-disable`; the ref
   mutation of `combinedChannelDataRef` is instead surfaced through
   `channelDataEpoch`, a counter bumped at both call sites that write into that ref
   (`index.tsx:1831`, `:2520`) and listed as a real dependency. `setPaperDoc`/
   `paperDocRef.current = next` do not feed back into any of the effect's own
   dependencies (state.windows, state.cells, state.markdown, state.handle,
   state.evalRequestGeneration, proseBlocksByBlockId, paperSessions, xMode all
   change only from other, unrelated triggers), so there is no self-retrigger loop.
2. **Keep-last reachability.** Reachable: `workbookState.ts`'s `watchEvent` reducer
   case bumps `evalRequestGeneration` on any edit or externally-landed change, which
   makes every previously-`ok`/`error` window entry stale (`isWindowStale`, verified
   against `workbookState.test.ts:285-299`) until a fresh evaluation lands at the new
   generation. During that window `settledWindowCount < windowCount`, and with
   `paperDocRef.current !== null` from an earlier rebuild, `paperLiveDecision`
   correctly returns `"keep-last"`, verified in `paperLive.ts` and exercised by
   `paperLive.test.ts`'s "an edit made every window's result stale — keep-last" case.
   `isWindowStale` is applied per-window inside the effect's `settledWindowCount`
   computation exactly as documented, so staleness correctly blocks a rebuild rather
   than only being checked in the abstract.
3. **Stored visibility / other layouts.** Nothing on the paper path calls
   `writeNotebookColumnVisibility` — that function is only invoked from the existing
   `toggleColumn` handler, unrelated to paper. `cells`/`graph`/`properties`
   unavailability at narrow widths is expressed purely through the
   `notebookColumnAvailability` record passed into the existing
   `visibleNotebookColumnIds(visibility, availability)` seam (`notebookColumns.ts`,
   itself untouched in this diff), never by mutating the persisted `columnVisibility`
   state. The narrow `BrandSheet`/`PropertiesForm` path (`index.tsx:2994-3017`) is
   untouched; `PaperView`'s tap handler only calls `setSelectedCellId`, which drives
   the same pre-existing `openCellId`/`openCell` derivation the sheet already keyed
   off. Wide (`panes`) and medium (`inline`) layouts are unaffected: `paperActive` is
   only ever true at the `"sheet"` placement (`model/paperView.ts` delegates to
   `editorPlacement`), so `showGraph`/`showCells`/`showPropertiesPane` behave exactly
   as before at those widths (`notebookColumnAvailability.{graph,cells}` reduces to
   `!false = true` there, matching pre-diff behaviour with no availability gate).
4. **Task 3 extraction.** Diffed byte-for-byte against `e8b31dc`'s `ReportView.tsx`:
   `DefTable`, `Table`, `ChartSlotView`, the per-kind `Block` (renamed
   `ReportBlockView`, exported) all moved unchanged except doc comments updated to
   describe the now-shared usage and `PrintPalette` narrowed to a new alias type
   `ReportBlockPalette = PrintPalette` (a type alias, not a structural change).
   `ReportView.tsx` retains its own `buildPrintPalette()` call and chart-settle
   counter untouched. No behaviour change; no new tests added, matching the task's
   "pure refactor, no new tests" instruction.
5. **Print/paper agreement.** Both views import `ReportBlockView` from the same
   `reportBlocks.tsx` module, so a block kind renders identically in structure on
   both. Print still resolves `buildPrintPalette()` (`R174`, static black-on-white);
   paper resolves `buildScreenPalette(documentVars())` (app theme tokens), each built
   to the same `PrintPalette` shape so `ReportBlockView` takes one type. Block
   existence: print gets the untouched `buildReportDocument` output including
   `cover`/`appendix`; paper additionally runs `toPaperDocument`, dropping exactly
   `cover` and `appendix` (verified against `PRINT_ONLY_KINDS`) while keeping every
   `absence` block, matching R184 item 2 and the "never a silent gap" rule. The two
   fixed placeholders paper feeds `buildReportDocument` for `appVersion`/
   `generatedAtMs` are consumed only by `buildCover` (verified by grep against
   `document.ts`), and `cover` is exactly the block type paper drops, so the
   placeholders never reach the screen.

## House style

- Doc comments present on every new public symbol (`paperViewActive`,
  `paperLiveDecision`, `PaperLiveInput`, `toPaperDocument`, `blockCellId`,
  `buildScreenPalette`, `PaperView`, `PaperViewProps`, `ReportBlockView`,
  `ReportBlockPalette`).
- New tests (`paperLive.test.ts`, `screenPalette.test.ts`, the `blockCellId` cases
  added to `paperDocument.test.ts`) are `.ts`, vitest `node` environment, named
  `thing — condition — result` with em dashes, and use blank-line-separated
  Arrange/Act/Assert.
- No colour literal outside token references — `paper.css` uses only `var(--...)`
  custom properties throughout; `screenPalette.ts`'s one literal, `"currentColor"`,
  is a CSS keyword fallback, not a colour value, matching the same pattern already
  used by `renderChart.ts`'s `windowColour`.
- No IPC introduced on an interaction path: `PaperView`'s tap handler only calls
  `onSelectCell`/`setSelectedCellId`, a local state update; the `listSessions()` call
  feeding `paperSessions` is the existing settle-cadence effect (fires on selection
  change), not on a gesture.
- Commits are single-line, no AI attribution trailers.
- No bare `// TODO` added; none of `unwrap()`/`Err(String)` concerns apply (TS lane).

## Verdict rationale

Task 3 is a verified behaviour-neutral extraction. Task 4's `PaperView`,
`screenPalette.ts`, and `paperDocument.ts` additions correctly follow every ruling
(R184 items 1, 2, 7; app-theme palette, not print's; tap via `data-cell-id` plus one
delegated handler) and are well tested where testable. Task 5's wiring correctly
threads `paperViewActive`/`paperLiveDecision` into `index.tsx`, uses the
availability-record seam rather than writing stored visibility, keeps `keep-last`
genuinely reachable and correctly gated by `isWindowStale`, and does not disturb the
narrow properties sheet or the wide/medium layouts. The gate command was run once as
instructed and reports the exact expected counts (183 files / 1843 tests). The only
finding is a pre-existing, untouched indentation quirk, not introduced by this diff.

VERDICT: CLEAN
