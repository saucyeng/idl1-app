# L8x Task 8 — doc sweep + **LANE MERGE GATE**

No new behaviour. Reconcile every claim the lane invalidated, then run the
full suite. ONE commit, then the gate, then report.

**Depends on Task 7.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l8x-data-writes"
git merge-base --is-ancestor 81a7db3 HEAD && echo GATE-OK
grep -c "pub fn save_track\|pub fn delete_track" tauri/src/commands/catalog.rs
grep -c "pub fn verify_data_dir" tauri/src/commands/maintenance.rs
```
All must succeed / return `>= 1`. If any fails, STOP and report.

## Files to read first

`CLAUDE.md`; this lane's `PLAN.md` §6, §8; every commit this lane made
(`git log --oneline 81a7db3..HEAD`); `TASKS.md` and `CHANGELOG.md`;
C3 §6 as Task 1 left it; the operating brief §4's R19 merge pattern.

## Where

- **Files:** `TASKS.md`, `CHANGELOG.md`, and any doc whose claim the greps
  below prove stale. **No source files.**

## The sweep

This is the L5 lesson: when a claim is corrected in one file, grep for it
everywhere before calling it fixed. Run each, and fix or justify every hit:

```bash
grep -rn "track editor is deferred\|deferred to wave 3" docs/ TASKS.md CHANGELOG.md
grep -rn "quarantine" docs/ TASKS.md | grep -iv "sidecar\|repair\|tmp/quarantine/<"
grep -rn "rescan_track_visits" docs/ TASKS.md
grep -rn "open question 10\|typed .unknown." docs/superpowers/specs/
grep -rn "no write commands\|C3 has no write" docs/ runs/2026-09-05/
```

Expected outcomes, each stated in the report:
- The wave-3 track-write and quarantine deferrals in C3 §6 are struck
  (Task 1). Any surviving copy elsewhere is stale.
- `rescan_track_visits` should appear only as a closed historical note —
  `rescan_tracks` (R83) is the shipped command. No lane owes work on it.
- No track field is still described as `unknown`.
- `TASKS.md`'s Rust-backlog line "quarantine commands" is removed.
- The operating brief's §3 gap list entries "track create/edit/delete" and
  "delete/forget session, quarantine review" are marked landed, not deleted
  — the brief is a dated record.

Anything the greps surface that you cannot resolve without a decision is a
STOP-and-report item, not a silent edit.

## CHANGELOG

One lane-level bullet naming the five commands and the two contract
amendments, above the per-task bullets. Keep both if `main` merged in a
conflicting bullet (R19 pattern: main's first, note "CHANGELOG: kept both
bullets" in the merge commit).

## COMPUTE RULES

**LANE MERGE GATE, after the commit**, foreground, once, tee'd:
```
cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4
cargo test -p idl-rs-tauri
```
Report all result lines verbatim. A failure is STOP-and-report — do not
rerun to hunt flakiness (R13).

## Steps

- [ ] 1. Gate. 2. Run all five greps; record every hit. 3. Fix the stale
      claims. 4. `TASKS.md` backlog line removed. 5. `CHANGELOG.md` lane
      bullet. 6. NUL check on every file touched. 7. Commit
      `docs: L8x lane sweep — track writes and quarantine landed`.
- [ ] 8. Run the lane merge gate and report every result line.

## Do not

- Do not touch source, and do not run cargo before the gate.
- Do not delete a dated record (the operating brief, a run ledger) — mark it
  landed instead.
- Do not amend any commit already reported to the lead.
- Do not push. Isaac pushes.

## Spec discipline

**spec-during** for any correction the greps force. If a correction changes
a command's behaviour rather than a stale description, STOP — that is a new
task, not a sweep.

## Report back (≤15 lines)

Commit hash + `git show --stat`; every grep's hit count and what you did
with each; every lane-gate result line verbatim; the full list of commits
in the lane (`git log --oneline 81a7db3..HEAD`); the post-lane TS shell task
list from PLAN §8, restated so the lead can dispatch it; anything still
open.
