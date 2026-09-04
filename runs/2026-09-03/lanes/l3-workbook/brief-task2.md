# L3 Task 2 — implementer brief (structural validation errors; C2 §3.5.A)

You are the implementer for L3 Task 2 of the idl1 rewrite — the second task of
the core workbook-v3 lane. TDD, one commit, then report.

## Where
- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
  branch `wave1-l3-workbook`, HEAD must be the commit of Task 1 (given in the
  dispatch message), status clean. Verify first; if not, stop and report. The
  worktree inherits `.cargo/config.toml` (shared target-dir) — leave it alone.
- Work ONLY there. Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  (shared checkout), `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` beyond READING the
  files named below, or any other worktree. Do NOT edit anything under `docs/`. Do NOT push.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the L3 plan
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\plans\2026-09-03-idl1-wave1-l3-workbook.md`
  — Global Constraints (41–135), `### Task 2` (233–256); contract C2
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\specs\2026-09-03-idl1-c2-workbook-v3.md`
  §3.5, §3.5.A (the seven-row error table — this task's spec, verbatim); the
  ledger `R20` entry in `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\runs\2026-09-03\decisions.md`
  (the `ReservedName` row is *amended* there — `Time`/`Distance` added, 15 names total);
  the current, as-landed `core/src/workbook/v3/error.rs`, `mod.rs`, `cell.rs` in this
  worktree — Task 1 already built `WorkbookError{cell_id, kind, message}`,
  `WorkbookError::new`/`front_matter`, `Display`, `std::error::Error`, and three of the
  seven `WorkbookErrorKind` variants; read them before writing anything, this task
  extends that code, it does not replace it.

## COMPUTE RULES — non-negotiable
This machine is memory-bound (cargo is capped at 2 jobs machine-wide; do not override). The
ONLY cargo build/test command you run, as few times as TDD needs:
`cargo test -p idl-rs workbook::v3::error`. Every run must report a non-zero `passed`
count — a targeted filter that matches nothing is a failed gate, not a pass (standing rule,
ledger R20). No full suite, no tarpaulin, no `-j`, no separate `cargo build`/`cargo check`
(not required this task — no existing `pub` signature changes), no `.cargo/` edits, never
`cargo fmt`. One cargo process at a time, foreground. `cargo check -p idl-rs-cli --tests` is
NOT required for this task.

## The task (plan Task 2, Steps 1–3) with these rulings

**Ruling (lead, R20) — L3-R1.** `WorkbookError` mirrors `MathEvalError`'s shape exactly:
`{cell_id: String, kind: WorkbookErrorKind, message: String}`, `#[derive(Debug, Clone,
PartialEq)]`, plus `impl Display` (writes `message`) and `impl std::error::Error`. One
constructor per kind, each producing C2 §3.5.A's template byte-for-byte, em dash and
apostrophes included; the tests assert the literal string. No line numbers in `message` and
no `line` field — C2 fixes the message shape and this lane does not widen it. Task 1 already
built the struct, `Display`, `Error`, and the two general constructors (`new`/`front_matter`)
— reuse them; add one named constructor function per kind (e.g. `fn duplicate_cell_id(id:
&str) -> WorkbookError`) that calls through to `WorkbookError::new`/`front_matter` with the
exact template, so callers never hand-build a message string.

**Ruling (lead, R20) — L3-R2.** Every function that can raise a cell-scoped error takes the
owning cell id (this task defines the constructors; Tasks 3/4 are the callers that supply
`cell_id`). Front-matter-sourced errors use the literal `"front-matter"` — already wired via
`WorkbookError::front_matter`.

**Ruling (lead, R20) — L3-R3.** The stray-math-line default is ruled by ledger R7 — code it,
do not re-raise. A line matching none of C2 §3.1's four `math_line` forms is
`InvalidIdentifier` with the *unmodified* C2 template, `<name>` substituted with the line's
trimmed text (up to the first `=` if one exists, else the whole trimmed line). No second
message variant — this governs Task 3's caller, but the message-shape invariant it depends on
is this task's to lock down: exactly one `InvalidIdentifier` template exists in the codebase.

Extend `WorkbookErrorKind` (currently `DuplicateCellId`, `MissingFrontMatterId`,
`UnsupportedWorkbookVersion`) with the remaining four: `DuplicateDefinition`,
`DuplicateConstant`, `InvalidIdentifier`, `ReservedName`. Add a constructor function per kind,
for all seven, each producing C2 §3.5.A's exact string:
- `DuplicateCellId(id)` → `"Cell id '<id>' used by more than one cell"`
- `DuplicateDefinition(name)` → `"'<name>' is defined more than once"`
- `DuplicateConstant(name)` → `"Constant '<name>' is declared more than once"`
- `InvalidIdentifier(name)` → `"'<name>' is not a valid definition name — use letters, digits, underscore, and don't start with a digit"`
- `ReservedName(name)` → `"'<name>' is reserved and can't be used as a definition or constant name"`
- `MissingFrontMatterId` → `"Workbook front matter is missing a valid 'id'"`
- `UnsupportedWorkbookVersion(n)` → `"Workbook version <n> is not supported (expected 3)"`

**`RESERVED_NAMES`.** Define, once, in `error.rs`: `pub const RESERVED_NAMES: [&str; 15] = [
"const", "pi", "tau", "e", "g", "Plot", "d3", "Inputs", "html", "laps", "session",
"constants", "channel", "Time", "Distance" ];` case-sensitive, byte-identical to C2 §5.1's
host-variable table plus the four universal constants plus `const` plus the R20-amended
`Time`/`Distance` pair. A comment above it cites C2 §3.5.A and the R20 ledger entry so a
future host-variable addition is remembered here too. Tasks 3 and 4 import this constant —
do not let either task grow its own copy.

Tests, one per kind, asserting the literal string against C2 §3.5.A's exact wording (pure
transcription check, e.g. `duplicate_cell_id_message_matches_c2_exactly`); a placeholder test
proving `WorkbookError` is `Clone + Debug + PartialEq` (Task 1 already has one covering
`Display`/`front_matter` — do not duplicate it, extend if it doesn't already cover this).

## Do not
- Do not re-raise Task 3's plan-text "Open Question 1/2" (plan lines 269, 481) — closed by
  ledger `R7`: *"L3: the stray-math-line and malformed-table-JSON error-kind defaults."*
  Approved as drafted. There is nothing open to escalate.
- Do not accept two different `InvalidIdentifier` message templates. Plan line 269's prose
  ("noting the line couldn't be parsed as `const NAME = value`…") is superseded by L3-R3
  above — one template, C2's, used everywhere.
- Do not normalise the em dash (U+2014) in `InvalidIdentifier`'s message to a hyphen, or the
  ASCII apostrophes in "don't"/"can't" to curly quotes. Transcribe byte-for-byte; C2 §3.5.A's
  table uses U+2014 and straight `'`.
- Do not narrow the derive/trait list to just `Clone + Debug + PartialEq` (plan line 247) —
  Task 1 already implements `Display` + `std::error::Error`; keep both, per CLAUDE.md §5
  (typed failures, `?`-boxable, formattable like every other core error).
- Do not touch C3 or add an IPC error kind — that gap (C3 has no `workbook_*` kind) is
  lead-owned (L3-R4), applied when L5's workbook-command task is briefed. Not this task.

## Style / hygiene
Doc comment on every public symbol; units where numeric (none here); typed errors only; A/A/A
tests named `thing — condition — result`; match surrounding hand-formatted style (Task 1's
`error.rs` is the template). Commit with explicit paths (NOT `git add -A`):
`git add core/src/workbook/v3/error.rs core/src/workbook/v3/mod.rs` (plus `cell.rs` only if
Step 2's wiring touches it) — message `workbook: v3 structural error kinds and exact C2
§3.5.A messages`. Single line, no AI attribution trailer.

## Spec discipline (say it out loud in your report)
"no spec change needed" — C2 §3.5.A already fixes every kind/message (the `ReservedName` row's
`Time`/`Distance` amendment was made by the lead in ledger R20, already reflected in the
signed C2 file; you are not editing the contract).

## Report back (concise)
Commit hash + `git show --stat`; the exact test command and result line (with `passed` count);
per-step done/deviated; confirmation the `RESERVED_NAMES` constant has exactly 15 entries;
anything ambiguous in C2 §3.5.A you resolved (say how) or that needs a lead ruling (stop and
report instead of guessing — CLAUDE.md §1).
