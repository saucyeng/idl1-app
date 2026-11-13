# idl-rs builtin registry, v2: a builtin is a typed Rust function

Status: approved by Isaac in chat, 2026-11-13 ("registry change sounds good"). Supersedes the phase-1 design in
`2026-11-12-idl-rs-builtin-registry.md`; branch `registry-phase1` stays as the fallback until the
prototype below is measured. Isaac (2026-11-13): "yes on the registry … since it's critical
infrastructure, can we think through it properly and ensure this is the most elegant solution?"
and "being able to add any rust scientific computing crate would be huge."

## What phase 1 got wrong

Phase 1 joined the two existing hand-written halves without making either smaller. Each builtin
is still an 11-line metadata block (`catalog.rs`) plus a body that unpacks its own arguments
(`require_arg_count` ×62, `require_channel` ×23, `require_scalar` ×19, …), and the argument
count lives in both. That is why it came out +640 lines. It also gives outsiders a `fn(Call)`
that takes a raw `Vec<Value>`, so every outside function would repeat the same unpacking.

## The design

The Rust signature is the declaration, the way axum declares web handlers.

```rust
/// Zero-phase Butterworth low- or high-pass filter …
fn butter(order: f64, cutoff_hz: f64, kind: &str, ch: Channel) -> Result<Value, MathEvalError> {
    …the body as today, minus its four `require_*` lines…
}

registry.add(meta! {
    name: "butter", category: "Filter", shape: "[t]", unit: "SameAsArg(3)",
    signature: "butter(order, cutoff_hz, \"low\"|\"lowpass\"|\"high\"|\"highpass\", ch)",
    description: "Zero-phase Butterworth …",
    example: "butter(2, 5, \"low\", [Fork])",
}, butter);
```

- **Arguments come from the parameter types.** A trait `FromArg` turns one `Value` into `f64`,
  `&str`, `Channel`, `Vec3` or `Value`, by calling today's `require_*` helpers, so every error
  kind and message is unchanged. `Option<T>` marks a trailing optional argument. `IntoBuiltin` is
  implemented for functions of 0..=6 such parameters (a small `macro_rules!` writes the impls),
  and it derives the arity (min and max) from them, which removes the hand-kept `arity` field and
  the `require_arg_count` calls.
- **Context is a parameter, not an argument.** A function that needs the channel lookup, the lap
  context or keyword arguments takes `&Ctx` (holds all three, and the spelling used, for shared
  bodies like `cumtrapz`/`cumulative_trapezoid`). `Ctx` consumes no argument.
- **Keyword arguments** stay listed in the metadata (`kwargs: &["max_fraction"]`), checked once
  by the registry before the call, read in the body through `ctx.kwarg("max_fraction")`. This
  replaces `KWARG_AWARE_FUNCTIONS`.
- **Not-yet-implemented names** (`sosfilt` …) register with a shared body that returns today's
  "not implemented" error; their status comes from that, not a separate field.
- **Description and example stay hand-written**, because no type can say them. The signature
  string stays hand-written too: it names literal choices (`"low"|"high"`) a type can't. A test
  checks its argument count against the function's arity, so the two can't drift.
- **`Registry` is a value**, not a global: `Registry::builtins()` returns idl-rs's own set,
  `registry.add(meta, f)` adds one, and the evaluator takes `&Registry`. The CLI and app pass
  `Registry::builtins()`; an outsider's program adds its own functions at startup, so any Rust
  crate (nalgebra, ndarray, statrs, …) can back a workbook function. Their functions take the
  same typed parameters, so an outside function is as short as an inside one. The CI-gated
  references list only idl-rs's own builtins. Outsiders' functions show up in whatever docs or
  editor catalog their program generates from its own registry.
- **No procedural macro.** A `#[builtin(...)]` attribute could also derive the signature string
  and description from the doc comment, but it means a second crate, and macro errors are hard
  to read. Plain traits and one `macro_rules!` for the impls keep it ordinary Rust.

Bodies move into modules by family (filters, spectral, elementwise, vector, laps, estimator),
each with its `registry.add` list beside it. `catalog.rs` and the `call_function` match are
deleted. `math_builtin_catalog()` keeps its signature for docs.rs and the bridge.

## Prototype first

Convert five builtins of different kinds before touching the rest: `butter` (four typed
arguments), `cumtrapz`/`cumulative_trapezoid` (shared body, `Ctx`), `deglitch_pulses`
(keyword argument), `resample` (two call forms) and `wheel_travel` (estimator lookup). Report
lines per builtin before and after, and whether errors and docs are byte-identical. If the
projected total is not smaller than today's (~1,976 lines across `call_function`, `catalog.rs`
and the kwargs list; v2 estimate ~1,550), stop and bring the numbers back before converting
the rest.

## Tests

Isolated (inline `#[cfg(test)]` in the registry module):

- every builtin's `example` string evaluates on the synthetic fixture
  `core/tests/fixtures/synth-3lap.idl0`: an implemented one returns a value of its declared
  shape; a not-implemented one returns that error. This makes every documented example a test.
- each declared keyword argument is accepted, and an undeclared one is rejected with today's error
- every signature string's argument count is within the function's arity
- no two builtins share a spelling, and every name in `units.rs`'s rule table resolves
- `FromArg`: each parameter type accepts its value kind and rejects the others with the existing
  message
- an outside function added with `registry.add` evaluates and is absent from the generated docs

End to end:

- `idl-rs workbook eval` on a committed fixture workbook over `synth-3lap.idl0` (filter, RMS,
  integration, per-lap reductions), its output compared against a committed expected file
- the generated `WORKBOOK-REFERENCE.md` and `functionCatalog.json` unchanged (CI diff gate)
- every existing math test passes unchanged

## Open questions (Isaac)

None blocking the prototype.
