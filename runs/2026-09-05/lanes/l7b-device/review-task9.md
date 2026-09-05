# L7b Task 9 review — device files, status hero, lane wrap-up (+ lane merge opinion)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
branch `wave2-l7b-device`.

Commits reviewed:
- `e374340` — "app: Device tab file download and status hero; L7b lane complete pending write commands" (Task 9 proper)
- `4b71833` — merge `main` into `wave2-l7b-device` (CHANGELOG.md/TASKS.md conflicts)
- `192cb44` — "app: Device tab PushConfigBar guards against unmount, memoises validation" (closes both review-task8 Minors)

Files touched (Task 9 commit): `CHANGELOG.md`, `TASKS.md`, `app/src/routes/pages/Device/{DeviceFiles.tsx,HeroCard.tsx,files.ts,files.test.ts,index.tsx,ipcStubs.ts}`, `docs/IDL0_SPEC.md`. All in scope.

## Test command and result

Ran once, whole suite (Task 9 is the lane merge gate), from `.../wave2-l7b-device/app`:

```
npx tsc --noEmit && npx vitest run --coverage
```

Output: `tsc --noEmit` printed nothing. Vitest: **46 test files passed (46), 330 tests passed (330)**. Coverage (`Device/`): `connection.ts` 87.5% lines, `files.ts` 84.21% lines / 70% branch (uncovered 94, 139–147), `ipcStubs.ts` 0% (expected — throw-only stubs, never called by tests), `profiles.ts` 94.11%, `push.ts` 94.44%, `sources.ts` 96.96%, `config/edit.ts` 100%, `config/model.ts` 91.01%.

This reproduces the implementer's reported 330 passed and matches the dispatch's stated expectation (`ipcStubs.ts` 0%, Device pure modules 84–100%) — `files.ts` sits marginally under that band at 84.21% lines / 70% branch, addressed as a finding below.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical findings. | — |
| Minor | `Device/files.ts:93-94` (`FILES_LOADED`), `Device/files.ts:139-141` (`isDownloadActive`) | Both are exported, pure, one-line functions with zero direct test coverage in `files.test.ts` — only exercised indirectly through `DeviceFiles.tsx`, which is correctly untested per the no-rendering-tests rule. `FILES_LOADED` is a straight spread-assignment and `isDownloadActive` a single `.some()` predicate, so the risk of a latent bug is low, but this is exactly the kind of pure-reducer branch CLAUDE.md §4 asks to be tested directly rather than left to fall out of a component test that doesn't exist. Not gate-blocking: the logic is trivially correct by inspection and matches its doc comment and every call site. | Two more test cases before or shortly after merge: `downloadReducer — FILES_LOADED — replaces files, queue untouched` and `isDownloadActive — a mixed queue — true only while something is queued or downloading`. |
| Minor | `Device/DeviceFiles.tsx:79` (`forceTick`) | `forceTick((n) => n + 1)` on every `PROGRESS` dispatch forces an extra re-render purely so the elapsed-time-derived transfer rate updates; harmless (this is a click-driven flow, not the IPC-effects rule's target, and there's no rendering test to catch it either way) but a maintainer reading this for the first time has to work out that the setter's return value is unused and it exists only as a render trigger. | A one-line comment already exists (`// re-render so...`) — sufficient; not a real gap, noting only because it's easy to mistake for dead code. |

## Checks performed (all pass)

- **IPC fires on explicit click only.** `onListFiles`/`onDownload` in `DeviceFiles.tsx` are called from `onClick` handlers, not from a `useEffect`; the only `useEffect` in the whole diff is `PushConfigBar.tsx`'s empty-deps unmount-flag setter, which does not start or dispatch any IPC work itself and cannot self-cancel (verified against the standing brief's added "IPC-driving effects" rule — there is nothing to trace here because Task 9 adds no IPC-driving effect at all).
- **Download reducer purity and one-at-a-time.** `downloadReducer` (`files.ts:91-131`) is a total, non-mutating switch; `DeviceFiles.onDownload` checks `isDownloadActive(state.queue)` before enqueuing and every row's Download button is `disabled={active}` — traced both the guard and the UI disablement, not just one of the two.
- **No invented percentage.** `PROGRESS`'s handling in the reducer (`files.ts:105-113`) stores `action.progress.total` verbatim (`number | null`); `DeviceFiles.tsx`'s `DownloadRow` renders `item.totalBytes === null ? "" : ...` and never computes a ratio — confirmed no `done/total` division exists anywhere in the diff.
- **No download→import handoff (R53 Q3).** `DownloadRow`'s "done" branch renders "downloaded (…) — import it from the Data tab." and nothing else in the diff calls any Data-tab or catalog-import function after a successful download.
- **`toFileViews` sourcing.** `files.ts` itself calls no IPC; `index.tsx`'s `onConnect` callback (not an effect) fetches `listSessions()` from `app/src/ipc/catalog.ts` — real, landed C3 §3.2, shared surface, not a Data-tab-owned module — and stores the id set in `knownSessionIds` state, passed down to `DeviceFiles`. No cross-lane import of Data-tab code.
- **`HeroCard` honesty (R59 Q6).** Every field this session cannot know — Mode, Recording, SD card, GPS fix, IMU, HRM, Battery — renders the literal string `"unavailable"` (`HeroCard.tsx:36-43`); only Connection (from `ConnectionState.connected`, R53 Q4 semantics) and Firmware (`connected?.firmware_version`, a real field on the landed `ConnectionInfo`) render a live value. No fabricated zero anywhere.
- **`PushConfigBar.tsx` mounted-ref guard and memoisation (`192cb44`).** `issues`/`prepared` are now `useMemo`'d on `config`'s identity, so they still recompute correctly whenever `config` changes (no stale closure — the dependency array is exactly `[config]` for both) while no longer being recomputed on every unrelated re-render; `onPush` reuses the memoised `prepared` rather than calling `preparePush` a third time. `mountedRef` is set to `false` only in the empty-deps effect's cleanup and both the `.then` and `.catch` branches check it before dispatching — a push resolving after unmount is now a documented no-op instead of a dispatch into a discarded reducer. Both review-task8 Minors are closed exactly as described.
- **Ownership boundary, whole lane.** `git diff main...HEAD --stat` shows every changed path under `app/src/routes/pages/Device/**`, the `DevicePage.tsx` shim, `CHANGELOG.md`, `TASKS.md`, and `docs/IDL0_SPEC.md`; nothing under `rust/`, `app/src-tauri/`, `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`, `package.json`/lockfile, `vite.config.ts`. No exceptions.
- **R53 Q1 whole-tree sweep.** `grep -rn "32768|scale =|/ 32768|channel_id"` over `Device/` (excluding `.test.ts`) returns only `model.ts:614` (`out.scale = channel.scale`, copying the user-set analog `scale` field verbatim, not deriving it), `validate.ts:205` (`channel.scale === 0`, a validation check on the same user-set field), and `sources.ts:78` (doc-comment prose citing the SPEC §3 formula, explicitly permitted). No `scale = range / 32768` arithmetic and no `channel_id`/`data_type` derivation anywhere in the tree.
- **Stubs never fabricate an `IpcError`.** `ipcStubs.ts` still throws only `NotImplementedError` for all eight stubbed commands (unchanged set from Task 1, doc comments extended by Task 9 to explain why `HeroCard` doesn't call `deviceStatus`/`deviceControl` at all). Grepped the whole `Device/` tree for `device_rejected` — no reference anywhere (R59 Q4: it's a real kind on `main` as of the C3 wave-2 write amendment merged in via `4b71833`, but this lane correctly does not reference it since nothing in this lane's scope emits or consumes it).
- **Merge commit `4b71833` hygiene.** `CHANGELOG.md`/`TASKS.md` conflicts both resolved by keeping both sides' bullets (main's L7a/L7c/other-lane bullets first, then this lane's), exactly the R19 pattern; no other file conflicted; no manual edit beyond the stated resolution.
- **CLAUDE.md §4 testing.** All 7 new tests in `files.test.ts` use Arrange/Act/Assert with blank lines between phases and are named literally `thing — condition — result` (em dash), matching the brief's test list verbatim; each assertion matches its name (spot-checked all seven against the source). No rendering tests added for `DeviceFiles.tsx`/`HeroCard.tsx`.
- **CLAUDE.md §5.** Doc comment on every exported symbol in `files.ts`, `DeviceFiles.tsx`, `HeroCard.tsx`; units stated where applicable (`doneBytes`/`totalBytes` in bytes, `formatTransferRate`'s KB/s). No `Err(String)`-equivalent; download/list failures route through `describeIpcError`/`err.kind`, never `.message`.
- **Repo hygiene.** Both `e374340` and `192cb44` are single-line commit messages, no AI attribution trailer; `git add` in the reported Step 8 command lists explicit paths (confirmed against `git show --stat`, no `-A` artifact). No `cargo`/`npm run tauri` invocation anywhere in the diff or the reported steps.
- **No assertion against a live radio.** `files.test.ts` exercises only the pure reducer and formatting functions against literal `DeviceFile`/`Progress`/`DownloadResult` objects — no `invoke` or BLE mock anywhere.
- **NUL-byte check.** Re-ran `grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]'` against all nine files the brief names — all printed `0`.
- **SPEC/CHANGELOG/TASKS accuracy vs. code.** §23.10's hero-card prose and §24.17's files/download prose both match the shipped code exactly (list-on-click, one-at-a-time, no percentage on null total, no import handoff, "unavailable" literal). The `TASKS.md` L7b line and the CHANGELOG wrap-up bullet both say "landed on `wave2-l7b-device`" throughout — no claim of having merged to `main`. The full parity-gaps table (14 rows) is represented in the wrap-up text with matching dispositions (stubbed / deferred wave 3 / dropped / partial / not exposed) for every row.

## Verdict rationale (task level)

Task 9 does exactly what its brief specifies and nothing more: file listing and download are click-driven and reducer-pure, downloads are strictly serial, no percentage is invented, there is no cross-tab import handoff, the hero card is honest about what it cannot know, and the R53 Q1 boundary (the lane's one automatic-Critical trigger) is clean across the whole tree, not just this task's new files. The two prior open findings from review-task8 are both closed correctly by `192cb44`, with the memoisation still correctly keyed on `config`'s identity. The only gap is two trivial, low-risk reducer branches (`FILES_LOADED`, `isDownloadActive`) left untested directly rather than through a (correctly absent) component test — real, but not a defect, and easily closed with two lines. This does not rise above Minor.

TASK VERDICT: CLEAN

## Lane merge opinion

All nine tasks are landed on `wave2-l7b-device` inside the lane's exact ownership boundary, every prior review's findings (Tasks 4–8, all previously NEEDS_FIXES on Minor/Important items) are closed by later commits already present on this branch, the whole-suite gate reproduces cleanly (330 passed, `tsc` silent), and the R53 Q1 arithmetic boundary — the one automatic-Critical trigger for this lane — is clean across every file, not just the newest ones. `TASKS.md`/`CHANGELOG.md` accurately describe the lane as landed-on-branch (not merged) and correctly enumerate every outstanding IPC need and every parity-gap disposition, with no silent drops. The lane is ready to merge to `main` as-is; the two Minor findings above (untested trivial reducer branches) are worth a quick follow-up commit but are not merge-blocking.

VERDICT: CLEAN
