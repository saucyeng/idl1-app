# L3 Task 4 — implementer brief (constants: flat table, universal-constant guard, parser wiring; C2 §3.1–3.2)

You are the implementer for L3 Task 4 of the idl1 rewrite — the fourth task of
the core workbook-v3 lane. TDD, one commit, then report.

## Where
- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
  branch `wave1-l3-workbook`, HEAD must be the commit of Task 3 (given in the
  dispatch message), status clean. Verify first; if not, stop and report. The
  worktree inherits `.cargo/config.toml` (shared target-dir) — leave it alone.
- Work ONLY there. Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  (shared checkout), `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` beyond READING the
  files named below, or any other worktree. Do NOT edit anything under `docs/`. Do NOT push.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the L3 plan
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\plans\2026-09-03-idl1-wave1-l3-workbook.md`
  — Global Constraints (41–135), `### Task 4` (291–319); contract C2
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\specs\2026-09-03-idl1-c2-workbook-v3.md`
  §3.1 (constants: two sources, one flat namespace, unit-suffix syntax), §3.2 (constants as
  bare identifiers — universal four never shadowable, `math::parse::constant_value`), §3.5.A
  (`ReservedName`/`DuplicateConstant` rows); `core/src/math/parse.rs` in full (small file) —
  `constant_value` (~line 60), `pub fn parse` (~71), `Parser` struct, `parse_primary`
  (~214–257, the fallback chain this task extends); the landed `core/src/workbook/v3/error.rs`
  (Task 2 — `RESERVED_NAMES`, per-kind constructors) and `mod.rs`/`math_cell.rs`
  (Task 3 — `ConstLine { cell_id, name, value, unit_display }`) in this worktree; Task 1's
  `front_matter.rs` for `ConstantRaw::{Number(f64), WithUnit{value, unit_display}}`.

## COMPUTE RULES — non-negotiable
This machine is memory-bound (cargo is capped at 2 jobs machine-wide; do not override).

**Ruling (lead, R20) — L3-R8, and standing for every task in this lane.** The gate is **two**
separate runs, both plain substrings (`cargo test`'s `-p idl-rs <filter>` is a substring
match, not a regex — `"constants|parse_with_constants"` from the plan's own Step 4 matches
*zero* test names and would silently pass; do not run it):
`cargo test -p idl-rs workbook::v3::constants` and `cargo test -p idl-rs parse_with_constants`.
Each run must report a non-zero `passed` count — a targeted filter that matches nothing is a
failed gate, not a pass. `cargo check -p idl-rs-cli --tests` is mandatory at the end (below) —
this task adds `math/parse.rs`'s first new `pub fn` reaching outside the module, and it's
seconds to run. No full suite, no tarpaulin, no `-j`, no separate `cargo build`, no `.cargo/`
edits, never `cargo fmt`. One cargo process at a time, foreground.

## The task (plan Task 4, Steps 1–4) with these rulings

### Step 1: Failing tests on `math::parse` — L3-R9 rewrites the plan's Step 1 verbatim
Plan lines 301 (expected message) and the `[("k", 9.81)].into()` fixture do not compile/match
landed code (G4.2, G4.3) — write these instead:

**Ruling (lead, R20) — L3-R9.**
- `parse_with_constants("k * 2", &HashMap::from([("k".to_string(), 9.81)])) — evaluates the
  bare identifier "k" as a literal 9.81` (assert on the produced `Ast`, mirroring how the
  existing `constant_value` universal-four test already asserts).
- `parse_with_constants("pi * 2", &HashMap::from([("pi".to_string(), 1.0)])) —
  parse_with_constants trusts its caller already excluded the universal four from the table,
  so this call succeeds using the parser's own built-in pi` — document this precondition in
  the function's doc comment; `merge_constants` (Step 3) is the actual enforcement point, this
  function has no opinion on reserved names.
- `parse_with_constants("nope * 2", &HashMap::new()) — err` where
  `err.kind == MathEvalErrorKind::Parse` and
  `err.message.contains("Unexpected identifier \"nope\"")` (substring — do not re-transcribe
  the full landed message, `parse.rs:255`'s `"Unexpected identifier \"{name}\" — did you mean
  [{name}] for a channel reference?"`, which is not this task's to change).

### Step 2: Implement `parse_with_constants`
Thread the constants table through `Parser` (add a field, e.g. `constants: &'a HashMap<String,
f64>`, or an equivalent — your call) so `parse_primary` (the `if let Some(value) =
constant_value(&name) { ... }` fallback at `parse.rs:251-253`, immediately before the
`Unexpected identifier` error at 254-256) gains one more fallback in between: a table lookup
against the threaded constants map, checked *after* `constant_value` (universal four keep
precedence — they're checked first already) and *before* the error. Keep `parse()` (line 71)
as a zero-constants call into the same underlying function — construct it with an empty map —
so no existing caller's behaviour changes. Add `parse(expr) == parse_with_constants(expr,
&HashMap::new())` as a test (`HashMap::new()` does not allocate; this is a free equivalence
check, not a perf concern).

### Step 3: `merge_constants` and full `ReservedName`/`DuplicateConstant` enforcement

**Signature, corrected from the plan.** Per L3-R2 (Task 2), `merge_constants` takes Task 3's
`ConstLine` struct, not a 4-tuple:
`merge_constants(front_matter: &HashMap<String, ConstantRaw>, const_lines: &[ConstLine]) ->
(HashMap<String, f64>, Vec<WorkbookError>)`. For a `ConstantRaw::Number(v)` the value is `v`;
for `ConstantRaw::WithUnit { value, .. }` the value is `value` — `unit_display` is display
metadata only (C2 §3.1), never consulted here.

**Ruling (lead, R20) — L3-R10.** `merge_constants` is the **single enforcement point** for the
full C2 §3.5.A `ReservedName` set — Task 2's `RESERVED_NAMES` (15 entries: `const`, the four
universal constants, the eight host vars, and `Time`/`Distance` per the R20 widening) —
applied to **both** sources (front matter and `const` lines), case-sensitive, before the
merged table is returned; a reserved name is reported (Task 2's `ReservedName` constructor,
`cell_id` = `"front-matter"` for a front-matter constant, the line's own cell id for a `const`
line) and **not** merged, so `parse_with_constants` never sees one. Import `RESERVED_NAMES`
from `error.rs` — do not redeclare it (closes G4.4: the plan's own Step 3 text under-enforces,
checking only `pi`/`tau`/`e`/`g`; the full set is what C2 §3.5.A actually requires and what
Task 2 built the constant for). Its doc comment states the precondition, and that
`identifier`-shape restriction (Task 3) applies to `const`-line names only, while
`ReservedName` applies to both sources.

Build the flat table: front-matter constants first, then `const` lines (order doesn't matter
for the final map, but duplicate detection must see both sources) — a name appearing in both,
or twice within `const` lines, is `DuplicateConstant` (Task 2's constructor); a name in
`RESERVED_NAMES` from *either* source is `ReservedName`, not silently shadowed and not merged.

**Front-matter constants with spaces (G4.5 — document, don't "fix").** C2 §3.1 and the test
below correctly allow a spaced front-matter constant name (`"rider mass"`) into the merged
table — that's correct, do not reject it. But note in `merge_constants`'s doc comment that
such a name is **only reachable from the JS `constants` object** (`constants["rider mass"]`,
C2 §5.1) — the math-cell tokenizer cannot produce a spaced bare identifier, so
`parse_with_constants` can never resolve it via `[Name]`-free substitution. This is expected,
not a bug this task fixes; state it so the next reader doesn't rediscover it as one.

Tests: `same name in front matter and a const line — DuplicateConstant`; `two const lines
named "k" — DuplicateConstant, second occurrence reported`; `front-matter constant named "g"
— ReservedName, not merged into the table`; `front-matter constant named "session" —
ReservedName, not merged` (L3-R10's explicit host-var-collision test); `front-matter constant
named "const" — ReservedName`; `constant name with a space (front matter only) — allowed,
present in the table`.

### Step 4: Test and commit
Run both L3-R8 filters above (each non-zero `passed`, `0 failed`), then
`cargo check -p idl-rs-cli --tests` (must succeed — this task's first touch of a `pub` core
module reaching outside `workbook/v3`). Commit with explicit paths (NOT `git add -A`):
`git add core/src/workbook/v3/constants.rs core/src/workbook/v3/mod.rs core/src/math/parse.rs` —
message `workbook: v3 constants merge, universal-constant guard, math::parse::parse_with_constants (C2 §3.1-3.2)`.
Single line, no AI attribution trailer.

## Do not
- Do not run the plan's literal Step 4 command (`cargo test -p idl-rs
  "constants|parse_with_constants"`) as your gate — it is a substring filter matching no test
  name, `0 passed; 0 failed` would pass silently (G4.1). Use L3-R8's two runs instead.
- Do not enforce `ReservedName` with only `pi`/`tau`/`e`/`g` (plan line 309's literal text) —
  use the full 15-name `RESERVED_NAMES` from Task 2 (G4.4, L3-R10).
- Do not add a `regex` crate or any new dependency here — `merge_constants` is a `HashMap`
  walk, `parse_with_constants` is a parser-internal change.

## Style / hygiene
Doc comment on every public symbol; units where numeric (constant values are unitless scalars
— `unit_display` is metadata only, say so); typed errors only; A/A/A tests named `thing —
condition — result`; match surrounding hand-formatted style (`math/parse.rs`'s existing style
for Step 2; Task 2/3's `workbook/v3` style for Step 3).

## Spec discipline (say it out loud in your report)
"no spec change needed" — C2 §3.1, §3.2 are exact.

## Report back (concise)
Commit hash + `git show --stat`; both L3-R8 test commands and their result lines (with
`passed` counts) plus the `cargo check -p idl-rs-cli --tests` result; per-step done/deviated;
confirmation `RESERVED_NAMES` was imported, not redeclared; anything ambiguous in C2 §3.1–3.2
you resolved (say how) or that needs a lead ruling (stop and report instead of guessing —
CLAUDE.md §1).
