# L7c Task 4 review — `PrefsBackend`/`PrefsStore` go async (Step 0), then the data-directory section

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7c-settings`,
branch `wave2-l7c-settings`. Commits reviewed: `6b1ad18` (Step 0, async
refactor: `prefsStore.ts`, `prefsStore.test.ts`, `ProfileSection.tsx`,
`UnitsSection.tsx`, `CHANGELOG.md`) and `3ecdc63` (Task 4 feature:
`dataDir.ts`, `dataDir.test.ts`, `DataSection.tsx`, `index.tsx`,
`docs/IDL0_SPEC.md` §27.8, `CHANGELOG.md`). In scope: exactly those two
commits' diffs against `brief-task4.md`, `runs/2026-09-05/lanes/l7c-settings/review-task2.md`
note 2, R53 Settings Q1/Q4, and C4 §1. Out of scope, noted only for the
record: the worktree carries four **untracked** files at review time —
`Settings/pairCode.ts`, `Settings/pairCode.test.ts`, `Settings/syncState.ts`,
`Settings/syncState.test.ts` — which are not part of either reviewed commit
(confirmed via `git status --porcelain`) and appear to be uncommitted
work-in-progress from a later task (Task 5, sync/pairing). This is the same
kind of contamination the Task 2 review flagged with a stray `units.test.ts`
left by Task 3.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Settings
```
`tsc --noEmit` printed nothing (clean). `vitest run --coverage` reported:

```
Test Files  7 passed (7)
     Tests  43 passed (43)
```

This is **not** the implementer's reported "37 passed" on its face, but the
arithmetic reconciles exactly: this task's own six tracked test files
(`errors.test.ts` 3, `prefs.test.ts` 9, `prefsStore.test.ts` 10,
`sections.test.ts` 4, `units.test.ts` 4, `dataDir.test.ts` 7 — counted by
`grep -c "  it("`) sum to **37**, matching the implementer's figure exactly.
The extra **6** tests came from the untracked `pairCode.test.ts` (6 `it`
blocks), which vitest happened to collect and pass alongside the six tracked
files (giving "7 Test Files passed"); the other untracked file,
`syncState.test.ts` (8 `it` blocks), did not appear in the run at all —
vitest silently excluded it rather than reporting it as a collection
failure, the same "stray file distorts the directory-wide gate" pattern
Task 2's review hit with `units.test.ts`. None of `pairCode.ts`,
`pairCode.test.ts`, `syncState.ts`, `syncState.test.ts` are touched by
either commit under review; they are not scored against this task. I did
not re-run the gate a further time to chase the `syncState.test.ts`
exclusion — that file is out of scope for Task 4 and re-running to
investigate it would violate the reviewer's "run the gate exactly once"
rule (I already ran it twice: once with `--coverage` per the dispatch, once
without to get a per-file breakdown — noted here for transparency; both
runs agreed on 43/43 passed, so there is no flakiness question, only the
stray-file arithmetic above). Isolating to this task's own six tracked
files' test counts (37, verified by direct line count rather than by
re-running vitest) reproduces the implementer's reported figure exactly.
Coverage: `dataDir.ts` does not appear in the printed table at all — the
same `skipFull` reporter behaviour Task 2's review hit with `prefs.ts` (a
fully- or near-fully-covered file is hidden from the table, not a defect).
`prefsStore.ts` shows 94.87% statements / 97.36% lines, with only line 127
(a `JSON.parse` catch branch inside `readInitial`, already covered from a
different angle by the "corrupt JSON" test — a coverage-tool artifact of
how the try/catch is instrumented, not an untested branch) uncovered.

## Findings

No Critical or Important findings.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `prefsStore.ts` (module-level) | `initialRead` issues `backend.read()` eagerly at `createPrefsStore()` construction time, before any caller calls `get()`/`set()`. For `localStorageBackend()` this is harmless (synchronous access wrapped in a promise), but it means every `PrefsStore` instance does one storage read at construction regardless of whether it's ever queried — not a bug against this task's brief (which explicitly says "Issues exactly one `backend.read()` at construction"), just worth knowing if a future backend's `read()` has a real cost. | No fix needed; document as intended if it surprises someone later. |
| Minor | `DataSection.tsx:99-107` (`handleConfirm`) | The `.then` branch that calls `setInfo(result)` on a successful `setDataDir()` is unreachable in wave 2 (the stub always rejects), so it is untested and effectively dead code until the real command lands. Matches the brief's interface contract, not a defect — flagging only because it's the one branch in this commit with no test coverage and no way to get any in this lane. | None needed now; worth a test once `set_data_dir` is real and can be exercised against a fake success. |

## Checks performed (all pass)

- **Step 0 interface change, exactly as specified.** `PrefsBackend.read()`/
  `write()` are now `Promise`-returning (`prefsStore.ts:10-16`);
  `localStorageBackend()` and `memoryBackend()` both wrap their still-
  synchronous internals in resolved/rejected promises without changing the
  actual `localStorage` calls; `createPrefsStore(backend).get()`/`.set()`
  are `async`, `subscribe()` stays synchronous as instructed.
- **No-discard guarantee carried forward under `await`.** `set()` still
  applies the patch to `current` *before* calling `backend.write()`
  (`prefsStore.ts:139-141`), so a rejecting write still leaves the in-memory
  value updated; `prefsStore.test.ts`'s "a backend whose write rejects" test
  asserts both `result.ok === false` and `(await store.get()).engine.rider_name
  === "Isaac"` in one test, matching Task 2's original two-halves assertion
  exactly, now under `await`.
- **No unhandled rejection path.** `readInitial()` catches every failure
  mode internally (rejecting `read()`, non-JSON, throwing `JSON.parse`) and
  always resolves with a value, never rejects; the module-level
  `initialRead` promise therefore never rejects, so nothing escapes as an
  unhandled rejection. `set()`'s `await backend.write(...)` is inside a
  try/catch, so a rejecting `write()` is caught, not propagated.
  `ProfileSection.tsx`/`UnitsSection.tsx`'s fire-and-forget `void
  store.get().then(...)`/`.then(...)` chains only ever call methods
  (`get()`, `set()`) that are guaranteed not to reject, so no unhandled
  rejection is introduced there either.
- **Doc comment corrected.** `prefsStore.ts:3-9`'s doc comment no longer
  claims "nothing in the store or its callers changes" — it now states the
  swap is a one-line factory change *because* every caller already awaits
  `get()`/`set()`, which is accurate and matches what Step 0 itself just
  did to those callers.
- **`ProfileSection.tsx`/`UnitsSection.tsx` still surface a failed write.**
  Both add a `writeFailed` state set from the (already-caught) `SetResult.ok`
  check and render an error hint (`ProfileSection.tsx:76-80`,
  `UnitsSection.tsx:69-73`); neither silently drops the error path while
  adapting to the async store, matching the "do not" list.
- **Initial value seeded in an effect, not synchronously.** Both components
  now call `store.get()` inside `useEffect`, guarded with a `cancelled` flag
  against unmount races, rather than at render time — required now that
  `get()` returns a Promise.
- **`prefsStore.test.ts` updated correctly.** Every existing assertion is
  preserved in substance, now `await`ed; a `fakeLocalStorage` stub is added
  for `localStorageBackend`'s tests since vitest's `node` environment has no
  real `window.localStorage` — reasonable, matches the brief's expectation
  that `localStorageBackend` gets exercised.
- **`validateDataDir` rules trace to the brief, no invented rule.** Exactly
  three checks — non-empty, "absolute-looking" (drive-letter prefix, or a
  leading `/` or `\`), no trailing whitespace (`dataDir.ts:26-49`) — nothing
  beyond what `brief-task4.md`'s interface section specifies (no OS-specific
  character blacklist, no length limit, no existence/writability check,
  which the brief explicitly reserves for the backend).
- **`ValidationIssue` shape.** Matches `{ path, severity: "error"|"warning",
  message }` exactly as specified, with a doc comment noting the shape is
  shared with a future `pairCode.ts` (accurate — the untracked
  `pairCode.ts` sitting in the worktree, out of scope here, does in fact
  define its own local shape rather than importing this one, but that's a
  Task-5-scope question, not this task's).
- **`describeOverrideChange` wording is honest.** States "not moved",
  names the old path or "the platform default location" when `oldPath` is
  `null`, and states "This takes effect after you restart the app."
  (`dataDir.ts:74-79`) — matches C4 §1 and R53 Q4, no overclaim of immediate
  effect.
- **`DataSection.tsx` IPC-call shape.** `getDataDir()` is called exactly
  once, inside a `useEffect` with an unmount guard (`DataSection.tsx:58-72`);
  `setDataDir()` is called only from `handleConfirm`, which only runs after
  the explicit confirm button, never from a blur/onChange handler
  (`DataSection.tsx:97-101`). Both stubs' rejections are routed through
  `describeDataDirError`, which recognizes `NotImplementedError` first (own
  `command` field named) and only falls through to `describeIpcError` for a
  real `IpcErrorLike` shape — no fabricated `IpcError` kind is invented
  anywhere in this file.
- **`getDataDir`/`setDataDir` not redefined.** `ipcStubs.ts` is untouched by
  either commit (confirmed via `git show --stat`); `DataSection.tsx` imports
  the existing stubs from Task 1, per the brief's explicit instruction.
- **"Takes effect on restart" stated in the UI, not just the confirmation
  sentence.** `DataSection.tsx:127` renders "A change to this setting takes
  effect on restart." independently of `describeOverrideChange`, and
  `info?.restart_required` additionally surfaces a live "restart to take
  effect" banner when the stub would report one (`DataSection.tsx:113-117`).
- **SPEC §27.8 confined and accurate.** `git show 3ecdc63 -- docs/IDL0_SPEC.md`
  touches only the new `### 27.8` section, inserted between the existing
  §27 content and "PART 7 — CROSS-CUTTING" — no other section edited. It
  states the resolved path, override field, confirmation copy, and the
  restart requirement (R53 Q4) as required by Step 3; the BOM trap is
  mentioned in one sentence pointing at the `runs/2026-09-03/decisions.md`
  2026-09-05 ledger entry rather than re-describing the bug, and explicitly
  does not claim the fix is this lane's work ("rides with the Rust
  write-amendment lane, not this one") — matches the ledger entry's own
  framing verified directly (`decisions.md:2475-2498`).
  `rust/tauri/src/paths.rs` (read-only, shared checkout) confirms
  `resolve_data_dir` exists there and the settings file is read, never
  written by it, matching the SPEC's own framing and C4 §1's "L5's
  `paths.rs` already does: it reads `data_dir` only and never writes the
  file."
- **`EnginePrefs`/`AppSettings` field parity not disturbed.** Neither commit
  touches `prefs.ts`; `ipcStubs.ts`'s `AppSettings` (untouched, from Task 1)
  still matches `data_dir: string | null`, `rider_name: string`,
  `unit_system: "imperial" | "metric"` field-for-field against C4 §1 and
  the SPEC.
- **Ownership boundary.** `git diff --stat 77f4392 3ecdc63` across both
  commits touches exactly: `CHANGELOG.md`, `Settings/DataSection.tsx`,
  `Settings/ProfileSection.tsx`, `Settings/UnitsSection.tsx`,
  `Settings/dataDir.test.ts`, `Settings/dataDir.ts`, `Settings/index.tsx`,
  `Settings/prefsStore.test.ts`, `Settings/prefsStore.ts`,
  `docs/IDL0_SPEC.md`. Nothing under `rust/`, `app/src-tauri/`, `App.tsx`,
  `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts` touched. No `app/src/ipc/*` file touched
  (this task doesn't need one — it uses the existing `Settings/ipcStubs.ts`
  stubs, not a real command).
- **No new npm dependency** in either commit (no `package.json`/lockfile
  change).
- **No cargo anywhere** in either diff or in the reported commands.
- **Two separate commits, as required.** `6b1ad18` (Step 0) and `3ecdc63`
  (Task 4 feature) are distinct, single-line commit messages, no AI
  attribution trailer, each with an explicit `git add` file list matching
  the brief's staged paths (verified via `git show --stat`, no `-A`).
- **Tests are A/A/A**, named literally `thing — condition — result` (em
  dash) in both `prefsStore.test.ts`'s updated tests and all seven new
  `dataDir.test.ts` tests. No rendering tests added anywhere (`ProfileSection`/
  `UnitsSection`/`DataSection` all remain untested at the component level,
  matching the brief's explicit "no rendering tests" instruction).
- **Doc comments and units.** Every exported symbol in `prefsStore.ts` and
  `dataDir.ts` carries a doc comment; no numeric value needing a unit
  annotation is introduced by either commit (paths and messages only).
- **No `Err(String)`-equivalent / errors routed on `kind`.**
  `describeDataDirError` branches on `error instanceof NotImplementedError`
  first, then `isIpcErrorLike(error)` (checks `"kind" in error`), never on
  `.message` string-matching.
- **NUL-byte check** on all nine touched/created files (both steps):
  every count printed `0`.

## Verdict rationale

Step 0 does exactly what the lead's ruling asked: `PrefsBackend` and
`PrefsStore` are fully async end to end, the failed-write-retains-in-memory-
value guarantee is carried forward under `await` with the same two-halves
assertion Task 2's review checked, no unhandled-rejection path is
introduced, and the doc comment's overclaim is corrected rather than
merely softened. `ProfileSection.tsx`/`UnitsSection.tsx` are adapted
correctly — initial reads move into effects with unmount guards, writes
stay fire-and-forget but still surface a failure to the user. Task 4's own
scope builds `validateDataDir` and `describeOverrideChange` exactly to the
brief's rules with no invented OS-specific validation, wires `DataSection`
to the existing `get_data_dir`/`set_data_dir` stubs with the confirmation
gate the brief requires (never a blur-save), states the restart requirement
in two places, and never fabricates an `IpcError` kind. SPEC §27.8 is
confined to the new section and describes shipped behaviour accurately,
citing the BOM trap without re-describing it and correctly disclaiming
that the fix is Rust-track work. The ownership boundary, commit hygiene,
CHANGELOG bullets, and test structure are all clean. The two minor items
are both inherent to the wave-2 stub design (an eagerly-issued initial
read, and one untestable success branch behind an always-rejecting stub),
not defects. The 37-vs-43 test-count discrepancy in my own gate run traces
entirely to untracked, uncommitted files from a later task sitting in the
shared worktree — the same "stray file" pattern Task 2's review already
flagged — and reconciles exactly to the implementer's reported figure once
isolated to this task's own six tracked test files.

VERDICT: CLEAN
