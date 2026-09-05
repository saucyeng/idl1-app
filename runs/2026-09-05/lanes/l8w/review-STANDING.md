# L8w (Rust write-amendment lane) — standing reviewer brief

Reusable across every L8w task review. The dispatch message appends the
task-specific scope (commit hash, files touched, and the task's own brief
excerpt from the plan) — that plan text's rulings are what you check
against; this file is the process/format contract that doesn't change task
to task.

## Where

- Worktree under review: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
  branch `wave2-l8w-write-amendment` (Task 13 alone also touches
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l8w-write-amendment`
  — `app/src-tauri/**` and `app/package.json` only, same branch name). The
  dispatch message gives the exact commit (`git show --stat <hash>`) —
  review that commit's diff, not the whole branch, unless told otherwise.
- Read-only there, with one exception: writing your findings file. Never
  `git revert`, `git checkout <path>`, `git reset`, or `git stash` in the
  worktree under review — see a pre-fix test failure by reading the diff, or
  check out the parent commit in a disposable `git worktree add` to a
  throwaway path.
- Do NOT touch the shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  or any other worktree. Do NOT edit anything under `docs/` (this lane's spec
  discipline is "no spec change needed" throughout — a diff touching
  `docs/superpowers/specs/` or `docs/IDL0_SPEC.md` is itself a finding unless
  the task's own brief text says otherwise, e.g. if the lead answered Open
  Question 3 with a SPEC change). Do NOT push. Do NOT fix the code yourself —
  findings only; a fix is a separate dispatched task.
- Do NOT edit anything under `app/src/` in any task's diff except Tasks 13's
  narrow `package.json`/capability scope — this lane never touches
  `app/src/routes/`, `app/src/ipc/`, `app/src/state/`. Any such file
  appearing in a diff is a Critical finding (scope violation — the UI-stub
  swap is a separate lead shell task, not this lane's).

## COMPUTE RULES — non-negotiable

This machine is memory-bound (cargo capped at 2 jobs machine-wide; never
override). **Reviewers do not build or test** (CLAUDE.md §8) — the harness
denies a reviewer's cargo invocation outright. Verify the implementer's
reported run instead: the command must be the task's own filter from the
plan (or its brief), the `passed` count must be non-zero and plausible for
the tests in the diff (a targeted filter matching nothing is a failed gate,
not a pass), and every new test must be traced statically against landed
types so you can say it would compile and would fail if its named behaviour
broke. No full suite (`cargo test --workspace` and a bare `cargo test` are
both §8 hook-denied) except at Task 14, which *is* the full-suite gate and
whose report you verify the same way (numbers match what was reported, no
re-running). No `cargo tarpaulin`, no `-j`, no rerunning a command twice "to
be sure," no extra `cargo build`/`cargo check` beyond what the task mandates.
Task 13 (dialog plugin) has no cargo test filter at all — its proof is a
build/check the plan names explicitly; confirm that exact command and output
were reported, not a substitute.

## What to verify (generic — every task)

- **The plan's task text wins over inference.** Where an implementer's
  choice differs from what the plan states (e.g. picking `std::fs::write`
  over `write_atomic` in Task 10, or a different `Connections` locking shape
  in Task 6 than the plan's suggested `Arc<tokio::sync::Mutex<BtleplugBle>>`),
  check whether the plan explicitly left that choice to the implementer
  ("implementer's call, document it") — if so, verify the implementer *did*
  document the choice and its reasoning; a silent, undocumented deviation
  from a plan-suggested shape is a finding even when the resulting code is
  correct.
- **C3 conformance, field for field.** Every response DTO matches
  `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`'s interface for
  that command exactly — field names (snake_case, matching Rust verbatim,
  C3 §1), optionality, and the exact error-kind set listed for that command
  in C3 §2's table and the command's own entry. A response DTO with an extra
  or missing field versus C3's TS interface is a Critical finding — this is
  the one thing every wave-2 UI lane built directly against.
- **Binary layouts (Tasks 11, 12) byte-for-byte against C3's tables.** Header
  size (24 bytes `IDLH`, 16 bytes `IDLF`), field order, field types, and the
  worked byte-offset arithmetic in C3's §3.4/§3.6 entries. Compute the
  offsets yourself from the task's own encoder code and check they match C3
  literally, not just "look plausible." A header that isn't exactly the
  specified byte count (even if internally self-consistent) is Critical —
  the whole point of Q3(a)'s padding decision was fixed offsets a
  `Float64Array`/`Float32Array` view can rely on.
- **Additive-only signature changes (Task 9).** `eval_workbook`'s
  `lap_context: Option<LapContext>` must (a) exist as a new trailing
  argument, never replacing or reordering an existing one, and (b) `None`
  must produce byte-identical output to the pre-amendment command — check
  the implementer's regression test actually asserts this against a fixture
  that predates the change, not just "compiles the same." A behavioural
  change under `None` is a Critical finding (C3 §5's whole basis for calling
  this non-breaking).
- **`IpcErrorKind` additions are additive, never edit an existing variant.**
  Tasks 6/7 (`DeviceRejected`), 8 (`ConfigParse`/`ConfigUnsupportedVersion`)
  must only *add* enum variants and match arms — a diff touching an existing
  variant's name, discriminant, or an existing `From` impl's other arms is a
  Critical finding (C3 §5: "never renamed or removed once shipped").
- **Scope limitations are documented where the plan calls for it, not
  silently absorbed.** Task 8's registry-preview must actually skip
  non-fixed-ID channels (not guess an id) and must say so in its doc comment
  and the task's CHANGELOG bullet. Task 7's `device_control` must not
  attempt to parse an `AckCode` back out of `TransportError`'s message text
  (a Critical finding if it does — see the standing plan's Open Question 1)
  and must document the platform limitation rather than silently pretending
  `device_rejected` always works.
- **CLAUDE.md §4 (testing).** Arrange/Act/Assert with a blank line between
  each; test names `thing — condition — result`. Tests exercise the
  `_via`-suffixed plain functions (this lane's established idiom, matching
  `commands/catalog.rs`/`commands/device.rs`), never the bare
  `#[tauri::command]` wrapper (not constructible outside a running app).
- **CLAUDE.md §5 (documentation and errors).** Doc comment on every public
  symbol; units on every numeric value; no `Err(String)`; no unexplained
  `.unwrap()`/`.expect()` on production-path data; `// TODO(idl0):` never
  bare `// TODO`.
- **No reformatting.** `idl-rs` is hand-formatted, never `cargo fmt`'d — a
  diff should be additive/surgical to the files the task's own file list
  names; broad whitespace/import-order churn elsewhere is a finding.
- **Repo hygiene.** Commit message is a single line, no AI attribution
  trailer; `git add` used explicit paths (check `git show --stat` against
  the task's file list); nothing under `docs/` touched (this lane's spec
  discipline is "no spec change needed" throughout, per task); the shared
  checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` untouched
  and still on `main`.
- **Cross-task consistency.** Later tasks reuse this lane's own established
  patterns (the `_via`-suffixed function idiom, `StubBle`/`StubWifi` test
  doubles from `commands/device.rs`, `From<core::X>` mapping impls in
  `commands/*.rs` rather than hand-copying fields inline) rather than
  reinventing them — a duplicate/drifted copy is a finding even when the
  values currently match.

## Findings file

Write to
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\runs\2026-09-05\lanes\l8w\review-task<N>.md`
(or `-fix<N>.md`/`-fix.md` for a re-review of a fix-up). Structure, matching
the L2 lane's established format:

1. Header: task name/scope, worktree(s), branch, commit hash(es) under
   review, one line naming what's in scope (and explicitly what's out of
   scope, if the worktree has other uncommitted/unrelated changes present).
2. `## Test command and result` — the exact command run, its full output
   (including the `test result: ok. N passed; ...` line), and a one-line
   confirmation it reproduces what the implementer reported. For Task 13,
   substitute the build/check command and output the plan names.
3. `## Findings` — a table:

   | Severity | file:line | Finding | Fix |
   |---|---|---|---|

   Severity is one of **Critical** (breaks the build, a shipped-behaviour
   bug, a C3 field/error-kind mismatch, a wrong binary byte offset, a
   breaking-not-additive signature change, or a text-parsed `AckCode`),
   **Important** (a real defect with a concrete consequence — a missed edge
   case a test should have caught, an undocumented scope decision the plan
   left to the implementer's judgment but required documenting), or **Minor**
   (style, a missing doc comment, a pre-existing-pattern gap this task
   merely matches). State "No Critical/Important findings" explicitly when
   true.
4. `## Checks performed (all pass)` — bullet list of everything you verified
   that did *not* produce a finding: the C3 field-for-field check, the byte-
   offset arithmetic (for Tasks 11/12), the additive-signature check (Task
   9), the specific plan rulings and confirmation each was followed, test
   coverage adequacy, hygiene checks.
5. `## Verdict rationale` — one paragraph. State plainly what's correct, name
   the specific finding(s) (if any) that keep it from CLEAN, and say whether
   the fix is small/mechanical or a real rework.
6. Final line, bare: `VERDICT: CLEAN`, `VERDICT: NEEDS_FIXES`, or
   `VERDICT: NEEDS-REWORK`.

## Report back

In your final message (not just the file): the findings-file path, the
verdict line, and a one-sentence summary. If a review surfaces something
that implies a lead ruling is needed beyond the plan's three logged Open
Questions (a genuine ambiguity the plan didn't anticipate, not just an
implementer slip) — say that explicitly and separately, don't bury it in a
Minor finding.
