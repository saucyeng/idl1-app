# L7c Task 4 — implementer brief (the data-directory section)

You are the implementer for L7c Task 4 — the `<data>` directory override
section, built against the `get_data_dir`/`set_data_dir` stubs (IPC need
7a/7b). This task adds a new section to `docs/IDL0_SPEC.md` §27
(spec-during, no idl0 counterpart). TDD, ONE commit, then report.

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
  (R53 Q4's exact ruling); `runs/2026-09-05/lanes/l7/IPC-NEEDS.md` need 7
  (`get_data_dir`/`set_data_dir`, `DataDirInfo`'s three fields — copy field
  names verbatim: `resolved_path`, `override_path`, `restart_required`);
  `docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md` §1 (the
  override's actual semantics: changing it does **not** move existing
  files, the old tree is left in place, and `<data>` is resolved once at
  startup and cached for the process lifetime — so a change needs a
  restart); `Settings/ipcStubs.ts` (already has `getDataDir`/`setDataDir`
  and `DataDirInfo` from Task 1 — read the actual file, this task calls
  those, does not redefine them); `Settings/ProfileSection.tsx` (the
  `{ store: PrefsStore }` prop pattern this task's `DataSection.tsx`
  follows for consistency, even though this section reads from the
  `getDataDir` stub rather than `PrefsStore` for its main content).

## The task (plan Task 4, Steps 1–4, unchanged)

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

**Spec-during** — `docs/IDL0_SPEC.md` §27 gains the new data-directory
section per Step 3.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line;
per-step done/deviated; confirmation the section states "takes effect on
restart"; confirmation the confirmation step (not a blur-save) gates any
change; confirmation the NUL-byte check printed `0` for every file;
anything ambiguous you resolved (say how) or that needs a lead ruling.
