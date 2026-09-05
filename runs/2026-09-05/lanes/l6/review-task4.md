# L6 Task 4 review — the non-authoritative TypeScript fence scan (`model/cells.ts`)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
branch `wave2-l6-notebook`. Commit under review: `e78070f1eefd4bfd77de9204104847127e7860a3`
("app: pure cell scan over the C2 §2 fence grammar"), parent `988af2e`. HEAD at
review time is `e78070f`, worktree status clean — matches the dispatch.

In scope: `app/src/routes/pages/Notebook/model/cells.ts`,
`app/src/routes/pages/Notebook/model/cells.test.ts`, `CHANGELOG.md` (the
only three files this commit touches, per `git show --stat`). Nothing else
in the worktree was inspected or is in scope.

## Gate command and result

Run once from `app/`:

```
npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Notebook/model/cells
```

Output:

```
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

`tsc` was silent (no errors). Coverage report: `cells.ts` 95.78% statements /
94.11% branch / 100% functions / 96.47% lines, uncovered lines 170, 260-261.
This reproduces the implementer's reported "10 passed" and "cells.ts 96.5%
lines" exactly (96.47% rounds to 96.5%).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `cells.ts:259-262` | The "unterminated fence at EOF closes at document end" branch is uncovered by any test (coverage report: lines 260-261 unhit) — confirmed correct by inspection: it matches CommonMark's "runs to end of document" rule for an unclosed fence, which is what pulldown-cmark and hence Rust's `scan_cells` do too, so it agrees with the reference. The brief's own comment at that line already admits "not exercised by the current test suite." | Add an eleventh test: `scanCells — an unterminated fence at end of file — closes at document end` with a fixture like `` "```js id=aaaaaaaa\nx\n" `` (no closing fence) asserting one cell with `bodyRange` ending at the document's byte length. Small, mechanical. |
| Minor | `cells.ts:145-156` | `parseCellOpen`'s invalid-`id=`-value path (`idRaw` set, `id: null` when the value doesn't match `/^[0-9a-f]{8}$/`) is correct by inspection, but no test exercises it — the 10-test Step-1 list in `brief-task4.md` never asks for one, yet the standing reviewer brief's own "What to verify" section for Task 4 explicitly calls this behaviour out as a check-worthy ruling (R21). | Add a test, e.g. `scanCells — an invalid id= value — reports idRaw set and id null`, fixture `` ```js id=nothex\ncode\n``` ``, asserting `id === null` and `idRaw === "nothex"`. Small, mechanical; would also close the remaining branch-coverage gap. |
| Minor | `cells.ts:1-45` (module doc comment) | The doc comment's "no indented fences, no tilde fences" line is true and honest, but frames it only as "that subset is what C2 §2.2 defines and all this app authors or generates" — it doesn't call out that this is a real behavioural divergence from Rust's `scan_cells`, which (via `pulldown-cmark`'s generic `CodeBlockKind::Fenced`) *does* recognise tilde-delimited and up-to-3-space-indented fences identically to backtick fences. Not one of the three enumerated "deliberate differences," so a future reader skimming that list could miss it. Purely a documentation completeness nit — no test or code fix implied, since a tilde-fenced or indented cell is not something the app itself ever writes. | Optional: fold this into the "deliberate differences" bullet list explicitly, or leave as is — not a functional gap for anything this app generates. |
| Minor | `cells.ts:170` | `scanFrontMatter`'s "opening `---` present but no closing `---` found" fallback (`return { range: null, bodyStart: 0 }`) is uncovered (coverage report, line 170). Correct behaviour (treats the un-terminated block as ordinary body text, matching how a real YAML front-matter parser would also fail open here since Rust owns front-matter parsing, not this scan) but untested. | Optional test: a document starting with `"---\nid: x\n"` and no closing `---`, asserting `frontMatterRange === null`. Not required by the brief's Step-1 list; would be nice-to-have. |

No Critical or Important findings.

## Checks performed (all pass)

- **Ownership / diff scope.** `git show --stat e78070f` touches exactly
  `CHANGELOG.md`, `Notebook/model/cells.ts`, `Notebook/model/cells.test.ts`
  — nothing under `rust/`, `app/src-tauri/`, `App.tsx`, `package.json`, or
  any other lane's files.
- **No new npm dependency.** `package.json`/lockfiles untouched in the diff.
- **HEAD/status precondition.** Worktree HEAD is `e78070f` on
  `wave2-l6-notebook`, parent `988af2e` (Task 3's landed state after the
  merge-before-coverage commit), working tree clean.
- **CHANGELOG bullet** matches the brief's Step 5 text byte-for-byte.
- **Commit message** is a single line, no AI attribution trailer:
  `app: pure cell scan over the C2 §2 fence grammar`.
- **Gate reproduction.** `tsc --noEmit` silent; `vitest run --coverage`
  reports 10 passed, 0 failed, `cells.ts` 96.47% lines — matches the
  implementer's report.
- **UTF-8 byte offsets, not JS string indices.** Every range-bearing value
  traces back to `splitIntoByteLines` (`cells.ts:94-107`), which computes
  each line's cumulative offset via `new TextEncoder().encode(raw).length`
  — never `.length`/`.indexOf`/`.slice` on the raw string for a range.
  `replaceCellBody` also operates entirely on `Uint8Array`s from
  `TextEncoder`. The `replaceCellBody` round-trip test uses an em dash and
  umlauts (`"— ünïcode"`) both before the target cell (in the heading) and
  inside the replacement body; an implementation using UTF-16 code-unit
  offsets instead of UTF-8 byte offsets would misplace the splice boundary
  by the multi-byte deltas and the `sliceBytes` assertions would fail —
  this convincingly exercises the byte-vs-UTF-16 distinction even though it
  isn't a standalone-named "non-ASCII" test.
- **Only fence lines are scanned; no expression/YAML/table-JSON parsing.**
  Grepped the diff for anything resembling expression or JSON parsing
  inside `cells.ts` — none; `frontMatterRange` is a byte span only, content
  never inspected beyond the `---` delimiter lines; `raw_fence_body`
  equivalent (the fence contents) is never read or interpreted, only
  bracketed by byte offsets.
- **Fence grammar matches C2 §2.2/§2.3 and mirrors `cell.rs`'s externally
  observable behaviour**, verified by direct comparison against
  `rust/core/src/workbook/v3/cell.rs`'s `parse_fence_open`/`scan_cells`:
  cell-kind token must be exactly `math`/`table`/`js` (case-sensitive);
  `id=` captured only when `/^[0-9a-f]{8}$/`; an unrecognised `key=value`
  attribute is preserved verbatim in `infoLine`/round-tripped, never
  interpreted; a fence with no `id=` is legal and yields `id: null`
  (TS never mints one — Rust's job on save, correctly not replicated here).
- **Inert-fence nesting.** Traced the `insideInert`/`inertTickCount` state
  machine (`cells.ts:226-242`) against the `` ````markdown `` fixture: a
  4-backtick outer inert fence correctly swallows a nested 3-backtick
  `` ```js id=deadbeef `` line as literal content (3 < 4, not a close) and
  is only closed by the matching 4-backtick line — the same
  ≥N-backticks-and-nothing-else rule CommonMark (and hence
  `pulldown-cmark`, and hence `cell.rs`) applies.
- **Prose attachment (C2 §2.4).** `proseBeforeRange` is computed from
  `segmentStart` (end of the previous fence-close, or end of front matter
  for the first span) to the next fence-open's start, `null` when empty;
  `proseAfterRange` is set only on the last cell via the post-loop
  reassignment (`cells.ts:264-267`); a zero-cell document returns
  `cells: []` with no `ScannedCell` fabricated to hold the whole-document
  prose, matching C2 §2.4's "falls back to plain three-way text merge" note
  and the brief's explicit instruction not to fabricate a cell.
- **Duplicates returned, not validated.** No `Set`/dedup logic anywhere in
  `cells.ts` — every fence-open found is pushed as a `ScannedCell`
  regardless of `id` collisions, correctly leaving `DuplicateCellId`
  detection to Rust (C3 §3.4).
- **The two documented judgment calls, checked against C2 §2 and
  CommonMark/pulldown-cmark:**
  - `infoLine` = the whole info string (kind token plus all attributes,
    e.g. `"js id=cafebabe foo=bar"`) — matches the test asserting the exact
    string, and matches CommonMark's definition of the fence's "info
    string" (everything after the opening fence, trimmed).
  - Unterminated fence at EOF closes at document end — matches CommonMark's
    stated rule ("runs to end of the containing block or document") and
    thus matches what `pulldown-cmark` (and `cell.rs`) would do for the
    same input. Correct, but untested — see Minor finding above.
- **Three documented divergences from `cell.rs`** (module doc comment,
  `cells.ts:23-44`) — verified accurate against the Rust source: (1)
  line-oriented backtick-count tracking vs. the full CommonMark event
  stream (both agree on the tested subset); (2) never mints an id, returns
  `id: null` + `idRaw` per R21 instead of generating one; (3) returns
  duplicates rather than collecting a `DuplicateCellId` error. All three
  match `cell.rs`'s actual code.
- **Purity.** No import of `react`, `@tauri-apps/api`, or any DOM global
  (`document`/`window`/`localStorage`) in either file — `grep`'d the diff.
  `TextEncoder`/`TextDecoder` only, which the brief explicitly allows.
- **Performance-budget grep.** No `invoke(`, `onPointerMove`, `onWheel`,
  `onTouchMove`, or `requestAnimationFrame` anywhere in the diff.
- **Testing hygiene (CLAUDE.md §4).** All 10 tests are A/A/A with blank
  lines between `// Arrange`/`// Act`/`// Assert`; names exactly match the
  brief's Step-1 list, `thing — condition — result` form; file is
  `cells.test.ts` beside `cells.ts`. Test count (10) and names verified
  one-for-one against `brief-task4.md`'s list — nothing renamed, nothing
  missing, nothing extra beyond the specified 10 (the two Minor findings
  above are about tests the *standing brief* additionally invites, not
  ones `brief-task4.md`'s own Step-1 list requires).
- **Documentation and errors (CLAUDE.md §5).** Doc comment on every
  exported symbol (`CellKindToken`, `ScannedCell` and its fields,
  `ScannedDoc` and its fields, `scanCells`, `replaceCellBody`); the
  module doc comment states the UTF-8-byte-offset convention explicitly,
  including *why* (`"a JS string index counts UTF-16 code units, which
  diverges from UTF-8 byte offsets..."`); no bare `// TODO`; neither
  `scanCells` nor `replaceCellBody` throws on malformed/well-formed input
  — both are pure functions returning a value for any string input (no
  `throw`, no `unwrap`-equivalent risk: `TextDecoder().decode` is only ever
  called on byte ranges cut at line boundaries, which are always valid
  UTF-8 boundaries, so it cannot fail on constructed input).
- **Coverage.** 96.47% lines / 94.11% branch on `cells.ts`, exceeding the
  design's 80% pure-TS-module bar; the two uncovered spans are both
  correct-by-inspection edge cases noted as Minor findings above, not
  defects.
- **Repo hygiene.** Explicit `git add` paths per the brief's Step 6 (no
  `git add -A` residue — `git show --stat` shows exactly the three
  intended files); nothing under `docs/` touched; no cargo invocation
  anywhere in the commit or in this review.

## Verdict rationale

The implementation is correct: the fence grammar, id capture/validation
(R21), inert-fence nesting, and prose attachment all match C2 §2.2–§2.4 and
mirror `cell.rs`'s externally observable behaviour exactly on every case the
brief's 10 tests exercise, byte offsets are genuinely UTF-8-byte-based
throughout (not a JS-string-index leak anywhere), and the module stays
non-authoritative as R52 Q3 requires — no expression/YAML/table-JSON
parsing anywhere. The gate reproduces exactly what the implementer
reported. The four findings are all Minor: two are missing tests for
behaviours that are already correct by code inspection (the EOF-fence-close
path and the invalid-`id=`-value path, the latter explicitly named in the
standing brief's own checklist), and two are documentation completeness
nits with no functional consequence for anything this app itself writes.
None of these block merge or need a fix-up dispatch; they are fair
follow-up polish for whoever next touches this file (worth folding into
Task 6 or 13's own test additions if convenient, per the brief's own note
that those tasks will cite `cells.ts`'s exports).

VERDICT: CLEAN
