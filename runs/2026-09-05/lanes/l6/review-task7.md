# L6 Task 7 review — tiles → Plot line data, hover with no IPC

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
branch `wave2-l6-notebook`. Commit under review: `39a6dbd4ee886da40f9ee171b637da3a15a08f30`
("app: tiles to Plot line data, hover from the tile column region (no IPC per move)").

In scope: `CHANGELOG.md`, `app/src/routes/pages/Notebook/components/ChartCell.tsx`,
`app/src/routes/pages/Notebook/model/{channelData.ts,channelData.test.ts,hover.ts,hover.test.ts}`
— exactly what `git show --stat 39a6dbd` lists, nothing more.

Out of scope, present but uncommitted in the worktree at review time: modified
`host/SandboxHost.ts`, `host/rebuildReplay.ts`, `host/rebuildReplay.test.ts`,
`sandbox/main.ts`, plus new `host/outboundQueue.ts`/`outboundQueue.test.ts` — the
sandbox outbound-queue/host-var-replay follow-up flagged in the dispatch. Ignored
for this review except where cited below as pre-existing, already-landed context
(`sandbox/main.ts`'s `materializeHostVar`, `host/protocol.ts`'s `channelPayload`,
both unmodified by 39a6dbd).

## Gate command and result

Run from the worktree's `app/`:
```
npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Notebook/model
```
`tsc --noEmit` at the live worktree HEAD failed with 3 errors, all inside
`host/SandboxHost.ts` (`OutboundQueue`/`OutboundEnvelope` unused, `RebuildReplayState`
missing `lastJsonHostVars`) — none in any file this commit touches. These come from
the uncommitted, out-of-scope follow-up (`git status --short` shows exactly those
files modified/untracked). To confirm 39a6dbd itself is clean, I added a disposable
detached worktree at `39a6dbd` (`git worktree add --detach`, junctioned
`node_modules`, removed after) and ran `npx tsc --noEmit` there: **silent, 0 errors**.

`npx vitest run --coverage src/routes/pages/Notebook/model` at the live worktree
(package.json/deps unchanged by this commit, so running it there is equivalent for
vitest):
```
 Test Files  5 passed (5)
      Tests  37 passed (37)
```
`channelData.ts`: 97.05% stmts / 85.71% branch. `hover.ts`: 89.47% stmts / 92.3% branch.
This reproduces the implementer's reported 37 passed, channelData.ts 97%, hover.ts 89%.
Gate: **pass** (tsc silent on the reviewed commit; vitest non-zero passed, 0 failed).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `channelData.ts:112-113` (the `v: Float32Array` field) vs `sandbox/main.ts:63` (`new Float64Array(payload.v)`) | Cross-task buffer-type mismatch that will silently corrupt every plotted value once wired. This task chose `v: Float32Array` (4 bytes/element) for the host-side transfer buffer, which the brief explicitly permits ("`v: Float32Array` or whatever concrete types you choose — document them"). But Task 5's already-landed `materializeHostVar` (unchanged by this commit) unconditionally does `new Float64Array(payload.v)` on the transferred `v` buffer — reinterpreting the same bytes at 8 bytes/element. Once Task 8 wires `tileToChannelData`'s output into `channelPayload`, the sandbox will read half as many records as intended, with each value's bits reinterpreted as an unrelated IEEE-754 double instead of the intended float — not a crash, a silently wrong chart. This is exactly the kind of type choice CLAUDE.md §1 says to stop and ask about rather than pick "the reasonable one," since the two ends of this buffer belong to different already-committed tasks with no shared test proving compatibility. | Either change `channelData.ts`'s `v` to `Float64Array` to match `materializeHostVar`'s fixed assumption, or file this as a lead ruling / Task 8 blocking note so `materializeHostVar` is corrected to read `Float32Array` for `v` before it's wired — not left to be discovered by Task 8 debugging a garbled chart. |
| Minor | `hover.ts:1-11` | `HoverGeometry`'s doc comment documents an assumption ("no gaps between tiles' column ranges") that `hoverAt` doesn't defend against — a caller handing tiles with a hole in the middle (plausible before Task 8's fetch orchestration guarantees full coverage) gets a wrong column silently rather than `null`. Not a defect against this task's own brief (which scopes `hoverAt` to already-fetched, in-order tiles and doesn't ask for gap handling), and no test claims to cover it, so this is a documented limitation rather than an unstated one. Worth Task 8 re-checking once real fetch/settle timing is in play. | No action required this task; flag for Task 8's own review to confirm tiles handed to `ChartCell` are always contiguous before settle. |

No Critical findings.

## Checks performed (all pass)

- **P1** — grepped the commit for `invoke(`: zero hits. `ChartCell.tsx`'s only
  pointer handler (`handlePointerMove`) calls `hoverAt` (pure) and `setHover`
  (React state) only; `handlePointerLeave` only calls `setHover(null)`.
- **P2** — `hoverAt` reads `columnMin`/`columnMax`/`columnMean`/`columnTUs` off
  `DecodedTile`s already in the caller's hands; `cursor_readout` does not appear
  anywhere in this commit's diff.
- **P5** — `tileToChannelData`'s `budget` parameter caps `length` via
  `Math.min(total, budget)`, verified against the "more columns than budget"
  test (100 columns, budget 10 → `length ≤ 10`, last record's time near the
  window's end, not its start, confirming stride not truncation).
- **P7** — `channelData.ts`'s doc comment and code produce the two flat typed
  arrays only; no JSON array of numbers appears anywhere in this task's diff.
  (`channelPayload`/`materializeHostVar`, the actual wire crossing, are Task 5's
  already-landed, unmodified code — see the Important finding above for the one
  place this task's chosen type doesn't match that landed code.)
- **`bigint`-before-`Number` sentinel check** — `channelData.ts:65` (`if (tUs ===
  COLUMN_T_US_EMPTY)`, compared before any `Number(tUs)` call at line 96/101) and
  `hover.ts:60` (`if (tUs === COLUMN_T_US_EMPTY) { return null; }`, before the
  returned object ever surfaces `tUs` to a caller that might convert it) — both
  correct order, confirmed by reading the code (not by trusting the doc comment).
- **Point budget ownership** — confirmed by reading `model/tiers.ts`: `pointBudget()`
  only computes the numeric cap from pixel width/mobile flag; it does not itself
  touch tiles or downsample. `tileToChannelData` (this task) is the only place
  that actually applies the cap to column data. No double-application; the two
  tasks agree on division of labor.
- **Downsample correctness across non-contiguous/partial tiles** — `tileToChannelData`
  filters every tile's columns independently by `[startUs, endUs)`, sentinel, and
  seam-dedupe before ever computing `total`/`stride`, so a partial last tile (fewer
  columns than a full tile) or a gap between two tiles' time ranges is handled
  correctly by the filter (it just contributes fewer/no columns) — the stride math
  operates on the already-filtered, concatenated list, not on tile boundaries, so
  it stays correct regardless of tile shape. Confirmed against the "two adjacent
  tiles" test and by re-deriving the stride arithmetic by hand for the budget test
  (total=100, budget=10, stride=10, `t[9]` sourced from index 90 → 90 s > 50 s,
  matching the test's assertion).
- **NaN handling vs Plot's actual behaviour** — `docs/vendor/observable-plot/marks/line.md:362`
  ("If any of the x or y values are invalid (undefined, null, or NaN), the line
  will be interrupted, resulting in a break") confirms the doc comment's claim:
  Plot does not draw a `NaN` `y` as zero, it breaks the line there. The "all-NaN
  column keeps time, emits NaN in `v`" choice and its doc comment are accurate.
- **C2 §5.1 / R52 Q2 settled shape** — confirmed the code and comments never claim
  `channel()` "returns" `{length, t, v}` (the superseded SoA shape); `ChannelData`'s
  own doc comment correctly frames itself as the host-side transfer buffer, distinct
  from the array-of-records shape `sandbox/main.ts`'s `materializeHostVar` builds
  from it (matches R52 Q2 in `runs/2026-09-03/decisions.md:2561-2565`).
  `host/protocol.ts`/`sandbox/main.ts` are untouched by this commit — Task 5's
  `channel` path was already complete, so Step 2's conditional edit correctly did
  not fire.
- **Ownership** — `git show --stat 39a6dbd` touches only `CHANGELOG.md` and five
  files under `app/src/routes/pages/Notebook/{model,components}/`. No `package.json`,
  no `rust/`, no `App.tsx`, no other lead-owned file.
- **No new npm dependency** — `package.json`/lockfiles not in the diff.
- **Repo hygiene** — commit message is a single line, no AI attribution trailer;
  `git add` used explicit paths per the brief's Step 6 list (confirmed against
  `git show --stat`); nothing under `docs/` touched.
- **CLAUDE.md §4/§5** — every exported symbol (`ChannelData`, `tileToChannelData`,
  `HoverGeometry`, `hoverAt`, `ChartCellProps`, `ChartCell`) has a doc comment with
  units where numeric (µs/seconds on `t`/`tUs`/`startUs`/`endUs`, CSS px on
  `pixelX`/`originPx`/`pixelWidth`/`width`/`height`); no bare `// TODO`; test names
  match the brief's Step-1 list verbatim for all 5 `channelData.test.ts` cases and
  all 3 brief-specified `hover.test.ts` cases (the implementer added 2 extra hover
  tests — "no tiles at all", "resolves into the second of two tiles" — beyond the
  brief's 3, which is additional coverage, not a shortfall); each test file uses
  A/A/A with blank lines between Arrange/Act/Assert.
- **Test count vs brief** — brief specifies 8 new tests (5 + 3); this commit adds
  10 (5 + 5), a superset, so the "fewer tests than specified" Important-finding
  trigger in the standing brief does not apply.
- **Purity/no premature Task 8/9 scope-creep** — `channelData.ts`/`hover.ts` import
  nothing from `react`, `@tauri-apps/api`, or DOM globals; `ChartCell.tsx` never
  calls `fetchTile`/`ensureTiles`, receives tiles as props only, matching the "Do
  not fetch tiles from `ChartCell.tsx`" ruling. No `useEffect` exists in
  `ChartCell.tsx` at all, so the standing brief's IPC-driving-effect trace
  (dependency array vs dispatches, self-cancelling effects) does not apply to this
  commit — there is no effect to trace.

## Verdict rationale

The pure modules are correct, well-tested (10 tests, all A/A/A, matching or
exceeding the brief's list), and the gate reproduces cleanly once the
out-of-scope in-flight follow-up's `tsc` breakage is set aside (confirmed via a
disposable worktree at the exact commit). The `bigint`-before-`Number` sentinel
ordering, the stride-not-truncation downsample, the seam dedupe, and the NaN
line-break behavior are all implemented as specified and match the vendored
Plot documentation. The one real problem is the `v` buffer's concrete type:
`channelData.ts` chose `Float32Array` where Task 5's already-landed sandbox
decode hardcodes `Float64Array`, which will silently corrupt every hovered/
plotted value once Task 8 wires the two together — a small, mechanical fix
(pick one type on either end) but one that needs to happen before that wiring
lands, not be discovered by a garbled chart afterward.

VERDICT: NEEDS_FIXES
