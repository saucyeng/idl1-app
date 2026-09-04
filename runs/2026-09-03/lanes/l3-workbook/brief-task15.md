# L3 Task 15 — implementer brief (done-when proofs: evaluator parity and tile-vs-decimation)

You are the implementer for L3 Task 15 of the idl1 rewrite — the lane's
done-criteria proof task. Tests only, no production behaviour. TDD, one commit,
then report.

## Scope change you must read first (ruling R30)

**Ruling R30 (`runs/2026-09-03/decisions.md:1733-1743`) cut Task 13
(`migrate-workbook`) from wave 1.** `migrate_workbook_text`, `MigrationReport`,
`MigrationReport.identifier_by_v2_id` (L3-R36) and the `_migrate_math` front-matter
key **do not exist and will not exist in this lane**. The plan's Task 15 Step 1
(plan 1130–1152) and the pre-read's L3-R41 are both written entirely on top of
them, and are therefore **not executable as written**.

Step 1 below replaces the v2-vs-v3 migration-parity test with a **v3-vs-direct-evaluator
parity test**: the same numerical proof (the v3 cell pipeline returns the engine's
numbers, bit-for-bit, not new ones), with the migration arm scoped out. Step 2
(tile stats vs. decimation) is unaffected by R30 and stands.

**Step 1 is PROVISIONAL** pending the lead's answer to Q5 in
`runs/2026-09-03/lanes/l3-workbook/questions.md` (whether this substitute proof
is accepted as satisfying the lane's Done-when (1), whose text names migration).
Build it as written; if Q5 comes back differently, only this test's framing changes.

## Where
- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
  branch `wave1-l3-workbook`, HEAD must be the commit of the preceding task (given
  in the dispatch message — the task before this one is **not** Task 13, which is
  cut; expect Task 12 or Task 14), status clean. Verify first; if not, stop and
  report. The worktree inherits `.cargo/config.toml` (shared target-dir) — leave it alone.
- Work ONLY there. Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  (shared checkout), `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` beyond READING the
  files named below, or any other worktree. Do NOT edit anything under `docs/`. Do NOT push.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the L3 plan
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\plans\2026-09-03-idl1-wave1-l3-workbook.md`
  — Global Constraints (41–135), `### Task 15` (1124–1172, superseded in the two ways
  named above and below); the pre-read
  `runs\2026-09-03\lanes\l3-workbook\pre-read-tasks10-16.md`, Task 15 section
  (G15.1–G15.6, L3-R41); ledger `runs\2026-09-03\decisions.md` — **R30** (migration cut),
  R25 (L3-R28…R42 approved; tile layout **v2**), R31 (cursor `null` outside the recorded
  span), R21 (L3-R25's `CellEvalResult` shape). Landed code you will build on, verified
  in this worktree at `f7c757b`:
  - `core/src/session/handle.rs:243` — `SessionHandle::from_channels(meta: SessionMetaInput,
    channels: Vec<ChannelInput>) -> Self`; `ChannelInput` at `handle.rs:80-91` is
    `{ channel_id, sample_rate_hz, samples, t_us, source_kind }` with the documented
    invariant `t_us.len() == samples.len()`; `SessionMetaInput` at `handle.rs:65-75`; the
    existing test constructor pattern is `test_meta()` at `handle.rs:1019-1026`.
  - `core/src/session/handle.rs:923` — `impl ChannelLookup for SessionHandle`, so a
    `SessionHandle` is passed directly as the `&dyn ChannelLookup`.
  - `core/src/session/handle.rs:323` — `pub fn channel_samples(&self, channel_id: &str) -> Vec<f64>`.
  - `core/src/math/eval.rs:235` — `pub fn evaluate(expression, lookup, lap_ctx) -> Result<EvalOutput, MathEvalError>`;
    `eval.rs:250` — `evaluate_with_constants(expression, constants: &HashMap<String, f64>, lookup, lap_ctx)`;
    `EvalOutput` at `eval.rs:216-226` is `{ samples: Vec<f64>, sample_rate_hz: f64, t_us: Vec<i64> }`,
    `t_us` **empty for a scalar result or a channel with no established axis** (L3-R12).
  - `core/src/workbook/v3/mod.rs:136` — `pub fn parse_workbook(markdown: &str) ->
    Result<(WorkbookDoc, Vec<WorkbookError>), Vec<WorkbookError>>`; `WorkbookDoc` (same file)
    carries `constants: HashMap<String, f64>` (the merged flat table), `defs: Vec<MathCellDef>`,
    `cells: Vec<CellDoc>`.
  - `core/src/workbook/v3/host.rs:30-42` — `HostChannel { length: usize, t: Vec<f64>, v: Vec<f64> }`,
    `length == v.len()` always, `t` in **seconds**, `t` **empty** for a scalar/table-sourced
    result (L3-R21).
  - `core/src/chart_decimation.rs:66` — `pub fn decimate_channel(samples: &[f64], tier: u32,
    tile_index: u32) -> Vec<f64>`, interleaved `[min, max, …]`, `TILE_SIZE_BUCKETS = 1024`
    (`chart_decimation.rs:10`), `TIER_BASE = 8` (`chart_decimation.rs:7`).
  - Test-module naming precedent: `core/src/math/tests_parity.rs`, registered at
    `core/src/math/mod.rs:26-28` as `#[cfg(test)] mod tests_parity;`.

  **Not landed at the time this brief was written (HEAD `f7c757b` = Task 8) — verify
  before building on this, and stop and report if what you find differs:**
  - Task 9's `eval_cells(doc: &WorkbookDoc, structural: &[WorkbookError], lookup: &dyn
    ChannelLookup, lap_ctx: &MathLapContext) -> Vec<CellEvalResult>` and the L3-R25 shapes
    `CellEvalResult { cell_id, kind, defs: Vec<CellDefResult>, errors: Vec<CellError> }`,
    `CellDefResult { name, label, value: Option<HostChannel>, error: Option<MathEvalError> }`
    (spec'd in `brief-task9.md:52-70`; **there is no `CellEvalResult.host_value`** — G15.2).
  - Task 10's `core/src/tile.rs`: `build_tile_bytes(samples: &[f64], t_us: &[i64], tier: u32,
    tile_index: u32, column_count: u32) -> Vec<u8>` and `column_stats` / `column_times_us`
    (spec'd in `brief-task10.md:88-92`), tile layout **version 2** per R25. Read the module
    as landed and take its header/offset constants from it — **do not hardcode byte offsets
    from this brief or from the plan.**

## COMPUTE RULES — non-negotiable
This machine is memory-bound (cargo is capped machine-wide; do not override). **The plan's
Step 3 (`cargo test --workspace`, plan 1168) is forbidden** — R13(c)/L3-R27, and the lane's
one full run belongs to Task 16 Step 0 (L3-R42). Run exactly one filter this task:

    cargo test -p idl-rs workbook::v3::tests_pipeline

It must report a non-zero `passed` count and `0 failed` (a filter matching nothing is a
failed gate, L3-R8). No full suite, no `--workspace`, no tarpaulin, no `-j`, no separate
`cargo build`/`cargo check` (this task adds no `pub` symbol and changes no signature), no
`.cargo/` edits, never `cargo fmt`. One cargo process at a time, foreground — wait for it
to finish before starting any other cargo command, background or not.

## The task (plan Task 15, Steps 1–2, with R30 and L3-R41 applied)

New file `core/src/workbook/v3/tests_pipeline.rs`, registered in
`core/src/workbook/v3/mod.rs` as `#[cfg(test)] mod tests_pipeline;` — mirroring
`math/mod.rs:26-28`. Both tests live there (the plan's "add tests to `workbook/migrate.rs`
… and `tile.rs`" no longer applies: there is no `migrate.rs`, and Task 10 already owns
`tile.rs`'s unit-level cross-check, `brief-task10.md` Step 4).

### Step 1: v3 pipeline vs. the bare evaluator, bit-for-bit (PROVISIONAL — Q5)

Test fn: `workbook_v3_pipeline_values_match_a_direct_evaluate_bit_for_bit`.
Doc comment carries the A/A/A name: *"v3 cell pipeline — four definitions over a synthetic
session — every value equals a direct `evaluate` on the inlined expression, bit-for-bit."*

**Arrange.** One synthetic `SessionHandle` via `from_channels` (`handle.rs:243`) with two
channels carrying **explicit, non-uniform `t_us`** (do not synthesize a uniform axis — the
point is that the recorded axis survives). One inline v3 Markdown document (`version: 3`,
a UUIDv4 `id`, a front-matter `constants` entry) with a single `math` cell holding four
definitions, per L3-R41 minus its migration-only fixture item:
1. plain arithmetic over one base channel;
2. a `[Name]` cross-reference to definition 1;
3. one using a front-matter constant (this is the **v3-only** case — SPEC:1793 records that
   idl0 inlined user constants as numeric literals, so there is no v2 arm to compare against
   and none is attempted, G15.1);
4. a scalar, `avg = mean([X])`, to exercise the axis-less case (L3-R12/L3-R21).

**Act.** Path A: `parse_workbook(md)` → `eval_cells(&doc, &structural, &handle, &lap_ctx)`
→ read each value from `defs[i].value` (**not** `host_value`, G15.2), matched by
`CellDefResult.name` — the definitions' identifiers are the match key now that
`MigrationReport.identifier_by_v2_id` does not exist (R30).
Path B: for each definition, call `math::eval::evaluate_with_constants` **directly against
the bare `SessionHandle`**, on an expression written with any `[Name]` cross-reference
**textually inlined** (definition 2's expression with definition 1's expression substituted).
Inlining is what makes path B independent — calling `resolve_workbook_defs` would just be
path A again. State that in the test's doc comment.

**Assert**, per definition:
- `value.v == direct.samples` **bit-for-bit** (`f64` equality, not epsilon; compare NaN via
  `is_nan()` on both sides, never `==`);
- `value.length == value.v.len()` (L3-R21);
- `value.t.len() ∈ {0, value.length}`, and `0` **only** for definition 4, the scalar (G15.4 —
  the plan's `t.len() == samples.len()` is wrong for every axis-less result);
- for definitions 1–3, `value.t[i] == direct.t_us[i] as f64 / 1e6` for every `i` (the µs→s
  conversion is the only transform between the two paths).

Scope the parity claim in the doc comment: *identical `f64` samples out of the same evaluator
on the same inputs* — the constants table and the `t_us` axis are new information, not parity
regressions.

### Step 2: tile stats from a real evaluated math cell vs. `decimate_channel`

Test fn: `tile_built_from_an_evaluated_math_cell_matches_decimate_channel_directly`
(the plan's name, kept). Doc comment A/A/A name: *"tile bytes — built from an evaluated
math-cell result — sample region equals `decimate_channel` cast to `f32`, element-for-element."*

Take Step 1's **channel-valued** definition (definition 1 — never the scalar; its `t_us` is
empty and a tile has no axis to write), run its `(v, t_us)` through
`tile::build_tile_bytes(...)` as Task 10 landed it, decode the sample region back out as
`f32` LE, and assert it equals `decimate_channel(&v, tier, tile_index)` cast to `f32`,
element-for-element (NaN-aware). Read the header field widths and the sample-region offset
from the landed `tile.rs`/its constants — **do not hardcode offsets from this brief.** One
tier/tile_index pair is enough; `tier = 0, tile_index = 0`.

This is the integration-level pass Task 10 Step 4 promised at the unit level, on a real
evaluated result rather than a hand-built array; do not duplicate Task 10's own cross-check.

### Step 3: Test and commit
Run the one filter above; expect non-zero `passed`, `0 failed`. Commit with explicit paths
(NOT `git add -A`): `git add core/src/workbook/v3/tests_pipeline.rs core/src/workbook/v3/mod.rs`
— message `test: v3 pipeline parity against the direct evaluator, and tile bytes from an
evaluated math cell (L3 done-criteria)`. Single line, no AI attribution trailer.

## Do not
- Do not write, import or reference `migrate_workbook_text`, `MigrationReport`,
  `identifier_by_v2_id` or `_migrate_math` — Task 13 is cut (R30). If you find yourself
  needing any of them, stop and report.
- Do not run `cargo test --workspace` (plan 1168) — forbidden by R13(c)/L3-R27; the lane's
  single full run is Task 16 Step 0.
- Do not read values from `CellEvalResult.host_value` (plan 1142) — it does not exist;
  values are at `defs[i].value` (L3-R25, G15.2).
- Do not assert `t.len() == samples.len()` unconditionally (plan 1148) — it is false for the
  scalar definition (G15.4).
- Do not build a v2 arm for the constant-using definition (G15.1) — no v2 file references a
  user constant, and today's `evaluate` resolves only `g/pi/tau/e` without a constants table.
- Do not add production code, change any `pub` signature, or "fix" anything you find failing
  in Tasks 9–12's landed code — a failure here is a real finding: stop and report it.
- Do not hardcode tile byte offsets — read them from the landed `tile.rs`.

## Style / hygiene
Arrange / Act / Assert with blank lines between; test doc comments carry the
`thing — condition — result` name; units on every numeric value (`t` in seconds, `t_us` in
µs — state which at the one conversion site); match surrounding hand-formatted style; no
`cargo fmt`.

## Spec discipline (say it out loud in your report)
"no spec change needed" — this task only tests prior work. The lane's Done-when (1) wording
(which still names migration) is Task 16's to restate, and is parked on Q5.

## Report back (concise)
Commit hash + `git show --stat`; the one test command and its result line (with the `passed`
count); per-step done/deviated; confirmation both test fns exist by name; confirmation the
`t.len() ∈ {0, length}` assertion holds with `0` only for the scalar; confirmation nothing
migration-related was referenced; the actual `eval_cells`/`build_tile_bytes` signatures you
found (this brief was written before they landed) and any deviation they forced; anything
ambiguous you resolved (say how) or that needs a lead ruling (stop and report instead of
guessing — CLAUDE.md §1).
