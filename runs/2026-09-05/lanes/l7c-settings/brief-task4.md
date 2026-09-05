# L7c Task 4 — implementer brief (PrefsBackend goes async, then the data-directory section)

You are the implementer for L7c Task 4. **Before this task's own scope**,
Step 0 below makes `PrefsBackend` async — a lead ruling from the Task 2
review, not part of the original plan text. Only after that lands do you
build the `<data>` directory override section, against the
`get_data_dir`/`set_data_dir` stubs (IPC need 7a/7b) and adding a new
section to `docs/IDL0_SPEC.md` §27 (spec-during, no idl0 counterpart). TDD
throughout, **two commits** (Step 0's refactor, then the feature — see
below), then report.

## Step 0 (do this first): make `PrefsBackend` async — lead ruling 2026-09-05 (L7c review-task2 note 1)

`runs/2026-09-05/lanes/l7c-settings/review-task2.md`'s note 2 flagged that
`Settings/prefsStore.ts`'s doc comment claims the future
`get_settings`/`set_settings` swap means "nothing in the store or its
callers changes" — but a real Tauri command is `invoke`-based and async,
and the current `PrefsBackend.read(): string | null` /
`write(text: string): void` is synchronous. The lead's ruling: fix this now,
before it's a bigger rewrite later.

**What changes, all in `Settings/prefsStore.ts` and its test file, plus the
two Task 3 components that read the store synchronously:**
- `PrefsBackend`'s `read()` and `write(text)` become `Promise`-returning:
  `read(): Promise<string | null>`, `write(text: string): Promise<void>`.
- `localStorageBackend()` keeps its actual `localStorage` calls
  synchronous internally (there's no async `localStorage` API to call) but
  wraps each return value / thrown error in a resolved/rejected `Promise`
  so it satisfies the new interface. `memoryBackend(seed?)` likewise wraps
  its synchronous reads/writes in resolved promises.
- `createPrefsStore(backend).get()` and `.set(patch)` become `async`,
  returning `Promise<Prefs>` and `Promise<SetResult>` respectively. Keep
  every existing behavioural guarantee: a failed `write()` still reports
  `{ ok: false, error }` **and** the in-memory value still updates first,
  so the user's typing is never discarded (this is the exact thing
  Task 2's review proved with an assertion on both halves — do not lose
  that coverage). `subscribe(listener)` stays synchronous — it's a plain
  callback registration, not an IO call.
- Update `Settings/prefsStore.test.ts`'s existing tests to `await` the new
  async calls; the assertions themselves (what `get()`/`set()` return, what
  a listener receives) do not change in substance.
- Update `Settings/prefsStore.ts`'s doc comment: replace the "nothing in
  the store or its callers changes" claim with an accurate one — the
  *shape* of the swap becomes a one-line factory change (a new
  `tauriSettingsBackend()` alongside `localStorageBackend()`), which is
  true now that both sides are async; callers already await `get()`/`set()`
  so they don't change a second time when the backend does.
- **Adapt `Settings/ProfileSection.tsx` and `Settings/UnitsSection.tsx`**
  (Task 3, already committed) to the now-async store: `store.get()` calls
  used to seed initial state need to run in an effect (or however the
  existing component structure best accommodates an async read — read both
  files first, they currently call `store.get()` synchronously at least
  once each) and `store.set(...)` calls in event handlers can stay
  fire-and-forget (`void store.set(...)`) as long as a failed write's
  `{ ok: false }` result is still surfaced to the user the same way it is
  today — do not silently drop that error path while making this change.
  Read their existing tests (if any exist beside them) and update what the
  now-async store requires.

- [ ] **Step 0a: Update `prefsStore.ts` and `prefsStore.test.ts`**

  Change the interface and both backends as above; update every existing
  test to `await`; add (if not already covered) one test confirming a
  `set()` still reports `{ ok: false, error }` on a rejecting `write()`
  while `get()` afterward still shows the in-memory value — the exact
  guarantee Task 2's review checked, now under the async signature.

- [ ] **Step 0b: Adapt `ProfileSection.tsx` and `UnitsSection.tsx`**

  Make both components correct against the async `PrefsStore`. If either
  file has no test today, you do not need to add component-rendering tests
  (CLAUDE.md §4: no rendering tests) — the pure logic they call
  (`prefsStore.ts`) is already covered by Step 0a.

- [ ] **Step 0c: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Settings
  ```
  `tsc` must be silent (this catches every caller of the now-async
  `get()`/`set()` that wasn't updated); `vitest` must show the full
  Settings suite passing, not just `prefsStore.test.ts`.

- [ ] **Step 0d: NUL-byte check**

  ```
  grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]' app/src/routes/pages/Settings/prefsStore.ts app/src/routes/pages/Settings/prefsStore.test.ts app/src/routes/pages/Settings/ProfileSection.tsx app/src/routes/pages/Settings/UnitsSection.tsx
  ```
  Every count must print `0`.

- [ ] **Step 0e: CHANGELOG + commit (separate from Task 4's own commit)**

  CHANGELOG bullet citing this as "lead ruling 2026-09-05 (L7c
  review-task2 note 1)" — a async-ification of `PrefsBackend`/`PrefsStore`
  ahead of the real `get_settings`/`set_settings` swap, not a Task 4
  feature.

  ```bash
  git add app/src/routes/pages/Settings/prefsStore.ts app/src/routes/pages/Settings/prefsStore.test.ts app/src/routes/pages/Settings/ProfileSection.tsx app/src/routes/pages/Settings/UnitsSection.tsx CHANGELOG.md
  git commit -m "app: Settings PrefsBackend/PrefsStore go async (lead ruling, review-task2 note 1)"
  ```
  Single line, no AI attribution trailer. This is a real commit on its own
  — do not fold it into Task 4's feature commit; a reviewer checking this
  ruling landed correctly should be able to look at one commit for it.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7c-settings`,
  branch `wave2-l7c-settings`. **HEAD must be Task 3's commit** ("app:
  Settings tab Profile and Units sections", `fc5c35c`). Verify with `git log
  -1` and `git status`; if not there, STOP and report.
- Work ONLY there. Editing `docs/IDL0_SPEC.md` §27 in this worktree is this
  lane's spec-during obligation. Never touch `rust/`, `app/src-tauri/`,
  `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`.
- **No cargo, ever.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7c-settings/BRIEF.md`
  (R53 Q4's exact ruling); `runs/2026-09-05/lanes/l7c-settings/review-task2.md`
  **in full** — its "Notes for the lead" note 2 is the exact finding Step 0
  below fixes, cite it that way in your commit rather than re-explaining
  the reasoning from scratch; `Settings/prefsStore.ts` and
  `Settings/prefsStore.test.ts` as they exist today (synchronous — this is
  what Step 0 changes); `Settings/ProfileSection.tsx` and
  `Settings/UnitsSection.tsx` (Task 3, already committed — read both before
  Step 0b, they currently call `store.get()`/`store.set()` synchronously);
  `runs/2026-09-05/lanes/l7/IPC-NEEDS.md` need 7 (`get_data_dir`/
  `set_data_dir`, `DataDirInfo`'s three fields — copy field names verbatim:
  `resolved_path`, `override_path`, `restart_required`);
  `docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md` §1 (the
  override's actual semantics: changing it does **not** move existing
  files, the old tree is left in place, and `<data>` is resolved once at
  startup and cached for the process lifetime — so a change needs a
  restart); `Settings/ipcStubs.ts` (already has `getDataDir`/`setDataDir`
  and `DataDirInfo` from Task 1 — read the actual file, this task calls
  those, does not redefine them). This task's `DataSection.tsx` follows
  `ProfileSection.tsx`'s `{ store: PrefsStore }` prop pattern for
  consistency, even though it reads from the `getDataDir` stub rather than
  `PrefsStore` for its main content.

## The task's own scope (plan Task 4, Steps 1–4, unchanged) — after Step 0 lands

**Files:**
- Create: `Settings/dataDir.ts`, `Settings/dataDir.test.ts`,
  `Settings/DataSection.tsx`
- Modify: `Settings/index.tsx`, `docs/IDL0_SPEC.md` §27

(`Settings/ipcStubs.ts` is **not** modified — `getDataDir`/`setDataDir`
already exist there from Task 1.)

**Interfaces:**
- `dataDir.ts`: `validateDataDir(path: string): ValidationIssue[]` — reuse
  or match the `{ path: string; severity: "error"|"warning"; message:
  string }` shape other lanes use for validation issues (check
  `Settings/pairCode.ts` if Task 5 has landed first — it hasn't in this
  lane's task order, so define the shape here if it doesn't already exist
  in `Settings/`); rules: non-empty, "absolute-looking" (a drive letter
  `X:` prefix or a leading `/` or `\`), no trailing whitespace. Plus
  `describeOverrideChange(oldPath: string | null, newPath: string):
  string` — the exact sentence C4 §1 requires: the app opens or creates a
  tree at the new path, existing files are **not moved**, and the old tree
  (or, if `oldPath` is null, the platform default) is left in place at its
  path.

- [ ] **Step 1: Write the failing tests**

  - `validateDataDir — an empty string — one issue: a path is required`
  - `validateDataDir — a relative path — one issue naming the requirement that it be absolute`
  - `validateDataDir — a Windows path with a drive letter — no issues`
  - `validateDataDir — a POSIX path starting with "/" — no issues`
  - `validateDataDir — a path with trailing whitespace — one issue: it would create a differently-named directory`
  - `describeOverrideChange — an old and a new path — the sentence names both and says the old data stays put (C4 §1)`
  - `describeOverrideChange — no previous override (null) — the sentence names the platform default as what is being left behind`

- [ ] **Step 2: Implement**

  The section shows the resolved `<data>` path by calling the
  `getDataDir()` stub (which rejects — render "unavailable" via
  `Settings/errors.ts`'s `describeIpcError`, extended if needed for the
  `not_found`/`io`/`internal` kinds this stub's real counterpart would
  raise), the override field, and — before any change is committed —
  `describeOverrideChange`'s sentence in an explicit confirmation step.
  Changing where a user's whole data store lives is not a field that saves
  on blur. The "Save" action calls `setDataDir(path)` (also a stub) and
  shows the same "not wired up yet" honesty other stubbed sections use.

- [ ] **Step 3: Add the data-directory section to `docs/IDL0_SPEC.md` §27**

  New section, no idl0 counterpart to replace. State: the resolved path,
  the override field, the confirmation copy, and — per R53 Q4 — that a
  change **takes effect on restart** because `<data>` is resolved once at
  startup and cached for the process lifetime. Do not claim the BOM-strip
  fix (`rust/tauri/src/paths.rs`) is this lane's work — it rides with the
  Rust write lane; mention it only as a known trap, one sentence, pointing
  at the ledger entry rather than re-describing the bug.

- [ ] **Step 4: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Settings
  ```
  Expected: 7 new tests passed, 0 failed.

- [ ] **Step 5: NUL-byte check**

  ```
  grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]' app/src/routes/pages/Settings/dataDir.ts app/src/routes/pages/Settings/dataDir.test.ts app/src/routes/pages/Settings/DataSection.tsx app/src/routes/pages/Settings/index.tsx docs/IDL0_SPEC.md
  ```
  Every count must print `0`.

- [ ] **Step 6: CHANGELOG + commit**

  ```bash
  git add app/src/routes/pages/Settings/dataDir.ts app/src/routes/pages/Settings/dataDir.test.ts app/src/routes/pages/Settings/DataSection.tsx app/src/routes/pages/Settings/index.tsx docs/IDL0_SPEC.md CHANGELOG.md
  git commit -m "app: Settings tab data-directory section over get_data_dir/set_data_dir stubs"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not fold Step 0's refactor commit and Task 4's feature commit into
  one — they are reviewed separately.
- Do not lose the "failed write still updates the in-memory value" guarantee
  while making `PrefsStore` async — carry Task 2's exact test intent
  forward under `await`.
- Do not leave `ProfileSection.tsx`/`UnitsSection.tsx` silently swallowing a
  failed `set()` while adapting them to the async store.
- Do not let a change commit without the confirmation step and its
  `describeOverrideChange` sentence.
- Do not claim a change takes effect immediately — it needs a restart.
- Do not attempt to work around the `settings.json` BOM bug yourself — it's
  Rust-track work.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Spec discipline (say it out loud in your report)

Step 0 (the async refactor) needs no spec change — it's an internal
interface shape, not user-visible behaviour. Task 4's own scope is
**spec-during** — `docs/IDL0_SPEC.md` §27 gains the new data-directory
section per Step 3.

## Report back (concise)

**Two commit hashes** — Step 0's refactor and Task 4's own feature commit —
each with `git show --stat`; the exact test command and result line for
each gate (Step 0c and Step 4); per-step done/deviated for both parts;
confirmation `PrefsBackend`/`PrefsStore` are now fully async and
`prefsStore.ts`'s doc comment no longer claims a callerless swap;
confirmation `ProfileSection.tsx`/`UnitsSection.tsx` still surface a failed
write to the user after the change; confirmation the section states "takes
effect on restart"; confirmation the confirmation step (not a blur-save)
gates any data-dir change; confirmation the NUL-byte check printed `0` for
every file in both steps; anything ambiguous you resolved (say how) or that
needs a lead ruling.
