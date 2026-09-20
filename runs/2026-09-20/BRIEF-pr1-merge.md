# Brief: merge idl-rs PR #1 and idl1-app PR #1 (first real workbook P0)

Lean owner (Sonnet), Rust gates + small text fixes. You work in the MAIN checkout
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` (exception to the usual rule, granted: this
is a merge job and no other Rust lane is running). Read CLAUDE.md (§7, §8),
`runs/2026-09-20/REVIEW-pr1.md` (findings 3, 5, 6, 8, 9 and "Merge order"), digest entries
R240–R243 (tail of `runs/2026-09-06/RULINGS-DIGEST.md`).

Rules: check `FreeVirtualMemory` before each cargo command: >= 4 GB for core/cli, >= 6 GB for
anything building `idl-rs-tauri` or the app crate. Under the gate: wait 5 minutes once, then
skip that gate and say so; never retry in a loop. One cargo process at a time. Gate on the
cargo exit code, never through grep. Never `cargo fmt`. No AI attribution in commits. Never
push. Do not touch `.claude/worktrees/` (another agent's live worktree on the PR branch) or
the two untracked `2026-09-15-*-DRAFT.md` specs. The disk has about 7 GB free: if a build
fails for space, stop and report.

## Do
1. idl-rs (`rust/`): `git fetch origin`; on `main`, `git merge --no-ff
   origin/lane/first-workbook-p0` with message "merge first-workbook-p0: corrected IMU slot
   times, where() shape check, idl0 import routing (PR #1)". Say what any conflict was.
2. One commit on rust main for finding 3: the `where()` rate error message keeps its advice
   but must not present `resample()` as available while `core/src/math/eval.rs` still returns
   NotImplemented for it; say it arrives under ruling R242. Do not implement `resample()`.
3. Rust gates on main: `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`;
   `cargo check -p idl-rs-cli --tests`; `cargo test -p idl-rs-tauri --lib -- --test-threads=4`;
   `cargo test -p idl-transport -- --test-threads=4`; then from `app/src-tauri`
   `cargo check -p app`. A failing test that merely follows the PR's intended behaviour may be
   fixed (say which); anything else: stop and report.
4. App repo: the untracked `docs/superpowers/specs/2026-09-19-idl1-first-real-workbook-gaps-
   DRAFT.md` in main is byte-identical to the PR's copy (the lead checked) and blocks the
   merge: delete that untracked copy, then `git fetch origin` and on `main`
   `git merge --no-ff origin/lane/first-workbook-p0` with message "merge first-workbook-p0:
   first real workbook gaps spec, CHANGELOG, TASKS, regenerated CLI reference (PR #1)". The
   `rust` submodule must end at rust main's new head from steps 1-2, not the PR's commit.
5. One app-repo commit of text fixes: finding 5 (one CHANGELOG sentence under the P0-1 entry:
   cross-IMU element-wise expressions now need `resample()`, ruling R242); finding 8 (the draft
   spec's "Nothing here is implemented" corrected to name what PR #1 implemented); finding 9
   (retag the two wrongly tagged entries `[no-docs]`).
6. Regenerate the generated artefacts exactly as `docs/CI.md` and `.github/workflows/ci.yml`
   invoke them (`docs workbook`, `docs cli` Markdown and `--json`, `docs wire`), and commit any
   diff together with the submodule bump.
7. App gates from `app/`: `npx tsc --noEmit`, `npx vitest run`.
8. Do NOT run `library rebuild` and do not touch `C:\Users\isaac\Documents\idl1-library` (R243).

Report 12 lines or fewer: both merge commit hashes, each gate's result with passed counts,
anything skipped for memory, conflicts, and whether main is ready to push.
