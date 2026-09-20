# Review: live evaluation state, per cell and on the maths map (R250) — TS half

Commits reviewed: `871abe4` (task 1: cell frame), `974a9a3` (task 2: maths map),
range `0889635..HEAD` (also includes `a2182d9`, the spec commit, already in
range per the dispatch). Files touched: `CHANGELOG.md`,
`app/src/routes/pages/Notebook/components/{CellFrame.tsx,CellList.tsx,
CellPendingSlot.tsx,ProseEditor.tsx,useElapsedWhile.ts}`,
`app/src/routes/pages/Notebook/graph/{EvalLegend.tsx,GraphCanvas.tsx,
NodeCard.tsx}`, `app/src/routes/pages/Notebook/model/{blockedCells.ts(+test),
cellStateLine.ts(+test),cellStatus.ts(+test),evalSummary.ts(+test),
graphEvalView.ts(+test),pendingSlotHeight.ts(+test),plotChrome.ts(+test)}`,
`app/src/routes/pages/Notebook/index.tsx`, `app/src/shell/{StatusBar.tsx,
evalStatus.ts}`, `app/src/state/{decodeProgress.ts(+test),evalSummary.ts(+test)}`,
`app/src/styles/notebook.css`, spec DRAFT, `runs/2026-09-06/ui/UI-DIRECTION.md`.

## Test command and result

Ran myself (owner reported green already; re-run here since the harness
permits it for TS lanes):

```
cd app && npx tsc --noEmit
```
→ clean, no output.

```
cd app && npx vitest run \
  src/routes/pages/Notebook/model/cellStatus.test.ts \
  src/routes/pages/Notebook/model/blockedCells.test.ts \
  src/routes/pages/Notebook/model/cellStateLine.test.ts \
  src/routes/pages/Notebook/model/graphEvalView.test.ts \
  src/routes/pages/Notebook/model/evalSummary.test.ts \
  src/routes/pages/Notebook/model/pendingSlotHeight.test.ts \
  src/state/decodeProgress.test.ts \
  src/state/evalSummary.test.ts \
  src/routes/pages/Notebook/model/plotChrome.test.ts
```
→ `Test Files 9 passed (9)`, `Tests 116 passed (116)`.

(Did not run `madge` or `vite build` — instructed to prefer reading; tsc
already covers the module-graph/type surface these commits touch, and the
declaration-order trace below was done by hand.)

## Findings

| Severity | file:line | Finding | Fix |
| --- | --- | --- | --- |
| Important | `app/src/routes/pages/Notebook/graph/GraphCanvas.tsx:519` | The dashed-edge `"aria-label"` key is silently a no-op. `@xyflow/react`'s `Edge` type reads `edge.ariaLabel` (camelCase, see `node_modules/@xyflow/react/dist/esm/index.mjs:3043`: `"aria-label": edge.ariaLabel === null ? undefined : edge.ariaLabel \|\| ...`); the type's own `domAttributes` explicitly `Omit`s `'aria-label'`. Setting a kebab-case `"aria-label"` field directly on the edge object is not read anywhere by the library, so the intended "blocked by an upstream failure" accessible name for a dashed edge never reaches the DOM. tsc does not catch it because `flowEdges` is inferred, not assigned to an annotated `Edge[]`, so there is no excess-property check. Not a spec requirement (§3.1–3.3 don't ask for an edge aria-label — the hover/focus text lives on the node), so this is dead code that looks like it works and doesn't, the class of defect CLAUDE.md's review guidance calls out. | Rename the key to `ariaLabel` (or drop it — nothing in the spec asks for it). |
| Minor | `app/src/routes/pages/Notebook/graph/NodeCard.tsx:307` | `data-eval-state={state}` is added but nothing in this diff (component, test, or e2e selector) reads it. Harmless, but it's an unused hook left in shipped markup. | Either wire something to it (a future test) or drop it until something needs it. |
| Minor | `app/src/routes/pages/Notebook/model/blockedCells.ts:163-175` | `blockedNodes`' shared-frontier BFS is correct for "nearest ancestor wins" and terminates on cycles (verified: `blocked.has(id)` / `failingIds.has(id)` skip already-settled nodes, so each node is assigned at most once and the walk cannot loop forever even on the `a→b→c→b` cycle test). One under-specified case: when two failures are equidistant from a shared descendant, the cause is whichever failing node happens first in `input.failing` (caller-supplied order, not the graph's own order), so which of two equally-near upstream failures gets blamed is non-deterministic across calls with a reordered `failing` array. Not a bug against the spec (§2.3 only promises "nearest", not "nearest, tie broken by X") and the existing tests don't exercise a tie, so this is documentation debt, not a defect. | Optional: note in the doc comment that a tie is broken by `failing`'s order, or make the order deterministic (e.g. sort `failing` by node id before the walk) if two-cause ties are expected to occur in practice. |

## What I checked and did not find a problem in

- **TDZ/declaration-order hazards in `index.tsx`.** Traced every new read by hand:
  - `graphOutputs`/`graphSessionDetails` moved to `index.tsx:3805-3806`ish (right
    before `graphModel`), reading `state.windows`, `primaryWindow` (declared
    `:512`), `windows`, `sessionDetailsByWindow` (both declared well before
    `:3805`) — safe, and strictly earlier than before, not a new hazard.
  - `blockedByCell` (`:3826`, `useMemo`) reads `graphModel.nodes`,
    `blockedNodeMap` (`:3820`) — both declared just above it in the same
    top-to-bottom pass. Safe.
  - `cellStatusFor` is a `function` declaration (`:3955`) — fully hoisted, so
    its own declaration position doesn't matter; what matters is that the
    `const`s it *closes over* (`blockedByCell` `:3826`, `cellHeights` `:521`,
    `windows` `:494`) are all declared earlier in the render pass than any
    *call* to `cellStatusFor`. The earliest call is inside `cellStatusById`
    (`:4282`, well after `:3826`). Safe.
  - `decodeFractionFor`/`decodingChannelFor` (`function` declarations at
    `:4256`/`:4265`) close over `decodeKeysByCell` (`const`, `:4214`,
    declared *before* both). `cellStatusFor` calls `decodeFractionFor` in its
    body but — being a function declaration — is only ever *executed* after
    `:4214` has run (same reasoning as above). Safe.
  - `cellStatusById` (`:4282`) depends on all of the above, declared after
    every one of them. Safe.
  - `graphEvalViews` (`:4315`) and `blockedEdges` (`:4333`) close over
    `cellStatusById`/`blockedNodeMap`/`graphModel`, all declared earlier.
    Safe.
  - `proseEditorElement` (`:4371`) now calls `cellStatusFor({..})`; the
    diff's own comment ("Declared after `decodeKeysByCell`...") is correct —
    it sits after `:4214`/`:4256`/`:4265`, and after `blockedByCell`. Safe.
  - `notebookColumnAvailability` (`:4829`) and `visibleNotebookColumnIds`/
    `columnVisibility`/`applyColumnToggleValue` used inside the new
    `openMathsRequests` `useEffect` (`:4350-4358`): read only inside an effect
    body, which executes after the whole render function (and thus every
    later `const`) has finished — not a TDZ risk regardless of textual order.
  - No `let`/`const` anywhere in the new code is read before its own
    initializer runs in the linear render pass. I did not find the class of
    bug that caused the 2026-09-14 TDZ crash.
- **State precedence (`cellStatus.ts:176-188`)** matches spec §2.2 exactly:
  blocked > stale > error > fetching > (no-output: evaluating/idle-or-queued)
  > rendering > done, and it collapses to the pre-R250 5-state function at the
  resting values as claimed. No reachable input combination produces an
  infinite spinner or hides an error: `blocked` short-circuits everything
  (the only way out of "will never run" is a graph change, which is honest),
  and `error` sits above `fetching` so a ring can never cover a cross.
- **Memoisation.** `graphOutputs`, `graphSessionDetails`, `graphModel`,
  `graphSelectedWindows`, `graphNodeStatuses`, `blockedNodeMap`,
  `blockedByCell`, `cellStatusById`, `graphEvalViews`, `blockedEdges`,
  `evalSummary` are all `useMemo`d with correct, stable dependency arrays;
  none allocates a fresh `Map`/array unconditionally inside another hook's
  body outside a `useMemo`. `GraphCanvas`'s own `flowNodes`/`flowEdges`
  memos now correctly list `evalViews`/`blockedEdges` in their deps.
- **React hook rules in `useElapsedWhile`.** The ref mutation during render
  (`startedAt.current = Date.now()` / `= null`) is idempotent under double
  invocation (StrictMode) since it's guarded by `=== null` checks, matches
  the codebase's existing `useMsSinceSettle` pattern (same file's sibling),
  and the effect's own `setTimeout`/`setInterval` pair is cleaned up on every
  dependency change and unmount. Verified it returns non-`null` (a real
  elapsed value) from the same render `active` first becomes `true`, and the
  2-second "don't show it yet" rule lives in `cellStateLine.ts` (the pure
  consumer), not the hook — so the hook itself doesn't hide the value, but
  nothing displays it early either. No leaked interval path found: the
  `useEffect` cleanup always runs before a subsequent `active` transition's
  effect body.
- **No new colour literals.** `NodeCard.tsx`, `EvalLegend.tsx`,
  `CellFrame.tsx` all use existing tokens (`--fg-faint`, `--good`, `--accent`,
  `--hivis`, `--surface-2`/`bg-surface/60`). `motion-reduce:` escapes are
  present on every new animation (`NodeCard`'s pulse, `EvalLegend`'s pulsing
  swatch, `CellStateOverlay`'s spinner).
- **No `NaN`/`Infinity`/premature "100 %"**: `decodeProgress.ts` ignores
  `total_rows <= 0` rather than dividing by it; `cellStateLine.ts` and
  `describeNodeEval` both floor the percentage.
- **Dead code**: the old `.cell-list-pending` CSS rule was removed in the
  same commit as its last usage; grepped confirms no remaining reference.
- **Tests**: every new test file (`cellStatus`, `blockedCells`,
  `cellStateLine`, `graphEvalView`, `evalSummary` ×2, `pendingSlotHeight`,
  `decodeProgress` additions) follows `thing — condition — result` naming
  with Arrange/Act/Assert and blank lines between, and each assertion checks
  the specific claim in its name (spot-checked `blockedCells.test.ts`'s
  cycle-termination and nearest-ancestor tests, and `cellStatus.test.ts`'s
  full precedence ladder including the `CELL_STATUSES` reachability check).
- **Doc comments**: every new public export in the touched files carries one;
  units are on every numeric prop that needs them (`fraction: [0,1]`,
  `elapsedMs` in ms, heights in px).
- **§2.1 rename** (`"settled"` → `"done"`) was carried through all readers
  including `ProseEditor.tsx`, which the spec's "three readers" count under-
  stated (it's actually four with `ProseEditor.tsx`) — but the diff did
  update it correctly, so this is a spec-prose inaccuracy, not a code defect,
  and not worth a line in the table.

## Verdict rationale

The state machine, the blocked-subgraph derivation, the memoisation, and the
TDZ-hazard trace through `index.tsx` all hold up under close reading and the
one test run I performed (116/116 passing, tsc clean). The one real defect —
the dead `"aria-label"` key on dashed edges — is a genuine no-op accessibility
regression against the author's own stated intent in the diff's comment, but
it does not touch the spec's actual requirements (§3.1–3.3 put the
hover/focus text on the node, which works correctly via `title`/`describeNodeEval`),
it's a one-line fix, and nothing else in the lane rises above Minor. That is
a fix-before-merge item, not a rework.

VERDICT: NEEDS_FIXES
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\eval-progress\runs\2026-09-20\REVIEW-eval-progress.md
COUNTS: critical=0 important=1 minor=2
NOTES: the "blocked" dashed-edge aria-label is set under a kebab-case key React Flow never reads (it wants `ariaLabel`), so the label silently never reaches the DOM — one-line fix, everything else checked out clean.
