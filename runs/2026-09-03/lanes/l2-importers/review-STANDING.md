# L2 (core importers) — standing reviewer brief

Reusable across every L2 task review. The dispatch message appends the
task-specific scope (commit hash, files touched, and the task's own brief
file, e.g. `brief-task3.md`) — that brief's rulings are what you check
against; this file is the process/format contract that doesn't change task
to task.

## Where

- Worktree under review: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers`,
  branch `wave1-l2-importers` (Task 1 alone reviews the docs worktree
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l2-importers`, same
  branch name, `docs/IDL0_SPEC.md` only). The dispatch message gives the
  exact commit (`git show --stat <hash>`) — review that commit's diff, not
  the whole branch, unless told otherwise.
- Read-only there, with one exception: writing your findings file. **Never**
  `git revert`, `git checkout <path>`, `git reset`, `git stash`, or any
  command that mutates tracked files or index state in this worktree — not
  even to "verify the test fails without the fix." Ledger R11 records a
  reviewer doing exactly that in L1's worktree and leaving stale
  `REVERT_HEAD`/index state for the next implementer to clean up; no data was
  lost that time, but the rule going forward is absolute: if you want to see
  a test fail pre-fix, read the diff and reason about it, or check out the
  parent commit in a disposable `git worktree add` to a throwaway path —
  never touch the shared worktree's working tree or index.
- Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` (shared checkout) or any
  other worktree. Do NOT edit anything under `docs/` (Task 1's own review
  writes findings to `runs/`, not `docs/`, same as every other task). Do NOT
  push. Do NOT fix the code yourself — findings only; a fix is a separate
  dispatched task.

## COMPUTE RULES — non-negotiable

This machine is memory-bound (cargo is capped at 2 jobs machine-wide; do not
override). Run the task's targeted test filter (from its brief's COMPUTE
RULES section — copy it, don't invent a different one) **exactly once** to
reproduce the implementer's reported result. The run must report a non-zero
`passed` count — a targeted filter matching nothing is a failed gate, not a
pass (standing rule, L3-R8), and if the implementer's own reported run shows
`0 passed`, that alone is grounds for NEEDS_FIXES regardless of what else you
find. No full suite, no `cargo tarpaulin`, no `-j`, no rerunning the same
command twice "to be sure," no extra `cargo build`/`cargo check` beyond what
the task's brief itself mandates (Task 4 and Task 6 mandate one regression
filter each, on top of the task's own — copy exactly what the brief says, not
more). One cargo process at a time, foreground. Task 1 has no cargo gate at
all (prose only) — confirm no `.rs`/`Cargo.toml` file appears in its diff.

## What to verify (generic — every task)

- **The task's own brief's rulings win over the plan's prose.** Where
  `docs/superpowers/plans/2026-09-03-idl1-wave1-l2-importers.md`'s Task text
  and the dispatched brief disagree (stale message strings, wrong test
  filters, signatures the brief corrected — several tasks correct the plan's
  drafted code substantially, e.g. GPX's whole-file vs. partial-timestamp
  handling, FIT's GPS coordinate scale), the brief is authoritative — do not
  flag a deviation from the plan that the brief explicitly ruled on. Do flag
  a deviation from the *brief*.
- **Spec conformance.** Cross-check against the cited C1 §4.1/§4.2 rows and
  `docs/IDL0_SPEC.md` §15a byte-for-byte where the brief says byte-for-byte
  (channel units, `source_kind` tokens, error variant names against C3 §2's
  `import_*` rows). `deg_e7` scaling (×1e7) on `GPS_Latitude`/`GPS_Longitude`
  for every source (FIT, GPX) is a specific, easy-to-miss failure mode —
  check the actual multiplied value in a test assertion, not just that a
  `with_unit("deg_e7")` call exists.
- **CLAUDE.md §4 (testing).** Arrange/Act/Assert with a blank line between
  each; test names `thing — condition — result` (realized as
  underscore-joined identifiers in Rust — literal em dashes aren't valid in
  identifiers, that's expected, not a violation). Tests exercise only what
  this task owns, not a re-test of code another task/module already covers.
- **CLAUDE.md §5 (documentation and errors).** Doc comment on every public
  symbol; units stated on every numeric value's doc comment; no `Err(String)`
  anywhere; no unexplained `.unwrap()`/`.expect()` on production-path data
  (test-only `unwrap()` is fine); typed errors carry `Display` +
  `std::error::Error`. No warning-worthy condition silently dropped (CLAUDE.md
  §5's "recover what's readable, never crash, never silently drop") — a
  missing/duplicate/non-monotonic timestamp always surfaces an
  `ImporterWarning`, never just vanishes.
- **No reformatting.** `idl-rs` is hand-formatted, never `cargo fmt`'d — a
  diff should be additive/surgical; broad whitespace/import-order churn on
  lines the task didn't need to touch is a finding, not a style nit (it
  hides the real diff from future reviewers and risks merge conflicts with
  parallel lanes).
- **Repo hygiene.** Commit message is a single line, no AI attribution
  trailer; `git add` used explicit paths (check `git show --stat` against
  the brief's file list — a stray file pulled in by `git add -A` is a
  finding); nothing under `docs/` touched except Task 1's own SPEC file, in
  its own worktree; the shared checkout
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` untouched and still
  on `main`.
- **Cross-task consistency.** Later tasks in this lane import shared
  types/constants (`Importer`, `ImportedSession`, `ImporterWarning`,
  `ImporterError`, `session_id_from_blob_hash`, `Channel::from_f64_with_times`)
  rather than redeclaring them — a duplicate/drifted copy is a finding even
  if the values currently match, since it will silently drift later. Every
  importer builds channels via `Channel::from_f64_with_times(..).with_unit(..)`
  (L2-R1) — a bare `Channel { .. }` struct literal in an importer is a
  finding (it silently omits `t_recorded_us`/defaults `unit` wrong).

## Findings file

Write to `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\runs\2026-09-03\lanes\l2-importers\review-task<N>.md`
(or `-fix<N>.md`/`-fix.md` for a re-review of a fix-up, matching the L1 lane's
naming). Structure, matching the format already established by
`lanes/l1-store/review-task11.md` and `review-task15.md`:

1. Header: task name/scope, worktree, branch, commit hash under review, one
   line naming what's in scope (and explicitly what's out of scope, if the
   worktree has other uncommitted/unrelated changes present — say so and
   ignore them).
2. `## Test command and result` — the exact command run, its full output
   (including the `test result: ok. N passed; ...` line), and a one-line
   confirmation it reproduces what the implementer reported.
3. `## Findings` — a table:

   | Severity | file:line | Finding | Fix |
   |---|---|---|---|

   Severity is one of **Critical** (breaks the build, a shipped-behaviour
   bug, or silently wrong output — a mis-scaled GPS coordinate or a
   double-applied epoch offset belongs here), **Important** (a real defect
   with a concrete consequence — wrong-but-narrow, a missed edge case a test
   should have caught, a spec deviation), or **Minor** (style, a missing doc
   comment, a pre-existing-pattern gap this task merely matches rather than
   introduces — say so explicitly when true, it's mitigating, not absolving).
   State "No Critical/Important findings" explicitly when true rather than
   leaving the reader to infer it from an empty table.
4. `## Checks performed (all pass)` — bullet list of everything you verified
   that did *not* produce a finding: field-for-field spec checks, the
   specific rulings from the task's brief and confirmation each was followed,
   test coverage adequacy, hygiene checks. This is the section that lets a
   later reader trust "CLEAN" without re-deriving your work.
5. `## Verdict rationale` — one paragraph. State plainly what's correct, name
   the specific finding(s) (if any) that keep it from CLEAN, and say whether
   the fix is small/mechanical or a real rework. Don't hedge; if it's clean,
   say so without qualification.
6. Final line, bare, nothing after it on the line: `VERDICT: CLEAN`,
   `VERDICT: NEEDS_FIXES`, or `VERDICT: NEEDS-REWORK`. CLEAN = ship as is.
   NEEDS_FIXES = correct approach, one or more Important/Critical findings
   with a small/mechanical fix — expect a fix-up dispatch, not a redo.
   NEEDS-REWORK = the approach itself is wrong (wrong layer, wrong
   ownership, a ruling not followed at all, not just imperfectly) — expect
   the task re-dispatched, not patched.

## Report back

In your final message (not just the file): the findings-file path, the
verdict line, and a one-sentence summary. If you found something that
implies a lead ruling is needed (a genuine ambiguity the task's brief didn't
resolve, not just an implementer slip) — say that explicitly and separately,
don't bury it in a Minor finding.
