# Review: L5 Task 7 — SPEC §11 rewrite + Group A checkpoint

Worktree reviewed: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l5-tauri`
(branch `wave1-l5-tauri`, HEAD `95d2369`, on top of `817f774`).
Rust submodule worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l5-tauri`
(branch `wave1-l5-tauri`, HEAD `65f4fa1`).

## Test commands and results

- `cd idl-rs-worktrees\wave1-l5-tauri && cargo test -p idl-rs-tauri` →
  **11 passed; 0 failed** (error::tests x3, commands::tests x2, paths::tests x3,
  watcher::tests x3). Doc-tests: 0 run, 1 ignored.
- `cd idl1-app-worktrees\wave1-l5-tauri\app && npm test -- --run` →
  **10 test files, 23 tests, all passed**.
- `cd idl1-app-worktrees\wave1-l5-tauri\app && npx tsc --noEmit` → clean, exit 0.

All three match the plan's Step 3 "Group A checkpoint" expectation (both repos
green).

## Findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| — | — | No findings. | — |

## Verification detail

1. **Spec compliance.** `git show 95d2369 -- docs/IDL0_SPEC.md` shows §11
   replaced verbatim per the plan's Step 1 markdown block (11.1 Layers, 11.2
   IPC, 11.3 Platform targets, 11.4 State management, 11.5 File model and
   local database, 11.6 File watcher), stopping exactly before the pre-
   existing `## 12. State Management` heading (that section, still idl0-era
   Riverpod content, is explicitly out of this task's scope per the plan's
   "through (not including) `## 12. State Management`" instruction — left
   untouched, correctly). §11.1 cross-references `CLAUDE.md` §2 by name and
   gives only a one-line summary rather than reproducing the layer table —
   matches the plan brief's "summarizing/cross-referencing… rather than
   duplicating it" instruction.

2. **First-draft framing.** The new §11 opens with a "> **Status note
   (2026-09-03):**" blockquote stating this is L5's first draft and that
   L10's plan does the cross-lane consistency pass once L1–L4/L6/L7 land —
   present in the SPEC text itself, not just the plan, satisfying the task's
   own stated requirement.

3. **Stale idl0-architecture references, scoped to §11.** `grep -n
   "flutter_rust_bridge\|Riverpod\|sqflite" docs/IDL0_SPEC.md` in the
   worktree returns matches at lines 65, 890–891, 914, 941, 1167, 1641, 1649,
   1661, 2376. Of these, 890–891 and 914 are inside the new §11 and are
   explicitly contrastive ("This replaces idl0's Dart/Rust split
   (`flutter_rust_bridge`, Riverpod providers, `sqflite`) in full"; "Riverpod,
   Provider and Bloc are idl0-only and do not apply") — allowed by the task
   brief. Every other match (65, 941, 1167, 1641, 1649, 1661, 2376) sits
   outside §11 (§2 device/app split table, §12 State Management, §17a
   workbook bridge notes) — sections this task does not touch, out of scope
   per the review brief and per the plan's own Step 2 note ("matches
   elsewhere in the document… belong to sections this task does not touch").
   No stray reference inside §11 itself.

4. **CHANGELOG.** `[Unreleased]/### Added` gains exactly the bullet the plan
   specifies verbatim: "**docs/IDL0_SPEC.md §11 rewritten for the
   Tauri/Rust-core/TS architecture (spec-during).** First draft by L5; L10
   does the cross-lane consistency pass."

5. **TASKS.md.** Untouched by commit `95d2369` (no diff for that path in
   `git show 95d2369 -- TASKS.md`); line 25 in the worktree still reads
   `- [ ] L5 Tauri scaffold hardening`, correctly left for Task 15 to tick.

6. **AI attribution / commit hygiene.** `git show -s --format="%B" 95d2369`
   is the single line `docs: rewrite SPEC §11 App Architecture for idl1
   (spec-during, L5 first draft)` — no trailer, matches the plan's Step 5
   commit message exactly.

7. **Commit-location bug, correctly handled.** Task 7's own Step 5 literal
   commit command in the plan (`cd "C:/Users/isaac/Documents/Saucy/saucyeng/
   idl1-app" …`) points at the shared checkout, not the worktree — a bug in
   the plan text (this repo's setup section fixes the worktree at
   `idl1-app-worktrees/wave1-l5-tauri`, and CLAUDE.md §7/the plan's Global
   Constraints require lanes to work only in their own worktree). Verified:
   - `95d2369` exists on branch `wave1-l5-tauri` in
     `idl1-app-worktrees\wave1-l5-tauri`, confirmed via `git branch -vv` in
     that worktree and via `git show 95d2369` there.
   - The shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`
     is on `main` at `8204240` (`git log --oneline -3`), does **not** contain
     `95d2369`, and its `git status` shows no §11/CHANGELOG changes — only an
     unrelated pre-existing modified `app/src-tauri/Cargo.toml` and untracked
     review-note files from other concurrent review tasks, none of which
     belong to Task 7. The implementer's report that they committed in the
     worktree instead of the shared checkout is confirmed correct.

## Verdict

CLEAN — §11 matches the plan's Step 1 content exactly, is properly scoped and
self-flagged as a first draft, no stray idl0-architecture references leak
into the rewritten section, CHANGELOG is updated and TASKS.md correctly left
alone, both repos' test suites and `tsc` are green, the commit message has no
AI attribution trailer, and the implementer's worktree-vs-shared-checkout
correction is verified: the shared `idl1-app` checkout remains clean on
`main`, and the real commit lives only on the `wave1-l5-tauri` worktree
branch.

This closes out L5's Group A: Tasks 1–7 are all present as commits in the two
`wave1-l5-tauri` worktrees (rust: `9252553`→`23167fc`→`faea0f9`→`65f4fa1`;
app: `c125576`→`c53924b`→`817f774`→`95d2369`, plus the paths/state commit
`8757929`), and Task 7's own Step 3 checkpoint (both repos green) passes
under direct re-run here as well.
