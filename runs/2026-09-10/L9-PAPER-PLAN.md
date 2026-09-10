# L9 task 8 — Mobile paper view + responsive shell (plan)

Read-only planning, 2026-09-10. No builds run, no files modified outside this one. Scope:
TypeScript only, `app/src/`. No IPC changes, no Rust, no cargo slot. Authority: design doc
line 154 (paper view), line 152 (point budget), L9-SURVEY §4 task 8. Paths are relative to
`app/src/routes/pages/Notebook/` unless prefixed with `app/`.

## 1. Reuse of `model/report`

**Reusable as-is — the whole document model.** `buildReportDocument`
(`model/report/document.ts:647`) is pure and DOM-free and already emits what line 154 asks
for: prose with `${}` values resolved, `defTable`/`table` blocks, `chartSlot` blocks with
parsed `TimePlotProps` plus per-cell channel data, a `comparison` block across selected
windows, and named `absence` blocks instead of silent gaps. Its input struct
(`document.ts:607`) comes entirely from `index.tsx` state present every render.

**Reusable with an extraction.** The per-kind `Block` dispatch
(`components/ReportView.tsx:120`) and `ChartSlotView` (`:71`) render every block kind, and
`renderChart` (`model/report/renderChart.ts:277`) yields a static Plot SVG with no sandbox
iframe, no `position: fixed` layout tracking and no IPC on the interaction path — the right
chart path for a phone. Both move to a shared module `ReportView` and `PaperView` import,
leaving `ReportView.tsx` only its print settle counter (`:262`).

**Must be new.** Liveness: the report is one-shot, built on a button press by
`handleExportReport` (`index.tsx:1479`), where paper is a memo rebuilt on settle. Palette
and stylesheet: `printPalette.ts` is deliberately black-on-white paper (R174), and
`app/src/styles/report-print.css:12` hides `#report-print-root` outside `@media print`
while `:17` hides everything else inside it. Block filtering: `cover` and `appendix` are
print furniture. Tap targets: every content block carries `cellId` (`document.ts:125`,
`:145`, `:153`, `:165`, `:186`), so tap-to-edit is a `data-cell-id` plus one delegated
handler, which `ReportView` has no equivalent of. Chart data survives losing the cell list:
the initial bind effect (`index.tsx:1789`) is driven by cells, markdown and eval, not by a
mounted cell, and writes `combinedChannelDataRef` through an optional-chained sandbox call.

## 2. Breakpoint and detection rule

**Viewport width, not platform.** `app/src/shell/layout.ts:8`'s `resolveLayout` gives
`narrow | medium | wide` at 600/1200 CSS px; `model/editorPlacement.ts:22` derives
`panes | inline | sheet` from it, and `outputIsReadOnly` (`:36`) already means "narrow: the
output is read-only paper". **The paper view is what `"sheet"` has been describing all
along.** A platform check would be a second, drifting truth and would break desktop testing
at a narrow window. Rule: paper is active when `editorPlacement(widthPx) === "sheet"`. It
lives in a new `model/paperView.ts` beside `editorPlacement.ts`, exporting
`paperViewActive(widthPx)` that delegates rather than restating the number — the pattern
`editorPlacement.test.ts:23` already uses against `resolveLayout`. Platform matters in one
place, the point budget (line 152, "lower on mobile"): `model/tiers.ts:112`'s
`pointBudget(pixelWidth, isMobile)` takes the flag already and **both call sites hardcode
`false`** (`model/channelBindDriver.ts:324`, `:394`). Task 6.

## 3. Which columns hide, and the mechanism reused

- **Outer shell** (`app/src/shell/columnPrefs.ts`, `ColumnFrame.tsx`,
  `columnVisibility.ts`). Already correct: `shell/layout.ts:22`'s `usesColumns` is true
  only for `wide` and `shell/RouteHost.tsx:57` takes `layout`, so the four-column frame
  never mounts on narrow. **No change needed.**
- **Notebook-local panes** (`model/notebookColumns.ts`, R161: `graph`/`properties`/
  `cells`). Correct in shape already: `index.tsx:2541-2542` sets `graphViewAvailable` and
  `columnsToggleAvailable` to `placement !== "sheet"`, and
  `visibleNotebookColumnIds(visibility, availability)` (`notebookColumns.ts:81`) is the
  existing availability seam. Paper adds `cells` to what is unavailable on narrow via that
  record, **never** by writing stored visibility — a phone must not overwrite the desktop's
  remembered toggles (R161 is renderer-only and per-machine).

## 4. Touch editor path

Built already; it needs only an entry point. `index.tsx:2829`'s `placement === "sheet"`
branch renders `BrandSheet` holding `PropertiesForm`, opened when `openCellId !== null &&
openCell?.kind === "js"`. Today only the cell list sets `openCellId` on narrow, and paper
replaces that list, so paper supplies the gesture: tap a block,
`setSelectedCellId(block.cellId)`, sheet opens, the form generates Plot code through the
existing `onChange`/`handleCellCodeChange` path, the workbook saves, evaluation settles, the
document rebuilds. No new editor code. Accepted gap: `math` and `table` blocks get no touch
editor, because the form only opens for `js` cells.

## 5. Tasks

Gate for every task, from `app/`: `npx tsc --noEmit && npx vitest run`. Tests are vitest
`environment: "node"` (`app/vitest.config.ts:6`), `.ts` only, no jsdom (CLAUDE.md §4).
Order: 3 before 4; 1 and 2 before 5. Task 6 depends only on task 1 and can land last.

1. **`paperViewActive`** — new `model/paperView.ts`. Test `paperView.test.ts`: narrow
   true, 600/1200 boundaries asserted against `resolveLayout` rather than restated.
2. **Screen block filter** — new `model/report/paperDocument.ts` dropping `cover` and
   `appendix`. Test `paperDocument.test.ts`: order preserved, every `absence` kept, empty
   document survives. `document.ts` untouched, so print and paper share one builder.
3. **Extract the block renderer** — `components/ReportView.tsx` plus new
   `components/reportBlocks.tsx`. Pure refactor, no new tests (CLAUDE.md §4).
4. **`PaperView`** — new `components/PaperView.tsx` and `app/src/styles/paper.css`,
   registered in `app/src/styles/index.css`. App theme tokens, not `printPalette.ts`;
   `data-cell-id` per block and one delegated tap handler. No new tests (rendering).
5. **Wire into the page** — `index.tsx`, plus `model/notebookColumns.ts` if the
   availability record needs a new argument. On `"sheet"`, render `PaperView` in place of
   the cell list, rebuild from settled evaluation, mark `cells`/`graph`/`properties`
   unavailable, route taps to `setSelectedCellId`. Test surface: new `model/paperLive.ts`
   deciding `rebuild | keep-last | empty` from per-window eval states, so a mid-evaluation
   phone keeps the last good paper. The only real integration risk.
6. **Mobile point budget** — thread task 1's predicate to `pointBudget` at
   `model/channelBindDriver.ts:324` and `:394`. Extend `channelBindDriver.test.ts`: the
   mobile budget is strictly lower at the same width. Closes line 152's unwired half.

## 6. Open questions

**The lead can rule these.** (1) *Static `renderChart` SVG or the live sandbox iframe?*
Recommend static: already tested, no iframe layout tracking on a phone, and line 154 asks
for outputs rendered, not interactive charts. Cost is no hover, pan or zoom in v1. (2) *Drop `cover` and `appendix` on screen?* Recommend yes; print furniture.
(3) *A paper toggle on desktop?* Recommend none — narrowing the window is the trigger,
matching every other width-dependent behaviour here. (4) *Tapping a `math` or `table`
block?* Recommend a no-op. (5) *Every selected window or only the primary?* Recommend every
selected window, unchanged from `buildReportDocument`; lap comparison is the phone's job.

**Only Isaac can answer these.** (6) *His phone's CSS viewport width?* Unknown. Portrait on
a modern phone reports roughly 390 to 430 CSS px, well under 600, so the rule almost
certainly holds; landscape on a large phone can exceed 600 px and would silently fall back
to the medium inline-editor layout, which would need a height-aware or coarse-pointer
clause in task 1. (7) *Viewer or editor?* If the phone is mostly "open a synced workbook
and look at it" (design doc line 192), tasks 4 and 5 suffice; if he expects to retune a
chart trailside, the `js`-only limit in §4 becomes a gap needing its own task. (8) *Dark or
light outdoors?* Paper inherits the app theme; daylight readability may argue for forcing
light, not assumed here. Named unknown: no Android device or emulator has run this app yet
(L9-SURVEY §1), so every width figure above is inference from the CSS breakpoints.
