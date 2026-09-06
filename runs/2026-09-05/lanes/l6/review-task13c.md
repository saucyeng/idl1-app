# L6 Task 13c re-review — Task 13b fix + Task 13c (R72)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
branch `wave2-l6-notebook`. Commits under review:

- `5956185` — fix for `review-task13b.md`'s Critical/Major/Minor: new pure
  `model/channelBindDriver.ts` (`runChannelBind`), staleness guard via
  `boundIdentityRef`, `toIpcErrorOrUnknown` test coverage, CHANGELOG
  correction.
- `4708f3a` — Task 13c (R72): `NotebookSession.setBoundChannel` →
  `setBoundChannels(cellId, BoundChannel[])`; `runChannelBindWindow` shared
  loop behind `runChannelBind` (initial) and the new `runChannelSettle`
  (gesture settle), guarded by `settleSeqRef`; CHANGELOG bullet.

Files touched (union, via `git show --stat`): `CHANGELOG.md`;
`app/src/routes/pages/Notebook/index.tsx`;
`app/src/routes/pages/Notebook/model/{channelBindDriver.ts,channelBindDriver.test.ts,saveFlow.test.ts}`;
`app/src/routes/pages/Notebook/host/{NotebookSession.ts,NotebookSession.test.ts}`.
All under lane ownership (`app/src/routes/pages/Notebook/**` plus
`CHANGELOG.md`). `git status --porcelain` shows only the pre-existing,
out-of-scope `M rust` submodule-pointer change — not part of either
reviewed commit, not staged, left untouched.

## Gate command and result

```
cd app
npx tsc --noEmit
npx vitest run src/routes/pages/Notebook
```
`tsc` — silent, no errors.
`vitest` —
```
Test Files  30 passed (30)
     Tests  248 passed (248)
```
Reproduces the implementer's reported "30 files / 248 passed" exactly.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Major | `Notebook/index.tsx:421-456` (initial-bind effect) vs `:545-588` (`onViewportSettled`'s settle refetch) | The two staleness guards are independent and never invalidate each other. The initial-bind effect's `isStale` is `boundIdentityRef.current.get(cellId) !== identity` — `bindingIdentity` (`model/jsCellBinding.ts:124-128`) is a function of the mounted channel id, lap, and `binding.initialSpan` only; it does not change when the user pans/zooms. The settle handler's `isStale` is `settleSeqRef.current.get(cellId) !== seq`, bumped only by a later settle for the same cell. Consequence: if a cell's initial `runChannelBind` fetch is still in flight (slow network / many tiles) and the user pans before it resolves, `onViewportSettled` fires, its own `runChannelSettle` resolves first and calls `setBoundChannels`/`setChartWindows` with the panned window — then the slower initial bind resolves, its `isStale` check still reads "current" (nothing touched `boundIdentityRef` for this cell), and it unconditionally overwrites both `NotebookSession`'s registry entry and `chartWindows` for that `cellId` with the stale *initial-span* window, visibly reverting the user's pan and leaving the registry keyed to the wrong `[startUs, endUs)`. This is exactly the class of bug R72/the tightened IPC-effects rule's "stale result ⇒ dropped" requirement targets, and no interleaving test exercises it (`channelBindDriver.test.ts` only tests staleness *within* one driver call, never a settle racing an in-flight initial bind for the same cell). | Give both effects one shared "is this cell's channel-bind state still current" guard — e.g. a single per-cell monotonic sequence bumped by *both* a new binding identity and a new settle, checked by both `runChannelBind`'s and `runChannelSettle`'s `isStale` — so whichever of the two guards is behind loses, instead of each only knowing about its own kind of supersession. |
| Minor | `Notebook/model/channelBindDriver.ts:91-146` (`runChannelBindWindow`) | Per-channel `channelData` dispatches happen incrementally inside the loop (correctly gated by `isStale()` immediately before each), but `boundChannels` is only dispatched once, after the whole loop, and only if `isStale()` still false at that point. This means a non-stale run that hits a `null` result (evicted tile) for one channel mid-loop still sends `channelData` for the channels fetched before the gap and registers a `BoundChannel[]` that silently omits the evicted channel — consistent with the doc comment's stated "drops only that channel's bind" but worth a one-line note in the doc comment distinguishing "channel skipped because its own fetch failed" from "channel skipped because the whole run went stale," since both currently read as the same `continue`/return shape to someone skimming the loop. | Optional: split the `null`-result comment from the `isStale()` comment so the two skip reasons are visually distinct; not required for correctness. |

No Critical findings — the specific Critical from `review-task13b.md` (only
`channels[0]` sent/registered) is closed correctly by `5956185`, and R72's
whole-list registration in `4708f3a` is implemented as specified.

## Checks performed (all pass)

- **13b Critical closed.** `runChannelBind`/`runChannelBindWindow` loops over
  every entry in `binding.channels` (not just `channels[0]`), dispatching
  `channelData` for each in order (`channelBindDriver.test.ts`'s
  "dispatches channelData for both, in order" case); a duplicate channel is
  a non-issue since `bindingFor` already dedupes before this driver ever
  runs (test: "one channels entry (dedupe already done by bindingFor)").
- **13b Major (staleness before the `.then()` writes) closed** for the
  single-run case: `isStale()` is checked immediately after each
  `fetchChannelWindow` resolves and before any dispatch for that channel;
  `channelBindDriver.test.ts`'s "isStale becomes true after the first
  channel's fetch resolves" case proves zero actions are dispatched once
  stale, not a partial set. The cross-effect race between this guard and
  `settleSeqRef` (a different, narrower gap) is flagged as the Major finding
  above.
- **R72 registry shape.** `NotebookSession.boundByCellId` is now
  `Map<string, BoundChannel[]>`; `setBoundChannels` replaces the whole list
  per cell in one call; `allBoundChannels()` flattens in per-cell insertion
  order (`[...map.values()].flat()`), which is deterministic given `Map`'s
  guaranteed insertion-order iteration. `NotebookSession.test.ts`'s new case
  proves two channels round-trip in order and a re-register replaces the
  whole list, not merges into it.
- **R72 settle refetch iterates the full list.** `onViewportSettled` (`index.tsx:545-588`)
  calls `runChannelSettle` with `binding.channels` (every distinct channel),
  not `[channel]`; `channelBindDriver.test.ts`'s "two-channel cell settles"
  case proves both channels fetch and both land in one `boundChannels`
  dispatch.
- **R72 rebuild replay.** `NotebookSession.onChannelsInvalidated` →
  `makeChannelsInvalidatedHandler` reads `getBound()` (`allBoundChannels()`)
  fresh at rebuild time and calls `rebindChannelsAfterRebuild` over the
  full flattened list — untouched by either commit, but now receives every
  registered channel instead of one-per-cell, closing R72's rebuild-replay
  requirement. `init` → JSON host vars → channels → `setCells` ordering
  itself is untouched by this diff (confirmed by `git show --stat`: no
  `sandbox/main.ts` or `SandboxHost.ts` change in either commit).
- **Both `TODO(idl0)` markers from the 13b fix are gone.** Grepped
  `channelBindDriver.ts` and `index.tsx` for `TODO(idl0)`: the
  one-channel-only registration TODO in `channelBindDriver.ts`'s file
  doc comment and the mirrored note in `index.tsx`'s effect doc comment are
  both removed by `4708f3a`; the two remaining `TODO(idl0)`s in `index.tsx`
  (`lapContext` threading, `ChartCell` mounting only `channels[0]`) are
  unrelated pre-existing/still-open items, not claims this pair of commits
  makes false.
- **Cache-hit claim (settle re-fetch of the mounted channel).** `ChartCell`'s
  own settle handler (`ChartCell.tsx:368-370`) keys its tile cache entry as
  `{ sessionId, channelId, tier, columnCount: width }` with `tier` from
  `chooseTier(next.endUs-next.startUs, next.pixelWidth, sampleRateHz)`.
  `runChannelSettle`'s call site passes the same `sessionId`, the mounted
  channel's own `sampleRateHz` (via `binding.channels[0]`, which is what
  feeds `ChartCell`'s `sampleRateHz` prop), the same `viewport.pixelWidth`
  (`DEFAULT_CHART_WIDTH_PX` both places) and the same `[startUs, endUs)` —
  `fetchChannelWindow`'s internal `chooseTier`/`tileRange` calls therefore
  compute an identical key, so `ensureTiles` finds every tile already
  present in the shared `TileCache` (`sessionRef.current.cache`, one
  instance) and issues zero `fetchTile` calls for the mounted channel;
  confirmed by reading `ensureTiles`'s cache-check-before-fetch shape (not
  changed by either commit) rather than by a new test — no test in this
  pair exercises the cache-hit path directly, but the claim is code-true.
- **No `invoke` reachable from pointer/wheel handlers.** Neither commit
  touches `ChartCell`'s pointer/wheel handlers (`git show --stat`: no hunk
  in that region); `runChannelBind`/`runChannelSettle` are only invoked from
  the data-only initial-bind effect and from `onViewportSettled` (a
  settle-triggered callback, not a per-frame gesture handler) — consistent
  with the design's "IPC on gesture settle, not during."
- **Tests A/A/A, named `thing — condition — result`.** All 9 new/changed
  test cases across `channelBindDriver.test.ts`, `NotebookSession.test.ts`,
  and `saveFlow.test.ts` follow the naming convention and have a clear
  Arrange (fixture/fake deps) / Act (call the function under test) / Assert
  (one or more `expect`) shape with blank-line separation; each asserts
  something that would fail if its own rule broke (checked by reading, not
  by mutation-testing) — e.g. the "isStale becomes true after the first
  channel's fetch resolves" case would fail if the loop dispatched before
  checking staleness, and "a re-register replaces the whole list" would
  fail if `setBoundChannels` merged instead of replaced.
- **`toIpcErrorOrUnknown` coverage.** `saveFlow.test.ts` now has four cases
  total: a well-formed `IpcError` pass-through (pre-existing), a bare-string
  throw (pre-existing), a plain `Error` (`new Error("disk full")` →
  `{ kind: "unknown", message: "disk full" }`, new), and `undefined` →
  `{ kind: "unknown", message: "undefined" }` (new) — closing
  `review-task13b.md`'s Minor exactly as specified (both requested cases,
  matching expected shapes byte-for-byte against `saveFlow.ts:49-59`'s
  actual branches).
- **Ownership/hygiene.** `git show --stat` on both commits touches only
  `CHANGELOG.md`, `index.tsx`, `channelBindDriver.ts`/`.test.ts`,
  `saveFlow.test.ts`, `NotebookSession.ts`/`.test.ts` — all lane-owned; no
  `package.json`/lockfile, `docs/`, `rust/`, `App.tsx`, or
  `AppState.tsx` touch in either commit; both commit messages are a single
  line with no AI attribution trailer; no `cargo` invocation anywhere in
  this review.
- **CHANGELOG accuracy.** The corrected 13b bullet no longer claims a
  `// TODO(idl0)` was left at the `channels[0]` call sites for the
  registration gap — it now correctly says the fix moved sequencing into
  `channelBindDriver.ts` with a staleness check per `await`, matching what
  `5956185` actually ships. The new 13c bullet's claims (registry becomes a
  list, one shared loop behind `runChannelBind`/`runChannelSettle`, cache-hit
  cost claim, TODO removed) all check out against the diff.
- **Doc comments and units.** Every exported symbol added/changed across
  both commits carries a doc comment; `startUs`/`endUs` (µs), `heightPx`,
  `translateXPx` units are consistent with the rest of the file; every
  `TODO` found is `// TODO(idl0):`-prefixed.
- **No `any`.** Grepped both diffs for `: any`, `<any>`, `as any` — zero
  hits.
- **Purity.** `channelBindDriver.ts` imports no `react`, `@tauri-apps/api`,
  or DOM global; `ChannelBindDeps.fetchTile` is injected, never imported
  directly from `ipc/tiles.ts` inside the driver.

## Verdict rationale

Both closures from `review-task13b.md` are done correctly and match R72's
text exactly: every distinct channel is fetched, sent, and now registered
as a whole list that a settle refetch and a rebuild replay both iterate in
full, with a deterministic flatten order, and the `toIpcErrorOrUnknown`
gap is closed with the two requested cases. The one real gap this
re-review surfaced is architectural rather than a regression the dispatch
asked about directly: the initial-bind effect's `boundIdentityRef` guard
and the settle handler's `settleSeqRef` guard protect against different
kinds of supersession and do not know about each other, so a slow initial
fetch racing a fast user pan can revert the pan and desync the registry —
a real, if narrow-window, violation of the "stale result ⇒ dropped"
contract the tightened IPC-effects rule requires, uncovered by any test in
either commit. This is a fix-up, not a rework: the shared-loop
architecture is sound and the fix is a single shared sequence number
instead of two independent ones.

VERDICT: NEEDS_FIXES
