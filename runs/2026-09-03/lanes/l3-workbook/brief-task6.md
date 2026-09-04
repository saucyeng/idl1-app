# L3 Task 6 — implementer brief (cross-cell resolver; C2 §2.4)

You are the implementer for L3 Task 6 of the idl1 rewrite — the sixth task of
the core workbook-v3 lane. TDD, one commit, then report.

## Where
- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
  branch `wave1-l3-workbook`, HEAD must be the commit of Task 5 (given in the
  dispatch message), status clean. Verify first; if not, stop and report. The
  worktree inherits `.cargo/config.toml` (shared target-dir) — leave it alone.
- Work ONLY there. Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  (shared checkout), `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` beyond READING the
  files named below, or any other worktree. Do NOT edit anything under `docs/`. Do NOT push.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the L3 plan
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\plans\2026-09-03-idl1-wave1-l3-workbook.md`
  — Global Constraints (41–135), `### Task 6` (433–471); contract C2
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\specs\2026-09-03-idl1-c2-workbook-v3.md`
  §2.4 (flat namespace), §3.5.B (evaluation-time errors, `MathEvalErrorKind`); the pre-read
  `runs\2026-09-03\lanes\l3-workbook\pre-read-tasks6-9.md`, Task 6 section (G6.1–G6.6,
  L3-R16–R18); ledger `R21` in `runs\2026-09-03\decisions.md` ("L3 Tasks 6–9 pre-read
  adjudicated" — approves L3-R16–R18 as drafted, plus the required self-reference test added
  to L3-R18); Task 5's landed `core/src/math/eval.rs` (`LookupChannel{samples: Arc<[f64]>,
  sample_rate_hz, t_us: Arc<[i64]>}`, `EvalOutput{samples: Vec<f64>, sample_rate_hz, t_us:
  Vec<i64>}`, `ChannelLookup`, `MathLapContext`, private `MemoLookup` at `eval.rs:81`,
  `evaluate`/`eval` at `eval.rs:206`/`254`) and `core/src/math/resolve.rs` (`channel_refs` —
  already `pub(crate)`, `resolve.rs:23`; `resolve_dependencies`'s "best-effort, swallowed"
  contract, which this task deliberately does not reuse); `core/src/session/handle.rs:908-915`
  (`SessionHandle::lookup`'s "base wins over math store" precedent — this task's overlay
  deliberately inverts it); the landed `workbook/v3/error.rs` (Task 2), `math_cell.rs`+`mod.rs`
  (Task 3 — `ConstLine`, `MathCellLine::Def{name, expr_text, label}`), `constants.rs`+`mod.rs`
  (Task 4 — `merge_constants`).

## COMPUTE RULES — non-negotiable
This machine is memory-bound (cargo is capped at 2 jobs machine-wide; do not override). The
ONLY cargo build/test commands you run, as few times as TDD needs:
`cargo test -p idl-rs workbook::v3::resolve` and `cargo test -p idl-rs math::eval` (L3-R17
touches `math/eval.rs`). Every run must report a non-zero `passed` count — a targeted filter
that matches nothing is a failed gate, not a pass (standing rule, ledger R20/R21). No full
suite, no tarpaulin, no `-j`, no separate `cargo build`/`cargo check` (not required this task —
no existing `pub` signature reaching `idl-rs-cli` changes), no `.cargo/` edits, never
`cargo fmt`. One cargo process at a time, foreground.

## The task (plan Task 6, Steps 1–3) with these rulings
Plan 439's interface (`defs: &HashMap<String, MathCellDef>`) does not compile — `MathCellDef`
doesn't exist yet, and a `HashMap` loses the document order Task 9 needs (G6.1). Plan 452
routes through `parse_with_constants` + `eval` by hand, bypassing the private `MemoLookup`
(G6.3) — never do this; call `evaluate_with_constants` (below) instead.

**Step 0 (not in the plan's numbered steps) — wire `MathCellDef`/`WorkbookDoc.defs`/`.constants`.**

**Ruling (lead, R21) — L3-R16.** Define `pub struct MathCellDef { pub cell_id: String,
pub name: String, pub expr_text: String, pub label: Option<String>, pub order: usize }` in
`workbook/v3/mod.rs` beside `ConstLine`. `parse_workbook` populates two new `WorkbookDoc`
fields: `pub defs: Vec<MathCellDef>` (document order, then `def_line` order within a cell —
`order` is the index) and `pub constants: HashMap<String, f64>` (`merge_constants`' output).
Task 6 takes `&[MathCellDef]`, not a `HashMap`; it builds its own name index internally.

Add `MathCellDef` to `mod.rs`; extend `parse_workbook`'s existing per-cell math-body flatten
(Task 3 Step 2) to also collect every `Def` into a `MathCellDef` (cell_id, name, expr_text,
label, `order` = its index within its own cell's `Def` lines), appended to `WorkbookDoc.defs` in
document-cell order. Task 4's `merge_constants` call already runs inside `parse_workbook` and
collects its `Vec<WorkbookError>` half — this step captures the other half (its
`HashMap<String, f64>`) and stores it on `WorkbookDoc.constants`; do not call `merge_constants`
a second time.

**Ruling (lead, R21) — L3-R17.** Corrected signature:
`resolve_workbook_defs(defs: &[MathCellDef], constants: &HashMap<String, f64>,
lookup: &dyn ChannelLookup, lap_ctx: &MathLapContext) -> HashMap<String, Result<EvalOutput,
MathEvalError>>`. To keep memoization, `math/eval.rs` gains
`pub fn evaluate_with_constants(expression: &str, constants: &HashMap<String, f64>,
lookup: &dyn ChannelLookup, lap_ctx: &MathLapContext) -> Result<EvalOutput, MathEvalError>`
and `evaluate` becomes a zero-constants call to it — additive, exactly mirroring Task 4's
`parse`/`parse_with_constants` equivalence, with the same equivalence test:
`evaluate(expr, lookup, lap_ctx) == evaluate_with_constants(expr, &HashMap::new(), lookup,
lap_ctx)`. Task 6 calls `evaluate_with_constants`, never `parse` + `eval` by hand.

### Step 1: Topological order + cycle detection
Build a dependency graph over `defs` via `channel_refs` (`resolve.rs:23`, already `pub(crate)`
— use as-is, G6.6, the plan's "promote visibility" instruction is a no-op) filtered to names
present in `defs`. Kahn's or fixed-point iteration, implementer's choice — no dedicated cycle
error kind exists in C2 §3.5.A (confirmed absent); a leftover/cyclic member is
`MathEvalErrorKind::UnknownChannel` naming the unresolved dependency, falling out naturally.

**Ruling (lead, R21) — L3-R18, widened.** (a) **Definitions win over session channels** —
L3-R7's direction stands; its now-impossible `Time` test is replaced by
`definition named after a base channel — the definition's value is returned, not the base
channel's`, and the module doc states this deliberately inverts `SessionHandle::lookup`'s
base-wins precedence (`handle.rs:909-910`) because in v3 the document is the source of truth.
(b) The overlay converts each resolved `EvalOutput.t_us` into an `Arc<[i64]>` **once**, when it
is inserted, and clones the `Arc` per lookup — never the `Vec`. (c) Leftovers after the fixed
point (cycle members, dependents of a failed def) get `MathEvalErrorKind::UnknownChannel`, per
plan 445, with the message naming the unresolved dependency. **R21 addition:** because
definitions win over session channels, a definition named after a base channel that
*references itself* (`IMU0_AccelZ = [IMU0_AccelZ] * 9.81`) is a cycle and must surface as the
leftover `UnknownChannel` error naming the unresolved dependency — never an infinite loop, never
a silent read of the base channel. One test is required for this.

Tests: `A depends on B, B depends on A — both report UnknownChannel, no panic, no infinite
loop`; `A depends on B depends on C (no cycle) — resolves in one pass, C before B before A`;
**required**: `def_line "IMU0_AccelZ = [IMU0_AccelZ] * 9.81" — self-reference against a base
channel of the same name is a cycle — leftover UnknownChannel naming IMU0_AccelZ, never loops,
never reads the base channel`; `definition named after a base channel — the definition's value
is returned, not the base channel's`.

### Step 2: Memoized deps-first evaluation
Call `evaluate_with_constants` only (never `parse`+`eval` by hand, G6.3). Layer `defs`' own
resolved results *over* `lookup` per L3-R18(a). Store every definition's result (`Ok` or `Err`)
regardless of whether anything else references it (the behavioral difference from
`resolve_dependencies` that justifies this being a new function).

Tests: `three independent definitions, none referencing each other — all three resolve`; `one
definition's expression has a Parse error — its own entry is Err(Parse), sibling definitions
still resolve`; `definition referencing a base session channel not in defs — falls through to
lookup as today's v2 resolver does`.

### Step 3: Test and commit
Run both filters, expect non-zero `passed`, `0 failed` each. Commit with explicit paths (NOT
`git add -A`): `git add core/src/workbook/v3/resolve.rs core/src/workbook/v3/mod.rs
core/src/math/eval.rs` — message `workbook: v3 flat-namespace resolver, deps-first,
per-definition results never swallowed (C2 §2.4)`. Single line, no AI attribution trailer.

## Do not
- Do not type `defs` as `HashMap<String, MathCellDef>` (plan line 439) — `&[MathCellDef]` per
  L3-R16/17; a `HashMap` loses the document order Task 9 needs.
- Do not call `parse_with_constants` + `eval` by hand (plan line 452) — call
  `evaluate_with_constants` only; it is the one function that wraps `MemoLookup` (G6.3).
- Do not attempt to change `channel_refs`'s visibility — it is already `pub(crate)` (G6.6).
- Do not write L3-R7's original "definition named Time shadows the synthesized Time channel —
  documented, deterministic" test — `Time`/`Distance` are `ReservedName` and never reach this
  function. Write the two tests named in L3-R18 above instead.
- Do not invent a new `WorkbookErrorKind` for a cycle — a leftover member is the existing
  `MathEvalErrorKind::UnknownChannel`, nothing new.
- Do not clone `EvalOutput.t_us`'s `Vec<i64>` per lookup — convert to `Arc<[i64]>` once at
  insertion (L3-R18b).

## Style / hygiene
Doc comment on every public symbol; units where numeric (`t_us` in µs, `sample_rate_hz` in Hz —
state it); typed errors only; A/A/A tests named `thing — condition — result`; match surrounding
hand-formatted style.

## Spec discipline (say it out loud in your report)
"no spec change needed" — C2 §2.4, design §4's reactive DAG. Contract deltas from this batch
are the lead's ledger-R21-owned amendment list; this task codes ruled behaviour, it does not
touch C2 or C3.

## Report back (concise)
Commit hash + `git show --stat`; both test commands and result lines (with `passed` counts);
per-step done/deviated, including Step 0; confirmation `evaluate`'s behavior is unchanged (the
equivalence test result); confirmation the required self-reference test is present and named;
confirmation `WorkbookDoc.defs`/`.constants` are populated in document order; anything ambiguous
you resolved (say how) or that needs a lead ruling (stop and report instead of guessing —
CLAUDE.md §1).
