# idl-rs builtin registry — phase 1

Status: approved in principle by Isaac (2026-11-12: "I like the extensibility change").
Phase 1 below is a refactor with no behaviour change. Phase 2 (public registration by
outsiders) is a public API decision and is NOT designed here; see "Open questions".

## Problem

Math builtins live in three hand-synced places:

1. `math/eval.rs` `call_function` — a ~810-line `match name { ... }` (eval.rs:1594-2404).
2. `math/catalog.rs` — 1,145 lines of metadata (`MathBuiltin`), hand-transcribed because the
   match "has no attached metadata to extract".
3. `KWARG_AWARE_FUNCTIONS` (eval.rs:1495) — a third list of names.

Nothing checks that a builtin's arity or kwargs in the catalog match its arm. The catalog is
the source of the CI-gated `WORKBOOK-REFERENCE.md` and `functionCatalog.json`.

## Phase 1 design

One static table, `math::registry`, replaces the match and the catalog.

```rust
/// What a builtin's evaluator receives.
pub(crate) struct Call<'a> {
    pub name: &'a str,              // the spelling used (cumtrapz vs cumulative_trapezoid)
    pub args: Vec<Value>,           // evaluated eagerly, owned (arms consume them)
    pub kwargs: &'a Kwargs,
    pub lookup: &'a dyn ChannelLookup,
    pub lap_ctx: &'a MathLapContext,
}

pub(crate) type EvalFn = fn(Call<'_>) -> Result<Value, MathEvalError>;

/// One builtin spelling: the catalog metadata it already had, plus its evaluator.
pub struct Builtin {
    /* every existing `MathBuiltin` field, unchanged */
    pub kwargs: &'static [&'static str],   // replaces KWARG_AWARE_FUNCTIONS
    pub documented: bool,                  // false only for `main` (table-cell only)
    pub(crate) eval: EvalFn,
}
```

Rules:

- **One entry per spelling**, in today's catalog order (the Markdown reference depends on
  order; the JSON is name-sorted). Spellings that share an arm today (`cumtrapz` /
  `cumulative_trapezoid`, `gradient` / `differentiate`, the four estimator names, the five
  not-implemented names) share one `EvalFn`, which may branch on `call.name` as the arm does now.
- **Arm bodies move verbatim** into named `fn`s grouped by module (elementwise, vector, channel
  DSP, windowed aggregates, laps, estimator). Each keeps its own argument checks, so every error
  kind and message stays identical. No central arity enforcement in phase 1.
- The one-line trig family may use a small `macro_rules!` to stay one line per builtin.
- `call_function` stays as a thin shim (look up the entry by name, check kwargs from
  `entry.kwargs`, call `entry.eval`; unknown name -> the existing `unknown_function_error`), so
  its tests and the `Ast::Call` caller are unchanged.
- `math_builtin_catalog()` keeps its signature for its consumers (docs.rs, the bridge's
  `list_math_builtins`, tests) and returns the documented entries; `MathBuiltin` becomes a
  type alias or the same struct. `catalog.rs` is deleted.
- `units.rs` `function_unit_rule` (a fourth per-name table) is unchanged in phase 1; its
  completeness test now walks the registry. Folding it in is phase 1b (needs a typed rule whose
  Display reproduces today's strings byte for byte).

## Acceptance

- `docs workbook`, `docs workbook --json`, `docs cli` regenerate with EMPTY diffs.
- All existing math tests pass unchanged (CI); new test: every registry entry's `kwargs` is the
  set its evaluator accepts, every name resolves, no duplicate spellings.
- Net lines: expected ~2,000 -> ~1,600 across eval.rs + catalog.rs.

## Open questions (Isaac)

1. **Phase 2, outsider registration:** compile-time only (a downstream crate builds its own
   table and passes it to `evaluate`) or runtime (a global `register()`)? Either way the CI-gated
   docs list only idl-rs's own builtins. Not needed for phase 1.
