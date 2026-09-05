# L8w Task 14 — implementer brief (Wrap-up: CHANGELOG, TASKS.md, C3 §6 spot-check, full-suite lane gate)

You are the implementer for L8w Task 14, the lane's wrap-up: CHANGELOG and
TASKS.md entries covering all 17-18 commands (17 from the original plan
plus the lead-added `list_math_builtins`, Task 12b), a spot-check of C3
§6's deferred-items list against what actually shipped, and the **one**
full-suite run that is this lane's merge gate. This task runs **after every
other L8w task has landed** on the branch. ONE commit, then report.

## GATE — same as every L8w task; verify before opening the worktree

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. If either fails, STOP and report.

**Additionally, before starting this task**: confirm Tasks 1–13 (including
the lead-added Task 12b, `list_math_builtins`) are all committed on
`wave2-l8w-write-amendment` in both worktrees. If any task's commit is
missing, STOP and report to the lead rather than writing wrap-up notes
against an incomplete lane.

## Where

- Worktree (rust): `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
  branch `wave2-l8w-write-amendment`.
- Worktree (app): `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l8w-write-amendment`
  — `CHANGELOG.md`/`TASKS.md` live in the shared checkout's top level, not
  under `rust/`; confirm which worktree actually holds these files (they
  are almost certainly app-repo files, not rust-repo files — verify with
  `git -C "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l8w-write-amendment" log --oneline -1 -- CHANGELOG.md`
  before assuming, since the earlier L8w tasks in this lane never touched
  these files themselves).
- Do NOT push either worktree.
- **Files:** `CHANGELOG.md`, `TASKS.md` (app worktree); spot-check (read
  only, fix only if genuinely wrong — see below)
  `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` §6's "Wave-2
  amendment (R59)" list, plus your own §3.6/§3.4 edits from Tasks 12/12b if
  this task finds anything to reconcile there.

- Read first: `CLAUDE.md`; plan Task 14 in full
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`);
  `runs/2026-09-05/lanes/l8w/BRIEF.md`'s "Done when" section; every prior
  task's commit message on the branch (`git log --oneline
  wave2-l8w-write-amendment` in both worktrees) — this is your source list
  for the CHANGELOG bullet, not a re-derivation from memory; the tail of
  `CHANGELOG.md` and `TASKS.md` as they exist today (already read once
  while writing this brief — re-read at task time since other lanes may
  have landed entries since) to match their existing formatting exactly.

## COMPUTE RULES — non-negotiable

This task **is** the lane's full-suite gate — the one place in the lane
`cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` runs, in the
foreground, once. Never `cargo test --workspace`, never a bare `cargo
test`. `cargo check -p idl-rs-cli --tests` and `cargo check -p idl-rs-tauri`
once more, clean, as the final confirmation before merge. No `cargo fmt`,
no `cargo tarpaulin`, no `cargo doc`. One cargo process on the machine at a
time — do not run the full suite and a `cargo check` concurrently.

## The task, in order

- [ ] **Step 1: Confirm the gate** and that Tasks 1–13 (+12b) are all
      present on the branch in both worktrees.
- [ ] **Step 2: Run the full suite once**, rust worktree:
      ```
      cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4
      ```
      Capture the exact `test result: ok. N passed; M failed; K ignored`
      line(s) — there will be one per crate/binary target. Report every one
      verbatim, not a summary. If anything fails, **stop and report** —
      this is a merge-blocking condition, not something to work around by
      re-running or by touching test code (that's a separate dispatched
      fix task per the standing reviewer brief's rules).
- [ ] **Step 3: `cargo check -p idl-rs-cli --tests`** clean.
- [ ] **Step 4: `cargo check -p idl-rs-tauri`** clean.
- [ ] **Step 5: Spot-check C3 §6's "Wave-2 amendment (R59)" deferred list**
      (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`) against
      what actually shipped in this lane: `list_quarantine`/
      `resolve_quarantine`, `save_track`/`delete_track`,
      `rescan_track_visits`, `fetch_histogram`, `fetch_scatter_points`
      should all still be listed as deferred (none of Tasks 1–13/12b
      implement any of them) — this is a **grep-confirm, not a rewrite**
      (the plan's own "grep for it everywhere before calling it fixed"
      lesson). If you find one of these was accidentally implemented by an
      earlier task (it shouldn't have been — flag this loudly, don't
      silently update the deferred list to match a scope overrun) or find
      the list already correct, say which in your report either way.
- [ ] **Step 6: Write the CHANGELOG.md bullet**, matching the file's
      existing entry style/voice exactly, summarising:
      - The full command list, distinguishing thin wrappers (Tasks 2–7,
        10, App/Catalog/Workbook/Device groups) from genuinely new core
        code (Task 8's registry-preview derivation, Task 11's `IDLH`
        encoder, Task 12's `IDLF` encoder + `Averaging` extension, Task
        12b's builtin catalog).
      - The `eval_workbook` `lap_context` amendment (Task 9) and its
        honest-natural-rejection behaviour pending lap indexing.
      - The three new `IpcErrorKind` variants: `DeviceRejected` (Task 7),
        `ConfigParse`/`ConfigUnsupportedVersion` (Task 8).
      - Task 8's registry-preview scope limit (SPEC-fixed IDs only, no
        generic-channel-id guess).
      - Task 7's `device_control`/`pull_config` platform limitation
        (`device_rejected` defined but practically unreachable on
        `btleplug`'s Windows backend, per R63 (1)).
      - The `Averaging::{None, Max}` extension and its C3 §3.6 spec-during
        amendment (Task 12).
      - `list_math_builtins` and its provisional `unit_rule` field (Task
        12b) — state plainly that `unit_rule`'s vocabulary is a
        placeholder pending a lead ruling, per Task 12b's own report.
      - The dialog-plugin wiring (Task 13) and its resolved version.
      - The Task 9 open item (this lane's own note): `MathOverlay` cannot
        be constructed from `eval_workbook`'s `lap_context.overlay_laps`
        as C3 currently shapes it — a wave-3-or-later contract question,
        not resolved by this lane.
- [ ] **Step 7: Update `TASKS.md`** — tick the wave-2 write-lane line; list
      the same parity-gap-style notes the CHANGELOG carries (scope limits
      are not silent), matching the existing bullet style used for L7a/L7b/
      L7c's own wrap-up entries (read those first, copy their voice).
- [ ] **Step 8: Commit** — `git add CHANGELOG.md TASKS.md` — message
      `docs: L8w wrap-up — 18 commands landed, lane gate green (CHANGELOG + TASKS.md)`.

## Do not

- Do not fix a test failure yourself if the full suite fails — report it;
  a fix is a separate dispatched task per the standing reviewer brief.
- Do not rewrite C3 §6's deferred list to retroactively match a scope
  overrun — flag it instead if you find one.
- Do not run `cargo test --workspace` or a bare `cargo test`.
- Do not touch any command's implementation in this task — wrap-up only.
- Do not amend a previously reported commit.

## Style / hygiene

Match `CHANGELOG.md`/`TASKS.md`'s existing entry voice and formatting
exactly — read several recent entries (L7a/L7b/L7c's own wrap-up bullets
are the closest precedent) before writing yours.

## Spec discipline (say it out loud in your report)

"No spec change needed" for this task's own scope (CHANGELOG/TASKS.md are
not SPEC documents) — any C3 changes this lane made were Tasks 12/12b's own
spec-during edits, already committed before this task runs.

## Report back (concise)

Commit hash + `git show --stat`; the full suite's exact `test result:` line(s)
with `passed`/`failed`/`ignored` counts (paste verbatim); both final `cargo
check` results; confirmation of which worktree holds `CHANGELOG.md`/
`TASKS.md`; the C3 §6 spot-check result (list unchanged / found and flagged
an overrun); confirmation every one of Tasks 1–13 + 12b is represented in
the CHANGELOG bullet; anything ambiguous you resolved (say how) or that
needs a lead ruling (stop and report instead of guessing — CLAUDE.md §1).
