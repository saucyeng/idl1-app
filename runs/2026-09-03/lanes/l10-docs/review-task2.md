# Review: L10 Task 1 + Task 2 (2026-09-03-idl1-wave1-l10-docs.md)

**Test command:** N/A — both tasks are docs-only / read-only. No Rust or TS
code changed; `cargo test`/`vitest` are not applicable to this diff. Verified
by direct file inspection and `git diff`/`git show` instead (see below).

## Task 1 — CLAUDE.md §2 vs design doc §4 (read-only, no commit)

Re-ran the two `sed` extracts myself and compared by eye against the finding
recorded in the plan ("confirmed identical, no drift").

- All six CLAUDE.md §2 layer rows (`rust/core`→`idl-rs`, `rust/transport`→
  `idl-transport`, `rust/tauri`→`idl-rs-tauri`, `rust/cli`→`idl-rs-cli`,
  `app/src-tauri`, `app/src`) map 1:1 in substance to design doc §4's target
  architecture tree: purity/I/O constraints, "only crate the frontend sees,"
  "never does DSP," etc. all agree. No CLAUDE.md edit was made (confirmed:
  `git status` on the shared checkout shows no CLAUDE.md diff; no commit
  exists for this task). **Substantive conclusion is correct — no drift.**
- `git status`/`git branch --show-current` on the shared checkout confirms it
  is on `main`, matching the "read-only" working-directory requirement for
  this task.
- Minor imprecision only: design doc §4's block actually has more than "six
  rows" (it also lists `docs/` and the deleted-crate note), and the "Rust =
  numbers, JS = pictures" line the plan's Step 1 says is present in "both
  documents['] ... sections" actually lives in design doc §3 (Principles),
  not inside the §4 block that was diffed — so the two `sed` extracts are not
  literally the matching text the plan's prose implies. This doesn't change
  the correct no-drift verdict (the line does exist in the design doc, just
  one section up), but the plan's own wording overstates how literally the
  two extracts align. Not a blocker.

## Task 2 — idl1-app README fixes (worktree `wave1-l10-docs`, commit `3be8e59`)

- Worktree exists at the correct path, correct branch, based on current
  `main` tip (`fc1dacd`, i.e. after L4's merge — later than the plan's
  drafting-time snapshot, which is expected and fine).
- `git show 3be8e59 --stat`: exactly `CHANGELOG.md`, `app/README.md`,
  `tools/README.md` changed — no TASKS.md touch, no stray files, matching the
  plan's declared file list.
- `tools/README.md`: the `## \`idl0_dump.dart\`` heading and its `dart run`
  code fence are genuinely gone. `grep -n "idl0_dump.dart"` finds exactly 2
  hits, both inside the new "## Log inspection" prose paragraph (one
  referencing the tool by name, one inside the path
  `idl0-app/tools/idl0_dump.dart`) — both are the plan's own replacement text
  legitimately mentioning the filename twice, not a sign the old section
  survived. Confirmed true, as the task asked me to verify. (Note: the plan's
  own Step 5 said "Expected: 1" for this grep — that expectation was simply
  wrong at plan-drafting time, since the plan's own replacement text quoted
  in Step 2 already contains the filename twice; the implementer's actual
  result of 2 is correct and is not a deviation by the implementer.)
- `app/README.md`: fully replaced, no longer the `npm create tauri-app`
  boilerplate (`grep -c "Tauri + React + Typescript"` → 0). New content is
  project-specific: names `idl-rs-tauri`, cites CLAUDE.md §2, points at the
  root `README.md`, and matches that root README's tone/structure (Status
  line, Develop/Test sections).
- `CHANGELOG.md`: new `### Changed` subheading created under `[Unreleased]`
  (didn't exist before) with an accurate, specific entry describing exactly
  what changed in both READMEs. Matches the plan's template text verbatim.
- No AI attribution trailer in the commit message or body (checked via
  `git log -1 --format='%B'` and grep for co-authored/claude/generated/
  anthropic — no hits).
- Commit message matches the plan's specified text exactly:
  `docs: fix stale tool/app README carry-overs from M0`.
- Shared checkout (`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`): on
  `main`, correct branch, but **not clean** — `git status` shows a modified
  `app/src-tauri/Cargo.toml` (empty diff, LF/CRLF line-ending noise only) and
  an untracked file `runs/2026-09-03/lanes/l1-store/review-gps-fix.md`.
  Neither belongs to Task 2's scope (Task 2 never touched the shared
  checkout — it worked entirely inside the separate worktree, and `3be8e59`
  is not merged into `main`). This dirtiness is not attributable to this
  task's implementer; it's residue from other concurrent lane/review activity
  in the shared checkout. Flagged for the lead as a hygiene item, not a
  finding against Task 2 itself.

## Findings table

| Severity | File:Line | Finding | Fix |
|---|---|---|---|
| Minor | `docs/superpowers/plans/2026-09-03-idl1-wave1-l10-docs.md:114-116` | Task 1's prose claims the two `sed`-extracted blocks contain "the same 'Rust = numbers, JS = pictures' line," but that line is actually in design doc §3, one section above the §4 block being diffed; design doc §4 also has more entries than "six rows" (docs/, deleted-crate note). The underlying no-drift conclusion is still correct in substance. | Reword the plan's Step 1 prose to say the principle is stated nearby (§3) rather than implying it's inside the compared §4 block; no CLAUDE.md/spec content change needed. |
| Minor | `docs/superpowers/plans/2026-09-03-idl1-wave1-l10-docs.md:237` (Task 2 Step 5) | Plan's own verification step expects `grep -c "idl0_dump.dart"` to return `1`, but the plan's own replacement text (Step 2) mentions the filename twice, so the correct/actual result is `2`. Implementer's actual output (2) is correct; the plan's stated expectation was wrong at drafting time. | Fix the plan's "Expected: 1" to "Expected: 2" for future reruns, to avoid a future executor incorrectly treating 2 as a failure. |
| Minor | shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` | Shared checkout is not currently clean (`app/src-tauri/Cargo.toml` line-ending-only diff; untracked `runs/2026-09-03/lanes/l1-store/review-gps-fix.md`), though not caused by this task. | Have whichever process left the shared checkout dirty (likely a concurrent L1 review/build) restore it to clean before the next task that requires a clean shared checkout as a precondition. |

No Important or Critical findings. Both tasks were executed as specified: Task
1 made no edits and its no-drift conclusion holds up under independent
re-verification; Task 2's commit content, scope, and hygiene (no stray files,
no AI trailer, accurate CHANGELOG) all match the plan.
