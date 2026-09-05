# L7c Task 2 review — the prefs model and its localStorage-backed store

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7c-settings`,
branch `wave2-l7c-settings`. Commits reviewed: `9b2bbd6` (feature),
`084975d` (merge main, CHANGELOG conflict), `9a22a4c` (localStorageBackend
coverage tests). In scope: `Settings/prefs.ts`, `Settings/prefs.test.ts`,
`Settings/prefsStore.ts`, `Settings/prefsStore.test.ts`, `CHANGELOG.md`,
`docs/IDL0_SPEC.md` §27.1. Out of scope, noted only for the record: the
worktree's current HEAD (`fc5c35c`) is one commit past `9a22a4c`/`23bf000`
— Task 3 ("Settings tab Profile and Units sections") is already committed
there, with an untracked, non-compiling `units.test.ts` left beside it. That
commit was not reviewed here.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Settings
```
`tsc --noEmit` printed nothing (clean). `vitest run` against the directory
picked up the untracked Task-3-era `units.test.ts` (not part of this task's
commits) and failed to collect it (`Cannot find module './units'` — resolved
fine once I re-ran without that stray file). Isolating to this task's own
four test files (`errors.test.ts`, `prefs.test.ts`, `prefsStore.test.ts`,
`sections.test.ts` — the last two are Task 1's) gives:

```
Test Files  4 passed (4)
     Tests  26 passed (26)
```

This reproduces the implementer's reported 26 passed exactly. `prefs.test.ts`
alone: 9 passed; `prefsStore.test.ts` alone: 19 passed (Step 1's 6 plus
`9a22a4c`'s 4 `localStorageBackend` tests, on top of Task 1's baseline —
arithmetic checks out against the brief's "15 new on top of Task 1's 7").

Coverage: raw `coverage-final.json` shows `prefs.ts` and `prefsStore.ts` both
instrumented; the text reporter's default `skipFull` behaviour hides fully
(or near-fully) covered files from the printed table, which is why `prefs.ts`
doesn't appear in the table at all — not a defect, a reporter quirk. The one
uncovered `prefsStore.ts` line (112) is a JSON-parse-throws branch inside
`readInitial`, exercised at 97% lines as the implementer reported.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical or Important findings. | — |

## Checks performed (all pass)

- **Field parity (Critical checkpoint).** `EnginePrefs` (`prefs.ts:4-11`)
  matches `rust/core/src/store/settings.rs`'s `AppSettings` field for field:
  `data_dir: string | null` ↔ `Option<String>` (absent → `None` → `null`);
  `rider_name: string` default `""` ↔ `String` default `""`; `unit_system:
  "imperial" | "metric"` ↔ `UnitSystem` serialized snake_case with the same
  two values and the same `"imperial"` default. No drift.
- **`UiPrefs` is local-only and not engine-relevant.** `last_section` and
  `section_list_width_px` are pure UI state (CLAUDE.md §2 — no number the
  engine depends on lives here); doc comments say so explicitly.
- **`PrefsBackend` seam.** `read(): string | null` / `write(text: string):
  void` matches the interface literally specified in `brief-task2.md`;
  `localStorageBackend()` and `memoryBackend(seed?)` both implement it;
  `createPrefsStore` depends only on the interface, not on `localStorage`
  directly.
- **Every `localStorage` access wrapped.** `localStorageBackend().read()`
  try/catches `getItem` and returns `null` on throw
  (`prefsStore.ts:24-30`); `write()`'s `setItem` is deliberately left
  unwrapped at the backend layer with a comment explaining `set()` is the
  single catch point (`prefsStore.ts:31-37`) — verified `set()` does catch
  it (`prefsStore.ts:126-132`) and returns `{ ok: false, error }` while still
  updating `current` first, so `get()` reflects the in-memory value. The
  "write throws" test (`prefsStore.test.ts:83-99`) asserts both
  `result.ok === false` and `store.get().engine.rider_name === "Isaac"`,
  proving the no-discard claim rather than just asserting one half of it.
  The "read throws" test (`prefsStore.test.ts:66-81`) and the "corrupt JSON"
  test (`prefsStore.test.ts:101-112`) both assert `get()` falls back to
  `DEFAULT_PREFS` with no throw escaping.
- **No stored value / corrupt value / throwing backend, all three exercised**
  as required by the task brief's own test list.
- **No IPC anywhere in this task's diff** — no import from `app/src/ipc/*`,
  no `invoke` call, no reference to `get_settings`/`set_settings` as a real
  call (only as prose in the spec rewrite describing the future gap).
- **Ownership boundary.** `git show --stat` on all three commits: touched
  paths are exactly `Settings/prefs.ts`, `Settings/prefs.test.ts`,
  `Settings/prefsStore.ts`, `Settings/prefsStore.test.ts`, `CHANGELOG.md`,
  `docs/IDL0_SPEC.md`. The merge commit (`084975d`) additionally brought in
  `app/package.json`, `app/package-lock.json`, `app/vitest.config.ts`, and
  several `runs/**` review-record files — all from `main` via the merge,
  none authored by this lane. Nothing under `rust/`, `app/src-tauri/`,
  `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `vite.config.ts` touched.
- **SPEC edit confined to §27.1.** `docs/IDL0_SPEC.md`'s diff in `9b2bbd6`
  starts at the `### 27.1` heading and ends before `### 27.2` — no other
  section touched. The rewrite states plainly that wave 2 keeps the whole
  document in `localStorage`, does not sync, does not reach `settings.json`
  yet, and names `get_settings`/`set_settings` (IPC need 6, cross-checked
  against `runs/2026-09-05/lanes/l7/IPC-NEEDS.md:164-168`) as the command
  that closes the gap. It does not claim persistence the code doesn't do.
- **CHANGELOG merge conflict resolution.** `084975d` touched only
  `CHANGELOG.md` for its conflict (confirmed via `--stat`); both bullets
  (Task 1 and Task 2) were kept. Ordering note: as committed in `084975d`
  the lane's two bullets landed *above* main's "TS coverage reporting"
  bullet, the reverse of the R19 "main's first" rule — but this was
  self-corrected in the very next commit, `23bf000` ("chore: reorder
  CHANGELOG merge bullets, main's first per standing rule"), which is
  outside this review's three-commit scope but visible on the branch. Net
  state after `23bf000` is compliant; not scoring this against Task 2 since
  it was corrected before landing anywhere further.
- **No new npm dependency** in any of the three commits.
- **Tests are A/A/A** with blank lines between arrange/act/assert (or a
  single-line arrange/act/assert where the brief's own examples do the
  same) and named literally `thing — condition — result` (em dash) in both
  `prefs.test.ts` and `prefsStore.test.ts`, including the four
  `localStorageBackend` tests added in `9a22a4c`.
- **No rendering tests.** Both test files exercise pure functions/objects
  only.
- **Doc comments** present on every exported interface, field, and function
  in both `prefs.ts` and `prefsStore.ts`; units named (`_px`).
- **Repo hygiene.** Both feature commits (`9b2bbd6`, `9a22a4c`) are
  single-line messages, no AI attribution trailer; `git show --stat`
  confirms explicit paths were staged (matches the brief's `git add` list),
  not `-A`.
- **No `cargo` invocation** anywhere in the diff or in the reported test
  commands.

## Notes for the lead (not scored against this task)

1. **Errors.ts coverage (Task 1) — reachable, not dead.** `errors.ts` sits at
   57% line coverage; the uncovered lines are the `not_found`, `io`, and
   `internal` cases of `describeIpcError`'s switch (`errors.ts:30-35`) —
   real, reachable branches a future C3 error can hit, not dead code. They
   should get a test (one assertion per case is enough) in Task 3 or
   whichever task next touches `errors.ts`; not a blocker for Task 2, which
   didn't touch this file.
2. **`PrefsBackend`'s synchronous shape vs. the eventual async command.** The
   interface (`read(): string | null; write(text: string): void`) is
   synchronous, as literally specified in `brief-task2.md`'s interface
   block — the implementer matched the brief exactly, this is not a
   deviation. But `prefsStore.ts`'s own doc comment claims the future
   `get_settings`/`set_settings` swap means "nothing in the store or its
   callers changes" (`prefsStore.ts:3-6`). A real Tauri command is
   `invoke`-based and async; a synchronous `PrefsBackend.read()/write()`
   cannot wrap it without either blocking or restructuring `get()`/`set()`
   to return promises, which *would* change every caller. Worth a ruling
   before Task 6 or the C3 write-amendment lane locks in the backend swap
   plan, so the "one-time import, one-line swap" story in the SPEC rewrite
   doesn't turn into a bigger rewrite later.
3. **Worktree already past this task.** HEAD is `fc5c35c` ("app: Settings
   tab Profile and Units sections", Task 3), committed with `units.ts` but
   not its `units.test.ts` (left untracked, and it fails to import in its
   current form). This broke the directory-wide vitest gate I ran until I
   isolated this task's own test files. Not a Task 2 finding, but the lead
   may want to know Task 3 already landed a commit with a stray/broken test
   file before this review completed.

## Verdict rationale

Both feature commits do exactly what the brief specifies: `EnginePrefs`
matches the landed `AppSettings` field for field with no drift in names,
types, or "" / null conventions; every `localStorage` access is wrapped and
the three required failure modes (no stored value, corrupt stored value, a
throwing backend) are each tested and correctly proven, including the
no-discard guarantee on a failed write; the ownership boundary and SPEC-edit
scope are both clean; the merge commit's CHANGELOG conflict was resolved
per the R19 pattern (briefly out of order, then self-corrected in the very
next commit, which is fine); no IPC, no cargo, no new dependency, no
scope creep. Tests are properly named and structured. The one open question
(the synchronous `PrefsBackend` vs. an eventually-async command) is a
brief-level design choice the implementer followed faithfully, not a defect
in this task, so it's raised as a note rather than scored.

VERDICT: CLEAN
