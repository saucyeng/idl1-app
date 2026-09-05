# L7a Task 5 review — import queue (`ImportPanel`/`importQueue`/`FilePicker`)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
branch `wave2-l7a-data`, commit under review `05f26861f11a61f4e5b811e5420f77c85da4a302`
("app: Data tab import queue over import_file/list_importers"). In scope: the
8 files in that commit's diff (`CHANGELOG.md`, `FilePicker.ts`/`.test.ts`,
`ImportPanel.tsx`, `importQueue.ts`/`.test.ts`, `Data/index.tsx`,
`docs/IDL0_SPEC.md` §24). A Task 4 follow-up may have landed on top of this
commit in the worktree since dispatch; not reviewed here.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Data
```

`tsc --noEmit` printed nothing (clean). Vitest:

```
 Test Files  9 passed (9)
      Tests  66 passed (66)
```

This reproduces a passing, non-zero-count gate. Two discrepancies from the
implementer's reported numbers, neither blocking: the implementer reported
65 passed, I got 66 (one extra test is present in the worktree at review
time — consistent with the Task 4 follow-up the dispatch said might land
mid-review, out of this task's scope). The implementer reported
`importQueue.ts` at 93% lines and `FilePicker.ts` at 100%; my run shows
`importQueue.ts` at 93.33% lines (matches) but `FilePicker.ts` does not
appear in the coverage table at all despite `FilePicker.test.ts`'s two tests
passing — a `v8`/reporter artifact, not a functional problem (Minor, noted
for awareness only).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Critical | `ImportPanel.tsx:83-113` (the driving `useEffect`) | The driving effect depends on `[state.items, onImported]` and its own body dispatches `START`/reads/writes into that same `state.items` via `importFile`'s callbacks. Every dispatch (`START`, `PROGRESS`, `SUCCEEDED`, `FAILED`, `DISMISS`, even an unrelated `ENQUEUE` of a second file) produces a new `state.items` array reference (the reducer always returns a fresh object/array — see `importQueue.ts`'s `mapAt` and every case arm). React re-runs a `useEffect` whose dependency array changed by reference, and it runs the *previous* invocation's cleanup first. Here that cleanup is `() => { cancelled = true; }` — the exact flag the in-flight `importFile(...).then/.catch` and the `Channel.onmessage` callback check before dispatching `PROGRESS`/`SUCCEEDED`/`FAILED`. Concretely: the effect calls `dispatch({type:"START"...})` and then calls `importFile(...)` inside the *same* invocation. That `START` dispatch triggers a re-render, which (once committed) tears down that very invocation's closure — setting its own `cancelled` to `true` — before the real Tauri IPC round-trip for `importFile` has any chance to resolve (an actual cross-process `invoke()` call cannot complete before a JS scheduler tick, so the cleanup essentially always wins the race). Once `cancelled` is `true`, every later `PROGRESS`/`SUCCEEDED`/`FAILED` from that closure is silently dropped (`if (cancelled) return;`), so the item is stuck at `status: "running"` forever — no completion, no failure, no error message, and (because a later effect run always sees an item still `"running"` and returns early) the queue never advances to the next `"queued"` item either. This is not a rare race: it is the ordinary path for every import, and it also fires whenever *any* item's terminal status is reached or any new file is enqueued while another is running, because those actions likewise change `state.items` and tear down whatever import is currently in flight. This is the core mechanism the whole task is meant to deliver, and as wired it can never successfully complete an import once L5 Task 9 lands. Not caught by the unit tests because `importQueue.test.ts` exercises the pure reducer directly (never through the effect), and `ImportPanel.tsx` has no test (correctly — CLAUDE.md forbids rendering tests) — but that also means nothing exercised this wiring. | Stop tying the "is something running / which import am I babysitting" bookkeeping to `state.items` identity. E.g. track the in-flight index/id in a `useRef` set once per `importFile` call and read `state` for the *item's current fields* via a ref updated in a separate effect (or via `useReducer`'s dispatch functions closed over a stable ref), so the driving effect's cleanup only fires on unmount or when the *specific running item* is torn down (e.g., user cancels), not on every reducer dispatch its own callbacks produce. |
| Important | `ImportPanel.tsx:96,101,105` (`dispatch({ type: "PROGRESS"/"SUCCEEDED"/"FAILED", index: nextIndex, ... })`) combined with `importQueue.ts`'s `DISMISS` case | `DISMISS` removes an item from the array (`state.items.filter(...)`), shifting every later item's index down by one. The driving effect's callbacks close over `nextIndex`, captured once when the import started. If a user dismisses any earlier terminal item (`"done"`/`"failed"`) while a later item is `"running"`, the running item's true array position shifts down but the closure keeps dispatching at the old, now-stale `index`. `mapAt`'s `items.map((item, i) => i === index ? fn(item) : item)` silently no-ops when `index` no longer names any element (queue shrank below it) or, worse, now names a different item (another item shifted into that slot) — either a dropped update or a misrouted one, exactly the failure mode the dispatching brief asked to have checked explicitly. The implementer's own comment in `importQueue.ts` ("index addressing stays correct even if the same path is enqueued twice") only reasons about duplicate paths, not about `DISMISS` shrinking the array out from under a running item's captured index. In today's build this is masked by the Critical finding above (no real import ever reaches a point where a `DISMISS` of an earlier item matters, because the running item's own updates are already being dropped by the self-cancellation bug), but it must be fixed together with it, not treated as already covered by "index addressing is fine because we never resolve two `START`s to one index." | Address items by a stable id assigned at `ENQUEUE` (e.g. an incrementing counter field on `ImportItem`), not by array position, so `DISMISS` can shrink the array without invalidating any other item's identity. |
| Minor | `CHANGELOG.md:9` | The new bullet states the reducer "drives files through ... `import_file` one at a time" as an already-working behaviour ("neither is stubbed, a rejection ... is shown honestly"). Given the Critical finding, no import can currently reach any terminal state once the Rust side lands, so this description will read as inaccurate until the effect is fixed. Not a fabrication at write time (the bug is not visible from the reducer alone) but worth revisiting once the fix lands. | No action needed now; re-check CHANGELOG wording when the effect fix is dispatched. |
| Minor | `FilePicker.test.ts:12-15` | The second test (`"an empty or whitespace-only string — resolves to null"`) inlines two `expect` calls with no Arrange/Act/Assert blank-line separation (CLAUDE.md §4). Trivial content, but a literal AAA-with-blank-lines reading would want each case as its own act/assert pair or at least a blank line before the assertions. | Cosmetic; not blocking. |
| Minor | coverage report | `FilePicker.ts` does not appear as a row in the `--coverage` table despite being fully exercised by `FilePicker.test.ts` (see Test command section) — a `v8`/vitest reporting artifact under this repo's `vitest.config.ts`, not a code defect. | None needed; flagged for awareness only. |

No fabricated `IpcError` kind, no stub of `import_file`/`list_importers`, no
new npm dependency, no touch to `app/src-tauri/`, `App.tsx`, `main.tsx`,
`routes/types.ts`, `state/AppState.tsx`, `package.json`, or `vite.config.ts`,
no `cargo`/`npm run tauri` anywhere in the diff or gate commands.

## Checks performed (all pass)

- Ownership boundary: `git show --stat 05f2686` — every path is under
  `app/src/routes/pages/Data/**`, `CHANGELOG.md`, or `docs/IDL0_SPEC.md` §24
  (spec-during task); no lead-owned file touched; no `app/src/ipc/*.ts`
  change (correct — `import.ts`/`catalog.ts` already had everything needed).
- `pickImportFile()` returns `Promise<string | null>`, trims and treats
  blank as `null`, matches lead ruling R55's seam exactly; no
  `@tauri-apps/plugin-dialog` import, no capability file touched.
- `importFile` calls are serialised: the driving effect only starts a new
  item when `findIndex(status === "running") === -1`, and (setting the
  Critical finding aside) never starts a second import concurrently by
  construction.
- `overallPercent` returns `null` whenever any `"running"` item's `total`
  is `null`, verified both in `importQueue.ts`'s `itemFraction` and by the
  "PROGRESS with total null" test.
- A non-`IpcError` / unrecognised-kind rejection is surfaced honestly via
  `describeIpcError`'s `UNKNOWN_KIND_FALLBACK` ("Something went wrong."),
  never treated as success; `import_gpx_no_trackpoints` and the other C3 §2
  kinds map to the exact strings in `errors.ts`, checked byte-for-byte
  against the FAILED test's expectation.
- `listSessions()` refresh (`onImported` → `Data/index.tsx`'s
  `handleImported`) is wired to fire once per queue drain via
  `drainedAtLengthRef`, not per file — matches the settle-bound requirement,
  independent of the Critical finding (this guard logic is itself correct,
  it just never gets exercised today because the queue never actually
  drains in a real run).
- `importerId` is `null` for the default `<option value="">Auto-detect</option>`
  and a string id otherwise, matching C3 §3.3's auto-detect contract.
- No IPC call on keystroke: the path `<input>` only updates local
  `pastedPath` state; `pickImportFile`/`importFile` fire only on the Import
  button click.
- Test names all literally `thing — condition — result` with em dashes;
  `importQueue.test.ts`'s seven tests match the brief's Step 1 list exactly,
  each with a blank line between Arrange/Act and Assert.
- No rendering tests: `ImportPanel.tsx` has no `.test.ts(x)`; both new test
  files exercise pure modules (`importQueue.ts`, `FilePicker.ts`) only.
- Doc comments present on every exported symbol in `importQueue.ts` and
  `FilePicker.ts`; numeric fields' units are inherited by reference from
  `Progress`'s own doc comment (phase-specific unit, documented upstream) —
  acceptable, not a bare undocumented number.
- `docs/IDL0_SPEC.md` §24's Import bullet is a real rewrite (names the
  picker gap, the serialised queue, the `Channel<Progress>` shape, the
  importer override, and the `list_sessions` refresh-once-per-drain
  behaviour), not a one-line stub; spec-during discipline honoured.
- Commit is a single line, no AI attribution trailer; `git add` used
  explicit paths (no stray files pulled in).
- NUL-byte check (brief Step 5) reproduced: `0` for every file listed.
- No `cargo`, no `npm install`, no new `package.json` dependency anywhere
  in the diff or the reported/rerun commands.

## Verdict rationale

The reducer, error mapping, spec rewrite, and file-picker seam are all
correct and match the brief and R55 exactly — this is solid work on the
parts that are unit-testable in isolation. But the one piece that makes the
queue actually run, `ImportPanel.tsx`'s driving `useEffect`, has a
self-defeating dependency: it dispatches into the very state array it
depends on, so its own cleanup cancels its own in-flight `importFile` call
before any real (network/IPC-latency) response can land, meaning no import
can ever reach `"done"` or `"failed"` in practice, and the queue cannot
advance past its first item. A second, related defect (stale index capture
surviving `DISMISS`'s array shrink) would misroute or drop updates even if
the first bug were fixed. Both are contained to `ImportPanel.tsx`'s effect
and `importQueue.ts`'s action addressing scheme — the reducer's action
shapes and the panel's rendering are otherwise sound, so this does not
require reworking the queue design or file layout, just re-architecting how
the effect tracks "what am I babysitting" and how items are addressed.

VERDICT: NEEDS_FIXES
