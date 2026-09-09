# The unit model — design

*Design input for the C2 §3.3 spec edit ruled by R152. Read-only survey; no
code or spec changed by this document. Every claim about the engine below was
read out of the tree at `rust/` commit `e1b8f12`, not inferred — R152 exists
because the last such claim was not.*

---

## 0. What is actually there today (read, not assumed)

| Claim | Verified |
|---|---|
| `ChannelValue` carries no unit | `core/src/math/value.rs:8` — fields are `samples`, `sample_rate_hz`, `channel_id`, `t_us`. Nothing else. |
| `LookupChannel` carries no unit | `core/src/math/eval.rs:18` — `samples`, `sample_rate_hz`, `t_us`. |
| The unit exists one layer below | `core/src/session/mod.rs:183` — `Channel.unit: String` (C1 §4.1). `SessionHandle::lookup` (`core/src/session/handle.rs:1005`) reads `c.materialize()`, `c.nominal_rate_hz`, `c.t_us` and **drops `c.unit` on the floor**. That single `with_channel` closure is where the unit is lost. |
| `EvalOutput` carries no unit | `core/src/math/eval.rs:220` — `samples`, `sample_rate_hz`, `t_us`. |
| `CellDefResult` (core) has `sample_rate_hz`, no `unit` | `core/src/workbook/v3/eval.rs:31`, with R152's reasoning written into the doc comment. |
| There is no `^` operator | `core/src/math/parse.rs`'s `BinOp` and C2 §3.2's operator table both stop at `+ - * /`, comparisons, `and`/`or`. Exponentiation exists **only** as `pow(x, y)`. The brief's "`^`/`pow`" is one function, not two constructs. |
| §3.6's n-D shapes are spec-only | No `Shape`/`Axis` type exists in `core/src/math/`. `Value` is still `Channel | Scalar | Str | Vec3`. So §3.6's axis `unit` field is a contract commitment, not running code — this design must be forward-compatible with it, and cannot lean on it. |
| One consumer already ships the exact ambiguity R152 warns about | `app/src/routes/pages/Notebook/model/cursorCard.ts:49` — `unit: string`, documented as "`ChannelSummary.unit` (C1 §4.1), **or `""` when unknown**", and `CursorCard.tsx` renders nothing when it is `""`. A dimensionless ratio and a channel whose unit we never learned are already indistinguishable on screen, today, for *raw* channels. |
| `app/src/ipc/workbook.ts:44`'s `CellDefResult` has neither `unit` nor `sample_rate_hz` | The R152 sample-rate half landed Rust-side and Tauri-side (`tauri/src/commands/workbook.rs:62`); the TypeScript mirror has not been updated. Not this design's scope, but the unit task will touch the same interface and should not step over it silently. |

**Consequence for the plan.** Units are lost in exactly one place per source
(the `lookup` closure), and are never *created* anywhere. There is no partial
implementation to finish and no wrong behaviour to unwind. This is a green
field with a hard constraint (R152) on what may be shipped.

---

## 1. Representation

### The three candidates

**(a) An opaque string carried through.** `Channel.unit` is already a `String`;
propagate it, copying it across every operation that "preserves units".

*What it cannot do:* anything with two different units in it. `[fork_travel] *
[wheel_speed]` has no answer — you either concatenate (`"mm" + "km/h"`, garbage)
or give up. `+` cannot be checked, because `"mm"` vs `"m"` vs `"millimetres"`
compares as three unrelated strings and `"km/h"` vs `"km / h"` as two. It cannot
express `integrate`'s `[ch]·s` without string-building, which is unit *algebra*
implemented in the worst possible datatype. **Rejected**: it is the thing C2
§3.3 already writes down informally, with no machinery to evaluate it.

**(b) A dimension vector + display string.** Seven SI exponents (M, L, T, I, Θ,
N, J) plus a scale factor to base units, plus a display string.

*What it cannot do — and this is disqualifying here, not merely awkward:*

- It **forces canonicalisation, and canonicalisation is conversion.** C1 §4.1
  and C2 §3.6.1 both state units are display metadata, *never converted*.
  `mm · m/s` has dimension L²T⁻¹; to display it the model must pick a
  representative — `m²/s` — which silently rescales the rider's number by 1000.
  Even if we keep the scale factor and refuse to rescale, the display string is
  now a second, independent source of truth that the algebra does not maintain.
- Half our units **have no dimension**. C1 §4.1 ships `pulse`, `count`,
  `enum_raw`, `ms_raw`, and `""`. C2 §3.4's own "Unitless" row is `count, raw,
  ADC`. A dimension vector must call every one of these dimensionless, which
  makes `[WheelFront] + [GPS_Satellites]` a legal, checked, dimensionally sound
  addition of wheel pulses to satellite counts.
- It **cannot catch the mm/m error**, which is the error this app will actually
  make. Suspension travel is mm, GPS altitude is m; they are dimensionally
  identical and adding them is a bug. A dimension checker approves it.
- `bpm` would render as `s⁻¹`, `g` as `m/s²`, `deg` as dimensionless. Every one
  of those is a worse label than the one C1 already recorded.

**(c) A small symbolic algebra over the recorded unit strings — RECOMMENDED.**

A unit is a map from **atom** (an opaque unit token, exactly as recorded — `mm`,
`g`, `km`, `h`, `s`, `Hz`, `bar`, `deg`, `bpm`, `pulse`, `count`) to a
**rational exponent**. The empty map is dimensionless.

```
mm            → { mm: 1 }
km/h          → { km: 1, h: -1 }
m/s²          → { m: 1, s: -2 }
mm · m/s      → { mm: 1, m: 1, s: -1 }
g²/Hz         → { g: 2, Hz: -1 }
g/√Hz         → { g: 1, Hz: -1/2 }
```

- **Parsing** a C1 unit string into a map, and **rendering** a map back, are
  total and mutually inverse on the units C1 actually emits.
- **Multiplication** adds exponents; **division** subtracts; `pow(x, n)`
  multiplies them by `n`; `sqrt` halves them. Every one of those is closed —
  which is why exponents are **rational**, not integer: `sqrt` must be total,
  and `g/√Hz` is a real accelerometer-PSD unit, not a curiosity.
- **Addition** requires map equality. `mm` and `m` are different atoms, so
  `[travel_mm] + [altitude_m]` is caught. This is the whole reason to prefer
  (c) over (b).
- It is **exactly the notation C2 §3.3 already writes**: `[ch]·s`, `[ch]/s`,
  `[a]·[b]`, `√[x]`, `[x]^y`. The spec edit turns that column from prose into a
  rule table; it does not invent a new vocabulary.
- It never converts, because it never canonicalises. `km/h` stays `km/h`.

*What (c) cannot do, stated plainly:*

1. **It does not know `m/s` and `km/h` are the same quantity.** `[speed_kmh] -
   [speed_ms]` is flagged as a mismatch rather than converted. That is correct
   for this app (§1's no-conversion rule) but it means the model can never
   power an automatic unit converter. If unit conversion is ever wanted, it is a
   *separate* table (C2 §3.4 is already that table, unevaluated) layered on top,
   not a change to this model.
2. **It does not simplify across atoms.** `mm·m/s` stays `mm·m/s`; it will not
   become `m²/s` or `mm²/s`. Honest, and slightly ugly on a node card. It *does*
   cancel identical atoms: `[a]/[a]` is dimensionless, `mm·s/s` is `mm`.
3. **It does not validate the atom.** A typo'd unit in a CSV header (`"mmm"`)
   becomes an atom and propagates. Nothing in this design can detect that; only
   C1's importers can, and they do not today.
4. **`deg` and `rad` are different atoms**, so `sin([angle_deg])` cannot be
   caught as a mistake by unit algebra alone — the §3.3 rule for `sin` says its
   argument is radians, and the model can *warn* on a `deg` argument as a
   named-function rule, but that is a hand-written rule, not algebra.

### The types

```rust
/// A unit as a product of named atoms with rational exponents. The empty
/// product is dimensionless. Atoms are the unit tokens C1 §4.1 records,
/// verbatim and unconverted.
pub struct UnitExpr { /* BTreeMap<String, Ratio> — sorted, so equality and
                         display are canonical without conversion */ }

/// The unit lattice used during inference. `Scalar` is internal only.
pub enum Unit {
    /// A bare numeric literal (or arithmetic between literals). Adapts to the
    /// other operand under `+ - min max clamp if`; dimensionless under `* /`.
    Scalar,
    /// A determined unit. `Known(UnitExpr::EMPTY)` is genuinely dimensionless.
    Known(UnitExpr),
    /// We could not work it out. Carries why, for display.
    Unknown(UnknownReason),
}
```

`Scalar` is what makes `[travel] + 10` legal (10 mm) while `[travel] * 2`
stays mm. Without it, a literal is either dimensionless — and every offset
expression in every workbook reports a mismatch — or unknown, and every
workbook loses its unit at the first constant. It never crosses the wire; a
top-level `Scalar` result reports **dimensionless**.

---

## 2. The operator rules

Notation: `U(x)` is the inferred unit of `x`. `∅` is the empty (dimensionless)
`UnitExpr`. "Mismatch" is defined in §2.1.

| Construct | Rule |
|---|---|
| numeric literal | `Scalar` |
| `pi` `tau` `e` | `Scalar` (pure numbers) |
| `g` (universal constant, 9.80665) | `Known({m:1, s:-2})`. It is a physical constant with a unit; C2 §3.2 states its units in the spec text already. **Open question 3.** |
| declared workbook constant | `Scalar` — `parse_with_constants` substitutes it as a literal *before* parsing (`core/src/math/parse.rs`), so by eval time it is indistinguishable from one. **Open question 4** covers declaring a unit on a constant. |
| `[Name]` — session channel | `Known(parse(C1 unit))`; `Unknown(NoSourceUnit)` when the recorded unit is `""` |
| `[Name]` — math definition | that definition's own inferred unit (§3) |
| `{cell}` / `{col[]}` | `Unknown(NoSourceUnit)` — a table cell has no recorded unit today |
| unary `-` | `U(x)` unchanged, including `Unknown` |
| `not x` | `Known(∅)` |
| `a * b` | `Scalar`×`Scalar` → `Scalar`; `Scalar`×`Known(u)` → `Known(u)`; `Known(u)`×`Known(v)` → `Known(u·v)` (exponents added, zero exponents dropped); anything with `Unknown` → `Unknown(Propagated)` |
| `a / b` | as `*`, with `b`'s exponents negated. `Scalar / Known(u)` → `Known(u⁻¹)` |
| `a + b`, `a - b` | `Scalar`+`Scalar` → `Scalar`; `Scalar`+`Known(u)` → `Known(u)` (the literal adopts the unit); `Known(u)`+`Known(u)` → `Known(u)`; `Known(u)`+`Known(v)`, `u ≠ v` → **mismatch** → `Unknown(Mismatch{u, v})`; anything with `Unknown` → `Unknown(Propagated)` |
| `< > <= >= == !=` | always `Known(∅)` — a comparison is a truth value. Operands are still **checked**: comparing `mm` to `m` raises the same mismatch diagnostic, but the *result* unit is unambiguous, so it is `Known(∅)`, never `Unknown`. |
| `and` `or` | `Known(∅)`. Operands are truthiness tests; no operand check. |
| `pow(x, n)` | `n` a literal (or a folded constant): `Known(u)` → `Known(u^n)` with rational exponents; `Scalar` → `Scalar`. `n` **not** a literal: `Known(∅)`/`Scalar` → `Known(∅)` (a dimensionless base raised to anything is dimensionless), otherwise `Unknown(NonLiteralExponent)`. |
| `sqrt(x)` | `Known(u^½)`; `Scalar` → `Scalar` |

### 2.1 A mismatch is a diagnostic, not an error — and here is why

R152 says a wrong unit is worse than no unit. It does **not** say a suspicious
unit is worse than a number. The choice is between three postures for
`[HR_BPM] + [GPS_SpeedKmh]`:

1. **Hard error** — the definition greys out, as `ShapeMismatch` does. This is
   the strictest reading, and it is wrong *here* for one reason: it changes the
   behaviour of workbooks that exist today. A workbook that renders a chart this
   afternoon would render nothing after the upgrade. The brief's own §6 says
   "this adds information, it does not change a number"; a hard error changes a
   number to no number. It is also a C2 grammar change (a new
   `MathEvalErrorKind`) requiring the §7.1 migration mechanism.
2. **Silently take the left operand's unit** — the R152 failure mode verbatim.
   Never.
3. **Compute the number, withhold the unit, and say why.** The result unit is
   `Unknown(Mismatch)`; the definition additionally carries a **non-fatal
   diagnostic** — "`+`: units differ (`bpm` and `km/h`); result unit withheld" —
   surfaced next to the definition the way a validation message is, not as an
   evaluation failure.

**Recommend (3).** It satisfies R152's rule exactly (no unit is ever wrong,
because none is shown), it satisfies R147's spirit (the user is *told*, rather
than left with a blank), and it breaks nothing. It also gives the lead the
option of promoting mismatch to a hard error later, once real workbooks show
how often it fires — a decision that should be made on evidence, not on first
principles. **Open question 1.**

The same diagnostic covers `if(cond, t, f)` with mismatched branches,
`min(a,b)`/`max(a,b)`, `clamp`'s `lo`/`hi` when they are not literals,
`vadd`/`vsub`, and a `deg`-atom argument to `sin`/`cos`/`tan`.

---

## 3. Where units come from

Three sources, in the order inference consults them.

**Raw and synthesized channels — C1 §4.1.** `Channel.unit`, already present in
`core`, already populated by every importer, already written to Parquet column
metadata. `session/synthesis.rs` gives `Time` `"s"` and `Distance` `"m"`. The
only work is to stop dropping it: `ChannelLookup` gains

```rust
/// This channel's recorded display unit (C1 §4.1), e.g. `"mm"`, `"km/h"`.
/// `None` when the lookup has no unit for it — a test double, a math-store
/// channel, or a source that recorded none. Never `Some("")`.
fn unit_of(&self, _name: &str) -> Option<String> { None }
```

as a **defaulted** trait method. There are nine `impl ChannelLookup` sites in
the tree; only `SessionHandle` needs a body (`with_channel(name, |c|
c.unit.clone())`, one line, filtering `""` to `None`). Nothing else breaks.

**Named functions — C2 §3.3's Output units column.** That column is already
written, for all 69 named functions, and it is already in this model's notation.
The spec edit reclassifies each entry into one of a small closed set of rules:

| Rule | Functions |
|---|---|
| `SameAsArg(i)` | `butter`, `sosfilt`, `declip`, `detrend`, `rms`, `mean`, `std`, `median`, `sum`, `first`, `last`, `p`, `abs`, `floor`, `ceil`, `round`, `clamp`, `hilbert`, `resample`, `variance_time`, `variance_dist`, `norm`, `rotate_*`, `vx`/`vy`/`vz` |
| `Dimensionless` | `count`, `sign`, `sin`/`cos`/`tan`, `sinh`/`cosh`/`tanh`, `normalize`, `current_lap`, `sector_number` |
| `Fixed(u)` | `asin`/`acos`/`atan`/`atan2`/`angle` → `rad`; `deg2rad` → `rad`; `rad2deg` → `deg`; `attitude` → `deg`; `body_accel` → `g`; `wheel_travel` → `mm`; `wheel_velocity` → `mm/s`; `lap_start_time` → `s`; `lap_start_distance` → `m` |
| `TimesTime` / `PerTime` | `integrate` → `[ch]·s`; `differentiate` → `[ch]/s` |
| `Product(i, j)` | `correlate`, `convolve`, `cross`, `dot`, `vscale` |
| `Sqrt(i)` | `sqrt` |
| `Pow(i, literal j)` | `pow` |
| `AllMatch(…)` | `if`, `min(a,b)`, `max(a,b)`, `vadd`, `vsub`, `vec` — mismatch → §2.1 diagnostic |
| `Spectral` | `fft` → `SameAsArg(0)` (magnitude); `spectrogram` → `SameAsArg(0)` for `"magnitude"`, `[ch]²/Hz` for `"density"` — the scaling literal selects the rule, and it is a string literal in the call, so it is statically readable |

The `integrate`/`differentiate` rule multiplies by the atom `s`, not by "the
time axis unit", because today's `[t]` values have no axis object. §5 below
says what happens when §3.6 lands.

Two §3.3 cells need rewriting because they assert the opposite of this work:
`pow`'s "engine does not track units", and `sqrt`'s "meaningful only if `x` is
unitless or a squared unit" (rational exponents make it total).

**Axes — C2 §3.6.1's `unit`.** §3.6 is unimplemented, so this is a
forward-compatibility statement, not code:

> **A value-level unit is the unit of the numbers. An axis unit is the unit of
> that axis's coordinates. They are independent, and a value carries both.** A
> `[t,f]` spectrogram of a `g` channel has value unit `g` (or `g²/Hz`), a `t`
> axis in `s`, and an `f` axis in `Hz`. They meet in exactly four places, all of
> them explicit function rules, never implicit:
>
> 1. `argmax(x, "f")` / `argmin(x, "f")` — the result's **value** unit is the
>    named axis's unit (`Hz`). §3.6.3 already says "in that axis's `unit`"; this
>    model makes it the rule. `argmax_index` is `Known(∅)`.
> 2. `integrate` / `differentiate` — multiply or divide the value unit by the
>    **last axis's** unit (which §3.6.3 requires to be `time`). This generalises
>    the "atom `s`" rule above without changing it, since a `time` axis's unit
>    is `s`.
> 3. `nearest(x, "f", 12)` / `slice(x, "f", lo, hi)` — the literal coordinates
>    are in the **axis** unit; the value unit is untouched. Nothing to infer,
>    but the node card should label those arguments from the axis.
> 4. `at`, `axes`, `broadcast`, `align`, and every reduction — value unit
>    untouched. Reducing an axis away does not change what the numbers are.
>
> When §3.6 is implemented, `Axis.unit: String` should become the same
> `UnitExpr` this document defines, parsed from the same strings. Until then the
> axis unit is not modelled and rules 2's generalisation stays hard-coded to
> `s`.

**Math definitions referencing other definitions.** `[Name]` resolving to
another definition takes that definition's inferred unit. Inference therefore
runs in dependency order, memoized per definition — the same order
`workbook::v3::resolve::resolve_workbook_defs` already computes. A cycle (the
`visited` guard in `core/src/math/resolve.rs`) yields `Unknown(Cycle)`, which
matches the value behaviour: a cycle already fails to evaluate.

---

## 4. The unknown case

**The model can produce an unknown, and it must.** Anyone who claims otherwise
has not read C1 §4.1: a CSV-imported channel's recorded unit is the empty
string. There is no rule that recovers a unit that was never recorded. Three
further sources:

| Reason | Cause |
|---|---|
| `NoSourceUnit` | The channel's C1 unit is `""` (CSV without a unit header), or a `{cell}` table reference |
| `Mismatch { left, right, op }` | §2.1 — the units are known and disagree |
| `NonLiteralExponent` | `pow(x, [n])` where the base is not dimensionless |
| `Propagated { of }` | An operand was already unknown; names the definition or channel where it started |
| `Cycle` | A definition cycle |

So R152's requirement bites in full: **three states must be distinguishable at
every boundary, and each consumer needs a rule for all three.**

```
known(text)      the unit is "mm", "km/h", "g/√Hz"
dimensionless    genuinely no unit — a ratio, a count, a comparison, a sign
unknown(reason)  we could not work it out, and here is why
```

`unit: string | null` cannot express this. It is exactly the encoding
`cursorCard.ts` uses today (`""` for both), and exactly the ambiguity R152
forbids. A two-state field must not ship, in either the Rust or the TypeScript
shape.

**`Unknown` is contagious and never guessed away.** `Unknown * mm` is
`Unknown`, not `mm`. The single exception is stated in §2: a dimensionless base
under a non-literal exponent is dimensionless, because 0×anything = 0 — that is
an algebraic fact, not a guess.

---

## 5. The wire, and the four consumers

### The field

```rust
// core/src/workbook/v3/eval.rs — CellDefResult, additive
/// This definition's inferred unit (C2 §3.3's unit model, ruling R152).
pub unit: UnitLabel,
/// Non-fatal unit diagnostics for this definition (§2.1) — never an
/// evaluation failure; the value in `value` is unaffected.
pub unit_notes: Vec<UnitNote>,
```

```rust
pub enum UnitLabel {
    /// A determined, non-empty unit, rendered from `UnitExpr` — "mm", "km/h".
    Known(String),
    /// Genuinely no unit: a ratio, a count, a comparison result.
    Dimensionless,
    /// Not determinable. `reason` is display-ready English.
    Unknown { reason: String },
}
```

Serialized `#[serde(tag = "state", rename_all = "snake_case")]`, so the
TypeScript is a discriminated union that cannot be destructured wrongly:

```ts
export type UnitLabel =
  | { state: "known"; text: string }
  | { state: "dimensionless" }
  | { state: "unknown"; reason: string };
```

`unit_notes` is `[]` in the overwhelming majority of cases and exists so the
mismatch of §2.1 is *visible* rather than merely absorbed into `unknown`.

### What each consumer renders

| Consumer | `known("mm")` | `dimensionless` | `unknown` |
|---|---|---|---|
| **Graph node card** (`graph/NodeCard.tsx`) | a unit chip: `mm` | no chip — the node is a ratio and says so by omission, which on a compact card is the right silence | a dimmed `unit ?` chip, `title` = the reason. Never blank: a missing chip already means dimensionless. |
| **Cursor value card** (`components/CursorCard.tsx`) | `112.4 mm` | `112.4` — bare, correct, and the card's existing behaviour for `""` | `112.4` with a dimmed trailing `?`, tooltip = reason. The `?` is the entire fix for the ambiguity that ships today. |
| **Inline `${…}` prose** (C2 §5.2) | the unit is exposed as a **property** on the host variable (`travel.unit`), so the author writes `${travel.value} ${travel.unit}`. **Never auto-appended** — a prose span is arbitrary JS and the host cannot know whether the author's expression still has that unit (`${x/y}` does not). | `.unit` is `null` | `.unit` is `null`; `.unitState` says which. **Open question 5.** |
| **PDF report** (decision 85 — *not yet built*; this is a spec rule for whoever builds it) | `112.4 mm` | `112.4 —` : an explicit em-dash in the unit column. A report is read by a mechanic who is not in the room; a blank cell reads as an omission, and "the report did not print the unit" is a different claim from "this number has no unit". | `112.4 unknown`, with the reason in a footnote. Never blank, never guessed, never suppressed — a report that hides its own uncertainty is the exact artefact R152's cost paragraph is about. |

The report row is the one worth arguing about, and it is the reason
dimensionless and unknown cannot share a rendering anywhere: on a node card
they can both be quiet, on a printed page they cannot.

---

## 6. Migration and blast radius

**The central design decision: unit inference is a separate pass over the AST,
not a field threaded through `Value`.**

A unit is a property of an *expression*, not of a buffer. Nothing about the unit
of `[travel] * 2` depends on the samples. So inference is a second, cheap walk
of the same `Ast` — `core/src/math/units.rs`, `fn infer(ast, &dyn UnitLookup)
-> (Unit, Vec<UnitNote>)` — running beside `eval`, not inside it.

What that buys:

- **`ChannelValue`, `LookupChannel`, `Value`, `EvalOutput` are untouched.** No
  field added to a `pub` struct means no struct-literal breakage: there are 16
  `ChannelValue { … }` construction sites and 22 `LookupChannel { … }` sites
  across 9 files, and none of them change.
- **`call_function`'s ~70-arm match is untouched.** The function unit rules live
  in one table in the new module, next to nothing else.
- **The hot path is untouched.** `elemwise` — which `core/src/math/eval.rs:412`
  already carries a perf `TODO(idl0)` about — gains no per-sample work and no
  per-node allocation.
- **Rollout is safe at every step**, because an unrecognised function or an
  unhandled construct yields `Unknown`, and `Unknown` is a shipped, honest,
  fully-rendered state rather than a hole.

The cost is that the two walks can drift: a new function added to
`call_function` with no entry in the unit table silently yields `Unknown`. A
test that enumerates the catalog (`math::catalog`) and asserts every name has a
unit rule closes that, and belongs in task 3.

**Full change list.**

| Where | Change | Kind |
|---|---|---|
| `core/src/math/units.rs` | new module: `UnitExpr`, `Unit`, `UnitLabel`, `UnitNote`, parse/display, operator + function rules, `infer` | new |
| `core/src/math/mod.rs` | `pub mod units;` + re-exports | additive |
| `core/src/math/eval.rs` | `ChannelLookup::unit_of` — **defaulted** trait method | additive; no impl breaks |
| `core/src/session/handle.rs` | `unit_of` body reading `Channel.unit` (~4 lines) | additive |
| `core/src/workbook/v3/{resolve,eval}.rs` | run inference in dependency order; fill `CellDefResult.unit`/`unit_notes` | 2 construction sites + tests |
| `tauri/src/commands/workbook.rs` | mirror the two fields; `UnitLabel` serde shape | 1 construction site |
| `app/src/ipc/workbook.ts` | `UnitLabel` type + two fields (and, separately, the missing `sample_rate_hz` noted in §0) | additive |
| `app/src/routes/pages/Notebook/graph/NodeCard.tsx`, `components/CursorCard.tsx` + `model/cursorCard.ts`, prose host vars | render per §5 | 3 consumers |
| C2 §3.3 (+ a new §3.3.1), §3.6.1 note, §3.5 (the diagnostic is not an error kind) | the spec edit the lead schedules | spec |

**No `pub` signature moves.** The one trait addition is defaulted. `EvalOutput`,
`Value`, `ChannelValue`, `LookupChannel`, `evaluate`, `eval`, `call_function`,
`elemwise` all keep their current signatures.

**Existing workbooks are unaffected.** No number changes, no evaluation
outcome changes, no file bytes change, no C2 version bump, no §7.1 migration.
Units are *inferred* from the workbook and the session, never stored in the
`.idl1wb`. The one exception is the optional `# unit:` annotation (task 6),
which is purely additive to §3.1's `trailing_comment` — a workbook without one
behaves exactly as it does today.

---

## 7. Task plan

Ordered so the tree is never broken and — per R147 — **a consumer sees a real
unit at task 4 of 8**, before the model is finished. Every task is
independently committable; every intermediate state is honest, because anything
the model has not yet learned reports `unknown` with a reason.

| # | Task | Language | Targeted test filter |
|---|---|---|---|
| 1 | `math::units` — `UnitExpr` (atom map, rational exponents), parse from a C1 unit string, render back, multiply/divide/pow/sqrt/equality. Round-trip every unit string C1 §4.1 emits. No engine wiring. | Rust | `cargo test -p idl-rs math::units::` |
| 2 | `ChannelLookup::unit_of` (defaulted) + `SessionHandle` impl; `infer` over literals, `[Name]`, unary, `+ - * /`, comparisons, `and`/`or`; the `Scalar` lattice; the mismatch diagnostic. Functions all yield `Unknown(Propagated)` for now. | Rust | `cargo test -p idl-rs math::units::` |
| 3 | The §3.3 function rule table — all 69 names, plus the catalog-completeness test that fails when a function has no rule. | Rust | `cargo test -p idl-rs math::units::` |
| 4 | **First consumer, end to end.** `CellDefResult.unit`/`unit_notes` in `core` + `tauri`; `UnitLabel` in `app/src/ipc/workbook.ts`; the graph node card renders all three states. Nothing after this task is required for a user to see a unit. | Rust + TS | `cargo test -p idl-rs workbook::v3::` ; `vitest run app/src/routes/pages/Notebook/graph` |
| 5 | Cursor value card: three states, retiring `cursorCard.ts`'s `""`-means-both encoding for **definition** channels (raw channels keep `ChannelSummary.unit` and gain the same three-state treatment). | TS | `vitest run app/src/routes/pages/Notebook/model/cursorCard.test.ts` |
| 6 | Optional `# unit: N/mm` annotation on a `def_line` (C2 §3.1's existing `trailing_comment` slot, beside `# label:`): an author's declaration **overrides** inference and turns `Unknown` into `Known`. Mismatch between a declaration and a confident inference is a diagnostic, not an override refusal. Requires open question 2 answered. | Rust | `cargo test -p idl-rs workbook::v3::` |
| 7 | Prose `${…}` host-variable `unit`/`unitState` properties (C2 §5.1/§5.2). | Rust + TS | `cargo test -p idl-rs workbook::v3::host` ; `vitest run app/src/routes/pages/Notebook/sandbox` |
| 8 | Report rendering rule written into the spec + the report's unit column, **when the report is built** (decision 85 is not built today; if it is still unbuilt, this task is the spec paragraph only). | spec (+ TS later) | n/a |

The C2 §3.3 spec edit is spec-first and precedes task 1; the lead schedules it
from this document.

---

## 8. Open questions for the lead

1. **Is a `+` between mismatched units a diagnostic or a hard error?**
   *Recommend: a non-fatal diagnostic* — the result unit is withheld
   (`unknown`) and a message is shown, but the number still computes. A hard
   error changes the behaviour of workbooks that render today, which §6's
   "adds information, changes no number" promise forbids, and it is a C2
   grammar change requiring §7.1 migration. Promoting it to an error later, on
   evidence from real workbooks, stays open.

2. **Does an author get to declare a unit (`# unit: N/mm`) on a definition?**
   *Recommend: yes, task 6.* It is the only escape hatch from `unknown` for a
   derived quantity the human knows and the algebra cannot (`[force] /
   [travel]` where the source channels are CSV with no units). It rides in
   §3.1's existing `trailing_comment` beside `# label:` and is backward
   compatible. If the answer is no, `unknown` is permanent for every
   CSV-sourced definition and task 6 is dropped.

3. **Does the universal constant `g` carry `m/s²`?**
   *Recommend: yes.* C2 §3.2 already documents it as "standard gravity,
   m/s²", so `[accel_g] * g` correctly yields `g·m/s²` — which reads oddly
   (the atom `g` for g-force and the constant `g`) but is honest, and flags
   that the author probably wanted `m/s²` alone. The alternative — treating
   the constant as `Scalar` — makes `[accel_g] * g` report `g`, a unit that
   is wrong by a factor of 9.8 in meaning.

4. **Can a declared workbook constant carry a unit?**
   *Recommend: not in this revision.* Constants are substituted as literals
   before parsing (`parse_with_constants`), so giving them units means moving
   substitution after inference — real work for a modest gain, and task 6's
   `# unit:` annotation covers the same need at the definition level.

5. **Does a prose `${…}` span ever auto-append a unit?**
   *Recommend: no.* Expose `.unit` on the host variable and let the author
   write it. A prose span is arbitrary JavaScript; `${(a.value/b.value).toFixed(1)}`
   has no relation to `a`'s unit, and auto-appending one there is precisely the
   confidently-wrong label R152 forbids.

6. **Should raw-channel display (the cursor card, the channel list) adopt the
   same three-state `UnitLabel` now?**
   *Recommend: yes, in task 5.* `cursorCard.ts` already conflates "no unit"
   and "unit unknown" for raw channels; leaving that while fixing it for
   computed channels means two different meanings of a blank unit on the same
   card. It is a small change and it removes the last live instance of the
   encoding R152 rules out.
