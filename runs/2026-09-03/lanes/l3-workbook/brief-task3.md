# L3 Task 3 — implementer brief (math-cell definition grammar; C2 §3.1)

You are the implementer for L3 Task 3 of the idl1 rewrite — the third task of
the core workbook-v3 lane. TDD, one commit, then report.

## Where
- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
  branch `wave1-l3-workbook`, HEAD must be the commit of Task 2 (given in the
  dispatch message), status clean. Verify first; if not, stop and report. The
  worktree inherits `.cargo/config.toml` (shared target-dir) — leave it alone.
- Work ONLY there. Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  (shared checkout), `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` beyond READING the
  files named below, or any other worktree. Do NOT edit anything under `docs/`. Do NOT push.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the L3 plan
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\plans\2026-09-03-idl1-wave1-l3-workbook.md`
  — Global Constraints (41–135), `### Task 3` (259–288); contract C2
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\specs\2026-09-03-idl1-c2-workbook-v3.md`
  §3.1 (the `math_line` EBNF and `identifier` grammar, exact), §3.2 (expression grammar,
  by reference to `math/token.rs`/`math/parse.rs`/`math/eval.rs`), §3.5.A (row wording); the
  `R20` ledger entry (`runs/2026-09-03/decisions.md`) for the `ReservedName` widening; the
  landed `core/src/workbook/v3/error.rs` from Task 2 (`WorkbookErrorKind`, the per-kind
  constructors, `pub const RESERVED_NAMES: [&str; 15]`) — this task is the first consumer;
  skim `core/src/math/token.rs` (hand-written tokenizer, no regex) and
  `core/src/math/resolve.rs:24` (`channel_refs`, "regex-free") for the house style a
  hand-written scanner should match.

## COMPUTE RULES — non-negotiable
This machine is memory-bound (cargo is capped at 2 jobs machine-wide; do not override). The
ONLY cargo build/test command you run, as few times as TDD needs:
`cargo test -p idl-rs workbook::v3::math_cell`. Every run must report a non-zero `passed`
count — a targeted filter that matches nothing is a failed gate, not a pass (standing rule,
ledger R20). No full suite, no tarpaulin, no `-j`, no separate `cargo build`/`cargo check`
(not required — no `pub` signature reaching `idl-rs-cli` changes here), no `.cargo/` edits,
never `cargo fmt`. One cargo process at a time, foreground.

## The task (plan Task 3, Steps 1–3) with these rulings

**Ruling (lead, R20) — L3-R5.** No `regex` crate — `core/Cargo.toml` gains none this task.
C2's `/…/` terminals are *specifications*, not an instruction to add a regex engine;
implement them as hand-written scanners, matching `math/token.rs`'s and `math/resolve.rs`'s
existing house style. `identifier` (`/[A-Za-z_][A-Za-z0-9_]*/`, C2 §3.1) is a ~6-line char
scan.

**Ruling (lead, R20) — L3-R6.** Line classification order and rules, stated once — implement
exactly this order, not `starts_with` heuristics:
1. Strip a trailing comment by scanning for `#` **outside** a double-quoted string, preceded
   by whitespace (closes G3.3 — a `#` inside `"low"`/`"none"` string arguments must not split
   the line).
2. Blank → `Blank`.
3. Leading `#` → `Comment`.
4. `const` **followed by at least one space/tab** → `const_line` (closes G3.2 — do NOT use
   `trimmed.starts_with("const")`; that misclassifies `constant = [X]` as a malformed const
   line since `"constant"` also starts with `"const"`).
5. Contains `=` → `def_line`.
6. Otherwise → L3-R3 (Task 2's rule): `WorkbookErrorKind::InvalidIdentifier` with the
   unmodified C2 §3.5.A template, `<name>` = the line's trimmed text up to the first `=` if
   one exists, else the whole trimmed line.

**Ruling (lead, R20), widened — L3-R7.** A definition **or constant** named `Time` or
`Distance` (the two engine-synthesized channels) is `ReservedName` — this is now an enforced
rule, not deferred documentation. (The pre-read's original L3-R7 proposed leaving this as
silent, documented shadowing with a test named `definition named Time shadows the synthesized
Time channel — documented, deterministic`; the lead widened it into a `ReservedName` error
instead — do not write that shadowing test. Write this one instead:
`def_line name "Time" — ReservedName`, `const_line name "Distance" — ReservedName`.)
`Time`/`Distance` are already in Task 2's `RESERVED_NAMES` (15 entries) — this task's
identifier validation checks every `def_line`/`const_line` name against that constant, it does
not hard-code a second list.

**`MathCellLine` and `parse_math_cell_body` signature — corrected from the plan.** The plan's
interface line (`parse_math_cell_body(body: &str)`) predates L3-R2; per that ruling every
cell-scoped-error-raising function takes the owning cell id:
`parse_math_cell_body(cell_id: &str, body: &str) -> (Vec<MathCellLine>, Vec<WorkbookError>)`.
`MathCellLine::{Blank, Comment, Const { name: String, value: f64, unit_display:
Option<String> }, Def { name: String, expr_text: String, label: Option<String> }}` (plan
263's shape, unchanged). `unit_display` on `Const` is None for a bare-number `const` line —
C2 §3.1's unit-suffix syntax is a front-matter-only feature (Task 1); a `const` line's
right-hand side is always a bare `number` (the grammar has no unit-suffix alternative there),
so this field exists for shape-symmetry with front matter's `ConstantRaw::WithUnit` and stays
`None` from this task's own parsing — do not attempt to parse a unit suffix out of a
`const_line`.

**`ConstLine`, for Task 4 to consume.** Define `pub struct ConstLine { pub cell_id: String,
pub name: String, pub value: f64, pub unit_display: Option<String> }` in `mod.rs` (this
brief's placement call, so Task 4's brief can name it precisely — low cost either way).
Step 2's whole-document flatten collects every cell's `Const` lines into `Vec<ConstLine>`
(tagging each with its owning cell's id) for Task 4's `merge_constants` to take by reference.

### Step 1: Line splitter and `identifier`/`ReservedName` validation
Split `body` on `\n`; classify each line per L3-R6. `identifier` validation: a `def_line` or
`const_line` name not matching `identifier` → `InvalidIdentifier` (Task 2's constructor,
`cell_id` from this function's new parameter). A name matching `identifier` but present in
`RESERVED_NAMES` → `ReservedName` (Task 2's constructor) — checked for **both** `def_line` and
`const_line` names, case-sensitive.

Tests (plan 273, amended per L3-R7 above): `def_line "roll_deg = [Roll]" — Def with name
roll_deg`; `def_line "x = 1 # label: My Label" — label captured`; `def_line trailing plain
comment without label — label is None`; `const_line "const k = 9.81" — Const`;
`const_line "constant = [X]" — Def, not misclassified as const_line` (closes G3.2 directly);
`def_line with a string argument containing '#', e.g. detrend([X], "none") — not split at the
in-string '#'` (closes G3.3); `identifier starting with digit — InvalidIdentifier`; `name
"const" — ReservedName`; `name "pi" — ReservedName`; `name "channel" — ReservedName`
(host-var collision); `def_line name "Time" — ReservedName`; `const_line name "Distance" —
ReservedName`; `blank line and comment-only line — no error, produce Blank/Comment`.

### Step 2: Whole-document flat namespace + `DuplicateDefinition`
In `mod.rs`, after Task 1's cell scan, run `parse_math_cell_body` over every `math` cell's
`raw_fence_body`, flatten every `Def` across the whole document (C2 §2.4: one flat namespace)
and raise `DuplicateDefinition` (Task 2's constructor) for a repeated `Def` name.

**Do NOT also raise `DuplicateConstant` here**, despite plan line 277's text — reconciling it
with Task 4 Step 3 (G3.6: the plan's Step 2 and Task 4's `merge_constants` both independently
detect the same `Const`-vs-`Const`/`Const`-vs-front-matter collision, which double-reports it).
This task's job is narrower: collect every `Const` line into `Vec<ConstLine>` (above) and hand
it to Task 4, which is this lane's single enforcement point for `DuplicateConstant` — the same
"single enforcement point" shape L3-R10 already uses for `ReservedName`.

Test: `same identifier defined in two different math cells — DuplicateDefinition, both cells
still parse`.

### Step 3: Test and commit
Run: `cargo test -p idl-rs workbook::v3::math_cell` — expect a non-zero `passed`, `0 failed`.
Commit with explicit paths (NOT `git add -A`):
`git add core/src/workbook/v3/math_cell.rs core/src/workbook/v3/mod.rs core/src/workbook/v3/error.rs` —
message `workbook: v3 math-cell definition/const-line grammar (C2 §3.1)`. Single line, no AI
attribution trailer.

## Do not (gap notes not covered above)
- G3.5 — `and`/`or`/`not` (C2 §3.2's infix/prefix keywords) match the `identifier` regex and
  are not in `RESERVED_NAMES`. Leave them out of the reserved list this task — `const and = 5`
  parsing as a legal constant named `and` is cosmetic/confusing, not incorrect (the infix
  operator still wins in expression position per `parse.rs:242-256`), and no ruling adds them.
  Do not unilaterally add them to `RESERVED_NAMES` — that is a C2 §3.5.A widening, lead-owned,
  like L3-R7 was.

## Style / hygiene
Doc comment on every public symbol; units where numeric (`value: f64` — document what unit
it's in, i.e. none applied, the raw scalar); typed errors only; A/A/A tests named `thing —
condition — result`; match surrounding hand-formatted style.

## Spec discipline (say it out loud in your report)
"no spec change needed" — C2 §3.1 is exact; the `Time`/`Distance` `ReservedName` widening was
already made by the lead in C2 §3.5.A (ledger R20) before this task started — you are
consuming it, not amending it.

## Report back (concise)
Commit hash + `git show --stat`; the exact test command and result line (with `passed` count);
per-step done/deviated; confirm no `regex` crate was added (`core/Cargo.toml` diff, if any,
should be empty); anything ambiguous in C2 §3.1–3.2 you resolved (say how) or that needs a
lead ruling (stop and report instead of guessing — CLAUDE.md §1).
