# C2 — Workbook v3 (`.idl1wb`)

**Status:** signed (lead) 2026-09-02 · **Date:** 2026-09-03 · **Owner:** lead

Consumed by: L3 (`idl-rs` core `workbook` module — parser, math-cell evaluator
extension, `migrate-workbook`), L6 (notebook editor — CodeMirror, Properties ↔
Code, `plotForm`), L11 (LAN sync per-cell merge). Grammars are EBNF
(`::=`, `|`, `?` zero-or-one, `*` zero-or-more, `+` one-or-more, literal
strings in `"…"`, `/…/` for a regex terminal).

---

## 1. Container

A `.idl1wb` file is UTF-8, LF line endings, and is **Observable
Framework-compatible Markdown**: a YAML front-matter block followed by
CommonMark prose interleaved with fenced code blocks, of which only
` ```math `, ` ```table ` and ` ```js ` are executable (D8). Any other fence
language (` ```json `, ` ```bash `, a plain ` ``` ` with no info string, …) is
inert — rendered as a code block, never evaluated, never assigned a cell id.

```ebnf
document      ::= front_matter "\n" body
front_matter  ::= "---\n" yaml_block "---\n"
body          ::= segment*
segment       ::= prose_span | cell
```

**Front-matter keys:**

| Key | Type | Required | Meaning |
|---|---|---|---|
| `id` | string (UUIDv4) | yes | Stable workbook identity. Never changes — including across sync conflicts (a conflict produces conflict *cells* inside the file, never a second file with a new `id`; see §7). |
| `name` | string | yes | Display name. |
| `constants` | map\<string, number \| string\> | no (default `{}`) | Named scalars for math-cell `[Name]`-free literal substitution. Value is a bare YAML number (unitless) or a `"<number> <unit>"` string (§3.2). |
| `units` | `"si"` \| `"imperial"` | no (default `"si"`) | Workbook-level unit-system *preference*. Consumed only by the editor UI (L6) when it suggests an axis label / number format from a channel's C1 column `unit` metadata (e.g. defaulting a new mark's `y.label`). It has **no effect on parsing, evaluation, or the `plotForm` grammar** — no v3 construct performs unit conversion. This is a deliberate narrowing from idl0, where `MathQuantity.defaultUnit` picked a per-channel display unit (§3.4 records the same table for L6 to reuse); v3 has no per-math-definition unit field to apply it to (§3.1). |
| `version` | integer | no (default `3`) | Fixed at `3` for this contract; **omitting the key defaults to `3`**, mirroring idl0's own rule ("Omitting `workbook_version` defaults to 1, the current max" — `docs/legacy/idl0-workbook_format.md` §3). A parser encountering an explicit `version` ≠ `3` refuses the file (`UnsupportedWorkbookVersionException`) rather than guessing at compatibility; only *absence* defaults, a wrong value never does. |

No other top-level front-matter keys are defined by this contract. §6 defines two **transient, migration-only** keys (`_migrate_charts`, `_migrate_math` — *the latter added post-sign, 2026-09-04, lead ruling R25, wave-1 L3*) that a v3 parser must tolerate (round-trip them unmodified) but never itself produces except via `migrate-workbook`.

---

## 2. Cells

### 2.1 Kinds

Four kinds: **prose** (plain Markdown, no fence, no id — §2.4), **math**
(§3), **table** (§4), **js** (§5). "Cell" without qualification means a
fenced block (math/table/js); prose is a *span*, not a cell — see §2.4 for
why and how it still participates in merge.

### 2.2 Cell id

```ebnf
fence_open   ::= "```" cell_kind (" " attr)* "\n"
cell_kind    ::= "math" | "table" | "js"
attr         ::= "id=" hex8
hex8         ::= /[0-9a-f]{8}/
fence_body   ::= /.*/                    (* kind-specific grammar, §3/§4/§5 *)
fence_close  ::= "```" "\n"
cell         ::= fence_open fence_body fence_close
```

Example: ` ```js id=3fa9c12e `.

- **Assignment.** A fence with no `id=` attribute is legal to author by hand or
  by an agent. On first save by any writer (the app, the CLI, `notify`'s
  watcher picking up an external edit that added a fence) that writer
  generates 4 random bytes, lowercases their hex encoding, and rewrites the
  fence line with `id=<hex8>` appended. Collision probability at workbook
  scale (tens of cells) is astronomically small (~2⁻³²  per pair); §7 defines
  the one defensive rule for the case anyway.
- **Immutability.** Once assigned, `id` never changes — not on cell-content
  edit, not on cell-kind change (a `math` cell hand-edited into a `js` cell
  keeps its id), not on reorder. It is the **unit of diff and merge** (§7):
  the sync algorithm identifies "the same cell" across two documents purely
  by this id, never by position or content.
- **Uniqueness.** Two cells sharing an id within one document is a parse-time
  `DuplicateCellId` error (§3.5's error model applies workbook-wide, not just
  to math cells).
- **Reserved attribute namespace.** `attr` is defined as exactly one form
  (`id=hex8`) in v3; the grammar's `(" " attr)*` leaves room for a future
  space-separated `key=value` attribute without widening the fence-kind
  token. A v3 parser encountering an unrecognised `key=value` attribute
  preserves it verbatim (round-trips it) but does not interpret it.

### 2.3 Fence info grammar

Given above (2.2) — repeated here per the outline for a single point of
reference: `fence_open ::= "```" cell_kind (" " "id=" hex8)? "\n"`.

### 2.4 Ordering and document flow

**Document order** (top-to-bottom in the file) governs two things only:
rendering order (the "scientific paper" reading order, mobile paper view
included) and the JS Runtime's initial DOM insertion order. It governs
**neither** math-cell evaluation order nor JS-cell evaluation order:

- Math-cell definitions across the **whole document share one flat
  namespace** — `name → expression` — exactly as idl0's single
  `math_channels[]` array did. Splitting definitions across several `math`
  cells, or ordering `name = expr` lines within one cell, is purely
  organisational; `[Name]` references resolve by name via `math::resolve`
  (deps-first, cycle-guarded), never by textual position. A definition may
  reference a name defined in a `math` cell that appears *later* in the
  file.
- JS cells depend on host variables (§5.1) by name; `@observablehq/runtime`
  schedules them by its own topological dependency order, independent of
  document position (design §4, "Reactive DAG across two runtimes").
- Front matter always precedes the first segment; there is no "front-matter
  cell." §7 gives its own (non-cell) merge rule.

**Prose merge unit.** Prose has no id, so §7's per-cell merge cannot apply to
it directly. Rule: **a prose span belongs to the fenced cell that
immediately follows it**, as that cell's `prose_before` text (from the end
of the previous fenced cell, or the end of front matter for the first span,
up to the next fence-open). The one document position with no following
cell — trailing prose after the *last* fenced cell — belongs to that last
cell as `prose_after` (a field only the final cell in a document can carry).
Rationale for "belongs to the next cell" over the alternative ("belongs to
the previous cell"): prose in this format is overwhelmingly *introducing*
the cell below it (see the worked example in design §5 — "# Fork tuning…"
precedes the `math` cell it describes), so attaching it forward keeps a
cell's caption travelling with a rename/reorder of that cell, matching how
an author actually edits. A document with **zero** fenced cells (pure prose,
e.g. a written-only note) is legal; §7 gives its merge rule as plain
three-way text merge, since there is no cell to attach it to.

### 2.5 The design §5 worked example, restated literally

*This subsection is not part of the brief's Step-1 outline. It restates
design §5's worked example so checklist item (a) is checkable, and is
added here, beyond the outline, with lead approval (review round 1,
Important finding 3).*

Design §5's worked example is illustrative shorthand — its own `id: 9f3c…`
is visibly elided — not literal v3 syntax. Restated here so it
demonstrably parses under §§2–5 exactly as written (checklist item (a)),
with every departure from the design doc's prose form named and justified.

**`g` removed from the example's `constants`, amended post-sign
(2026-09-04, lead ruling R37).** The design doc's prose form declared
`g: 9.80665` in front matter. That cannot parse: `g` is one of the four
universal math constants in `RESERVED_NAMES` (§3.5.A, extended by R20),
so `merge_constants` refuses it as a `ReservedName` — which made this
subsection's own claim ("demonstrably parses under §§2-5 exactly as
written") false, and left `workbook::v3::tests::
parse_workbook_c2_5_worked_example_parses_id_version_and_both_cells`
failing from the moment Task 4 landed the check. The reserved-name rule
is the correct half and stands: `[g]` must always mean standard gravity.
The declaration was redundant anyway: `g` resolves in any expression
without being declared, so dropping it from `constants` costs the
example nothing.

```
---
id: 9f3c1e2d-4b6a-4f1c-9c3d-2a7e8f9b0c1d
name: Fork tuning
constants: { rider_mass_kg: 82 }
---
# Fork tuning — Whistler, 2026-08-30

​```math id=a1b2c3d4
fork_velocity = differentiate([fork_travel])
fork_bottom_out = [fork_travel] > 195
​```

​```js id=e5f6a7b8
Plot.plot({ marks: [Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })] })
​```

Bottom-outs this lap: ${fork_bottom_out.v.filter(Boolean).length}
```

Departures from the design doc's prose, and why each is required:

- **`id` given as a real UUIDv4.** The design doc's `9f3c…` is visibly
  truncated for page width, not a literal value (§1 requires a well-formed
  UUIDv4 — `MissingFrontMatterId`, §3.5).
- **`version` omitted, not defaulted explicitly.** Now legal as written —
  §1 defaults an absent `version` to `3`.
- **`deriv(fork_travel, t)` → `differentiate([fork_travel])`.** `deriv` is
  not in §3.3's catalog (the catalog is `call_function`'s dispatch table
  verbatim — no aliasing is introduced by this contract, since the
  expression grammar is fixed to be *exactly* the existing evaluator's,
  §3.2). `differentiate(ch)` is the one-argument function that computes
  this. Channel references are always bracketed (`parse.rs`'s own error
  for a bare identifier: `"did you mean [fork_travel]?"`) — `fork_travel`
  unbracketed is a `Parse` error, not valid v3.
- **`fork_travel > 195` → `[fork_travel] > 195`.** Same bracket rule.
- **Both fences gain `id=` attributes.** Required for anything past a
  first save (§2.2); the design doc's example predates id assignment.
- **`count(fork_bottom_out)` → `fork_bottom_out.v.filter(Boolean).length`.**
  `count` is not a bound host global (§5.1's table has no bare `count`) —
  `math::aggregate::count` exists only inside `math`-cell expressions
  (§3.3), and §5.2 already states `${…}` cannot reach it. The design
  doc's inline example is shorthand for "however the author reduces it in
  JS"; the literal rewrite reduces the bound `{length,t,v}` object's `v`
  column directly.

With these corrections, the document parses cleanly under §§2–5: front
matter supplies a valid `id`/`name`/`constants` and defaults `version`;
the `math` cell's two `def_line`s both match §3.1's grammar and reference
only §3.3 catalog functions; the `js` cell matches §5.3's `plotForm`
grammar exactly (it is Example 1 of §5.3, restated); the inline `${…}`
matches §5.2.

---

## 3. Math cells

### 3.1 Definition syntax

```ebnf
math_body     ::= math_line*
math_line     ::= blank_line | comment_line | const_line | def_line
blank_line    ::= /[ \t]*\n/
comment_line  ::= /[ \t]*#[^\n]*\n/
const_line    ::= /[ \t]*/ "const" /[ \t]+/ identifier /[ \t]*/ "=" /[ \t]*/ number trailing_comment? "\n"
def_line      ::= /[ \t]*/ identifier /[ \t]*/ "=" /[ \t]*/ expression trailing_comment? "\n"
identifier    ::= /[A-Za-z_][A-Za-z0-9_]*/
trailing_comment ::= /[ \t]+#[^\n]*/
expression    ::= (* crate::math::parse::parse — see §3.2 *)
number        ::= "-"? (* crate::math::token's Number literal — int/float, optional exponent; the optional leading minus was added post-sign (2026-09-04, lead ruling R24): front matter's `"<number> <unit>"` form already accepted `-?`, and a `const offset = -1.5` line being an error while `constants: {offset: -1.5}` is not was an asymmetry with no expression-level escape hatch. Tokenizer shape `[Minus, Number, Eof]`, value negated. *)
```

**`identifier` is new and load-bearing.** idl0's `MathChannel.name` was free
text (spaces and punctuation allowed — e.g. `"Roll rate (deg/s)"`,
`"Fork velocity"`). v3 requires a definition name to be a valid JS
identifier because §5.1 exposes **one JS host variable per math
definition, by name** — `Roll rate (deg/s)` cannot be a JS binding. This is
a deliberate new constraint of the v3 grammar, not a carry-forward; §6
gives the exact migration rule for idl0 names that don't already qualify
(all nine AHRS built-ins do not).

**Display-name annotation.** A `def_line`'s `trailing_comment` is an
ordinary `#` comment *except* one specific form: `# label: <text>` (the
literal word `label` following `#` and optional whitespace, a colon, then
free text to end of line) is recognised as the definition's **display
name** — the string
the UI shows in the channel list, chart legends, and any Properties-form
control that names this definition, distinct from the JS-identifier-
constrained `name` on the left of `=`. This is how a migrated idl0 name
like `"Roll (deg)"` (not a legal `identifier`) survives as what a human
reads, while the identifier itself (`roll_deg`) is what code references —
see §6 for the exact migration rule that produces both. A definition with
no `# label:` comment has no display name; the UI falls back to the
identifier itself.

`[ChannelName]` **references** (inside an `expression`) are unaffected by
this constraint and keep the existing tokenizer's rule verbatim — the
bracketed text is captured as-is, spaces and all (`crate::math::token`,
"names may contain spaces and digit-leading segments"). In practice a
reference will only ever contain spaces when it targets a *raw session*
channel that happens to have one (none do, per the channel catalog) — the
only spaced idl0 names were math-channel names, and those are now
identifiers. A `[Name]` naming a v3 math definition must match that
definition's identifier exactly.

**Constants — two sources, one flat namespace, per-cell error if they
collide:**
1. Front-matter `constants` map (§1) — workbook-scoped, always available.
2. `const name = value` lines inside any `math` cell (chosen syntax; see
   below), also workbook-scoped once parsed (not scoped to their own cell —
   matching the flat-namespace rule above, so a `const` declared in one math
   cell is usable from every math cell and every JS cell's `constants`
   object).

**Why `const NAME = value` and not bare `NAME = value`:** a bare
`name = value` line is already the syntax for a *channel* definition
(`def_line`); distinguishing a constant declaration needs either a
different sigil or a keyword. `const` is chosen over, e.g., a front-matter–
only policy (rejected: agents and authors routinely want a scratch constant
right next to the expression using it, without round-tripping through YAML)
and over inferring "constant vs. channel" from the right-hand side being a
bare number (rejected: `k = 9.81` would then be ambiguous with a one-sample
channel def whose expression happens to be a literal — `pressure = 9.81`
should define a rate-0 channel, not silently become a constant). The
keyword makes the two forms lexically distinguishable at the start of the
line, mirroring `const` as a reserved word: `const` is **not** a legal
`identifier` for a channel definition or for a constant itself (a
`const const = 1` line is a `ReservedName` error, §3.5).

Constant **names** are not restricted to `identifier` (unlike math
definitions) — they are consumed only via the JS `constants` object
(`constants["rider mass"]` or `constants.g`), never as a bare JS variable
(§5.1), so a front-matter constant name may contain spaces. A `const` line's
name, however, **is** restricted to `identifier` (the const grammar reuses
`identifier`) so that the two constant sources look and validate the same
way at the point of declaration; a front-matter constant wanting a
spaced/free-text name is therefore only expressible in YAML, not via a
`const` line — an intentional asymmetry, not an oversight, since `const`
lines are meant for quick scratch values an agent types inline.

**Unit-suffix syntax for front-matter constants** (referenced from the
outline, §1): a YAML value is either a bare number (`sag_target: 0.3`, unitless)
or a string `"<number> <unit>"` matched by
`/^\s*(-?\d+(\.\d+)?([eE][+-]?\d+)?)\s+(\S.*)\s*$/`; the numeric group is
the usable scalar, the unit-string group is **display metadata only** — it
is never dimensionally checked or converted, matching idl0's existing
`constants` semantics ("changing a stored value does not update existing
expressions that used it," SPEC §19). Example: `rider_mass_kg: "82 kg"` is
equivalent in evaluated value to `rider_mass_kg: 82`; the `"kg"` is for a
future constants-panel display only.

### 3.2 Expression grammar

The expression grammar inside `def_line`/`const_line`'s right-hand side is
**exactly** the existing evaluator's grammar, unmodified by this contract —
by reference to:
- Tokenizer: `rust/core/src/math/token.rs` (`tokenize`).
- Parser: `rust/core/src/math/parse.rs` (`parse`, producing `Ast`), grammar
  `or → and → comparison → additive → multiplicative → unary → primary`.
- Evaluator: `rust/core/src/math/eval.rs` (`evaluate`, `call_function`).

**Operators** (from `parse.rs` `BinOp`/`UnOp`, all elementwise per
`eval.rs` `elemwise`/`apply_binary`):

| Operator | Kind | Semantics |
|---|---|---|
| `+ - * /` | binary, arithmetic | Elementwise; `/` by zero is a typed `DivisionByZero` error, not `Inf`/`NaN`. |
| `< > <= >= == !=` | binary, comparison | Elementwise; result `1.0`/`0.0`. |
| `and` `or` | binary, keyword (infix) | Elementwise truthiness (`≠0.0`); **not** call syntax — `x > 0 and y < 10` is valid, `and(x, y)` is a parse error. |
| `not` | unary, keyword (prefix) | Elementwise logical negation. |
| `-` (unary) | unary | Elementwise negation. |
| `[Name]` | primary | Channel/math-definition reference (§3.1). |
| `{name}` / `{name[]}` | primary | Table-cell reference — structurally unavailable in a `math` cell's channel-lookup context (`ChannelLookup::lookup_cell` defaults to `None`); parses but errors `UnknownChannel` at eval time outside a `table` cell. Documented here because the tokenizer accepts it everywhere; §4 is where it is meaningful. |
| `(...)` | primary | Grouping. |

**Constants as bare identifiers.** Four *universal* constants resolve to a
literal at parse time regardless of any front-matter/`const` declaration —
`pi` (π), `tau` (2π), `e` (Euler's number), `g` (`9.80665`, standard
gravity, m/s²) — defined in `math::parse::constant_value`. A workbook
`constants` entry or `const` line sharing one of these four names is a
`ReservedName` validation error (§3.5): the universal four are never
shadowable, so `[IMU1_AccelZ] * g` is unambiguous in every workbook. Any
other declared constant resolves the same way (a literal, substituted at
the point of use) but is not built into the tokenizer — it is a workbook-
level table the parser consults (`name → f64`) before falling through to
"unexpected identifier" (§3.1's flat constants namespace).

### 3.3 Builtin catalog

Every function `crate::math::eval::call_function` dispatches, by reference
to that match statement (`rust/core/src/math/eval.rs`) — the source of
truth — cross-checked against SPEC §19's table and idl0's Dart
`MathChannelValidator.knownFunctions` (`app/lib/data/math_channel.dart`).
**Status** is `Implemented` unless the function's own match arm returns
`MathEvalErrorKind::NotImplemented` (it still parses and validates — the
"NotImplemented" functions are part of the grammar's committed surface,
not absent from it). **In idl0 knownFunctions?** records whether the name
appears in the Dart allowlist being retired by this migration (§6);
`sum`/`count`/`first`/`last`/`p`/`detrend` and every vector/rotation
function are omissions in that allowlist the engine already implemented —
carried forward here as ordinary catalog entries, not new.

| Function | Signature | Category | Output units | Status | In idl0 `knownFunctions`? |
|---|---|---|---|---|---|
| `butter` | `butter(order, cutoff_hz, "low"\|"lowpass"\|"high"\|"highpass", ch)` | Filter | same units as `ch` | Implemented (`"band"` rejected as a `Runtime` error, not parsed as a 3rd type) | yes |
| `sosfilt` | `sosfilt(sos, ch)` | Filter | same units as `ch` | NotImplemented | yes |
| `declip` | `declip(ch)` | Reconstruction | same units as `ch` (designed for ±32 g-clipped accel, g) | Implemented | yes |
| `integrate` | `integrate(ch)` | Time-domain | `[ch]·s` | Implemented | yes |
| `differentiate` | `differentiate(ch)` | Time-domain | `[ch]/s` | Implemented | yes |
| `detrend` | `detrend(ch)` \| `detrend(ch, "linear"\|"constant"\|"mean"\|"none")` | Time-domain | same units as `ch` | Implemented | **no** |
| `rms` | `rms(ch)` → scalar \| `rms(ch, w)` → rolling channel, `w` window in samples | Time-domain / aggregate | same units as `ch` | Implemented | yes |
| `mean` | `mean(ch)` → scalar \| `mean(ch, w)` → rolling channel | Time-domain / aggregate | same units as `ch` | Implemented | yes |
| `std` | `std(ch)` → scalar (population σ) \| `std(ch, w)` → rolling channel | Time-domain / aggregate | same units as `ch` | Implemented | yes |
| `median` | `median(ch)` → scalar | Aggregate | same units as `ch` | Implemented (2-arg rolling `median(ch, w)` is NotImplemented) | yes |
| `sum` | `sum(ch)` → scalar | Aggregate | same units as `ch` (raw sum, not time-normalised) | Implemented | **no** |
| `count` | `count(ch)` → scalar | Aggregate | count (dimensionless) | Implemented | **no** |
| `first` | `first(ch)` → scalar | Aggregate | same units as `ch` | Implemented | **no** |
| `last` | `last(ch)` → scalar | Aggregate | same units as `ch` | Implemented | **no** |
| `p` | `p(ch, quantile)` → scalar, `quantile` ∈ [0,100] | Aggregate | same units as `ch` | Implemented | **no** |
| `abs` | `abs(x)` | Elementwise | same units as `x` | Implemented | yes |
| `sqrt` | `sqrt(x)` | Elementwise | `√[x]` (meaningful only if `x` is unitless or a squared unit) | Implemented | yes |
| `sign` | `sign(x)` | Elementwise | dimensionless, ∈ {-1, 0, 1} (NaN→NaN) | Implemented | yes |
| `floor` `ceil` `round` | `floor(x)` / `ceil(x)` / `round(x)` | Elementwise | same units as `x` | Implemented | yes |
| `pow` | `pow(x, y)` | Elementwise | `[x]^y` (engine does not track units; meaningful for unitless/integer `y`) | Implemented | yes |
| `min` | `min(ch)` → scalar \| `min(a, b)` → elementwise | Aggregate / elementwise | same units as operand(s) | Implemented | yes |
| `max` | `max(ch)` → scalar \| `max(a, b)` → elementwise | Aggregate / elementwise | same units as operand(s) | Implemented | yes |
| `clamp` | `clamp(ch, lo, hi)` | Elementwise | same units as `ch` (`lo`/`hi` given in `ch`'s units) | Implemented | yes |
| `sin` `cos` `tan` | `sin(x)` etc. | Trig | dimensionless ratio; `x` in radians | Implemented | yes |
| `asin` `acos` `atan` | `asin(x)` etc. | Trig | radians | Implemented | yes |
| `atan2` | `atan2(y, x)` | Trig | radians | Implemented | yes |
| `sinh` `cosh` `tanh` | `sinh(x)` etc. | Trig | dimensionless | Implemented | yes |
| `deg2rad` | `deg2rad(x)` | Trig conversion | radians (`x` in degrees) | Implemented | yes |
| `rad2deg` | `rad2deg(x)` | Trig conversion | degrees (`x` in radians) | Implemented | yes |
| `fft` | `fft(ch, "hann"\|"hamming"\|"rect"\|"rectangular")` | Frequency | same units as `ch` (magnitude), indexed by bin `k`, `freq[k] = k·sample_rate_hz/n` Hz | Implemented | yes |
| `spectrogram` | `spectrogram(ch)` | Frequency | n/a — 2-D result, no 1-D channel form | NotImplemented (deferred permanently — no channel-shaped output exists; §5.1's raster path is the real spectrogram surface) | yes |
| `hilbert` | `hilbert(ch)` | Frequency | same units as `ch` | NotImplemented | yes |
| `correlate` | `correlate(a, b)` | Correlation | `[a]·[b]` | NotImplemented | yes |
| `convolve` | `convolve(ch, kernel)` | Correlation | `[ch]·[kernel]` | NotImplemented | yes |
| `resample` | `resample(ch, hz)` | Resampling | same units as `ch` | NotImplemented | yes |
| `if` | `if(cond, t, f)` | Logic | units of `t`/`f` branches (must match) | Implemented | yes |
| `current_lap` | `current_lap()` | Lap | 1-based lap number, `0` outside any lap (dimensionless) | Implemented | yes |
| `lap_start_time` | `lap_start_time(n)` | Lap | s, `NaN` if `n` out of range | Implemented | yes |
| `lap_start_distance` | `lap_start_distance(n)` | Lap | m, `NaN` if `n` out of range or no `[Distance]` in session | Implemented | yes |
| `sector_number` | `sector_number()` | Lap | 0-based sector index, `NaN` outside any sector (dimensionless) | Implemented | yes |
| `variance_time` | `variance_time(ch)` | Variance | same units as `ch` (main − overlay, time-matched) | Implemented | yes |
| `variance_dist` | `variance_dist(ch)` | Variance | same units as `ch` (main − overlay, arc-length-matched) | Implemented | yes |
| `attitude` | `attitude("roll"\|"pitch")` | Estimator (diagnostic) | degrees | Implemented | yes |
| `body_accel` | `body_accel("long"\|"lat")` | Estimator (diagnostic) | g | Implemented | yes |
| `wheel_travel` | `wheel_travel("front"\|"rear")` | Estimator | mm | Implemented | yes |
| `wheel_velocity` | `wheel_velocity("front"\|"rear")` | Estimator | mm/s | Implemented | yes |
| `vec` | `vec(x, y, z)` | Vector | Vec3 (intermediate; units of `x`/`y`/`z`, must match) | Implemented | **no** |
| `vx` `vy` `vz` | `vx(v)` etc. | Vector | same units as `v`'s components | Implemented | **no** |
| `vadd` `vsub` | `vadd(a, b)` / `vsub(a, b)` | Vector | same units as operands (must match) | Implemented | **no** |
| `vscale` | `vscale(v, s)` | Vector | `[v]·[s]` | Implemented | **no** |
| `cross` | `cross(a, b)` | Vector | `[a]·[b]` | Implemented | **no** |
| `dot` | `dot(a, b)` | Vector | `[a]·[b]` | Implemented | **no** |
| `norm` | `norm(v)` | Vector | same units as `v`'s components | Implemented | **no** |
| `normalize` | `normalize(v)` | Vector | dimensionless (unit vector) | Implemented | **no** |
| `angle` | `angle(a, b)` | Vector | radians, ∈ [0, π] | Implemented | **no** |
| `rotate_mat` | `rotate_mat(v, m00..m22)` (row-major, scalar entries) | Rotation | same units as `v` | Implemented | **no** |
| `rotate_axis` | `rotate_axis(v, ax, ay, az, angle)` (scalars; `angle` radians) | Rotation | same units as `v` | Implemented | **no** |
| `rotate_euler` | `rotate_euler(v, roll, pitch, yaw)` (radians; args may be channels — per-sample rotation) | Rotation | same units as `v` | Implemented | **no** |

69 named functions total (63 `Implemented`, 6 `NotImplemented`/deferred:
`sosfilt`, `spectrogram`, `hilbert`, `correlate`, `convolve`, `resample` —
recounted directly from the table above by expanding every multi-name row,
e.g. `floor`/`ceil`/`round` as 3, `vx`/`vy`/`vz` as 3, `vadd`/`vsub` as 2,
rather than restated from memory). One function,
`main(col[])`, exists in `call_function` but is **table-cell only**
(reads `MathLapContext::baseline_row`, which is never populated outside a
table evaluation) — it is documented in §4, not here, and is a `Runtime`
error (`NaN` result, not an error — it returns `Value::Scalar(NaN)` when
`baseline_row` is `None`) if called from a `math` cell.

**Checklist cross-check (brief item e):** every one of idl0's 48
`MathChannelValidator.knownFunctions` entries — `butter`, `sosfilt`,
`declip`, `integrate`, `differentiate`, `rms`, `mean`, `std`, `median`,
`fft`, `spectrogram`, `hilbert`, `correlate`, `convolve`, `resample`,
`abs`, `sqrt`, `pow`, `sign`, `min`, `max`, `clamp`, `floor`, `ceil`,
`round`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `sinh`,
`cosh`, `tanh`, `deg2rad`, `rad2deg`, `if`, `current_lap`,
`lap_start_time`, `lap_start_distance`, `sector_number`, `variance_time`,
`variance_dist`, `wheel_travel`, `wheel_velocity`, `attitude`,
`body_accel` — appears in the table above. None omitted.

### 3.4 Unit table

Reused from `app/lib/data/math_quantity.dart` (`kMathQuantities` +
`defaultUnit`) as the table L6 consults for axis-label suggestions per §1's
`units: si|imperial` preference. Not evaluated by the engine — no v3
construct reads this table at parse/eval time (§1). Units listed
primary-first; **default (SI)** is always index 0; **default (imperial)**
is index 0 unless overridden.

| Quantity | Units (primary first) | Default (SI) | Default (imperial) |
|---|---|---|---|
| Acceleration | g, m/s², ft/s² | g | g |
| Speed | km/h, m/s, mph, ft/s | km/h | mph |
| Length & Distance | m, km, ft, mi | m | ft |
| Angle | °, rad | ° | ° |
| Angular Speed | deg/s, rad/s, rpm | deg/s | deg/s |
| Angular Acceleration | deg/s², rad/s² | deg/s² | deg/s² |
| Frequency | Hz, kHz | Hz | Hz |
| Time | s, ms, μs | s | s |
| Pressure & Stress | kPa, psi, bar, MPa | kPa | psi |
| Pressure Delta | kPa, psi, bar | kPa | psi |
| Temperature | °C, °F, K | °C | °F |
| Temperature Delta | °C, °F, K | °C | °F |
| Force | N, kN, lbf | N | lbf |
| Force Rate | N/s, kN/s | N/s | N/s |
| Torque | N·m, ft·lbf | N·m | ft·lbf |
| Power | W, kW, hp | W | hp |
| Energy & Work | J, kJ, Wh, kWh | J | J |
| Spring Constant | N/mm, lb/in, N/m | N/mm | lb/in |
| Mass | kg, lb, g | kg | lb |
| Current | A, mA | A | A |
| Electric Charge | mAh, Ah, C | mAh | mAh |
| Voltage | V, mV | V | V |
| Curvature | 1/m | 1/m | 1/m |
| Ratio | (unitless) | — | — |
| Unitless | count, raw, ADC | count | count |

### 3.5 Validation errors

Two layers, cell-scoped (`{cell_id, message}`, `cell_id` = the owning
`math`/`table` cell's fence id, or the literal string `"front-matter"` for
a front-matter-level problem):

**A. Parse-time / structural** (new to workbook v3; not in
`MathEvalErrorKind` because they concern the *document*, not one
expression):

| Kind | Trigger | Message shape |
|---|---|---|
| `DuplicateCellId` | Two fenced cells share `id=` | `"Cell id '<id>' used by more than one cell"` |
| `DuplicateDefinition` | Same identifier defined twice (any `math` cell, any line) | `"'<name>' is defined more than once"` |
| `DuplicateConstant` | Same constant name in front matter and/or two `const` lines | `"Constant '<name>' is declared more than once"` |
| `InvalidIdentifier` | A `def_line`/`const_line` name doesn't match `identifier` (§3.1) | `"'<name>' is not a valid definition name — use letters, digits, underscore, and don't start with a digit"` |
| `ReservedName` | A definition or constant is named `const`, one of the four universal constants (`pi`/`tau`/`e`/`g`), a host-var name (`Plot`/`d3`/`Inputs`/`html`/`laps`/`session`/`constants`/`channel`), or — *added post-sign 2026-09-04, lead ruling R20 (`runs/2026-09-03/decisions.md`)* — one of the two engine-synthesized channel names (`Time`/`Distance`): a definition named `Time` would otherwise shadow the session's time axis document-wide, silently, which C1's "time is recorded, not assumed" exists to prevent | `"'<name>' is reserved and can't be used as a definition or constant name"` |
| `InvalidFrontMatter` | *Added post-sign (2026-09-04, lead ruling R21)* — the front-matter YAML block itself fails to parse (a scanning/mapping error before any key, including `id`, can be read) | `"Workbook front matter is not valid YAML: <parser error>"` |
| `MissingFrontMatterId` | Front matter **parses as valid YAML** but lacks a well-formed UUIDv4 `id` (key absent, empty, or not a UUIDv4) — *narrowed post-sign (2026-09-04, lead ruling R21): a front-matter block that isn't valid YAML at all is `InvalidFrontMatter` above, not this kind. Withdraws Task 1's interim collapse of both failure modes into this one kind (`runs/2026-09-03/decisions.md`, "Tracked: L3 Task 1 landed")* | `"Workbook front matter is missing a valid 'id'"` |
| `UnsupportedWorkbookVersion` | `version` ≠ `3` | `"Workbook version <n> is not supported (expected 3)"` |
| `InvalidCellId` | *Added post-sign (2026-09-04, lead ruling R21)* — a fence's `id=` attribute is present but its value does not match `hex8` (§2.2, `/[0-9a-f]{8}/`: exactly 8 lowercase hex characters). Withdraws Task 1's interim behaviour of silently treating a malformed `id=` as absent and generating a fresh replacement id (`runs/2026-09-03/decisions.md`, "Tracked: L3 Task 1 landed") — a typo'd id can no longer be lost silently on save | `"Cell id '<id>' is not a valid identifier — must be 8 lowercase hex characters"` (`<id>` is the fence's literal, malformed `id=` value) |
| `InvalidTableJson` | *Added post-sign (2026-09-04, lead ruling R21)* — a `table` cell's fence body does not deserialize as `TableModel` (§4) | `"Table cell JSON is malformed: <serde_json error text>"` |

**B. Evaluation-time** (per definition, lazy — reuses
`MathEvalErrorKind` verbatim from `rust/core/src/math/error.rs`: `Parse`,
`UnknownFunction`, `UnknownChannel`, `ArgCount`, `Type`, `DivisionByZero`,
`NoLapContext`, `NotImplemented`, `Runtime`). A validation or evaluation
failure in one definition never blocks another — CLAUDE.md §5 ("missing
math channel reference → inline validation error, don't block other
channels") extends verbatim to workbook v3: the JS host variable for a
failing definition surfaces as an error marker (§5.1), every other
definition still evaluates.

---

## 4. Table cells

A `table` cell's fence body is one JSON object — the existing
`idl_rs::table::TableModel` (`rust/core/src/table/model.rs`) verbatim,
`camelCase` keys, unchanged by this contract (it is already the "portable
artifact" per that module's own doc comment):

```ebnf
table_body ::= json_object    (* TableModel — see schema below *)
```

| Field | Type | Meaning |
|---|---|---|
| `columns` | `Column[]` | `{ id: string, name?: string, template?: string }`. `name` is the `{name}`/`{name[]}` reference target; `template` is a formula applied to every cell in the column lacking its own `formula`. |
| `rows` | `Row[]` | `{ id: string, context?: RowContext }`. |
| `context` | `RowContext?` | `{ sessionId: string, lapIndex: number }` — binds the row to a lap window so its `[Channel]` refs resolve there. |
| `cells` | `Cell[][]` | `cells[r][c]`: `{ formula?: string, literal?: number, name?: string }`. `literal` short-circuits evaluation; else `formula` (or the column `template`) evaluates in the row's context; `name` makes the cell a `{name}` target. |

Cell formulas use the §3.2 expression grammar plus `{cellName}` /
`{colName[]}` references (`TokenKind::CellRef`) and the table-only
`main({col[]})` function (§3.3), which reads the table's designated Main
row (`MathLapContext::baseline_row`) — `NaN` when unset. A minimal worked
example:

```json
{
  "columns": [
    { "id": "c0", "name": "lap" },
    { "id": "c1", "name": "fork_max", "template": "max([Fork travel])" }
  ],
  "rows": [
    { "id": "r0", "context": { "sessionId": "s1", "lapIndex": 1 } },
    { "id": "r1", "context": { "sessionId": "s1", "lapIndex": 2 } }
  ],
  "cells": [
    [ { "literal": 1 }, {} ],
    [ { "literal": 2 }, {} ]
  ]
}
```

(Empty `{}` cells fall back to column `c1`'s `template`, evaluated in each
row's lap context.)

---

## 5. JS cells

### 5.1 Runtime and host variables

`js` cells are standard Observable Runtime cells (`@observablehq/runtime`
6.0.0) executed inside the sandboxed iframe (design §6). The host injects
these variables into the Runtime's module scope before any cell runs —
none of them cross Tauri IPC directly from cell code (design's "no IPC on
the interaction path" principle: the host resolves them ahead of time and
feeds results in via `postMessage`):

| Variable | Shape | Source |
|---|---|---|
| one per `math` definition, by name (§3.1) | `{ length: number, t: Float64Array, v: Float64Array }` — a **column-oriented** (SoA) table matching Observable Plot's tabular-data protocol, so `Plot.lineY(fork_velocity, {x:"t", y:"v"})` addresses columns by name with zero-copy from the transferred `ArrayBuffer` (design's IPC data path: bytes → `Float32Array`/`Float64Array` view). | The host evaluates the definition (Rust), decimates to the current tile budget, and binds the result under its identifier. |
| `channel(name, {lap?: number, session?: string})` | Same `{length, t, v}` shape as above | General lookup — any raw/session/synthesized/math-defined channel by name, optionally windowed to one lap and/or a non-active session (cross-session compare, e.g. an overlay). Definitions already bound as bare identifiers are also reachable this way; `channel` is required when the id needed isn't a valid bare identifier caller-side (rare) or when lap/session scoping is needed. |
| `laps` | `{ number: number, startT: number, endT: number }[]` | Active session's lap table. |
| `session` | `{ id: string, name?: string, timestampUtcMs: number }` | Active session metadata (C1). |
| `constants` | `{ [name: string]: number }` | Flattened §3.1 constants (front matter + all `const` lines). Keys may contain spaces (`constants["rider mass"]`); no per-name identifier restriction (§3.1). |
| `Plot` | module namespace | `@observablehq/plot` 0.6.17 (bundled). |
| `d3` | module namespace | `d3` 7.9.0 (bundled). |
| `Inputs` | module namespace | `@observablehq/inputs` 0.12.0 (bundled). |
| `html` | tagged-template function | Observable Framework's standard `html` helper. **Open question §8-4**: the exact package (`htl`) is not yet in T1's pinned ecosystem list — flagged, not assumed. |

**Provisional note on the `{length, t, v}` shape.** This is the shape
`plotForm`'s `x: "t", y: "v"` accessors (§5.3) require to be literal string
field names rather than functions, and is chosen for consistency with the
zero-copy IPC design. It has **not** been verified against
`@observablehq/plot` 0.6.17's actual tabular-data support (Arrow/Arquero-
style column objects) the way T1 verified `arrow`/`parquet`/`tauri`
claims — see §8-3. If L6 finds Plot 0.6.17 does not accept this shape, the
concrete return type changes, but the c**ontract's grammar** for `x`/`y` as
literal `"t"`/`"v"` field-name strings (§5.3) does not — only the object
`channel()` returns changes, e.g. falling back to `{t, v}[]` (array-of-
records). Flagged as an implementation risk to close in L6, not a C2
grammar ambiguity.

### 5.2 Inline `${…}` in prose

```ebnf
inline_expr ::= "${" js_expression "}"
```

Evaluated as a JavaScript expression in the **same host-mediated scope**
as a `js` cell (all of §5.1's variables in scope); the result is coerced to
a string (template-literal semantics, i.e. `String(value)`) and spliced
into the rendered prose. Re-evaluated whenever the Runtime re-runs any
cell the expression's free variables depend on (same reactive scheduling
as a `js` cell). Example from design §5: `` Bottom-outs this lap:
${count(fork_bottom_out)} `` — `fork_bottom_out` is a bare host variable
per §5.1's first row; `count` is `@observablehq/plot`/user JS, **not**
`math::aggregate::count` (that Rust function only exists inside `math`
cells' expression grammar — `${…}` is JavaScript, with no access to the
Rust math grammar's functions except through the already-evaluated
`channel`/named-definition variables). This is worth stating explicitly:
`${…}` cannot call `integrate(...)`, `butter(...)`, etc. — those are
`math`-cell-only syntax.

### 5.3 The `plotForm` subset

`plotForm` is two pure functions (`generate(props) → code`,
`parse(code) → props | null`) that agree on **exactly** this grammar:

```ebnf
plot_call     ::= "Plot.plot(" plot_options ")"
plot_options  ::= "{" option ("," option)* "}"
option        ::= "x" ":" x_scale
                | "y" ":" y_scale
                | "color" ":" color_opt
                | "marks" ":" marks_array
x_scale       ::= "{" x_field ("," x_field)* "}"
x_field       ::= "label" ":" js_string
                | "domain" ":" "[" js_number "," js_number "]"
                | "type" ":" "\"linear\""
y_scale       ::= "{" y_field ("," y_field)* "}"
y_field       ::= "label" ":" js_string
                | "domain" ":" "[" js_number "," js_number "]"
                | "type" ":" ("\"linear\"" | "\"log\"" | "\"sqrt\"")
color_opt     ::= "{" "legend" ":" "true" "}"
marks_array   ::= "[" mark ("," mark)* "]"
mark          ::= "Plot." mark_name "(" channel_call "," mark_options ")"
mark_name     ::= "lineY" | "dot" | "areaY" | "rectY" | "ruleY"
channel_call  ::= "channel(" js_string ("," "{" "lap" ":" js_int "}")? ")"
mark_options  ::= "{" "x" ":" "\"t\"" "," "y" ":" "\"v\""
                       ("," "stroke" ":" css_color)?
                       ("," "strokeWidth" ":" js_number)? "}"
css_color     ::= js_string                (* any valid CSS color literal *)
```

Every key in every object is **optional** except `marks` (a plot with no
marks is legal but pointless — the form always seeds one) and each
`mark`'s `x`/`y` (always the literal pair `"t"`/`"v"`, never anything
else — §5.1 fixes the channel shape's field names, so there is nothing
else to bind). `x.type` accepts only the literal `"linear"` (equivalent to
omitting the key; the generator never emits it) — reserved for a future
non-time x-axis without widening the grammar now (§8-2 records this as
provisional). Object keys may appear in any order; the grammar above lists
them in the order `generate()` emits, which is also the order `parse()`
requires for a **byte-identical** round-trip (`generate(parse(code)) ===
code` for code the form itself produced) — a hand-edit that only reorders
recognised keys still **parses** successfully (the parser is
order-insensitive) but will not byte-round-trip until the form regenerates
it, which is expected and harmless.

**"Custom" — the exact rule.** A `js` cell is *custom* (Properties pane
greys out, "Reset to form" available) when `parse(code)` returns `null`.
That happens for **any** of:
- The cell's code is not a single top-level expression matching
  `plot_call` (extra statements, variable assignments, comments, multiple
  `Plot.plot(...)` calls, anything before/after the call).
- Any object key not in the grammar above (e.g. `fx`, `facet`, `style`,
  a computed/variable value in place of a grammar-defined literal).
  `x.type`/`y.type` outside the closed enum in the grammar above.
- A mark whose `mark_name` is not one of the five listed, or whose
  `mark_options` supply anything beyond `x`/`y`/`stroke`/`strokeWidth`, or
  whose `x`/`y` are not the literal strings `"t"`/`"v"`.
- A `channel_call` with more than a `name` and an optional `{lap}` object
  (no `session`, no extra keys — `session`-scoped marks are not
  representable in the form in v1; author them as custom code).
- Any non-literal value where the grammar requires a literal (a computed
  `stroke` from a variable, a spread, a template literal used for
  anything other than a plain string content).

There is no partial match: a cell either parses fully into `props` or is
entirely custom. This mirrors design §6's stated rule — "Code outside it
… greys the pane to custom code" — literally: greying is binary per cell.

**Four worked examples** (props shown as the Properties-pane's internal
state; `generate(props)` produces the code; `parse(code)` on that code
returns props deep-equal to the original — "round-trips conceptually" per
checklist item (b)). Between them these exercise three of the five
`mark_name` alternatives (`lineY`, `dot`, `areaY`) and every `x_scale`/
`y_scale` field (`label`, `domain`, `type` — `y.type` in Example 2,
`x.label`+`x.domain` in Example 4):

*Example 1 — single channel, axis labels only.*
```
props = {
  marks: [ { channel: "fork_velocity", lap: null, mark: "lineY" } ],
  x: { label: "Time (s)" },
  y: { label: "Velocity (m/s)" }
}
```
```js
Plot.plot({
  x: { label: "Time (s)" },
  y: { label: "Velocity (m/s)" },
  marks: [
    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })
  ]
})
```

*Example 2 — two channels, explicit colors, manual log-scale y domain,
legend.*
```
props = {
  marks: [
    { channel: "IMU1_AccelX", mark: "lineY", stroke: "#2196F3" },
    { channel: "IMU2_AccelY", mark: "lineY", stroke: "#4CAF50" }
  ],
  y: { domain: [-2, 2], type: "log" },
  color: { legend: true }
}
```
```js
Plot.plot({
  y: { domain: [-2, 2], type: "log" },
  color: { legend: true },
  marks: [
    Plot.lineY(channel("IMU1_AccelX"), { x: "t", y: "v", stroke: "#2196F3" }),
    Plot.lineY(channel("IMU2_AccelY"), { x: "t", y: "v", stroke: "#4CAF50" })
  ]
})
```

*Example 3 — lap-scoped dot mark, thicker stroke.*
```
props = {
  marks: [ { channel: "fork_bottom_out", lap: 3, mark: "dot", strokeWidth: 2 } ],
  y: { label: "Bottom-out event" }
}
```
```js
Plot.plot({
  y: { label: "Bottom-out event" },
  marks: [
    Plot.dot(channel("fork_bottom_out", { lap: 3 }), { x: "t", y: "v", strokeWidth: 2 })
  ]
})
```

*Example 4 — `areaY` mark, explicit `x` window (`label` + `domain`).*
```
props = {
  marks: [ { channel: "fork_travel", mark: "areaY", stroke: "#9C27B0" } ],
  x: { label: "Session time (s)", domain: [120, 180] },
  y: { label: "Travel (mm)" }
}
```
```js
Plot.plot({
  x: { label: "Session time (s)", domain: [120, 180] },
  y: { label: "Travel (mm)" },
  marks: [
    Plot.areaY(channel("fork_travel"), { x: "t", y: "v", stroke: "#9C27B0" })
  ]
})
```
`rectY`/`ruleY` are not given a separate worked example: both share
`areaY`'s exact `mark(channel_call, mark_options)` shape in the grammar
(§5.3's EBNF has one `mark` production for all five `mark_name`
alternatives) — swapping the literal token `"areaY"` for `"rectY"` or
`"ruleY"` in this same example produces the identical parse tree modulo
that one token, so a fifth/sixth render would demonstrate the same
production, not a new one.

---

## 6. Migration from `.idl0wb` v2

Two-stage, split by what each side can compute (Rust vs. `plotForm`
TypeScript):

**Stage 1 — CLI `idl-rs migrate-workbook` (Rust, pure JSON/text
transforms):**

*Invocation (added post-sign, 2026-09-04, lead ruling R25, wave-1 L3):*
`idl-rs migrate-workbook <INPUT> --output <OUTPUT>` — a positional input
path (the pattern every other subcommand uses) and a **required**
`-o`/`--output` (unlike `export`/`math`, where stdout is a legal sink; a
`.idl1wb` document on stdout would interleave with the migration report
below). The report is written to stdout; a failure uses the CLI's
existing error envelope on stderr.

| v2 field | v3 destination | Rule |
|---|---|---|
| `workbook_id` | front matter `id` | *Amended post-sign (2026-09-04, lead ruling R25, wave-1 L3).* Copied verbatim only when it parses as a UUID; otherwise a fresh `Uuid::new_v4()` is minted and the substitution is recorded in the migration report — a hand-authored v2 file's `workbook_id` is free text (`docs/legacy/idl0-workbook_format.md`), while C2 §1 requires a UUIDv4 `id`. |
| `name` | front matter `name` | Verbatim. |
| `workbook_version` (absent, 1, or 2) | front matter `version: 3` | *Amended post-sign (2026-09-04, lead ruling R25, wave-1 L3).* Accepted range is `1..=workbook::SUPPORTED_WORKBOOK_VERSION` (the constant, `rust/core/src/workbook/model.rs`, currently `2`) — an absent `workbook_version` defaults to `1`, matching the landed v2 reader's own default, not the legacy doc's stale "current max is 1, a value > 1 throws." A value outside that range refuses migration with an error, not a guess. |
| `created_at_ms`, `updated_at_ms` | *dropped* | No v3 front-matter equivalent; the filesystem mtime and (if the repo is versioned) commit history supersede an in-file timestamp. |
| `math_channels[]` | **one** `math` cell containing every definition as a `name = expression` line | All v2 channels collapse into a single cell (per design §5's stated migration rule), positioned as the first cell in the body. A name not matching v3's `identifier` grammar (§3.1) is sanitised per the exact algorithm in §6.1, which also preserves the original name as a `# label:` comment (§3.1) and rewrites every `[OldName]` reference in the migrated expression set to the new identifier. The CLI prints one warning line per renamed definition (`"<old>" → "<new>"`) to its migration report. |
| `math_channels[].quantity`, `.units`, `.decimal_places`, `.sample_rate_hz` | *dropped* | No v3 per-definition equivalent (§3.1 carries no display metadata — a raw/session channel's `unit` now lives in C1's Parquet column metadata instead; a math-derived channel has no engine-tracked unit, matching how the engine already ignored these fields, `channel_def.rs`). |
| `math_channels[].id`, `.color` | front matter transient key `_migrate_math` | *Added post-sign (2026-09-04, lead ruling R25, wave-1 L3).* Written as `_migrate_math: { "<v2 math_channel id>": { "identifier": "<v3 name>", "color": "<v2 color, or null>" } }`, one entry per v2 `math_channels[]` definition, keyed by its v2 `id` (defaulting to `name` when absent — the legacy format's own convention, `docs/legacy/idl0-workbook_format.md`). `identifier` is the migrated v3 identifier a `ChartSlot.mathChannelIds` entry in `_migrate_charts` (below) resolves against in Stage 2; `color` is the same **fallback** stroke source Stage 2's `channelColors` table (below) already describes — neither previously had a defined destination. Deleted by the app in the same Stage-2 pass that deletes `_migrate_charts` (idempotence rule unchanged, below). |
| `constants[]` | front matter `constants` map | `{name: value}`; `id` (defaulting to `name`) is dropped — v3 constants have no separate id, only a name (§1). A name colliding with a universal constant (`pi`/`tau`/`e`/`g`) is refused (`ReservedName`, §3.5) rather than silently shadowed. |
| `worksheets[].blocks[].content.kind == "table"` | one `table` cell per `TableModel` | The JSON is already the v3 shape (§4) — copied verbatim into a fence. *Corrected post-sign (2026-09-04, lead ruling R25, wave-1 L3): struck "and legacy `worksheets[].tables[]` if present" — no such array exists; the only legacy flat array is `charts` (migrated by the row below), and a table's content lives only at `blocks[].content.table` (`docs/legacy/idl0-workbook_format.md`).* |
| `worksheets[].charts[]` / `.blocks[].content.kind == "chart"` (`ChartSlot[]`) | staged for Stage 2 | Written into a **transient** front-matter key `_migrate_charts: [ <ChartSlot JSON>, … ]` (flattened across every worksheet, worksheet name/order dropped — see below) for the app to consume on first open. The CLI does not attempt Plot-code generation itself: `plotForm.generate` is TypeScript, and the CLI is Rust-only (this is the literal "CLI vs. app split" the outline asks for). |
| `worksheets[].name`, `.xAxisMode`, `.kind` (`sessionSheet`'s pinned `gpsMap`/`lapTable`/`lapProgression`) | *dropped* | No v3 worksheet concept at all (a `.idl1wb` is one flat cell sequence); no v3 chart type covers `gpsMap`/`lapTable`/`lapProgression` (out of the `plotForm` grammar, §5.3) — those three chart slots are simply not carried into `_migrate_charts`. `xAxisMode` (`wheelDistance`/`gpsDistance`) has no v3 analogue either — `plotForm`'s `x` is always `"t"` (§5.1); an author wanting a distance-indexed x-axis writes custom `js` code by hand post-migration. |
| `overlay_layouts[]` | *dropped* | D9 — no CLI or app handling, not even transiently. |

**Migration report and refusal policy** *(added post-sign, 2026-09-04,
lead ruling R25, wave-1 L3).* Beyond the one-line-per-rename warning
already named above, the CLI's migration report additionally lists: every
`mathChannelIds` entry across `_migrate_charts` that has no matching key
in `_migrate_math` (an unresolved chart reference — the migration does not
refuse for this, it tells the truth about what it could not carry); every
dropped `WorksheetBlock` field (`id`, `placement`, `overlayTargetId`,
`overlayOpacity`); and every table block whose `rowSource ==
"lapSelection"`, migrated as an ordinary authored table with an explicit
warning that its live N-lap comparison behaviour is not carried into v3.
None of these three report categories ever refuses the migration —
refusal is reserved for the rules already stated above (an unrecognised
`workbook_version`, a migrated constant colliding with `pi`/`tau`/`e`/`g`);
every other irregularity is reported and migrated through.

### 6.1 Identifier derivation for migrated definition names

*Added in review round 1 (controller ruling R22) — a load-bearing detail
of the `math_channels[]` row above, broken out because §3.1's
JS-identifier constraint means it applies to essentially every idl0
built-in and to any author-given name with a space or punctuation, and
the migration must be exact and reproducible, not "sanitised" left
undefined.*

**Algorithm**, applied to a v2 `MathChannel.name` that does not already
match v3's `identifier` grammar (§3.1):

1. Lowercase the whole name.
2. Replace every maximal run of characters outside `[a-z0-9]` with a
   single `_`.
3. Trim leading and trailing `_`.
4. If the result starts with a digit, prefix `_`.
5. If the result collides with another already-derived identifier in the
   same document, append `_2`, `_3`, … (first collision gets `_2`) in
   source order.

The **original name is never discarded**: it is written back as a
`# label: <original name>` trailing comment on the `def_line` (§3.1's
display-name annotation), so the UI shows `Roll (deg)` even though the
code and every reference to it now read `roll_deg`. Every `[OldName]`
reference elsewhere in the migrated expression set is rewritten to the
new identifier in the same rename pass (unchanged from the row above);
this includes references inside a **migrated `js` chart cell** (Stage 2,
below) — a `channel("Roll (deg)")` call from a v2-derived chart becomes
`channel("roll_deg")`, since `channel()`'s string argument names a v3
definition by its identifier, not its display name.

**Worked conversions:**

| v2 name | Step 2 (runs → `_`) | Step 3 (trim) | Step 4 (digit prefix) | Result | `# label:` comment |
|---|---|---|---|---|---|
| `Roll (deg)` | `roll_deg_` (lowercased: `roll (deg)` → non-alnum runs ` (`, `)` each collapse to one `_`) | `roll_deg` | n/a (doesn't start with a digit) | `roll_deg` | `# label: Roll (deg)` |
| `Fork travel [mm]` | `fork_travel_mm_` (lowercased: `fork travel [mm]` → runs ` `, ` [`, `]` each collapse to one `_`) | `fork_travel_mm` | n/a | `fork_travel_mm` | `# label: Fork travel [mm]` |

Rendered as migrated `def_line`s:
```
roll_deg = ...                              # label: Roll (deg)
fork_travel_mm = ...                        # label: Fork travel [mm]
```

If both `"Roll (deg)"` and `"Roll [deg]"` existed in the same v2 workbook
(both derive to `roll_deg` at step 3), the second processed (source order)
becomes `roll_deg_2`, per step 5, with its own correct `# label:` comment
distinguishing it from the first.

**Stage 2 — app, on first open of a migrated file (TypeScript
`plotForm.generate`):**

The app recognises a freshly migrated file by the presence of
`_migrate_charts`. For each `ChartSlot` in that array:

| `ChartSlot` field | `plotForm` prop | Rule |
|---|---|---|
| `chartType == "timeSeries"` | (selects conversion at all) | Any other `chartType` (`fft`, `spectrogram`, `histogram`, `varianceTrace`, `gpsMap`, `lapTable`, `lapProgression`) is **not convertible** — dropped with a console warning; no cell is emitted for it. |
| `channelIds[]` + `mathChannelIds[]` | one `marks[]` entry per id, `mark: "lineY"` | Each id becomes `Plot.lineY(channel("<id>"), {...})`; a `mathChannelIds` entry uses the (possibly sanitised, per Stage 1) migrated identifier. |
| `channelColors[channelId]` (ARGB int) | that mark's `stroke` | Converted `argb → "rgba(r,g,b,a)"` (`r=(argb>>16)&0xFF`, `g=(argb>>8)&0xFF`, `b=argb&0xFF`, `a=((argb>>>24)&0xFF)/255`). |
| *(absent from `channelColors`)* → `math_channels[].color` (Stage 1's carried-forward fallback, hex `#AARRGGBB`) | that mark's `stroke` | Same `rgba()` conversion, components read from the hex string instead of an int. |
| *(both absent)* | *(no `stroke` key)* | Plot's auto-palette applies — matches v2's own fallback behaviour. |
| `yScaleMode == "manual"`, `yMin`, `yMax` | `y.domain: [yMin, yMax]` | — |
| `yScaleMode == "auto"` | *(no `y.domain`)* | — |
| `yScale` ∈ {`linear`, `log`} | `y.type` | Direct mapping. |
| `yScale` ∈ {`sqrtSigned`, `squareSigned`} | *dropped, falls back to `linear`* | No `plotForm` grammar slot for a signed sqrt/square transform (§5.3's `y.type` enum is `linear`\|`log`\|`sqrt`, and even plain `sqrt` is not what v2's *signed* variant means) — warning logged, chart still converts with plain linear y. |
| `title` | *dropped* | No `plotForm` grammar slot for a title (§5.3). The app may insert the old title as a Markdown heading in the new cell's `prose_before` (§2.4) — a UI nicety, not part of this grammar. |
| `showZeroLine`, `heightFactor`, `scope` | *dropped* | No v3 analogue; a zero-reference line is expressible as hand-written custom code (`Plot.ruleY([0])`) but is not derived automatically (would require a literal-array mark source, which `plotForm`'s `channel()`-only `channel_call` grammar does not admit, §5.3). |

Each successfully converted `ChartSlot` becomes one new `js` cell
(`generate()`'s output), appended after the migrated `math` cell, in the
`_migrate_charts` array's order. When every entry has been processed
(converted or dropped-with-warning), the app deletes `_migrate_charts`
from front matter and writes the file — idempotent (a file without the key
is never touched by this step again) and one-time per file.

---

## 7. Merge semantics (for L11)

**Scope.** Applies to `.idl1wb` files only, over the LAN-sync protocol
(design §7). Pure function: `merge(local: Doc, peer: Doc, base: Doc) →
MergedDoc`, tested standalone (design's L11 "pure function over two parsed
workbooks + last-synced base"). `base` is the last document both sides
successfully synced; the app caches it at
`<data>/workbooks/.sync-base/<id>.idl1wb` (one hidden file per workbook,
overwritten after every successful sync). If no cache exists (first-ever
sync for that workbook, either side), `base` is treated as the empty
document (front matter only, zero cells) — every existing cell on either
side is then classified `Added`.

### 7.1 Front matter (not cell-based)

Merged **per top-level key**, independently of the cell table below:
- `id`, `version` — immutable; a mismatch between `local.id` and
  `peer.id` means these are not the same workbook (a different-file
  situation, not a merge — sync refuses and surfaces an error, never
  silently overwrites).
- `name`, `units` — scalar fields: unchanged-on-one-side takes the
  other's value; changed-on-both takes local's value and appends a
  one-line HTML comment noting the peer's value was discarded (front
  matter has no sub-document structure to hold a "conflict copy" the way
  a cell does): `<!-- conflict from <peer>: name was "<peer value>" -->`,
  placed as the first line of body prose.
- `constants` — merged **per entry** (`name → value`), same three rule as
  a scalar field but applied per map key: an entry added/changed on only
  one side carries through; an entry changed on both sides to different
  values keeps local's value and the same HTML-comment conflict note
  (one line per conflicting constant), rather than duplicating a "conflict
  constant" (constants have no natural conflict-copy form either).

### 7.2 Cell decision table

States are computed **per cell id**, relative to `base`, independently for
`local` and `peer`: `Unchanged` (present in base, byte-identical content),
`Changed` (present in base, different content), `Deleted` (present in
base, absent from this side), `Added` (absent from base, present in this
side). **A given id has exactly one base-membership fact** — base either
contains that id or it doesn't — so `Unchanged`/`Changed`/`Deleted` (which
all presuppose base-presence) can never legitimately co-occur, for the
*same id*, with `Added` (which presupposes base-absence) reported for the
*other* side. The six cells crossing `Added` against
`{Unchanged,Changed,Deleted}` are therefore **structurally impossible**
and are filled with the contradiction and its defensive handling, not left
blank — satisfying "all 16 cells filled" honestly rather than by
padding.

| Local ＼ Peer | Unchanged | Changed | Added | Deleted |
|---|---|---|---|---|
| **Unchanged** | No-op: cell unchanged on both sides. Keep local's copy verbatim. | Peer edited, local didn't: **peer's version wins** — adopt peer's content for this id. | *Impossible* (peer `Added` ⇒ base lacks this id; local `Unchanged` ⇒ base has it). Defensive handling: trust the concrete evidence (peer's document plainly contains this id and local's plainly doesn't differ from *some* base state) — treat as peer `Changed`/local `Unchanged` (adopt peer's content), logging a `merge_state_inconsistency` warning naming the id. | Peer deleted, local didn't touch it: **deletion propagates** (no edit exists to lose) — drop the cell locally too. |
| **Changed** | Local edited, peer didn't: **local's version wins** — keep local's content (already the case; no-op vs. peer, which pulls nothing for this id). | Both edited since base, to (assumed) different content: **conflict.** Keep local's cell in place; append peer's full cell immediately below it, with a fresh id (§2.2's collision-avoidance path — never reuses local's or peer's id) and a leading marker line `<!-- conflict from <peer> -->` immediately inside its fence's `prose_before`. If local's and peer's content is *byte-identical* despite both being `Changed` (same edit made independently on both sides), no conflict is emitted — the states coincide, not just the labels. | *Impossible* (same reasoning as above). Defensive handling: treat as `Changed`/`Added` is not resolvable without a real base — fall back to the ordinary same-id conflict rule (append peer's cell as a conflict copy below local's), which is safe (never silently drops data) even though the state labels are contradictory. Logged as `merge_state_inconsistency`. | Local edited, peer deleted: **edit wins, deletion is recorded, not silently discarded.** Keep local's (edited) cell; insert `<!-- conflict from <peer>: deleted upstream -->` into its `prose_before` so a human notices the tension. This is design §7's explicit "a cell deleted on one side and edited on the other is kept as a conflict cell" rule — "kept as a conflict cell" means the *edited* cell survives, marked, not that a second empty cell is invented to represent the deletion. |
| **Added** | *Impossible* (local `Added` ⇒ base lacks this id; peer `Unchanged` ⇒ base has it). See note below the table — this is the vacuous direction of the asymmetry (peer, by definition, has no status at all for an id its document has never contained). Handling: not really a table cell at all — see the unary rule below. | *Impossible*, same reasoning. See below. | **Both sides independently created a cell that happens to carry the same random 8-hex id** (§2.2 notes the collision probability is ~2⁻³² per pair — vanishingly rare but not provably zero). Treated exactly like the `Changed`×`Changed` same-id-conflict rule above: keep local's, append peer's as a conflict-marked copy under a freshly minted id. | *Impossible*, same reasoning. See below. |
| **Deleted** | Local deleted, peer didn't touch it: **deletion propagates** (symmetric to Unchanged×Deleted) — cell is gone from the merged result. | Peer edited, local deleted: **edit wins** (symmetric to Changed×Deleted above) — adopt peer's edited content, with the same `<!-- conflict from <peer>: deleted locally -->` marker, attributed to whichever side is "local" in that peer's own merge run (the marker text is written from the perspective of the document being produced). | *Impossible*, same reasoning as the `Added` row. See below. | Both sides deleted: **agreement** — cell is gone, no marker needed. |

**The `Added` row/column's true rule (not really a 4×4 cell — a unary
one).** An id that is `Added` on one side has, by construction, no entry
at all on the other side unless that side coincidentally used the exact
same id (the `Added`×`Added` cell, handled above) — there is no
"peer status" to cross against, because the peer document simply doesn't
contain that id. The real rule, applied once per newly-added id rather
than read out of the grid: **union unconditionally.** A cell added only
locally is kept (it's already there); a cell added only by the peer is
inserted into the merged document. The six `Added×{U,C,D}` /
`{U,C,D}×Added` grid cells above exist only to satisfy "every cell filled"
honestly — they document *why* those combinations can't arise from a
single consistent base, not a second, different merge rule.

### 7.3 Ordering of merged cells

The merged document orders cells by: (1) cells present in `base` keep
`base`'s relative order (content may be `local`'s or `peer`'s per §7.2,
position doesn't); (2) a cell `Added` only locally is inserted at the
position it holds in `local`'s document, immediately after the nearest
preceding cell that also exists in the merged base-derived order (or at
the start, if it precedes every base cell in `local`); (3) a cell `Added`
only by `peer` is positioned the same way against `peer`'s document; (4)
when both sides insert a new cell at the same anchor point (immediately
after the same base-derived neighbour), local's insertion(s) sort before
peer's. This is its own independent, arbitrary-but-stable tiebreak for
*ordering* two unrelated new cells — it is not derived from §7.2's
local-wins rule, which resolves *content* for a single same-id conflict
and has no bearing on where two different, non-conflicting ids land
relative to each other; any deterministic choice would do, and
local-before-peer is picked only for consistency with §7.2's local-first
convention elsewhere in this contract. Conflict-copy cells (§7.2) are always
positioned immediately after the local cell they were appended below,
never reordered by this algorithm.

Prose spans (§2.4) travel with the cell they're attached to
(`prose_before`/`prose_after`) and are merged as an ordinary text field of
that cell using the same `Unchanged`/`Changed` logic as cell body content —
a prose-only edit (no fence-body change) is indistinguishable from a
fence-body edit for merge purposes; both make the owning cell `Changed`. A
document with zero fenced cells (§2.4's pure-prose case) merges as plain
three-way text (not this table): unchanged-on-one-side takes the other,
changed-on-both is a conflict rendered as the local text followed by a
`<!-- conflict from <peer> -->` marker and the peer's full text appended.

---

## 8. Open questions

1. **`htl`/`html` package pin.** §5.1's `html` host variable presumes
   Observable's `htl` tagged-template package (or Framework's re-export of
   it); T1's ecosystem report does not list `htl` or pin a version.
   Assigned: whoever finalises L5's `package.json` — confirm the exact
   package and add it to the ecosystem/pin record before L6 ships the
   sandbox bundle.
2. **`x.type` beyond `"linear"`.** §5.3 reserves the key but defines no
   non-time x-axis use yet. Assigned: whoever designs the (currently
   unplanned) distance-indexed or event-indexed chart type — a widening of
   this grammar is a contract change, not an L6-local decision.
3. **`channel()`/named-definition return shape, concretely.** §5.1 flags
   its `{length, t, v}` SoA proposal as provisional pending verification
   against `@observablehq/plot` 0.6.17's actual tabular-data acceptance
   (unlike T1's arrow/parquet/tauri claims, this was not independently
   verified against the library). Assigned: L6, first task — write a
   throwaway `Plot.lineY({length,t,v}, {x:"t",y:"v"})` render against the
   real bundled 0.6.17 build before committing to the shape; if it fails,
   the fallback (`{t,v}[]` array-of-records) does not change §5.3's
   grammar, only the internal data shape.
4. **CodeMirror math-mode tokenizer.** Design §16 lists this as an open C2
   item; this contract fixes the *grammar* (§3.1/§3.2) a CodeMirror mode
   must tokenize but not the mode's own implementation (highlighting
   categories, bracket matching UX). Assigned: L6.

None of the four block L3's parser, L6's Properties↔Code editor shape, or
L11's merge algorithm — all four are implementation-detail follow-ups
within the grammar this contract already fixes.
