# L6 Task 15 review — Properties + Code editor shell (D13), plus scoped check of the eb4ae30 race fix

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
branch `wave2-l6-notebook`. Commits under review:

- `9547349` — Task 15: `Notebook/components/EditorPanes.tsx`, `Notebook/components/CellFrame.tsx`
  (new), `Notebook/model/editorEcho.ts`/`.test.ts` (new), `Notebook/index.tsx`,
  `Notebook/components/CellList.tsx` (R74 frame prop), `Notebook/model/workbookState.ts`
  (`editCell.markdown`), `CHANGELOG.md`.
- `eb4ae30` — scoped check only: fix for `review-task13c.md`'s Major (shared
  `model/cellRunSequencer.ts` between the initial-bind effect and the settle
  handler), `Notebook/index.tsx`, `model/cellRunSequencer.ts`/`.test.ts`,
  `model/channelBindDriver.ts`/`.test.ts`.

`git show --stat` on both commits touches only files under
`app/src/routes/pages/Notebook/**` plus `CHANGELOG.md` — all lane-owned. No
`package.json`/lockfile, `docs/`, `rust/`, `App.tsx`, `AppState.tsx`, or
`vite.config.ts` touch in either commit. `git status --porcelain` shows only
the pre-existing, out-of-scope `M rust` submodule-pointer bump (unrelated,
not part of either reviewed commit, left untouched). No new dependency.

## Gate command and result

```
cd app
npx tsc --noEmit
npx vitest run src/routes/pages/Notebook
```
`tsc` — silent, no errors.
`vitest` —
```
Test Files  32 passed (32)
     Tests  260 passed (260)
```
Reproduces the implementer's reported "32 files / 260 passed" exactly.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `Notebook/model/editorEcho.ts:1-13` | The file doc comment says `isEditorEcho` was "pulled into a tiny pure/tested module per lead ruling R74." R74 (`runs/2026-09-03/decisions.md`) is specifically about `CellList` gaining the `frame` wrapper prop for per-cell selectability — it says nothing about the Properties↔Code loop guard. The pure-module requirement for the loop guard actually comes from Task 15's own brief ("State explicitly in your report which mechanism you used… this is rendering, not unit-tested per CLAUDE.md §4, but a reviewer needs to be able to reason about it"), not from R74. This is a citation error only — the module itself, its tests, and its use are all correct — but a future reader tracing R74 in the diff would be pointed at the wrong justification. | Drop the "per lead ruling R74" clause from `editorEcho.ts`'s doc comment (or replace it with a reference to the brief's own loop-guard requirement); no code change needed. |

No Critical or Important findings.

## Checks performed (all pass)

- **Single write path, both panes.** `EditorPanes.handleChange` is the only
  function passed as `onChange` to both `PropertiesForm` and `CodePane`
  (`EditorPanes.tsx:94-96`); it calls the parent's `onChange` prop, which
  `index.tsx` wires to `handleCellCodeChange(openCellId, nextCode)`
  (`index.tsx:387-393`, `index.tsx:653`). `handleCellCodeChange` calls
  `replaceCellBody(state.markdown, cellId, nextCode)` (Task 4's function,
  signature and byte-range semantics unchanged — confirmed against
  `model/cells.ts:288-309`) and no-ops (`nextMarkdown === state.markdown`)
  both when the replacement text is unchanged and, since `replaceCellBody`
  returns `markdown` unchanged when `cellId` isn't found, for a stale
  `cellId` — matching the dispatch's "a stale cellId is a no-op" check.
- **Echo suppression traced end to end.**
  - *Properties edit → Code, no bounce:* a `PropertiesForm.onChange` call
    reaches `handleChange`, which is not yet an echo (`lastAppliedRef` is
    either `null` or a different string), so it writes through and sets
    `lastAppliedRef`. The new `code` prop reaches `CodePane`; its own
    external-sync effect (`CodePane.tsx:215-224`) sees `currentText !==
    code` (Properties, not typing, produced the new text) and dispatches a
    real CodeMirror transaction, which fires `updateListener` with
    `docChanged: true` and — after `CodePane`'s own 400 ms debounce — calls
    `onChangeRef.current(nextCode)` with `nextCode` equal to the exact text
    `EditorPanes` just wrote. `EditorPanes.handleChange` calls
    `isEditorEcho(lastAppliedRef.current, nextCode)`, which is `true`
    (`editorEcho.ts:20-23`: `lastApplied !== null && lastApplied ===
    incoming`), and returns without calling the parent's `onChange` again —
    no second write, no re-entry into `handleCellCodeChange`.
  - *Code edit → debounce → Properties repopulates, no bounce:* a real
    keystroke in `CodePane` produces `nextCode` different from
    `lastAppliedRef.current`, so `isEditorEcho` is `false`; `handleChange`
    writes through once. `PropertiesForm`'s own `code !== prevCode` guard
    (`PropertiesForm.tsx:59-60`, pre-existing, unchanged by this task)
    re-derives its form state from the new `code` during render — it never
    calls its own `onChange` as a side effect of that re-derivation, so
    there is no path back into `handleChange` from this direction at all.
  - Both directions were also checked against `handleCellCodeChange`'s own
    no-op guard as a second, independent backstop: even without
    `isEditorEcho`, a spurious duplicate call with the *same* `nextCode`
    would hit `nextMarkdown === state.markdown` and no-op — `isEditorEcho`
    is not load-bearing for correctness on its own, but is exactly the
    mechanism the brief asked for and is documented precisely enough to
    trace (misattribution flagged above; the mechanism itself is right).
- **R74 (`CellList.frame`).** `frame?: (cell: ScannedCell, output: ReactNode)
  => ReactNode` defaults to `identityFrame` (`CellList.tsx:8-11`), so every
  caller from before Task 15 is unaffected — confirmed no other `CellList`
  call site in the diff or pre-existing code needed updating and the
  existing `CellList` test suite is untouched by this commit (`git show
  --stat` shows no `CellList.test.ts` hunk). `frame` wraps only `rendered`
  — the pending placeholder, `MathCell`, `TableCell`, or `renderJsCell`'s
  result (`CellList.tsx:87-96`) — never the `before`/`after` `ProseSpan`s,
  which stay outside the `frame(...)` call (`CellList.tsx:99-104`), matching
  R74's "applied to every kind's own output… and not the prose spans."
  `index.tsx`'s `frame={(cell, output) => <CellFrame …>}` (`index.tsx:637-647`)
  is applied uniformly to every `doc.cells` entry, including math/table/
  prose-adjacent cells, not js-only. `CellFrame` guards `onSelect` with
  `if (cell.id !== null) setSelectedCellId(cell.id)` (`index.tsx:641-643`),
  so a cell whose scan found no id (only ever possible for a malformed
  document) is inert rather than opening a broken editor.
- **Non-js cells get Code only; js gets both.** `EditorPanes`'s
  `kind === "js" && <PropertiesForm …/>` (`EditorPanes.tsx:95-97`) is the
  only conditional mount; `CodePane` mounts unconditionally directly below
  it. `openCell.kind` is `CellKindToken` (`"math" | "table" | "js"`,
  `model/cells.ts:54`) — prose has no fence id (`ScannedCell.id` is `null`)
  and is filtered out of `state.cells.find` before `EditorPanes` ever
  mounts, matching the file doc comment's claim that prose "never reaches
  this component."
- **`workbookState.editCell.markdown` deviation.** Reducer branch
  (`workbookState.ts:129-137`): with `markdown` omitted, behaviour is
  byte-identical to the old two-field shape (`dirtyCellIds` gains `cellId`,
  nothing else changes) — confirmed both pre-existing `editCell` tests
  (`workbookState.test.ts:50`, `:56`, calling the action with only `cellId`)
  still pass unmodified as part of the 260-passed run. With `markdown`
  present, `cells` is re-derived via `scanCells(action.markdown).cells`,
  the same function `markdownReady` uses (`workbookState.ts:106`, unchanged)
  — consistent re-scan path, not a second parser. This is a real, named
  deviation from the brief's file list (brief listed only `index.tsx` as
  modified besides the two new components) but is required for the editor
  to have anything to save, is named in both the commit and the CHANGELOG
  bullet, and is a small additive change to a lane-owned file, consistent
  with R74's own precedent that a brief's file list is scope guidance, not
  a wall.
- **New debounced re-eval effect (`index.tsx:289-309`).** Dependency array
  is `[state.dirtyCellIds, state.handle?.id]` — both data (a `Set` whose
  identity `workbookReducer`'s `editCell` refreshes via `new Set(...)` on
  every dispatch, `workbookState.ts:130-131`, and a string id), never a
  function/callback. Cleanup (`return () => clearTimeout(timer)`) cancels
  only the pending `setTimeout`, never an in-flight `evalWorkbook` call —
  if the timer has already fired and `runEval` is awaiting `evalWorkbook`,
  a later cleanup cannot touch it, which is the allowed shape (effect
  guidance: "never uses its cleanup to cancel in-flight work"). Staleness on
  landing is decided by `evalSeqRef.current !== mySeq`, a monotonic counter
  shared with the pre-existing watcher effect's own `runEval` call
  (`index.tsx:281-283`) — so whichever of the two effects (watch-event
  reload or edit-burst re-eval) started its `runEval` call most recently
  always wins when both land, the same shared-sequence pattern R74's
  companion fix (`eb4ae30`) uses for channel binds. `runEval` itself
  (`openEvalDriver.ts:104-121`, pre-existing from Task 13's `a61ab5c`, not
  touched by this commit) already checks `isStale()` after its one `await`
  and before dispatching — this is the pure, tested decision point the
  tightened IPC-effects rule requires; `openEvalDriver.test.ts`'s
  isStale-after-resolution case (added per the Task 13b CHANGELOG bullet)
  exercises exactly this branch, just via `runOpenAndEval`'s call to the
  same `runEval`, not a new direct test of this call site — acceptable
  since the function under test and its stale-check are unchanged and
  already covered; the new call site is a plain debounce (set/clear a
  timer) with no additional decision logic of its own, so no new pure
  module was needed for this task specifically. Not a Major: no function
  prop in the dependency array, no cancelling-in-flight-work cleanup, and
  the "stale ⇒ dropped" guarantee is provided by an existing, tested pure
  driver.
- **`eb4ae30` — one shared sequence per cell, both paths.** `CellRunSequencer`
  (`model/cellRunSequencer.ts`) is a single `Map<string, number>`; `start`
  increments and immediately becomes current, `isCurrent` compares the
  captured value against the latest, `delete` forgets a removed cell. Both
  the initial-bind effect (`index.tsx:449-450`, `cellRunSequencerRef.current.start(cellId)`
  before the `void runChannelBind(...)` call) and the settle handler
  (`index.tsx:~575-576`, same call shape inside `onViewportSettled`) take
  their sequence number immediately before starting async work and check
  `isCurrent` via the injected `isStale` callback after every `await`
  inside `runChannelBindWindow`'s per-channel loop (`channelBindDriver.ts`,
  unchanged shape, now fed a shared `isStale`). `boundIdentityRef` is
  confirmed no longer used as a staleness guard anywhere — its only
  remaining read is `index.tsx:390`'s check for whether a *new* run should
  start at all (an orthogonal "did the binding identity change" data
  question), and its doc comment (`index.tsx:126-128`) states this
  explicitly.
- **`eb4ae30`'s four new cross-effect tests genuinely exercise resolve-order
  inversion**, not just sequencing arithmetic: each of the four cases in
  `channelBindDriver.test.ts`'s "cross-effect staleness via a shared
  CellRunSequencer" describe block starts two runs in a specific order via
  `sequencer.start`, then controls which one's underlying fetch *resolves*
  first — independently, using `deferredTile()`'s manually-triggered
  `resolve` — and asserts the outcome tracks start order, not resolve order
  (e.g. "the initial bind resolves before the settle — the settle still
  wins, because it started later, not because it resolved later"). This is
  a real interleaving test, not a restatement of the sequencer's own unit
  tests (`cellRunSequencer.test.ts`, which only test the counter in
  isolation with no async driver involved).
- **Two `TileCache` instances in some `eb4ae30` tests — does this hide a
  real coalescing behaviour?** Three of the four cross-effect tests
  construct separate `TileCache`s for the two competing runs, with an
  explicit comment explaining this is deliberate (isolate the ordering
  claim from `TileCache.getOrStartFetch`'s own same-key coalescing). In
  production, both the initial-bind effect and every settle share one
  instance (`sessionRef.current.cache`, `index.tsx:414`/`index.tsx`'s
  settle call site). Traced what this hides: if the initial bind and a
  settle overlap in time and request the same tile key against the *shared*
  production cache, `TileCache`'s coalescing would have them await the
  literal same promise, so both would resolve at effectively the same
  microtask rather than at the independently-controlled times the tests
  simulate. This does not hide a bug — it removes a variable (independent
  resolve timing) that the shared-cache production path would actually
  narrow, not widen: with a shared cache, the two runs' resolutions cluster
  together in time, and whichever `isCurrent` check runs last still
  correctly reflects whichever `start()` call was most recent, since
  `CellRunSequencer`'s ordering guarantee has nothing to do with promise
  identity. The one case NOT weakened by cache sharing is "two settles for
  the same cell" (fourth test), which does use separate caches for the same
  documented isolation reason but tests a scenario (two settles, not
  settle-vs-initial-bind) where production coalescing is equally plausible
  and equally harmless for the same reason. No gap found; worth recording
  since the dispatch asked for an explicit answer rather than silence.
- **Every IPC/postMessage-driving effect in `index.tsx`/`EditorPanes.tsx`
  traced for file:line/deps/cleanup:**
  - `index.tsx:289-309` (new debounced re-eval) — see above; data-only
    deps, timer-only cleanup, no Critical.
  - `index.tsx:449-...` (initial channel-bind effect) — pre-existing shape,
    deps unchanged by either reviewed commit (`state.cells`/`state.markdown`
    /`sessionDetail`/`sessionSpanUs`/`sessionId`, per its own doc comment),
    no cleanup that cancels in-flight work (confirmed no `return () => ...`
    inside this effect cancelling `runChannelBind`).
  - `index.tsx:260-287` (watchWorkbook subscription) — pre-existing,
    untouched by either commit; deps `[state.handle?.id]`, cleanup sets a
    `disposed` flag consulted before dispatch inside the callback, not a
    promise cancellation — pre-existing pattern, out of this review's scope
    to re-litigate but confirmed not newly broken.
  - `EditorPanes.tsx` has no `useEffect` at all — its loop guard runs
    entirely in event-handler/render-phase code (`handleChange`, and the
    `openCellIdRef` reset "adjusting state during render" pattern,
    `EditorPanes.tsx:88-92`), so the IPC-effects rule (which is about
    `useEffect`) does not apply to it directly; traced anyway and found no
    IPC or `postMessage` call anywhere in this file.
  - No effect in either reviewed commit lists a function/callback prop in
    its dependency array.
- **No `invoke` from pointer/wheel handlers; no `dangerouslySetInnerHTML`.**
  `git show 9547349` and `git show eb4ae30` both grepped for `invoke(`,
  `dangerouslySetInnerHTML`, `onPointerMove|onWheel|onTouchMove|
  requestAnimationFrame` — no hits in either diff's added/changed lines
  (the one grep hit is inside `CHANGELOG.md`'s prose recounting the
  already-landed Task 13b/R69 change, not new code).
  `unitsPreference="si"` is passed hardcoded at `EditorPanes.tsx:96`;
  `PropertiesFormProps.unitsPreference`'s own doc comment
  (`PropertiesForm.types.ts:47-49`, pre-existing, unchanged) already states
  it is "not read by this component's current logic" per R65 — consistent,
  not a new no-op needing fresh documentation.
- **Ownership/hygiene.** Both commits touch only
  `app/src/routes/pages/Notebook/**` and `CHANGELOG.md`; no
  `package.json`/lockfile touch; both commit messages are single-line, no
  AI attribution trailer; no `cargo` invocation anywhere in this review;
  `git add` paths in the brief match the files actually committed.
  CHANGELOG bullet for Task 15 checked line-by-line against the diff — every
  claim (frame prop and its rationale, `editCell.markdown`, the new
  debounce effect, `isEditorEcho`, no unit tests for the two new rendering
  components) is true.
- **Doc comments and units.** Every exported symbol in `EditorPanes.tsx`,
  `CellFrame.tsx`, `editorEcho.ts`, and the changed exports in
  `workbookState.ts`/`CellList.tsx` carries a doc comment; `EDIT_EVAL_DEBOUNCE_MS`
  is documented in ms and distinguished from `CodePane`'s own 400 ms
  constant; no bare `// TODO` introduced (grepped both commits' added lines
  for `TODO` — the four hits in `index.tsx` are pre-existing or correctly
  `// TODO(idl0):`-prefixed).
- **Tests A/A/A, named `thing — condition — result`.** `editorEcho.test.ts`'s
  three cases and `cellRunSequencer.test.ts`'s five cases all have a clear
  Arrange/Act/Assert shape with blank-line separation and names following
  the convention; each would fail if its own rule broke (e.g. "incoming
  code matches the last applied write — is an echo" would fail if
  `isEditorEcho` used `!==` instead of `===`). No new `.test.ts` was written
  for `EditorPanes.tsx`/`CellFrame.tsx`, matching the brief's explicit "no
  unit tests" instruction for rendering.
- **No `any`.** Grepped both diffs for `: any`, `<any>`, `as any` — zero
  hits.

## Verdict rationale

The editor shell is assembled exactly as D13 and the brief describe: one
write path through `replaceCellBody` for both panes, `js`-only Properties
mounting, a loop guard that is correct by three independent, traceable
mechanisms (the guard itself, `CodePane`'s own external-sync check, and
`handleCellCodeChange`'s no-op check), and R74's `CellList.frame` hook
implemented precisely as ruled — optional, identity-default, wraps every
kind's own output and not the prose spans, existing tests untouched. The
two named deviations (`workbookState.editCell` gaining an optional
`markdown` field, and the new debounced re-eval effect) are both necessary,
small, correctly guarded against the tightened IPC-effects rule (data-only
deps, timer-only cleanup, staleness via an existing tested pure driver
shared with the pre-existing watch-event effect), and explicitly named in
the commit and CHANGELOG. The `eb4ae30` race fix genuinely closes
`review-task13c.md`'s Major: one shared `CellRunSequencer` per cell now
governs both the initial bind and every settle, the four new tests
demonstrate the outcome depends on start order rather than resolve order,
and tracing the two-`TileCache`-instance question found no hidden
coalescing bug — if anything, production's shared cache narrows the race
rather than widening it. The single finding is a citation error in
`editorEcho.ts`'s doc comment (misattributes the loop-guard's pure-module
requirement to ruling R74, which is actually about the unrelated `CellList`
frame hook) — cosmetic, does not affect correctness, trivial to fix.

VERDICT: CLEAN
