# Review — L6 Task 18 (host-channel binding for `js` chart cells over workbook definitions)

**Commit:** `4f5099f` — `app/Notebook: chart cells bind workbook definitions via fetch_host_channel (R77.3)`
**Branch/worktree:** `wave2-l6-followon` at `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-followon`

**Files touched:**
- `CHANGELOG.md`
- `docs/IDL0_SPEC.md` (§26.1, §26.4, §26.7)
- `app/src/routes/pages/Notebook/host/NotebookSession.ts` + `.test.ts`
- `app/src/routes/pages/Notebook/index.tsx`
- `app/src/routes/pages/Notebook/model/channelBindDriver.ts` + `.test.ts`
- `app/src/routes/pages/Notebook/model/channelRebind.ts` + `.test.ts`
- `app/src/routes/pages/Notebook/model/jsCellBinding.ts` + `.test.ts`

All touched paths are within the task's ownership grant (`Notebook/**`, SPEC §26.1/§26.4/§26.7, CHANGELOG). No `App.tsx`, `state/**`, `ipc/**`, `App.tsx`, or Rust files touched. `channelRebind.ts`'s §26.4 amendment matches R78 Q1(a)'s condition ("If Open Question 1 resolves toward refetch, §26.4's clause also needs one clause — edit it then").

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Notebook
```
Result: `tsc --noEmit` clean (no output/errors). Vitest: **34 files, 299 tests, all passed** (5.11s). Matches the implementer's reported numbers exactly.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Note | `channelBindDriver.ts` (definition branch) | The budget-unchanged skip path (`bounds.push(previous); continue;`) performs no `await` and so correctly needs no `isStale()` check there — confirmed by reading the code, not just the doc comment. | None — correct as written. |
| Note | `channelRebind.ts:rebindChannelsAfterRebuild` | Definition re-fetch on rebuild is fire-and-forget (`void deps.fetchHostChannel(...).then(...)`), consistent with the function staying synchronous per its own doc comment and matching `onChannelsInvalidated`'s `() => void` signature. A definition whose rebuild re-fetch is still in flight when a second rebuild fires is not de-duplicated or cancelled, but a rebuild is stated (R78) to be the rare watchdog path and this is unspecced. | None required — informational only. |

No Critical, Major, or Minor findings.

## Verification detail

1. **Resolution order (session before definition).** `jsCellBinding.ts`'s `bindingFor` tries `findChannel` first and only checks `definitionNames.has(mark.channel)` in the `else` branch; test `"bindingFor — session channel resolution is tried before a same-named definition — resolves as \"session\""` constructs a channel and a definition of the identical name `avg_speed` and asserts the resolved entry has `source: "session"`. An unresolvable name still returns `null` for the whole cell (unchanged path), covered by the existing "not present in sessionDetail.channels or definitionNames" test. `bindingIdentity` now folds every channel (`channels.map(c => \`${c.channelId}|${c.source}|${c.lap ?? "session"}\`).join(",")`) instead of `channels[0]` only; I checked the two identity tests that predate this task (same channel/lap/span ⇒ same identity; different span ⇒ different identity) still exercise real inequality, not vacuous equality, since both still compare full bindings with populated `channels`. The new identity test (session⇄definition flip on the same name) asserts inequality directly.

2. **Budget clamping.** `clampHostChannelBudget` rounds then clamps to `[1, 65536]`; tests hit both boundaries (0→1, 65537→65536) and the exact bounds (1, 65536) plus fractional rounding (639.6→640, 639.4→639), matching C3 §3.4's `1..=65536`. `shouldRefetchHostChannel(prevBudget, nextBudget)` is `prevBudget !== nextBudget`; the driver test `"a definition channel's budget unchanged from previousBound — issues no fetchHostChannel call, still registers the channel"` confirms zero `fetchHostChannel` calls and that the previous `BoundChannel` is still pushed into `boundChannels`. A changed budget correctly refetches (separate test, asserts the new budget value is what's sent).

3. **Staleness.** Every `await` in `runChannelBindWindow`'s definition branch (`deps.fetchHostChannel`) and session branch (`fetchChannelWindow`) is followed by `isStale()` before any dispatch for that channel; a stale run returns before pushing that channel's `channelData`/`bounds` entry and before the final `boundChannels` dispatch. Test `"isStale true after the host-channel await — drops every remaining dispatch, including boundChannels"` places the definition channel second in a mixed binding, arranges `isStale` to flip true exactly on the second `await`, and asserts only the first (session) channel's `channelData` landed and zero `boundChannels` dispatches occurred.

4. **Rebuild (R78 Q1).** `rebindChannelsAfterRebuild` branches on `channel.source`: `"session"` re-derives from `TileCache` only (unchanged, never fetches); `"definition"` calls `deps.fetchHostChannel` again and never touches `cache`. A rejected re-fetch or a `hasT: false` result is silently dropped (no `send` call), matching Q3(a)'s "not bound" rule applied symmetrically to the rebuild path. Rebuild order (`init` → host vars → channels → `setCells`) is untouched by this diff — confirmed no edits to `SandboxHost.ts` or the ordering logic, only to what `rebindChannelsAfterRebuild` does per bound channel.

5. **Q2/Q3.** `binding.mountedChannelId === null` (all-definitions cell) renders `JsCellFrame` with no note (`index.tsx`'s `renderJsCell`); a mixed cell still finds `mountedChannelId` among `binding.channels` and mounts `ChartCell`, with the definition channel(s) fetched alongside via the same bind effect. `has_t: false` definitions are excluded from `definitionsWithAxis` (the `ReadonlySet` fed to `bindingFor`), so `bindingFor` treats the name as unresolvable and returns `null` for the cell; the note text is distinguished (`isAxisLessDefinition` check against the unfiltered `definitionNames` list) — `` `Definition "${unresolved}" has no recorded axis.` `` vs `` `Channel "${unresolved}" is not part of this session.` ``, both naming the identifier as required. The driver additionally drops a `hasT: false` result defensively post-fetch (test: `"a definition result with hasT false — is dropped, not bound (Q3(a))"`), covering the case where a definition's `has_t` flips between resolution and fetch.

6. **`index.tsx` effect dependencies.** The bind effect's array is `[state.cells, state.markdown, state.outputs, sessionDetail, sessionSpanUs, sessionId]` — all `useState`/reducer-state values, no function. `sessionDetail`/`sessionSpanUs` are plain `useState` slots (`index.tsx:139-140`), unchanged by this task; they're only replaced by their own setters, not recreated per render by anything this diff added, so this task introduces no new refetch-storm risk. `fetchHostChannelDep` is a plain closure recreated each render but is read inside the effect body via direct reference, never placed in the dependency array — consistent with the tightened IPC-effects rule (deps must be data only). No cleanup function is registered in the bind effect (unchanged), and no in-flight work is cancelled.

7. **No `invoke` from pointer/wheel handlers.** `fetchHostChannelDep`/`fetchHostChannel` calls in this diff are only reached from the bind effect and from `ChartCell`'s `onSettle` callback (`index.tsx` ~line 729), which is the existing settle-driven pattern (`runChannelSettle`), not a raw pointer/wheel handler — matches the pre-existing architecture, unchanged by this task.

8. **SPEC accuracy.** §26.4's amended clause reads: a tile-backed channel "is re-derived from the shared `TileCache`, never re-fetched"; a definition-bound channel "has no tile-cache entry to re-derive from, so it is re-fetched via `fetch_host_channel` instead" — this is the exact clause R78 Q1(a) called for. §26.1 states the three-way render split and the no-time-window limitation in one sentence, matching code behavior verified above. §26.7's N3 entry now says host-channel byte path "landed" with the call site named, and states the remaining open item (no sub-range zoom) — accurate against the diff. CHANGELOG bullet matches the brief's required text essentially verbatim and is truthful against the code.

9. **Test naming and assertions.** All new/changed tests follow `thing — condition — result` and use Arrange/Act/Assert with blank-line separation (spot-checked across `jsCellBinding.test.ts`, `channelBindDriver.test.ts`, `channelRebind.test.ts`, `NotebookSession.test.ts`). Each asserts the specific claim in its own name (e.g. budget-unchanged test asserts zero calls AND registration; hasT-false test asserts zero `channelData` AND empty `bound` array) rather than a name that doesn't match its assertions.

## Verdict rationale

The implementation matches the brief's interfaces exactly (`BindingChannelSource`, `mountedChannelId`, `ChannelBindDeps.fetchHostChannel`, `clampHostChannelBudget`/`shouldRefetchHostChannel`, the `BoundChannel` discriminated union), applies R78's Q1(a)/Q2(a)/Q3(a) rulings correctly in both the forward-bind and rebuild paths, respects R72's per-channel (not `channels[0]`-only) identity and registry, keeps the IPC-effects rule (data-only deps, no cancelling cleanup, no function in deps), never routes a definition through `chooseTier`/`tileRange`/`ensureTiles`, never synthesizes a time axis for an axis-less definition, and stays within its ownership grant touching only `Notebook/**` plus the two named SPEC subsections and CHANGELOG. Tests are thorough, correctly named, and each asserts what it claims — I traced the staleness, budget-skip, rejection-drop, and hasT-false cases by hand against the driver's control flow and they hold. The gate ran clean (tsc, 34 files/299 tests). No deviations found beyond two informational notes that don't affect correctness or spec compliance.

VERDICT: CLEAN
