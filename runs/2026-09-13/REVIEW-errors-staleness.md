# Review: errors-staleness (W3.3 lane E, plan items 58–63)

Commits reviewed: `a244745` (59), `35c9b54` (60), `261b79d` (61), `797c343` (62),
`d0932af` (58), `7465029` (docs). Range: `main...HEAD` in
`idl1-app-worktrees/errors-staleness`.

Files touched: `CHANGELOG.md`; `Notebook/components/{CellFrame,CellList,
ChartCell,ProseBlock,ProseEditor,VersionBanner}.tsx`; `Notebook/index.tsx`;
`Notebook/model/{cellStatus,engineVersionBanner,gapSpans,jsCellFrameHeight,
jsCellNote,plotChrome,proseSpanError}.ts` + their `*.test.ts`; `styles/
tokens.css`; `runs/2026-09-07/ui/UI-DIRECTION-2.md`.

Test command / result (per dispatch, not re-run — already green per the
brief): `tsc` clean; `npx vitest run` = 262 files / 2815 tests passed
(main baseline 261/2767); `npx vite build` exit 0. I did not re-run the
gate; I read the new/changed test files in full (`cellStatus.test.ts`,
`gapSpans.test.ts`, `engineVersionBanner.test.ts`, `jsCellFrameHeight.
test.ts`, `jsCellNote.test.ts`, `proseSpanError.test.ts`, `plotChrome.
test.ts`) and checked the arithmetic/logic by hand against the source.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `ChartCell.tsx:475` | `useMemo(() => gapBandsPx(gapSpansFromTiles(tiles), liveViewport), [tiles, liveViewport])` re-walks every column of every fetched tile (`gapSpansFromTiles`) on **every** `liveViewport` change — i.e. every wheel tick and every pointer-move of a pan/zoom drag (`applyViewport`, called from the drag/wheel handlers, is what drives `setLiveViewport`). `tiles` itself does not change during a gesture; only the cheap placement step (`gapBandsPx`, O(spans)) needs to run per frame. The comment directly above the line ("must not be repeated on every pointer-move render") states the intent the code does not implement — `gapSpansFromTiles(tiles)` *is* repeated on every pointer-move render. This is exactly the class of per-frame recompute CLAUDE.md §3 says must leave the render path. | Split into two memos: `const gapSpans = useMemo(() => gapSpansFromTiles(tiles), [tiles])` (recomputes only on a real tile fetch) then `const gapBands = useMemo(() => gapBandsPx(gapSpans, liveViewport), [gapSpans, liveViewport])` (cheap, fine to run every frame). |
| Minor | `VersionBanner.tsx:44-48` | `WorkbookVersionBannerProps.banner` has no doc comment (the two callback props do). Pre-existing `VersionBannerProps.banner` above has the same gap, so this is consistent with existing style rather than a new regression, but CLAUDE.md §5 asks for a doc comment on every public symbol. | Add a one-line comment on `banner`, and optionally backfill the pre-existing one while touching the file. |
| Minor | `engineVersionBanner.ts` `parseEvaluatedWith` | Deliberately does not strip a trailing `#`-comment or handle a YAML block-scalar value (`evaluated_with: >`), both documented tradeoffs. Since nothing writes the key yet (disclosed, correctly out of scope), this can't misfire against any file the app itself produces today; it's a real (if narrow) misread risk only for a hand-authored front matter value, and is honestly called out in the doc comment. Not a defect against this lane's stated scope. | No action needed now; worth a one-line note in the eventual `render_front_matter` writer that the emitted value must never need quoting/escaping (e.g. never emit a `#` or a leading `>`/`|`), so the reader this lane shipped never has to handle it. |

## Priority-item findings

1. **`gapSpansFromTiles`/`gapBandsPx` correctness.** Sentinel comparison is
   `tUs === COLUMN_T_US_EMPTY` on the raw `bigint` before any `Number(...)`
   conversion (`gapSpans.ts:76,84`) — correct, matches the documented rule
   shared with `channelData.ts`/`hover.ts`/`peak.ts`. Leading runs are
   dropped because `emptyRun` is only incremented once `lastFilledUs !==
   null` (never counted before the first filled column); trailing runs are
   dropped because the loop only pushes a span on hitting a **filled**
   column, so a run that never closes is simply discarded when the loop
   ends. `lastFilledUs`/`emptyRun` are declared **outside** the per-tile
   loop, so a gap spanning the tile-to-tile seam accumulates across tiles
   correctly and is reported once — verified against the seam test
   (`gapSpans.test.ts:85-92`) and by hand: tile 0 `[0n, EMPTY]`, tile 1
   `[EMPTY, 3_000_000n]` → one span `{0, 3_000_000, columns: 2}`, correct.
   I did not find a case where a real gap is missed or a non-gap is
   drawn. `gapBandsPx`'s clamp-to-viewport and `minWidthPx` drop are
   arithmetically correct against the test table (checked the 20/30,
   0/30, 80/20 px cases by hand: viewport 0–10 000 000 µs over 100 px is
   10 px/100 000 µs, and all three match).

2. **`cellStatus` state machine.** All five states are handled
   exhaustively everywhere they're switched on: `plotChrome.ts` (`error` /
   `queued|evaluating|stale` spinner / fade), `CellFrame.tsx`'s
   `STATUS_DOT_CLASS` (a `Record<CellStatus, string>`, so a missing key
   would be a `tsc` error — `stale` is present), `ProseEditor.tsx`'s
   `statusLabel` switch (no `default`, so exhaustive; `stale` case added).
   The one real behaviour change beyond "add a state" is that a cell with
   existing output that is stale **during the edit debounce, with no
   round trip in flight**, used to report `"queued"` (`isCellBusy` false,
   no spinner) and now reports `"stale"` (`isCellBusy` true, spinner +
   grey wash from the first keystroke rather than from when the network
   call starts). This is called out explicitly in the UI-DIRECTION
   amendment ("stale is the same state during the edit debounce as during
   the round trip") and in the commit body, so it is a disclosed,
   deliberate ruling rather than a silent deviation — flagging it here
   only so the lead can confirm the ruling is the one wanted, since it is
   a visible UX change (spinner appears ~immediately on every keystroke
   in a cell with dependents) beyond "grey the stale result."

3. **Item-61 ordering.** `jsCellNote.ts`'s `windowCount === 0` check is
   first and returns unconditionally; every other branch (axis-less
   definition, failed declared definition, unresolved channel) is
   unreached only when `windowCount === 0`. When a session **is**
   selected (`windowCount >= 1`), the `if (input.windowCount === 0)` guard
   is false and execution falls through to the unchanged
   most-specific-first chain — I confirmed no specific message is ever
   suppressed while a session is selected. The `onFix` gating in
   `index.tsx:4266-4275` correctly reads `note.fixable` (not a
   re-derivation from `unresolved`), and `unresolved !== null` is
   additionally required, which matches `fixable` being true only in the
   branches where `unresolvedName` is in fact non-null.

4. **`parseEvaluatedWith`.** Key match is `line.startsWith("evaluated_with:")`,
   which correctly rejects a same-prefixed key like `evaluated_with_x:`
   (next char is `_`, not `:`). An indented line (space/tab) is skipped
   before the key check, so a nested `evaluated_with` under `graph:` is
   correctly ignored (test at `engineVersionBanner.test.ts:87-92`
   confirms). The scan stops at the first line that is exactly `---`
   after trimming trailing whitespace, so a `---` horizontal rule in the
   body and any `evaluated_with:` after it are correctly never reached
   (test at line 103-109). Two theoretical misreads, both disclosed or
   out of scope: a trailing `# comment` on the value line is not stripped
   (deliberate, documented) and a YAML block-scalar value (`evaluated_with: >`)
   would be misread as the literal string `">"` — neither can occur
   against a file this lane's own code produces, since nothing writes the
   key yet; both are pre-existing risks for a *hand-authored* file, which
   the doc comment is honest about for the first and silent about for the
   second (very narrow, not worth blocking on).

5. **`ChartCell.tsx` `useMemo`.** See Important finding above — this is
   the one real gap between what the code comment claims and what the
   code does.

6. **Doc comments / tests / naming.** Doc comments are present and
   substantive on every new public symbol I checked (`GapSpan`,
   `GapBand`, `gapSpansFromTiles`, `gapBandsPx`, `CellStatus`,
   `CellStatusInputs`, `cellStatus`, `isCellBusy`, `isCellStale`,
   `JsCellNote`, `NO_SELECTION_NOTE`, `jsCellNote`, `EVALUATED_WITH_KEY`,
   `parseEvaluatedWith`, `WorkbookVersionBanner`, `workbookVersionBanner`,
   `workbookVersionBannerMessage`, `NO_SELECTION_SPAN_MESSAGE`,
   `proseSpanNoSelectionMarker`) — one minor gap noted above
   (`WorkbookVersionBannerProps.banner`). Units are named in every new
   numeric field (`startUs`/`endUs`/`leftPx`/`widthPx`/`heightPx`/
   `pixelWidth`). No `unwrap()`/bare-string errors introduced; the new
   pure modules throw nothing and return typed unions/`null`. Tests are
   Arrange/Act/Assert with blank lines (a few one-liners inline the
   arrange, which is the existing house style seen throughout this file
   set, not a new deviation) and named `thing — condition — result`
   throughout the six new/changed spec files; I did not find a test that
   asserts less than its name claims. Pure modules (`gapSpans.ts`,
   `cellStatus.ts`, `jsCellNote.ts`, `jsCellFrameHeight.ts`,
   `engineVersionBanner.ts`, `proseSpanError.ts`) are unit-tested;
   components (`ChartCell.tsx`, `CellFrame.tsx`, `ProseEditor.tsx`,
   `VersionBanner.tsx`, `ProseBlock.tsx`, `CellList.tsx`) are not, per
   the brief's own rule.

## Disclosed gaps

Both disclosed omissions (burst-seam hatching needs a C3 field; nothing
writes `evaluated_with`, which belongs in core's `render_front_matter`)
are accurately described in the UI-DIRECTION amendment and CHANGELOG, and
both splits look genuinely unavoidable without a contract/Rust change —
I don't think either split was avoidable within this lane's TypeScript-only
scope.

## Verdict rationale

The lane's logic is correct on every specific claim I checked by hand
(gap detection including the cross-tile seam, the note-ordering fix, the
front-matter scanner's boundary cases, the exhaustive five-state switch
everywhere it's used) and the two disclosed scope cuts are real contract
gaps, not shortcuts. The one thing that would change a maintainer's
decision is the `ChartCell` gap-band `useMemo`: it does the expensive
part of the work (a full re-walk of every fetched tile's columns) on
every viewport update during an interactive pan/zoom gesture, which is
precisely the "no more than a frame's worth of work on the interaction
path" rule CLAUDE.md §3 states, and the code's own comment describes the
correct design without implementing it. That's a real, mechanical,
one-line-fix bug, not a style nit, so this is NEEDS_FIXES rather than
CLEAN.

VERDICT: NEEDS_FIXES
