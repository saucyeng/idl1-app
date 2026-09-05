# L8w Task 12b — implementer brief (`list_math_builtins`, C3 §3.4 — added by the lead, spec-during)

You are the implementer for L8w Task 12b, added by the lead after Task 12
and before wrap-up (Task 14): a thin `list_math_builtins() -> {name, arity,
unit_rule}[]` command over the math builtin catalog `rust/core/src/math/
eval.rs` owns. **This task is spec-during** — C3 §3.4 gains a new entry in
the same change. TDD, ONE commit, then report.

## GATE — same as every L8w task; verify before opening the worktree

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. If either fails, STOP and report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`
  (rust) for the command/catalog code.
- **C3 edit** goes in the idl1-app worktree:
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l8w-write-amendment`
  — `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` only, adding
  a new `list_math_builtins` entry under §3.4 (Workbook group).
- Do NOT push either worktree.
- **Files:** create a small catalog module (e.g.
  `rust/core/src/math/catalog.rs` — implementer's call, document why);
  modify `rust/tauri/src/commands/workbook.rs`, `rust/tauri/src/lib.rs`;
  modify `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` (app
  worktree).

- Read first: `CLAUDE.md`; the plan's "Added by the lead 2026-09-05
  (tracked note: math builtin catalog)" section at the very end of
  `docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`
  (quoted below); `docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`
  §3.3 ("Builtin catalog") **in full** — this is C2's own signed table of
  every builtin, and per its own text (see the flagged gap below) names
  `rust/core/src/math/eval.rs`'s `call_function` dispatch as its source of
  truth; `rust/core/src/math/eval.rs`'s `call_function` (the big `match
  name { ... }` starting ~line 743) **in full** — this is the only existing
  "catalog" in Rust, and it is a dispatch `match`, not a data table: there
  is **no existing `pub` struct/array anywhere in `core` carrying a
  name→arity or name→unit-rule mapping** (confirmed:
  `grep -rn "arity\|unit_rule\|FunctionInfo\|BUILTIN" rust/core/src/math`
  has no hits besides this brief) — verify this yourself before assuming
  otherwise; the L6 worktree's transcribed catalog,
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook\app\src\routes\pages\Notebook\model\functionCatalog.ts`
  (read-only) — **its `CatalogEntry` shape is `{name, signature, category,
  status}`, not `{name, arity, unit_rule}`** (confirmed by reading the
  file). Neither the Rust source nor the existing TS transcription has an
  `arity`/`unit_rule` field anywhere today — see "A real gap" below.

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; never override
with `-j`). While working: `cargo test -p idl-rs list_math_builtins`
(core) and `cargo test -p idl-rs-tauri
commands::workbook::list_math_builtins` (tauri), foreground, each non-zero
`passed`. No `cargo fmt`, no `cargo tarpaulin`, no `cargo doc`. One cargo
process at a time.

**`pub`-change check:** `cargo check -p idl-rs-cli --tests` (new `pub` core
surface) **and** `cargo check -p idl-rs-tauri`.

## The lead's own task text (quoted in full)

> Additive task for this lane (after Task 12, before wrap-up):
> `list_math_builtins() -> { name, arity, unit_rule }[]` in the C3 §3.4
> workbook group, a thin wrapper over the catalog `rust/core/src/math/eval.rs`
> already owns; C3 amended spec-during. The UI swap (a lead shell task)
> makes `Notebook/model/functionCatalog.ts` verify itself against the
> command once at startup and log a mismatch.

## A real gap — flag this to the lead, do not silently invent a shape

The lead's own wording ("the catalog `rust/core/src/math/eval.rs` already
owns") describes a catalog that, as landed, does **not** exist as data —
`call_function` is a 69-arm `match` with no structured metadata attached
to any arm. Building `{name, arity, unit_rule}[]` from it means **writing
a brand-new data table by hand**, transcribed from C2 §3.3's signed
"Builtin catalog" section (the same source L6's `functionCatalog.ts` was
transcribed from) — not extracting anything mechanically from
`call_function`'s `match` arms.

Two further open points, neither fixable by re-reading the code more
closely (both are shape decisions, not facts to discover):

1. **`arity`'s exact type is unstated.** C2 §3.3's signature column has
   entries like `rms(ch) | rms(ch, w)` (two valid arities for one name) and
   `butter(order, cutoff_hz, "low"|"lowpass"|"high"|"highpass", ch)` (fixed
   at 4). A single `number` can't represent "1 or 2." Implement `arity` as
   `number[]` (the set of valid argument counts for that name, e.g. `[1, 2]`
   for `rms`, `[4]` for `butter`) — this is this brief's own judgment call,
   stated here rather than left for you to guess silently; if you find a
   cleaner shape while implementing, document your reasoning and flag it,
   don't silently pick something else without saying so.
2. **`unit_rule`'s vocabulary is entirely unspecified anywhere** — C2 §3.3
   has no "units" column at all (its columns are Signature/Category/Status
   only, per the L6 transcription's own doc comment, which is the closest
   thing to a rendering of that table available). There is no existing
   Rust or TS artifact naming what a "unit rule" even is for this catalog
   (e.g. "same as first arg", "always dimensionless", "declared per
   function"). **Do not invent a taxonomy.** Implement `unit_rule` as a
   free-form `String` per function, populated with the most defensible
   value you can derive per-function from C2 §3.3's Category column and
   each function's own known physics (e.g. `"abs"`/`"sqrt"` etc. — Elementwise,
   same unit as input; `"fft"` — Frequency, no clean single-unit answer;
   `"integrate"`/`"differentiate"` — unit changes by a time factor) — and
   **flag this whole field's shape as needing a lead ruling** in your
   report, not as a footnote. This is exactly the kind of "a field type…
   is not stated in the design doc, a contract, or the lane's SPEC section"
   case CLAUDE.md §1 says to stop and ask about; implement your best-effort
   version so the command exists and is testable, but say plainly that the
   `unit_rule` string values are a placeholder pending a real ruling on
   what this field means, not treat your choice as final.

## Interfaces

```rust
// core (new module) — hand-transcribed from C2 §3.3, not derived from
// eval.rs's match arms mechanically (no data exists there to derive from).
pub struct MathBuiltin {
    pub name: &'static str,
    pub arity: &'static [u32],
    pub unit_rule: &'static str,
}
pub fn math_builtin_catalog() -> &'static [MathBuiltin];

// tauri/src/commands/workbook.rs
#[derive(serde::Serialize)]
pub struct MathBuiltinDto { pub name: String, pub arity: Vec<u32>, pub unit_rule: String }
#[tauri::command]
pub fn list_math_builtins() -> Vec<MathBuiltinDto>; // never fails, no Result
```
`list_math_builtins` never fails (no device/session/file dependency) —
match `engine_version()`'s existing "no `Result`" precedent (C3 §3.1).

## Key logic

Transcribe every name in C2 §3.3's table (the same 69 entries L6's
`functionCatalog.ts` already transcribed, minus `and`/`or`/`not` — grammar
keywords, not catalog entries per that file's own doc comment — and minus
`main(col[])`, a table-cell-only function C2 §4 documents separately, same
exclusions L6 already made). For each, fill `arity` from C2 §3.3's
Signature column (count the parenthesized arguments per alternative,
`number[]` when a name has more than one valid arity) and `unit_rule` per
the placeholder approach in "A real gap" above. Cross-check your transcribed
count against L6's own 69-entry doc comment before committing — a
mismatched count is a transcription error, not a discrepancy to leave
unexplained.

## Tests

**Core:**
- `math_builtin_catalog().len()` matches the expected 69-entry count (minus
  the 3 grammar/table exclusions already established — assert the exact
  number you land on and say why in a comment).
- Spot-check a handful of known multi-arity entries (`rms`, `mean`, `std`,
  `min`, `max`) have `arity.len() > 1`.
- Spot-check a fixed-arity entry (`butter`) has `arity == [4]`.
- No duplicate `name` entries.

**Tauri:**
- `list_math_builtins()` returns the same count and names as the core
  catalog (a pass-through mapping test, not re-deriving the data).

## The task, in order

- [ ] **Step 1: Confirm the gate**, open/reuse both worktrees.
- [ ] **Step 2: Transcribe the catalog** from C2 §3.3, following L6's own
      69-entry exclusion rules; write it as `&'static [MathBuiltin]` with
      your best-effort `unit_rule` values, flagged as placeholder.
- [ ] **Step 3: Write failing core tests**, confirm the catalog's shape.
- [ ] **Step 4: Implement the tauri wrapper**, write its pass-through test.
- [ ] **Step 5: Register** in `lib.rs`'s `handler()`.
- [ ] **Step 6: Test** — both filters, confirm non-zero `passed` each.
- [ ] **Step 7: `cargo check -p idl-rs-cli --tests` and `cargo check -p
      idl-rs-tauri`**, both clean.
- [ ] **Step 8: Commit, rust worktree** — explicit paths — message
      `core+tauri: list_math_builtins, catalog transcribed from C2 3.3 (spec-during)`.
- [ ] **Step 9: Add C3 §3.4's new entry** in the app worktree — a `##
      list_math_builtins()` block matching this file's existing entry
      style (return shape, errors: none, a note that `unit_rule`'s
      vocabulary is provisional pending a lead ruling), plus a dated
      revision note under the document title per C3 §5.
- [ ] **Step 10: Commit, app worktree** — message
      `docs: C3 3.4 adds list_math_builtins (lead-added L8w Task 12b, unit_rule provisional)`.

## Do not

- Do not present your `unit_rule` values as settled — the brief and your
  commit/report must say plainly this is a best-effort placeholder pending
  a ruling.
- Do not try to derive the catalog mechanically from `call_function`'s
  `match` arms — there is no metadata there to extract; this is a hand
  transcription from C2 §3.3, same as L6's own catalog was.
- Do not touch `functionCatalog.ts` or anything under `app/src/` — the
  self-verification wiring is a lead shell task.
- Do not run `cargo test -p idl-rs -p idl-rs-cli`, `--workspace`, or a bare
  `cargo test`.

## Style / hygiene

Doc comment on every public symbol, explicitly noting the `unit_rule` field
is provisional; A/A/A tests named `thing — condition — result`; no `cargo
fmt` in either worktree.

## Spec discipline (say it out loud in your report)

"Spec-during" — this task adds a new C3 §3.4 entry in the same change that
implements the command, per the lead's own instruction.

## Report back (concise)

Both commit hashes + `git show --stat` for each; both test-filter results
with `passed` counts; both `cargo check` results; the exact entry count you
transcribed and how it reconciles with L6's stated 69; the `arity: number[]`
shape decision, flagged for lead confirmation; the `unit_rule` field's
shape and values, flagged explicitly and prominently as needing a lead
ruling (not buried); the C3 diff you made (paste it); anything else
ambiguous you resolved (say how) or that needs a lead ruling (stop and
report instead of guessing — CLAUDE.md §1).

## Lead ruling 2026-09-05 (R64.2)

Drop `unit_rule`. The wire shape is `{ name: string, arity: number[], status: "implemented" | "not_implemented" }` (C2 section 3.3's 63/6 split). Amend C3 section 3.4 accordingly (spec-during). Arity is transcribed from C2 section 3.3's signatures; a test asserts the name set equals the dispatch table in `math/eval.rs` (derive the list from the same table where possible, never a second hand copy).
