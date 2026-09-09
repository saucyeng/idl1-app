# C2 — Workbook v3 (`.idl1wb`)

**Status:** signed (lead) 2026-09-02 · **Date:** 2026-09-03 · **Owner:** lead

**Revisions:**
- 2026-09-08: **§3.7 added — the maths graph view's file mapping** (ruling
  R135, wave-3 lane M, spec-first). A new optional front-matter `graph` key
  stores node canvas positions; §1's front-matter table and its round-trip
  rule, §2.4's cell-level display name, and §7.1's merge rule are amended to
  match. Along the way, a pre-existing conformance defect is fixed
  independently in `core` (not a spec change): `render_front_matter` dropped
  every top-level key it did not itself define, which already broke this
  section's own `_migrate_charts`/`_migrate_math` round-trip requirement.
- 2026-09-07: **§3.6 added — value shapes / n-dimensional math values**
  (ruling R110, wave-3 W3.1, spec-first). Math values gain a shape; the
  builtin catalog gains axis-aware reductions, `argmax`/`argmin`, slicing and
  `align`; `spectrogram` is *specified* to yield `[t,f]` (still NotImplemented — R158); charts
  bind by axis kind and the rank-2 case reuses C3's existing raster path.
  `version` stays `3` and no migration pass is needed — §3.6.8.
- 2026-09-06: §5.3 widened with an FFT chart production — `marks_array` splits
  into `time_marks`/`fft_marks`, a `spectrum_call`/`fft_params` grammar, the
  FFT Properties panel, and the FFT custom-code cases (rulings R78, L6
  Task 19 Q1–Q2; R79, L6 Task 20 open questions Q1–Q7).

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
| `graph` | mapping, optional `nodes`/`cells` sub-keys | no (default absent) | Maths graph view canvas positions — §3.7. Advisory only: never read by the parser, the evaluator, or `[Name]`/`# label:` resolution; nothing in it can change a value, a wire, or an error. |

No other top-level front-matter keys are defined by this contract. §6 defines two **transient, migration-only** keys (`_migrate_charts`, `_migrate_math` — *the latter added post-sign, 2026-09-04, lead ruling R25, wave-1 L3*) that a v3 parser must tolerate (round-trip them unmodified) but never itself produces except via `migrate-workbook`. This is one case of a general rule (ruling R135, 2026-09-08): **a v3 parser preserves every top-level front-matter key it does not itself define**, round-tripping it unmodified on render — including a key a future contract adds, opened by this build, and `graph` itself, opened by a build predating §3.7. An unrecognised key is inert: parsed as opaque YAML, never interpreted, never dropped. (Before this ruling, `render_front_matter` emitted only the five keys above and silently deleted everything else on save — a workbook written by a newer build, or synced from a peer running one, lost data when an older build opened and re-saved it. That was already a violation of this section's own requirement for `_migrate_charts`/`_migrate_math`; §3.7's Task 2 is the fix, and it is a `core` durability fix independent of the graph feature.)

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
- **Cell-level display name.** A `math` cell's first non-blank line, when it
  is a whole-line comment matching `# label: <text>`, carries that text as
  the *cell's* display name — the same `label:` word §3.1 defines for a
  `def_line`'s trailing comment, applied here to a whole line at the start of
  a cell instead of to one definition. This is a new meaning for a line that
  is `MathCellLine::Comment` today (`math_cell.rs`) and costs nothing to add:
  it is still an ordinary comment, so an older build round-trips it
  unchanged, unaware of the meaning. Full rule, including how it names a
  maths-graph subgraph, is §3.7.3.

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

**Keyword arguments** (R143 item 1, `runs/2026-09-08/scipy-alignment-plan.md`
§2). The one call-site production changes; every other production is
unchanged:

```
call      ::= identifier "(" [ arg { "," arg } ] ")"
arg       ::= expression | identifier "=" expression
```

Positional form stays valid for every function; a keyword argument is
**additive**, never a replacement syntax. Grammar makes three rules
explicit rather than leaving a model to infer them:

1. A keyword argument may not precede a positional one in the same call —
   `mean(x, window=5)` parses, `mean(window=5, x)` is a `Parse` error.
2. A name may not be bound twice in the same call — twice by keyword
   (`mean(x, window=5, window=9)`), or once positionally and once by the
   same keyword (`mean(x, 5, window=9)`) — a `Runtime` error naming the
   parameter, since the parser has no callee-parameter-name table to check
   the positional/keyword case against; only the double-keyword case is
   caught in the parser itself.
3. An unknown keyword name is a typed error, never silently dropped — a
   silently-ignored `prominence=` would be a false friend in parameter
   form, exactly the defect class this whole naming pass exists to remove.
   A function with no documented keyword form at all rejects **any**
   keyword argument the same way.

Tokenizer (`rust/core/src/math/token.rs`): `TokenKind::Equals` for a bare
`=` (previously a hard parse error unless immediately followed by a second
`=`). A bare `=` reached while parsing an *expression* (never as a keyword
name's separator, which `parse_one_arg`'s two-token lookahead consumes
first) is still the same `"did you mean =="` diagnostic as before, raised
by the parser now rather than the tokenizer, since only the parser knows
whether an `=` it just saw was consumed as a keyword separator.

Parser (`rust/core/src/math/parse.rs`): `Ast::Call` gains
`kwargs: Vec<(String, Ast)>`, call-site order, alongside the existing
`args: Vec<Ast>` (never a replacement for it). `parse_args` look-aheads one
token: an `Ident` immediately followed by `Equals` starts a keyword
argument; otherwise the argument is positional. This makes
`rust/core/src/workbook/v3/math_cell.rs`'s `classify_line` — which splits a
`def_line`/`const_line` at the **first `=`** in the line — load-bearing in
a way it was not before: a definition's own `=` is always the line's first
one (a keyword argument's `=` can only appear after it, inside the call),
so the split stays correct, but a call like
`x = where([a] > 0, mean([b], dim="t"), 0)` must classify as one `Def` with
the whole call as `expr_text`, not split again at the keyword's `=`.

Two of the grammar's three rules above need the callee's own parameter
names (rules 2's positional/keyword case, and rule 3) — that is
`eval::call_function`'s job, not the parser's, so a keyword-argument call
can parse successfully and still fail at evaluation with a named,
typed error.

Per-function keyword forms are documented on their own §3.3 rows (e.g.
`mean(ch, window=w)`, `periodogram(ch, window=…, detrend=…, scaling=…)`) —
this section states the grammar once; it does not enumerate which function
accepts which keyword.

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
**Unit rule** formalises the prose in **Output units** into the rule
vocabulary of §3.3.1, so the engine's inference table is a transcription of
this contract rather than a second source of truth (R162). Where the two
columns could ever disagree, the rule column is the normative one.

| Function | Signature | Category | Output units | Unit rule (§3.3.1) | Status | In idl0 `knownFunctions`? |
|---|---|---|---|---|---|---|
| `butter` | `butter(order, cutoff_hz, "low"\|"lowpass"\|"high"\|"highpass", ch)` | Filter | same units as `ch` | `SameAsArg(3)` — the channel is the **fourth** argument; `cutoff_hz` is expected in `Hz`, `order` is `Dimensionless` | Implemented (`"band"` rejected as a `Runtime` error, not parsed as a 3rd type). A confirmed false friend deferred rather than fixed (R151 item 8, C2 §3.8): scipy's `butter` only *designs* a filter (returns coefficients); *applying* it is a separate call (`lfilter`/`sosfilt`). This `butter` designs **and** applies, zero-phase, in one call — splitting design from application is a real behaviour change with its own migration, not a naming fix. | yes |
| `sosfilt` | `sosfilt(sos, ch)` | Filter | same units as `ch` | `SameAsArg(1)` — the channel is the **second** argument; `sos` coefficients are `Dimensionless` | NotImplemented | yes |
| `declip` | `declip(ch)` | Reconstruction | same units as `ch` (designed for ±32 g-clipped accel, g) | `SameAsArg(0)` | Implemented | yes |
| `cumulative_trapezoid` | `cumulative_trapezoid(ch)` | Time-domain | `[ch]·s` | `Product(SameAsArg(0), Fixed(s))` | Implemented (retired from `integrate` — gratuitous rename, matches `scipy.integrate.cumulative_trapezoid`'s name, R143/R151 item 6) | yes |
| `cumtrapz` | `cumtrapz(ch)` | Time-domain | `[ch]·s` | `Product(SameAsArg(0), Fixed(s))` | Implemented — a permanent second spelling of `cumulative_trapezoid`, not a deprecated one; scipy itself carries both (R151 item 6) | **no** |
| `differentiate` | `differentiate(ch)` | Time-domain | `[ch]/s` | `Quotient(SameAsArg(0), Fixed(s))` | Implemented — a backward difference, `result[0] = 0` (`rust/core/src/statistics.rs`); **deliberately not** `numpy.gradient`'s central difference — see `gradient`'s own row (R151 item 3) | yes |
| `gradient` | `gradient(ch)` | Time-domain | `[ch]/s` | `Quotient(SameAsArg(0), Fixed(s))` | Implemented — `numpy.gradient`'s own central-difference formula, added alongside `differentiate` rather than replacing it, since the two compute different values (R151 item 3) | **no** |
| `detrend` | `detrend(ch)` \| `detrend(ch, "linear"\|"constant"\|"mean"\|"none")` | Time-domain | same units as `ch` | `SameAsArg(0)` | Implemented | **no** |
| `rms` | `rms(ch)` → scalar \| `rms(ch, w)` → rolling channel, `w` window in samples | Time-domain / aggregate | same units as `ch` | `SameAsArg(0)` — `w` is a window in samples, `Dimensionless` | Implemented | yes |
| `mean` | `mean(ch)` → scalar \| `mean(ch, w)` → rolling channel | Time-domain / aggregate | same units as `ch` | `SameAsArg(0)` — `w` is a window in samples, `Dimensionless` | Implemented | yes |
| `std` | `std(ch)` → scalar (population σ) \| `std(ch, w)` → rolling channel | Time-domain / aggregate | same units as `ch` | `SameAsArg(0)` — `w` is a window in samples, `Dimensionless` | Implemented | yes |
| `median` | `median(ch)` → scalar | Aggregate | same units as `ch` | `SameAsArg(0)` | Implemented (2-arg rolling `median(ch, w)` is NotImplemented) | yes |
| `sum` | `sum(ch)` → scalar | Aggregate | same units as `ch` (raw sum, not time-normalised) | `SameAsArg(0)` | Implemented | **no** |
| `count` | `count(ch)` → scalar | Aggregate | count (dimensionless) | `Dimensionless` — a count of samples, not the C1 atom `count` (§3.3.1) | Implemented | **no** |
| `first` | `first(ch)` → scalar | Aggregate | same units as `ch` | `SameAsArg(0)` | Implemented | **no** |
| `last` | `last(ch)` → scalar | Aggregate | same units as `ch` | `SameAsArg(0)` | Implemented | **no** |
| `percentile` | `percentile(ch, quantile)` → scalar, `quantile` ∈ [0,100] | Aggregate | same units as `ch` | `SameAsArg(0)` — `quantile` is `Dimensionless` (0–100) | Implemented (retired from `p` — gratuitous rename, matches `numpy.percentile`'s name (R143, plan §1 task 10)) | **no** |
| `abs` | `abs(x)` | Elementwise | same units as `x` | `SameAsArg(0)` | Implemented | yes |
| `sqrt` | `sqrt(x)` | Elementwise | `√[x]` — total, since unit exponents are rational (`√(g²/Hz)` is `g/√Hz`) | `PowN(0, 1/2)` | Implemented | yes |
| `sign` | `sign(x)` | Elementwise | dimensionless, ∈ {-1, 0, 1} (NaN→NaN) | `Dimensionless` | Implemented | yes |
| `floor` `ceil` `round` | `floor(x)` / `ceil(x)` / `round(x)` | Elementwise | same units as `x` | `SameAsArg(0)` | Implemented — `round` is `f64::round`, half-**away-from-zero** (`2.5 → 3`, `-2.5 → -3`); `numpy.round` is banker's rounding (round-half-to-even, `2.5 → 2`). A confirmed false friend the scipy-alignment lane deferred rather than fixed (R151 item 8, C2 §3.8) — recorded here rather than changed, since a silent rounding-rule change would move existing values at exactly the halfway point. | yes |
| `pow` | `pow(x, y)` | Elementwise | `[x]^y` when `y` is statically known; withheld otherwise (the *engine* does not track units — the separate inference pass of §3.3.1 does) | `PowN(0, y)` when `y` is a numeric literal or a substituted constant; otherwise `Dimensionless` if `[x]` is dimensionless, else `Unknown(non-literal exponent)` | Implemented | yes |
| `min` | `min(ch)` → scalar \| `min(a, b)` → elementwise | Aggregate / elementwise | 1-arg: same units as `ch`; 2-arg: units of `a`/`b` (must match) | 1-arg: `SameAsArg(0)`. 2-arg: `AllMatch(0, 1)` | Implemented | yes |
| `max` | `max(ch)` → scalar \| `max(a, b)` → elementwise | Aggregate / elementwise | 1-arg: same units as `ch`; 2-arg: units of `a`/`b` (must match) | 1-arg: `SameAsArg(0)`. 2-arg: `AllMatch(0, 1)` | Implemented | yes |
| `clip` | `clip(ch, lo, hi)` | Elementwise | same units as `ch` (`lo`/`hi` given in `ch`'s units) | `SameAsArg(0)` — `lo`/`hi` are required scalars and adopt `[ch]` | Implemented (retired from `clamp` — gratuitous rename, matches `numpy.clip`'s name, R143, plan §1 task 10; `lo > hi` or either NaN is now a typed `Runtime` error instead of a panic, plan §4 task 1) | yes |
| `sin` `cos` `tan` | `sin(x)` etc. | Trig | dimensionless ratio; `x` in radians | `Dimensionless` — check `Expect(0, rad)`: a `deg` argument is a diagnostic, not a conversion | Implemented | yes |
| `asin` `acos` `atan` | `asin(x)` etc. | Trig | radians | `Fixed(rad)` — check `Expect(0, dimensionless)` | Implemented | yes |
| `atan2` | `atan2(y, x)` | Trig | radians | `Fixed(rad)` — check `SameUnit(0, 1)`; a mismatch is a diagnostic and does not change the result | Implemented | yes |
| `sinh` `cosh` `tanh` | `sinh(x)` etc. | Trig | dimensionless | `Dimensionless` — check `Expect(0, dimensionless)` | Implemented | yes |
| `deg2rad` | `deg2rad(x)` | Trig conversion | radians (`x` in degrees) | `Fixed(rad)` — check `Expect(0, deg)` | Implemented | yes |
| `rad2deg` | `rad2deg(x)` | Trig conversion | degrees (`x` in radians) | `Fixed(deg)` — check `Expect(0, rad)` | Implemented | yes |
| `periodogram` | `periodogram(ch, window="boxcar", detrend="constant", scaling="density"\|"spectrum"\|"raw_magnitude")` | Frequency | `scaling="density"` → `[ch]²/Hz`; `"spectrum"` → `[ch]²`; `"raw_magnitude"` → same units as `ch` (magnitude) — over a `[f]` shape whose axis coordinate is `k·sample_rate_hz/n` Hz | `SelectByLiteral(scaling, { "density" → Quotient(PowN(0, 2), Fixed(Hz)), "spectrum" → PowN(0, 2), "raw_magnitude" → SameAsArg(0) }, default "density")` | Implemented — retired `fft`'s single-segment shape, scipy-named and scipy-scaled (`density`/`spectrum` are scipy's own two scalings; `raw_magnitude` is deliberately not one of them — it names the un-normalised value the legacy `fft()` computed, R151 item 1) | yes |
| `welch` | `welch(ch, window="hann", nperseg=n, noverlap=n, detrend="constant", average="mean"\|"median"\|"max"\|"none", scaling="density"\|"spectrum"\|"raw_magnitude")` | Frequency | same scaling rules as `periodogram`, over a `[f]` shape | `SelectByLiteral(scaling, { "density" → Quotient(PowN(0, 2), Fixed(Hz)), "spectrum" → PowN(0, 2), "raw_magnitude" → SameAsArg(0) }, default "density")` | Implemented — segmented/averaged, what the charts already compute (`rust/core/src/fft.rs`'s `welch`, `rasters.rs:508`); `average="max"`/`"none"` are idl1 extensions beyond scipy's own two values (ruling R63(3)), kept reachable under the same keyword | **no** |
| `spectrogram` | `spectrogram(ch, window_size, hop_size, window, detrend, scaling)` | Frequency | same units as `ch` (magnitude) or `[ch]²/Hz` (density), over a `[t,f]` shape | *(contingent — see Open 1)* `SelectByLiteral(scaling, …)` as `periodogram`, over the `[t,f]` shape of §3.6.3 | NotImplemented *(corrected 2026-09-09, R158. R110's revision flipped this to `Implemented` on the strength of §3.6 **defining** the `[t,f]` value — but the engine does not compute it: `catalog.rs` marks it `N` and `eval.rs` groups it with the unimplemented builtins. §3.6.3 still gives the signature and shape it will have; the status column reports what the engine does today, not what the contract specifies.)* | yes |
| `hilbert` | `hilbert(ch)` | Frequency | same units as `ch` | `SameAsArg(0)` | NotImplemented | yes |
| `correlate` | `correlate(a, b)` | Correlation | `[a]·[b]` | `Product(0, 1)` | NotImplemented | yes |
| `convolve` | `convolve(ch, kernel)` | Correlation | `[ch]·[kernel]` | `Product(0, 1)` | NotImplemented | yes |
| `resample` | `resample(ch, hz)` | Resampling | same units as `ch` | `SameAsArg(0)` — `hz` is expected in `Hz` | NotImplemented | yes |
| `where` | `where(cond, t, f)` | Logic | units of `t`/`f` branches (must match) | `AllMatch(1, 2)` — `cond` is a truthiness test and is unconstrained | Implemented (retired from `if` — gratuitous rename, matches `numpy.where`'s name, R143, plan §1 task 10; `cond` now also accepts a scalar, selecting a whole branch — additive, every existing per-sample channel `cond` call is unaffected) | yes |
| `current_lap` | `current_lap()` | Lap | 1-based lap number, `0` outside any lap (dimensionless) | `Dimensionless` | Implemented | yes |
| `lap_start_time` | `lap_start_time(n)` | Lap | s, `NaN` if `n` out of range | `Fixed(s)` — `n` is a lap number, `Dimensionless` | Implemented | yes |
| `lap_start_distance` | `lap_start_distance(n)` | Lap | m, `NaN` if `n` out of range or no `[Distance]` in session | `Fixed(m)` — `n` is a lap number, `Dimensionless` | Implemented | yes |
| `sector_number` | `sector_number()` | Lap | 0-based sector index, `NaN` outside any sector (dimensionless) | `Dimensionless` | Implemented | yes |
| `lap_delta_time` | `lap_delta_time(ch)` | Lap delta | same units as `ch` (main − overlay, time-matched; mean across every `overlay_laps` entry when more than one, R73) | `SameAsArg(0)` — a difference of two `[ch]` series, not a time | Implemented | yes |
| `lap_delta_dist` | `lap_delta_dist(ch)` | Lap delta | same units as `ch` (main − overlay, arc-length-matched; mean across every `overlay_laps` entry when more than one, R73) | `SameAsArg(0)` — a difference of two `[ch]` series, not a distance | Implemented | yes |
| `attitude` | `attitude("roll"\|"pitch")` | Estimator (diagnostic) | degrees | `Fixed(deg)` | Implemented | yes |
| `body_accel` | `body_accel("long"\|"lat")` | Estimator (diagnostic) | g | `Fixed(g)` | Implemented | yes |
| `wheel_travel` | `wheel_travel("front"\|"rear")` | Estimator | mm | `Fixed(mm)` | Implemented | yes |
| `wheel_velocity` | `wheel_velocity("front"\|"rear")` | Estimator | mm/s | `Fixed(mm/s)` | Implemented | yes |
| `vec` | `vec(x, y, z)` | Vector | Vec3 (intermediate; units of `x`/`y`/`z`, must match) | `AllMatch(0, 1, 2)` — the Vec3's single unit; mismatched components are a diagnostic and yield `unknown` | Implemented | **no** |
| `vx` `vy` `vz` | `vx(v)` etc. | Vector | same units as `v`'s components | `SameAsArg(0)` | Implemented | **no** |
| `vadd` `vsub` | `vadd(a, b)` / `vsub(a, b)` | Vector | same units as operands (must match) | `AllMatch(0, 1)` | Implemented | **no** |
| `vscale` | `vscale(v, s)` | Vector | `[v]·[s]` | `Product(0, 1)` | Implemented | **no** |
| `cross` | `cross(a, b)` | Vector | `[a]·[b]` | `Product(0, 1)` | Implemented | **no** |
| `dot` | `dot(a, b)` | Vector | `[a]·[b]` | `Product(0, 1)` | Implemented | **no** |
| `norm` | `norm(v)` | Vector | same units as `v`'s components | `SameAsArg(0)` — formally `PowN(Product(0, 0), 1/2)`, which reduces to `[v]` because a Vec3 carries one unit | Implemented | **no** |
| `normalize` | `normalize(v)` | Vector | dimensionless (unit vector) | `Dimensionless` | Implemented | **no** |
| `angle_between` | `angle_between(a, b)` | Vector | radians, ∈ [0, π] | `Fixed(rad)` — the `Product(0, 1)` units of `atan2`'s two operands are identical and cancel | Implemented (retired from `angle` — `numpy.angle` is complex phase, not the angle between two vectors, a false friend; R143/R151 item 4) | **no** |
| `rotate_mat` | `rotate_mat(v, m00..m22)` (row-major, scalar entries) | Rotation | same units as `v` | `SameAsArg(0)` — the matrix entries are `Dimensionless` | Implemented | **no** |
| `rotate_axis` | `rotate_axis(v, ax, ay, az, angle)` (scalars; `angle` radians) | Rotation | same units as `v` | `SameAsArg(0)` — the axis components are `Dimensionless`, `angle` is `rad` | Implemented | **no** |
| `rotate_euler` | `rotate_euler(v, roll, pitch, yaw)` (radians; args may be channels — per-sample rotation) | Rotation | same units as `v` | `SameAsArg(0)` — `roll`/`pitch`/`yaw` are `rad` | Implemented | **no** |

**72 named functions total** (revised again by the scipy-alignment lane,
`runs/2026-09-08/scipy-alignment-plan.md`, ledger R151/R157 — was 69,
**revised 2026-09-07, R110: 64 `Implemented`, 5 `NotImplemented`/deferred**
— `spectrogram` moved to `Implemented`). This lane adds three entries to
the table above without removing any: `fft` retired and split into
`periodogram` + `welch` (net **+1** — the row above is gone, two rows
replace it), `cumtrapz` added as `cumulative_trapezoid`'s permanent second
spelling (net **+1**), and `gradient` added alongside `differentiate` (net
**+1**) — 69 + 3 = 72. The five previously-deferred names are unaffected:
`sosfilt`, `hilbert`, `correlate`, `convolve`, `resample`. §3.6.3 adds ten
further names — `argmax`, `argmin`, `argmax_index`, `argmin_index`,
`at`, `nearest`, `slice`, `axes`, `broadcast`, `align` — documented there
rather than restated here, taking the grand total to 82. The table's own
row count was recounted directly by expanding every multi-name row, e.g.
`floor`/`ceil`/`round` as 3, `vx`/`vy`/`vz` as 3, `vadd`/`vsub` as 2, rather
than restated from memory.

**A disagreement this lane found but did not resolve, recorded rather than
silently fixed (overnight rule):** `rust/core/src/math/catalog.rs`'s own
`math_builtin_catalog()` — the wire source for `list_math_builtins`, C3
§3.4 — still marks `spectrogram` `NotImplemented`, giving that file's own
counting tests `66 Implemented / 6 NotImplemented = 72`, not this
paragraph's `67`/`5` (64 + 3 new, all Implemented). The two totals agree
(72) only because one extra `NotImplemented` in the engine's real catalog
happens to offset one fewer `Implemented`; the *split* disagrees, and the
engine's catalog — not this paragraph's R110-era claim — is what the app
actually receives over IPC and what `functionCatalog.ts` was brought into
line with (this lane's TS half). Whether `spectrogram`'s R110 promotion to
`Implemented` ever landed in `call_function` itself, or `catalog.rs` was
simply never updated to match, is a question for whoever picks this up
next — not re-derived here. One function,
`main(col[])`, exists in `call_function` but is **table-cell only**
(reads `MathLapContext::baseline_row`, which is never populated outside a
table evaluation) — it is documented in §4, not here, and is a `Runtime`
error (`NaN` result, not an error — it returns `Value::Scalar(NaN)` when
`baseline_row` is `None`) if called from a `math` cell.

**Checklist cross-check (brief item e):** every one of idl0's 48
`MathChannelValidator.knownFunctions` entries, under its **current** name
where the scipy-alignment lane retired the idl0-era spelling (C2 §3.8 has
the mapping) — `butter`, `sosfilt`,
`declip`, `cumulative_trapezoid`, `differentiate`, `rms`, `mean`, `std`, `median`,
`periodogram`, `spectrogram`, `hilbert`, `correlate`, `convolve`, `resample`,
`abs`, `sqrt`, `pow`, `sign`, `min`, `max`, `clip`, `floor`, `ceil`,
`round`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `sinh`,
`cosh`, `tanh`, `deg2rad`, `rad2deg`, `where`, `current_lap`,
`lap_start_time`, `lap_start_distance`, `sector_number`, `lap_delta_time`,
`lap_delta_dist`, `wheel_travel`, `wheel_velocity`, `attitude`,
`body_accel` — appears in the table above. None omitted.

### 3.3.1 The unit rule vocabulary

The **Unit rule** column of §3.3 states, for each of the 72 entries, how a
call's output unit is derived from its arguments' units. Rulings R152/R154
(the model) and R162 (this column's location) govern; the design is
`runs/2026-09-08/unit-model.md`.

**Units are metadata about a value, never syntax inside an expression.**
Nothing in this section adds a construct to §3.2's grammar. A unit is
*inferred* by a separate pass over the same `Ast` the evaluator walks; the
numbers a workbook computes are unchanged by it.

**The three states** (R154 — they never collapse into two):

| State | Meaning |
|---|---|
| `known(u)` | A determined unit, e.g. `mm`, `km/h`, `g/√Hz`. |
| `dimensionless` | Genuinely no unit — a count, a ratio, a comparison result, a unit vector. |
| `unknown{reason}` | Not derivable, and the reason says why. |

`dimensionless` and `unknown` are different claims. A count *has* no unit; an
un-inferable exponent's unit is merely *unknown to us*. A consumer that
renders them identically is a defect (§5 of the design; the PDF report is the
case where the distinction is visible to a reader who is not in the room).

**A unit is a product of atoms.** An atom is a unit token exactly as C1 §4.1
recorded it — `mm`, `m`, `km`, `h`, `s`, `Hz`, `bar`, `deg`, `rad`, `g`,
`bpm`, `pulse`, `count` — mapped to a **rational** exponent. The empty
product is `dimensionless`. **Atoms are never canonicalised and never
converted**: `mm` and `m` are different atoms, so `mm + m` is a diagnostic,
not a silent rescaling. Rational exponents are what make `sqrt` total
(`g²/Hz` → `g/√Hz`).

**The rules.** `SameAsArg`, `Fixed`, `Dimensionless` and `Unknown` are
leaves; `Product`, `Quotient`, `PowN` and `SelectByLiteral` compose over
other rules, so `[ch]·s` is written `Product(SameAsArg(0), Fixed(s))` rather
than needing a rule kind of its own. Argument positions are **0-based over
the positional arguments** of the signature in §3.3.

| Rule | Meaning |
|---|---|
| `SameAsArg(n)` | The output carries positional argument `n`'s unit. |
| `Fixed(u)` | A constant unit regardless of the arguments — `Fixed(rad)`, `Fixed(mm/s)`. |
| `Dimensionless` | The empty unit product. Never a stand-in for "we don't know". |
| `Product(a, b)` / `Quotient(a, b)` | Exponents added / subtracted. A bare integer means `SameAsArg` of that position, so `Product(0, 1)` is `Product(SameAsArg(0), SameAsArg(1))`. |
| `PowN(n, k)` | Argument `n`'s exponents multiplied by the rational `k`. `PowN(0, 1/2)` is a square root. |
| `AllMatch(n, m, …)` | Every listed argument must share one unit, which is also the output's. A mismatch is the §3.3.1 diagnostic below and the output is `unknown{mismatch}`. |
| `SelectByLiteral(name, { literal → rule }, default d)` | A string-literal argument selects which rule applies. If that argument is absent the `default` applies; if it is present but not a string literal, the output is `unknown{non-literal selector}`. |
| `Unknown(reason)` | Not derivable. `reason` is display-ready English. |

**Checks are diagnostics, never coercions.** A rule may carry a trailing
`check Expect(n, u)` or `check SameUnit(n, m)`. These constrain what an
argument *should* be — `sin`'s argument in `rad`, `atan2`'s two operands in
the same unit — and a violation raises a **non-fatal diagnostic on the cell**
(R154 item 1). It never converts the value, never changes the output unit,
and never fails the evaluation. `deg` and `rad` are different atoms, so
`sin([angle_deg])` is caught by this check and not by the algebra.

**Constants** (§3.2's four universal names): `pi`, `tau`, `e` are
`dimensionless`; **`g` is `known(m/s²)`** (R162 — it survives parsing as a
named constant precisely so inference can see it; treating it as
dimensionless would mislabel `[body_accel] / g`). A numeric literal is a
*scalar*, which adopts the other operand's unit under `+ - min max clip
where` and is dimensionless under `* /`; scalar is an internal state and
never crosses the wire — a top-level scalar result reports `dimensionless`.

**Two entries worth reading twice.**

- **`periodogram` / `welch`** have *three* output units, chosen by the
  `scaling=` keyword argument (R151 item 1). `"density"` is `[ch]²/Hz`,
  `"spectrum"` is `[ch]²`, and `"raw_magnitude"` is `[ch]` un-normalised.
  Because `scaling=` is a string literal at the call site, the rule is
  statically readable — that is exactly what `SelectByLiteral` exists for.
  Omitting the argument selects `"density"`, matching the engine's default.
- **The vector family.** A `Vec3` carries **one** unit, not three:
  `vec(x, y, z)` is `AllMatch(0, 1, 2)`, so mismatched components are a
  diagnostic rather than a three-unit value. From that, `vx`/`vy`/`vz` and
  every `rotate_*` are `SameAsArg(0)`; `vadd`/`vsub` are `AllMatch`;
  `vscale`, `cross` and `dot` are `Product`; `norm(v)` is
  `PowN(Product(0, 0), 1/2)`, which reduces to `[v]`; `normalize(v)` is
  `Dimensionless` because the magnitude divides out; and `angle_between` is
  `Fixed(rad)` because `atan2`'s two operands both carry `[a]·[b]`, which
  cancels.

**`count` and the atom `count`.** `count(ch)` is `Dimensionless` — a count of
samples. A *channel* whose C1 §4.1 unit string is literally `"count"` is
`known(count)`, because atoms are taken verbatim. The asymmetry is
deliberate: one is a claim this contract makes about a function, the other is
a label a recording device wrote down.

**Where a unit cannot be derived**, the reason is one of: the source channel
recorded no unit (a CSV import's unit is `""`); a `{cell}` table reference,
which has no recorded unit today; a `+`/`AllMatch` mismatch; a non-literal
`pow` exponent or `SelectByLiteral` selector; a definition cycle; or an
operand that was already unknown. `unknown` is contagious and is never
guessed away — `unknown * mm` is `unknown`, not `mm`. The single exception is
algebraic: a dimensionless base raised to any exponent is dimensionless.

**Open — not settled from the engine or a ruling.**

1. **`spectrogram`'s scalings.** Its row is `NotImplemented` (R158), so the
   engine offers no evidence for what `scaling` will accept. Its rule is
   recorded as `periodogram`'s and marked contingent. *Recommendation:* when
   §3.6.3's `[t,f]` value lands, give it `periodogram`'s three scalings
   verbatim and drop the contingency; if it ships with only
   `magnitude`/`density`, the rule's literal set narrows and nothing else
   changes.
2. **`correlate` / `convolve` are `NotImplemented`**, so `Product(0, 1)` is
   read off §3.3's existing prose, not off an implementation. scipy's
   `correlate` in `"full"` mode also has no time normalisation, which is
   consistent with `Product`. *Recommendation:* keep `Product(0, 1)` and
   re-verify at implementation time.
3. **`hilbert` is `NotImplemented`**; `SameAsArg(0)` assumes it returns the
   analytic signal's envelope/magnitude in the input's units rather than a
   complex pair. *Recommendation:* keep `SameAsArg(0)`; if it lands returning
   phase as well, phase is a second output in `rad`, which is a signature
   change, not a unit-rule change.
4. **`cumulative_trapezoid` / `differentiate` / `gradient` multiply or
   divide by the atom `s`**, hard-coded, because today's values carry no axis
   object. *Recommendation:* when §3.6's axes land, generalise these to the
   last axis's unit (§3.6.3 requires it to be `time`, whose unit is `s`), so
   the rule's meaning is unchanged on every value that exists today.

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
| `UnsupportedWorkbookVersion` | `version` ∉ {`3`, `4`} | `"Workbook version <n> is not supported (expected 3 or 4)"` |
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

*Extended 2026-09-07 (R110):* §3.6.4 adds two parse-time kinds
(`InvalidShapeAnnotation`, `UnknownAxisSymbol`) to list A and three
`MathEvalErrorKind` variants (`ShapeMismatch`, `UnknownAxis`,
`ShapeAnnotationMismatch`) to list B. The sibling rule above governs them
unchanged — a shape error greys its own definition and its dependents, never
another definition.

---

### 3.6 Value shapes — n-dimensional math values

*Added post-sign (2026-09-07, lead ruling R110, wave-3 W3.1), spec-first: no
maths-graph UI is built against this until it is merged. It settles
UI-DIRECTION-2 decision 45c ("node outputs are typed arrays of any dimension …
every kind can feed further maths") and closes that document's Open item
"n-D values in the math language".*

Until this section, every math definition evaluated to a 1-D channel or a
scalar, and 2-D results (spectrogram, 2-D histogram) existed only as
chart-side raster endpoints (design §4; C3 §3.6). This section gives every
math value a **shape**, says which operators accept which shapes, how a shape
is written and checked in a definition, and how a chart draws a value that is
not 1-D. §3.6.8 states exactly what changes for workbooks written before it
and why no version bump or migration pass is needed.

#### 3.6.1 The shape type

A math value is a dense, row-major array of `f64` plus a **shape**. A shape is
an ordered list of **axes**; the number of axes is the value's **rank**.

```
Shape ::= [ Axis, Axis, … ]        (rank = number of axes; rank 0 = scalar)
Axis  ::= { kind, len, unit, coords, origin }
```

| Axis field | Type | Meaning |
|---|---|---|
| `kind` | closed enum (below) | What the dimension *is*. Not derivable from a length. |
| `len` | `usize` | Number of entries along the axis. |
| `unit` | `String` | Unit of the axis **coordinate** (`"s"`, `"Hz"`, `""` for lap/index/component). Display metadata, exactly as C1 channel units are; never converted (§1). |
| `coords` | `Option<Vec<f64>>` | The coordinate of each entry, in `unit`. Present for `time`, `freq`; absent for `lap`/`window`/`component`/`index`, whose coordinate *is* their integer position. Time coordinates are seconds derived from C1's recorded `t_us` — the value keeps the recorded time, it never synthesises `i / rate` ("time is recorded, not assumed"). |
| `origin` | `AxisOrigin` (opaque, comparable) | Provenance token identifying *which* coordinate vector this is. Two axes are the same axis only if their origins are equal. §3.6.2. |

**Axis kinds** (closed set in this revision; widening it is a contract change):

| `kind` | Written | Coordinates | Produced by |
|---|---|---|---|
| `time` | `t` | seconds from the session origin (C1 `t_us`) | every session channel, every elementwise result over one, every STFT frame axis |
| `freq` | `f` | Hz | `periodogram`, `welch`, `spectrogram` |
| `lap` | `lap` | lap number (1-based, C1 `laps[]`) | a reduction grouped by lap (§3.6.3) |
| `window` | `win` | index into the selection's window list (R115) | a reduction grouped by window (§3.6.3) |
| `component` | `c<n>` or `c{a,b,c}` | component index, or its name when named | `vec`-valued and state-vector producers; a fixed-width axis such as an iEKF state |
| `index` | `i` | positional index, no physical meaning | `periodogram`/`welch` bin index before a frequency axis is attached, rolling-window outputs, anything explicitly de-labelled |

**Written form.** A shape is written as a bracketed, comma-separated list of
axis symbols, innermost-last: `[]` (scalar), `[t]` (a series), `[lap]` (one
value per lap), `[t,f]` (time × frequency), `[t,c9]` (nine components per
sample — an iEKF state vector), `[t,c{roll,pitch,yaw}]` (the same with named
components). Decision 45c's `[t×f]` is this document's `[t,f]`; the
comma form is the canonical one — it is ASCII, so it is identical in source,
in error messages and in the port label the graph card draws.

**Axis order is part of the type.** Data is row-major: the last axis is
contiguous. `[t,f]` and `[f,t]` are different shapes and never interconvert
implicitly; `axes(x, "f", "t")` (§3.6.3) is the only transpose. This is the
whole point of naming axes: without kinds, `[t,9]` and `[9,t]` differ only by
a length nobody checks, and the transposed one is a silent wrong answer
instead of a `ShapeMismatch`.

**Rank 0 is a real shape, not a special case.** `mean(ch)` yields `[]`, and a
scalar participates in every elementwise operation with every shape (§3.6.2)
— that is the *only* implicit rank change in the language.

#### 3.6.2 Axis identity, alignment, and broadcasting

**Two axes are compatible** iff `kind`, `len` and `origin` are all equal.
`origin` is compared as a token, never by scanning `coords`: a time axis's
origin is `(session_id, window, resampling)` — the selected window (R115) and
the identity of any resampling applied — and a frequency axis's is its STFT
parameters plus that time origin. Equal tokens mean identical coordinates by
construction; unequal tokens mean the implementer must not assume alignment
even when the lengths match.

This matters immediately in the §3.6.7 example: a spectrogram's time axis has
one entry per STFT **frame**, not per sample, so it is *not* compatible with
its own source channel's time axis. Multiplying a frame-rate series by a
sample-rate series is a `ShapeMismatch`, not a broadcast and not a truncation.

**Broadcasting rules — deliberately minimal:**

1. **Scalar with anything.** A rank-0 operand combines elementwise with a
   value of any shape; the result has the other operand's shape. This is how
   `[Fork_Travel] * 2` and `x - mean(x)` already work and it is unchanged.
2. **Equal shapes.** Two operands of equal rank whose axes are pairwise
   compatible combine elementwise; the result has that shape.
3. **There is no other implicit broadcasting.** `[t]` combined with `[t,f]` is
   a `ShapeMismatch` even though the `t` axes are compatible. Rank-lifting is
   written out: `broadcast(x, "f", ref)` repeats `x` along `ref`'s `f` axis,
   giving `[t,f]`. Rejected alternative — NumPy-style trailing-axis
   broadcasting: it makes a typo that drops a reduction produce a
   spectrogram-sized array of plausible numbers rather than an error, and the
   values here are large enough (an 800 Hz channel × 1025 bins) that the
   failure is a hang, not a wrong pixel.
4. **Never an implicit resample.** Two `time` axes with the same kind and
   length but different origins do not combine; `align(x, ref)` (§3.6.3)
   resamples explicitly and names the interpolation.

#### 3.6.3 Operators and builtins by shape

Nothing in §3.2's expression **grammar** changes: no new syntax, no keyword
arguments. Axis-aware builtins take the axis as an ordinary **string literal
argument**, exactly as `butter(2, 3, "low", ch)` and `detrend(ch, "linear")`
already take their mode.

**Elementwise** — `+ - * /`, `< > <= >= == !=`, `and`/`or`/`not`, unary `-`,
and every §3.3 row whose Category is Elementwise/Trig, plus `where`, `clip`,
`pow`, `min(a,b)`, `max(a,b)`:

> operands must satisfy §3.6.2 rule 1 or 2; the result has the operands'
> shape. Rank is irrelevant — these work on `[t,f]` and `[t,c9]` exactly as
> on `[t]`, which is what makes "the pictures feed further maths" true rather
> than aspirational.

**Time-domain operators** — `butter`, `sosfilt`, `declip`, `integrate`,
`differentiate`, `detrend`, `resample`, and the rolling forms `mean(ch,w)`,
`rms(ch,w)`, `std(ch,w)`:

> require the value's **last** axis to be `time` and operate along it,
> independently for every position of the leading axes. `butter(2, 3, "low",
> state)` on `[c9,t]` filters nine signals. A value whose last axis is not
> `time` is a `ShapeMismatch` naming the axis it found. (`[t,f]` therefore
> cannot be filtered directly — `axes(spec, "f", "t")` first, giving
> `[f,t]`.) Shape out = shape in.

**Reductions** — `mean`, `sum`, `min(ch)`, `max(ch)`, `std`, `rms`, `median`,
`count`, `first`, `last`, `p(ch, q)`:

| Form | Accepts | Returns |
|---|---|---|
| `mean(x)` | any shape | `[]` — reduces **every** axis. Unchanged 1-D behaviour: `mean` of a `[t]` series is still a scalar. |
| `mean(x, "f")` | any shape carrying exactly one axis written `f` | that shape with the `f` axis removed. `[t,f] → [t]`. |
| `mean(x, "t:lap")` | a shape whose last axis is `time` | that shape with the `time` axis **replaced** by a `lap` axis: one entry per lap of the selected window. `[t] → [lap]`. |
| `mean(x, "t:win")` | as above | `time` replaced by a `window` axis: one entry per selected window (R115). `[t] → [win]`. |
| `mean(x, w)` — `w` a **number** | last axis `time` | rolling window of `w` samples; shape unchanged. Distinguished from the axis form by argument type, not by arity. |
| `p(x, 90, "f")` | as the axis form | quantile along `f`. The axis string is always the **last** argument. |

Reducing an axis drops it entirely; a rank-1 reduction therefore yields `[]`,
which is why the no-axis form and the 1-D behaviour agree.

**Argument extrema** — new, and the reason the peak-frequency line is
expressible at all:

| Function | Signature | Returns |
|---|---|---|
| `argmax` / `argmin` | `argmax(x, "axis")` | the **coordinate** at which the maximum occurs along that axis, in that axis's `unit`; shape = input minus that axis. On a `freq` axis this is Hz — the peak-frequency line. |
| `argmax_index` / `argmin_index` | `argmax_index(x, "axis")` | the integer index instead, dimensionless. Use when the axis has no coordinates (`component`, `index`). |

Ties resolve to the **lowest** index, deterministically. An all-`NaN` slice
yields `NaN` for both the coordinate and the index (not an error — a lap with
no data must not break the definition, §3.5.B).

**Selection and reshaping** — new:

| Function | Signature | Returns |
|---|---|---|
| `at` | `at(x, "axis", i)` — `i` an integer index, or a string naming a component of a named `component` axis | that shape minus the axis. `at(state, "c", "roll")` : `[t,c{roll,pitch,yaw}] → [t]`. |
| `nearest` | `nearest(x, "axis", coord)` | the entry whose coordinate is nearest `coord`; shape minus the axis. `nearest(spec, "f", 12)` : `[t,f] → [t]`, the 12 Hz row. |
| `slice` | `slice(x, "axis", lo, hi)` | coordinate range `[lo, hi)` (index range for coordinate-less axes); same shape, shorter axis, **new `origin`**. |
| `axes` | `axes(x, "a", "b", …)` | the same data permuted to the named axis order. Every axis of `x` must be named exactly once. The only transpose. |
| `broadcast` | `broadcast(x, "axis", ref)` | `x` repeated along `ref`'s named axis, appended as the **last** axis; `ref` is any expression carrying that axis. |
| `align` | `align(x, ref)` | `x` resampled so that each of its axes shares `ref`'s `origin` for the same kind. Linear interpolation on `time` and `freq`; nearest on integer axes; ends are `NaN`-filled, never extrapolated. The **only** way two differently-originated axes come together. |

**Rank-raising producers:**

| Function | Signature | Returns |
|---|---|---|
| `spectrogram` | `spectrogram(ch, window_size, hop_size, "rectangular"\|"hann"\|"hamming", "none"\|"mean"\|"linear", "magnitude"\|"density")` | `[t,f]`. `window_size`/`hop_size` in samples. The six parameters are C3 §3.6's `SpectrogramParams` field-for-field, in that order, over the same `idl_rs::fft` code — this is not second DSP. The `t` axis is one entry per frame, coordinate = the frame's centre time in seconds; the `f` axis is `window_size/2 + 1` bins, coordinate `k · rate / window_size` Hz, where `rate` is derived from the channel's own `t_us` as `1e6 / median(Δt_us)` (R76's rule, unchanged). |
| `periodogram` / `welch` | `periodogram(ch, window=…)` / `welch(ch, window=…, …)` | `[f]` — unchanged numerically from the retired `fft`'s single-segment shape when `scaling="raw_magnitude"` (the migration's own pinned form, C2 §3.8); §3.6.8 covers the axis both carry. |
| `vec` | `vec(x, y, z)` | shape of the components with a trailing `c{x,y,z}` axis. The existing Vec3 intermediate, now expressible as an ordinary value; `vx`/`vy`/`vz` remain and are `at(v, "c", "x"\|"y"\|"z")`. |

**Every other §3.3 entry is unchanged** and accepts rank ≤ 1 only —
`current_lap`, `lap_start_time`, `lap_start_distance`, `sector_number`,
`lap_delta_time`, `lap_delta_dist`, `attitude`, `body_accel`, `wheel_travel`,
`wheel_velocity`, `cross`, `dot`, `norm`, `normalize`, `angle_between`,
`rotate_mat`, `rotate_axis`, `rotate_euler`. Passing a rank ≥ 2 value to one
of them is a `ShapeMismatch`, never a silent flatten.

#### 3.6.4 Writing a shape in a definition

**Shapes are inferred, always.** A definition never needs an annotation, and
an annotation never coerces, converts or reshapes — it is a **check**, and
the graph card's port label (decision 45c) shows the inferred shape whether or
not one is written.

An optional annotation rides in the `def_line`'s existing `trailing_comment`
(§3.1). §3.1's terminal is unchanged — `trailing_comment` still matches
`/[ \t]+#[^\n]*/`; what follows describes the **structure of that comment's
text**, the same way §3.1 already describes the `label:` form inside it:

```ebnf
comment_text     ::= /[ \t]*/ shape_annotation? label_annotation? free_text?
shape_annotation ::= "shape:" /[ \t]*/ shape /[ \t]*/
shape            ::= "[" (axis_sym ("," axis_sym)*)? "]"
axis_sym         ::= "t" | "f" | "lap" | "win" | "i"
                   | "c" /[0-9]+/
                   | "c{" identifier ("," identifier)* "}"
```

The scan is ordered and backward compatible: a trailing comment is checked for
a leading `shape:` **first**; whatever remains is then scanned for `label:`
exactly as §3.1 already specifies (free text to end of line). A comment that
begins with `label:` is therefore unchanged in every respect, including one
whose label text happens to contain the word `shape`. Both together read:

```math
fork_spec = spectrogram(wheel_travel("front"), 2048, 1024, "hann", "mean", "magnitude")  # shape: [t,f] label: Fork spectrogram
```

An annotation matches the inferred shape iff every axis symbol matches the
corresponding axis's `kind` in order, and — for `c<n>` / `c{…}` — its length
and, when named, its component names. Lengths of `t`, `f`, `lap`, `win` and
`i` are **not** written: they are session-dependent, and a workbook that
pinned them would break on the next session (the same reason `"all"` exists
in §5.3 rather than a literal sample count).

**Errors.** Per definition, lazy, and — per §3.5.B, unchanged — never blocking
a sibling definition. Two new parse-time kinds (§3.5.A) and three new
`MathEvalErrorKind` variants (§3.5.B; this is an additive change to
`rust/core/src/math/error.rs` and to C3's error `detail`, see Open 1):

| Layer | Kind | Trigger | Message shape |
|---|---|---|---|
| A | `InvalidShapeAnnotation` | `shape:` present but not matching the `shape` grammar above | `"'<text>' is not a valid shape — write it like [t], [t,f] or [t,c9]"` |
| A | `UnknownAxisSymbol` | a well-formed shape naming a symbol outside the closed set | `"'<sym>' is not an axis — use t, f, lap, win, i or c<n>"` |
| B | `ShapeMismatch` | operands that satisfy no §3.6.2 rule, or a builtin given a shape it does not accept | `"<op> expects <expected>, got <actual>"` — e.g. `"'*' expects both operands to have the same shape, got [t] and [t,f]"`, `"butter expects its last axis to be time, got [t,f]"` |
| B | `UnknownAxis` | an axis-string argument naming an axis the value does not carry, or carries more than once | `"'<name>' is not an axis of <shape>"` |
| B | `ShapeAnnotationMismatch` | the annotation and the inferred shape differ | `"'<name>' is annotated [t] but evaluates to [t,f]"` |

`ShapeMismatch` and `UnknownAxis` are **evaluation-time**, not parse-time,
because a shape depends on the selected session: the same definition is `[t,f]`
against a session that has the channel and unresolved against one that does
not (decision 44 — the node greys, nothing is deleted). A definition that
cannot be shaped greys itself and everything downstream, and reports on the
node card as decision 41's red ×.

#### 3.6.5 Binding to JS

§5.1's first row — one host variable per math definition — extends by rank,
not by replacement:

- **Rank 1 with a `time` axis** binds exactly as today: `{ length, t, v }`,
  `t` seconds, `v` values. No existing js cell, `plotForm` production or
  inline `${…}` changes.
- **Rank 1 with another axis** binds `{ length, <sym>, v }` — `{length, f, v}`
  for a frequency series, `{length, lap, v}` per lap — matching §5.3's
  standing rule that a frequency shape binds `"f"` and never `"t"`.
- **Rank 0** binds the bare `number`.
- **Rank ≥ 2** binds `{ shape: string, axes: [{ kind, len, unit, coords }], v: Float64Array }`
  with `v` row-major. Plot cannot consume this directly, which is precisely
  why §3.6.6 requires charts to reduce first.

#### 3.6.6 What a chart draws

**A chart mark consumes a rank ≤ 1 value, plus exactly one rank-2 case.** The
mark picks its x axis from the value's axis kind, so "charts render whatever
dimension makes sense for the mark" (decision 45c) is a rule, not a judgement:

| Value shape | Mark | Binding |
|---|---|---|
| `[t]` | `Plot.lineY`/`dot`/`areaY`/`rectY` | `{x:"t", y:"v"}` — §5.3's `time_marks`, unchanged |
| `[f]` | `Plot.lineY`/`dot`/`areaY` | `{x:"f", y:"v"}` — §5.3's `fft_marks` shape, reached from a math definition instead of `spectrum(...)` |
| `[lap]` / `[win]` | `Plot.barY`/`dot` | `{x:"lap"\|"win", y:"v"}` — a per-lap bar chart, x an ordinal axis |
| `[]` | `Plot.ruleY`, or an inline `${…}` value | the scalar |
| `[t,f]` | raster under Plot axes | **the existing raster path only** — below |
| any other rank ≥ 2 | none | the cell renders decision 58's empty slot: `"peak_freq_2d is [t,c9] — reduce it to a series before charting"`, with the Fix button opening the definition |

**The rank-2 raster case does not duplicate the raster path.** Density is a
Rust raster under Plot axes (design §4) and stays so. A `[t,f]` definition
whose expression is exactly a `spectrogram(ch, …)` call over a session channel
is recognised by the host — the same `parse`-based recognition that binds
`channel(...)` and `spectrum(...)` today, not a code scan — and drawn by
calling the **existing** `fetch_raster(kind: "spectrogram")` /
`fetch_raster_meta` (C3 §3.6) with the six parameters read off the definition
line, keyed by a `rasterKey(channelId, params)` built the same way
`spectrumKey` is (R79 Q2). The math value itself never crosses IPC as pixels
and the sandbox never rasterises.

A `[t,f]` value that is *not* such a call (a filtered, sliced or
arithmetically combined matrix) has **no** raster endpoint in this revision
and falls in the last row above: reduce it, or chart it once a general matrix
raster exists (Open 4). This is a stated limit, not an omission — it keeps one
rasteriser rather than growing a second one in the sandbox.

#### 3.6.7 Worked example — spectrogram → peak frequency → line

The case R110 names: a `[t,f]` matrix, a reduction of it to `[t]`, and that
charted. Every shape below is the inferred one; the annotations are optional
and written here to be read.

```math id=7f3c9a12
# Fork spectrogram and the peak-frequency line derived from it.
fork_spec        = spectrogram(wheel_travel("front"), 2048, 1024, "hann", "mean", "magnitude")  # shape: [t,f] label: Fork spectrogram
peak_freq        = argmax([fork_spec], "f")                        # shape: [t] label: Peak fork frequency
peak_mag         = max([fork_spec], "f")                           # shape: [t] label: Peak magnitude
peak_freq_smooth = butter(2, 1.5, "low", [peak_freq])              # shape: [t]
peak_freq_by_lap = mean([peak_freq], "t:lap")                      # shape: [lap] label: Mean peak frequency per lap
low_band_energy  = sum(slice([fork_spec], "f", 0, 8), "f")         # shape: [t] label: 0-8 Hz energy
```

> **A definition references another definition with brackets**, exactly as
> it references a raw channel: `[peak_freq]`, never a bare `peak_freq`.
> `parse.rs`'s `primary()` resolves a bare identifier only as a universal
> constant (`pi`, `tau`, `e`, `g`) or a workbook `constants` entry — every
> other bare name is a parse error. This example carried unbracketed
> references until 2026-09-08 and was the source of at least one broken
> workbook, so the brackets above are load-bearing, not decoration.

Shape at each step, and why:

| Line | Shape | Notes |
|---|---|---|
| `wheel_travel("front")` | `[t]`, unit mm | Estimator over the session's sample-rate time axis. Origin **A**. |
| `fork_spec` | `[t,f]` | `t`: one entry per STFT frame (hop 1024 samples), centre times in seconds — a **new** origin **B**, not A. `f`: 1025 bins, `k · rate / 2048` Hz. |
| `peak_freq` | `[t]`, unit Hz | `f` reduced away by `argmax`, which returns the *coordinate*: the frequency of the strongest bin in each frame. Time axis is B. |
| `peak_mag` | `[t]`, unit mm | Same reduction with `max`, keeping the magnitude instead. Time axis B. |
| `peak_freq_smooth` | `[t]`, unit Hz | `butter` operates along the last axis, which is `time` ✓. Time axis B (a filter does not resample). |
| `peak_freq_by_lap` | `[lap]`, unit Hz | `"t:lap"` replaces the time axis with one entry per lap of the selected window. |
| `low_band_energy` | `[t]`, unit mm | `slice` narrows `f` to `[0, 8)` Hz (new `f` origin, same `t`), then `sum` reduces it. |

Charting the line — an ordinary §5.3 time cell, because `peak_freq_smooth` is
`[t]` and binds `{length, t, v}` per §3.6.5:

```js
Plot.plot({
  x: {label: "Time (s)"},
  y: {label: "Peak fork frequency (Hz)", domain: [0, 30]},
  marks: [Plot.lineY(channel("peak_freq_smooth"), {x: "t", y: "v"})]
})
```

Charting the matrix it came from is the `[t,f]` raster row of §3.6.6:
`fork_spec` is exactly a `spectrogram(...)` call, so the cell draws
`fetch_raster(kind: "spectrogram")` with `window_size: 2048, hop_size: 1024,
window: "hann", detrend: "mean", scaling: "magnitude"` — the same six values
the definition line states — with `peak_freq` overlaid as a line on the same
axes, both on time axis B, which is why they align without an `align` call.

**The error this design is here to produce.** Writing

```math
bad = [peak_freq] * wheel_travel("front")
```

is a `ShapeMismatch`: both operands are `[t]`, but their time axes have
different origins (B vs A) — frames against samples. The definition reports
`"'*' expects compatible axes, got [t] (frames) and [t] (samples)"`, greys its
own node and its dependents, and every sibling definition still evaluates. The
fix is explicit:

```math
good = [peak_freq] * align(wheel_travel("front"), [peak_freq])   # shape: [t]
```

#### 3.6.8 What changes for existing workbooks

**`version` stays `3`. There is no migration pass and `migrate-workbook` is
unchanged.** The extension is a strict superset: every construct legal before
this section is still legal, parses the same, and evaluates to the same
numbers. Decision 75 (workbooks are durable across updates) is met by *not
rewriting anything* — the strongest available form of "explicit and lossless".
The specific claims:

1. **Every existing definition acquires a shape it already had implicitly.** A
   channel-valued definition is `[t]`; an aggregate (`mean(ch)`, `p(ch, 90)`,
   `count(ch)`) is `[]`; a rolling form (`mean(ch, 64)`) is `[t]`. No numbers
   change, no bindings change, no error that did not fire before fires now —
   §3.6.2's rules 1 and 2 are exactly what the existing `elemwise`/
   `apply_binary` already do, now named.
2. **`spectrogram` moves from `NotImplemented` to `Implemented`** in §3.3,
   superseding its "deferred permanently — no channel-shaped output exists"
   note, which this section makes false. A workbook that called it received a
   typed `NotImplemented` error and no result; it now receives a `[t,f]`
   value. Nothing that worked stops working.
3. **`fft`'s output axis is now `freq`, not a bare bin index.** Its
   magnitudes are unchanged, but a rank-1 frequency value binds `{length, f,
   v}` (§3.6.5), where before it bound `{length, t, v}` with bin index in `t`.
   This is the **one** behaviour change in the section. To keep it lossless:
   a `freq`-axis rank-1 value **also** binds `t` as a deprecated alias of `f`
   for `version: 3` workbooks, so an existing js cell reading `.t` keeps
   working and gets Hz where it previously got bin numbers — the number it
   almost certainly wanted, since §3.3 already documented `freq[k] =
   k·sample_rate_hz/n` as the thing a reader had to reconstruct by hand. The
   alias is reported once per definition in the notebook's diagnostics, not as
   an error. See Open 2 for when it goes.
4. **Reduction builtins gain an optional trailing string argument.** Existing
   arities and meanings are untouched; a number in that position is still the
   rolling window it always was.
5. **New catalog entries**, all additive: `argmax`, `argmin`, `argmax_index`,
   `argmin_index`, `at`, `nearest`, `slice`, `axes`, `broadcast`, `align`.
   `list_math_builtins` (C3) reports them like any other row; none shadows an
   existing name.
6. **`# shape:` is new and optional**, and lives inside a comment. A build
   predating this section round-trips such a line byte-for-byte (it is
   trailing-comment text) and simply infers nothing from it.
7. **Opened by an older build**, a workbook using n-D features loses those
   definitions to per-definition `UnknownFunction` / `NotImplemented` errors,
   keeps every sibling definition, and saves back unchanged — §3.5.B's
   sibling rule and §2's byte-preserving round-trip together make the
   downgrade non-destructive. That is the property decision 75 actually needs,
   and it is why this is not a version bump: bumping to `4` would make §1's
   rule refuse every existing file outright.

#### 3.6.9 Resolved by the lead (R118, 2026-09-07)

All five items below were ruled on in `runs/2026-09-03/decisions.md` R118.
Two answers changed the contract and are already reflected above:

- **Item 3 is settled, not open.** Evaluation is **per window** (R117.4):
  one evaluation sees exactly one window, so `"t:lap"` always means the laps
  within the window being evaluated and needs no multi-window error case.
  **`"t:win"` is deliberately NOT specified** — reducing across windows is
  cross-window maths, which no per-window evaluation can perform; it belongs
  to the R73 cross-session-overlay amendment.
- **Item 2's deprecation carries a condition:** the next `version` bump must
  *migrate* workbooks using the `t`-alias, not merely stop accepting it
  (direction-2 decision 75 — workbooks are durable across updates).

The original wording of all five, with the recommendations that were made:

1. **`MathEvalErrorKind` gains three variants** (`ShapeMismatch`,
   `UnknownAxis`, `ShapeAnnotationMismatch`), which C3's error `detail` shape
   mirrors. *Recommendation:* additive C3 amendment carrying
   `detail: { expected: string, actual: string, axis?: string }`; no new
   top-level error kind, since these are `MathEvalError`s like every other
   per-definition failure.
2. **Lifetime of the `t`-alias for frequency values** (§3.6.8 item 3).
   *Recommendation:* keep it through wave 3, list it in `CHANGELOG.md` as
   deprecated, and drop it at the next `version` bump — not before, because
   nothing forces a bump today.
3. **`"t:lap"` when the selection holds several windows** (R115): is the `lap`
   axis within one window, or concatenated across all of them?
   *Recommendation:* `"t:lap"` is legal only when the selection is a single
   window and is a `ShapeMismatch` otherwise; `"t:win"` is the multi-window
   form. One meaning each, and the error names the fix. This is the seam
   between R110 and R115 and should be settled with the selection lane, not
   inside it.
4. **A raster endpoint for a rank-2 value that is not a `spectrogram(...)`
   call** (§3.6.6). *Recommendation:* defer past wave 3; when it lands it is a
   new `fetch_raster(kind: "matrix")` taking the value's id and a colour
   scale, not a second rasteriser in the sandbox.
5. **Component names for the iEKF state vector.** No iEKF specification exists
   in this repo, so this section does not invent one; the example uses `c9`.
   *Recommendation:* the iEKF subgraph (decision 43) names its own components
   when it is specified, as `c{…}`; `at(x, "c", i)` works either way, so
   nothing here blocks on it.

---

### 3.7 The maths graph view's file mapping

Ruling R135 (2026-09-08). This section fixes the graph view's four file-level
questions (decision 45b): where a node's canvas position lives, how it
merges, what names a subgraph, and how a port shows a shape it doesn't itself
compute. Nothing here is read by the parser or the evaluator — see §3.7.1's
advisory guarantee — so it changes no existing behaviour of a workbook that
never opens the graph view.

#### 3.7.1 Front-matter `graph` key

```ebnf
graph_key      ::= "graph:" "\n" nodes_key? cells_key?
nodes_key      ::= "  nodes:" "\n" position_entry*
cells_key      ::= "  cells:" "\n" position_entry*
position_entry ::= "    " (identifier | hex8) ": [" int "," int "]" "\n"
```

An optional top-level front-matter key (§1). `nodes` maps a math-cell
definition **name** (§3.1's `identifier`) to an `[x, y]` integer canvas
position; `cells` maps a math cell's **`hex8` id** (§2.2) to a position for
that cell's subgraph frame (§3.7.3). Both sub-keys are individually optional,
and so is the whole `graph` key; its absence means no position is stored for
any node, and the graph view auto-lays-out the document (the view's own
fallback algorithm, out of scope for this contract).

**Writer.** Only the graph view writes this key, as a byte-range replacement
of the `graph:` block inside front matter — touching no other front-matter
key and no cell, on drag settle rather than on every pointer move (no IPC on
the interaction path). It always writes the block in one canonical, fully
ASCII shape — identifier or `hex8` keys, `[x, y]` flow-sequence integer
values — so it needs no YAML library and never reformats a byte it did not
write: a general YAML serialiser would risk rewriting, say, `constants: {
rider_mass_kg: 82 }` into block style the first time anyone dragged a card,
which is unacceptable (§1's `constants` bytes belong to whoever typed them).

**Advisory guarantee.** `graph` is read by nothing that computes a value: not
the parser beyond opaque YAML, not `math::resolve`, not `[Name]`/`# label:`
resolution (§3.1), not evaluation (§3.5, §3.6). Every failure mode therefore
degrades to layout, never to data or an error:

- key absent, or a sub-key absent: affected nodes auto-placed; others keep
  their stored position.
- an entry naming a definition name or cell id that no longer exists (a
  rename, a deleted cell, a hand edit): the entry is **preserved on write,
  never pruned** — §7.1's `graph` merge rule already requires this, so parse
  and merge agree — but **ignored on read**, so the orphaned node simply
  re-lays-out. A definition commented out and later restored keeps its old
  position; a definition renamed loses it (§3.7.3's rename rule is the one
  exception that keeps it).
- the block is malformed YAML: the whole `graph` key is treated as absent
  for that parse (no `WorkbookError` — this is advisory data, §3.5's error
  model does not apply to it) and is replaced wholesale, not merged, the
  next time the graph view writes it.

#### 3.7.2 Merge rule (amends §7.1)

`graph` is merged **per entry**, within each of `nodes`/`cells`
independently, on the same three-way rule as `constants` (§7.1) — except
with **no conflict note**. An entry (one node's or one cell's position)
changed on both sides since `base` keeps local's value silently; an entry
present or changed on only one side carries through unconditionally. A
canvas position is cosmetic, not data the user reads for its content —
injecting an HTML comment into body prose because two people dragged the
same card on two machines would be noise, unlike `constants`, where a
differing numeric value is exactly the kind of thing a conflict note exists
to surface. This is also why `graph` positions are never a reason for sync
to report a conflict at all: §7.2's cell-level conflict machinery (append,
mark, duplicate) does not apply to this key, and can't — a moved node is a
front-matter entry, not a cell, and front matter merges outside the cell
table entirely (§7.1's opening line). That separation is the whole reason
positions live in front matter rather than in a cell body or a trailing
comment (§3.7's design rationale, recorded in `runs/2026-09-08/
w32-maths-plan.md` §2.2's rejected alternatives): any of those would make a
drag and a same-cell expression edit collide under §7.2's `Changed`×`Changed`
rule, duplicating the whole cell over a position change.

#### 3.7.3 Cell-level display name and subgraph boundary (amends §2.4, §3.1)

**Name.** A `math` cell whose first non-blank line is a whole-line comment
matching `# label: <text>` (§2.4) carries that text as the cell's display
name in the graph view — decision 45b's "one `math` cell named by
`# label:`". A cell with no such line has no display name; the graph view
falls back to the cell's `id` (§2.2). Renaming a cell (editing that comment
line) is an ordinary cell-body edit like any other — it does not touch
`graph`, and does not move the cell's stored position.

**Rename of a definition, however, touches both.** Renaming a definition
(the identifier left of `=`) changes the `name` key `graph.nodes` is keyed
by, so the graph view's rename operation is specified as **one atomic
edit**: it rewrites the `def_line` and every `[OldName]` reference across
the document (an ordinary cell-body edit) *and* renames the `graph.nodes`
entry, in the same save. A rename that only did the first half would silently
orphan the node's position (§3.7.1's orphan rule would then re-lay-out a
node the user didn't move) — the one place this contract has a pane write
both a cell body and the `graph` key in a single gesture, and it is
deliberate, not an accident of implementation.

**Subgraph boundary.** In the graph view, a `math` cell forms one
collapsible subgraph made of its own definitions. Its **inputs** are names
referenced by those definitions but defined outside the cell — another
cell's definition, or a session channel. Its **outputs** are names it
defines that are referenced outside the cell, charted by a `js` cell, or
used in a prose `${…}` interpolation (§5.2). Every other definition is
internal and hides when the subgraph is collapsed, matching decision 39's
"intermediate datasets never appear unless the user names them" read at cell
scope. Copying a math cell's text (into another position in the same
workbook, or into another workbook) copies its subgraph; nothing more about
sharing a subgraph across workbooks is specified here (decision 82).

#### 3.7.4 Ports show the inferred shape (cross-reference to §3.6)

A node's ports display the value shape §3.6 defines — `[]`, `[t]`, `[f]`,
`[lap]`, `[t,f]`, `[t,c9]`, `[t,c{roll,pitch,yaw}]`, and so on — inferred
from a completed evaluation's `CellDefResult` and the definition's own
`# shape:` annotation (§3.6.4) where one is written. The graph view performs
no shape inference of its own and has no independent notion of a port's
type. Where the true shape cannot be read from a completed evaluation — no
window has evaluated this definition yet, or `core` has not yet implemented
the shape being asked for (§3.6.9 records that `spectrogram` and the rest of
§3.6 are landing incrementally) — the port shows **unknown**, never a
guessed shape: a wrong shape rendered with the same confidence as a right
one is worse than an honest blank (ruling R135, Open question 1).

---

### 3.8 Retired names

Function names the language no longer uses, and what replaced them. The
authoritative list is `rust/core/src/math/alias.rs`'s
`math_name_migrations()` — this table mirrors it and must not drift.

| Retired | Replacement | Why |
|---|---|---|
| `variance_time` | `lap_delta_time` | It never computed a variance (σ²). It computes a lap's delta against an overlay lap, time-matched. "Variance" has one meaning in every statistics library, so the old name was a false friend (R143, R146): a reader — or a language model — would reason about σ² and be wrong. |
| `variance_dist` | `lap_delta_dist` | The same, arc-length-matched. |
| `fft` | `periodogram` (this migration's target; `welch` is the split's other half — see below) | `fft(ch, window)` was one un-normalised windowed magnitude spectrum, no segmentation, no averaging — not the Welch spectrum the charts already computed under the same word (R146: "the notebook and the charts compute *different* spectra"). Split into `periodogram` (this shape, scipy-named and scipy-scaled) and `welch` (segmented/averaged, what the charts already compute); `fft` itself is retired and reserved for a true complex DFT. The migration is a **rewrite**, not a bare rename — every migrated call is pinned to `scaling="raw_magnitude"` so no existing workbook's spectrum moves under cover of the rename (R151 item 1); a `version: 4` document's `fft(...)` error names both `periodogram` and `welch`, not `periodogram` alone. |
| `angle` | `angle_between` | `numpy.angle` is complex phase, not the angle between two vectors — a false friend (R143/R151 item 4). |
| `p` | `percentile` | Gratuitous rename — matches `numpy.percentile`'s name, no behaviour change (R143, plan §1 task 10). |
| `clamp` | `clip` | Gratuitous rename — matches `numpy.clip`'s name. Landed alongside a real bug fix, not renamed over it: `lo > hi` or either being NaN previously panicked (`f64::clamp`'s own precondition); both are now a typed `Runtime` error (plan §4 task 1). |
| `if` | `where` | Gratuitous rename — matches `numpy.where`'s name. `cond` also widened to accept a scalar (selecting a whole branch) alongside the existing per-sample channel form — additive, not a migration concern, since every existing call's `cond` was already a channel. |
| `integrate` | `cumulative_trapezoid` | Gratuitous rename — matches `scipy.integrate.cumulative_trapezoid`'s name. `cumtrapz` is *not* in this table: it is a **permanent** second spelling of `cumulative_trapezoid`, not a retired one — scipy itself carries both names, so a document already spelling it `cumtrapz` needs no migration (R151 item 6). |

**How a retired name is handled.** A `version: 3` workbook may still use one:
it is migrated on read, rewritten **on save only** (opening a workbook is
not consent to modify it — decision 75), and the change is reported through
`save_workbook`'s result rather than left as sediment in the document.
`merge` normalises all three inputs *before* per-cell classification, or the
first sync after a rename would conflict an entire document.

A retired name in a **`version: 4`** workbook is a typed error naming its
replacement — never silently accepted. That is what ends a deprecation
rather than extending it forever (R151 item 10).

**Known false friends deferred, not retired (R151 item 8).** `butter`
(designs *and* applies the filter, zero-phase — scipy's `butter`/`sosfilt`
split design from application) and `round` (half-away-from-zero, not
`numpy.round`'s banker's rounding) are confirmed false friends the
scipy-alignment lane did **not** rename: `butter`'s fix is a real behaviour
change with its own migration story, and `round`'s divergence is
documented in its own §3.3 row rather than fixed. Recorded here so the next
reader does not re-derive the finding — neither is a promise either name
changes soon.

**The naming policy this table serves** (R143): where a function is
semantically equivalent to a scipy/numpy one it takes that name; where it is
**not** equivalent it takes a deliberately different name. A familiar name
with unfamiliar behaviour is worse than an invented one, because an invented
name makes a reader check and a false friend does not.

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
| one per `math` definition, by name (§3.1) | `{ length: number, t: Float64Array, v: Float64Array }` for a `[t]` definition — **§3.6.5 extends this by rank**: a rank-0 value binds a bare number, a rank-1 value on a non-time axis binds that axis's key instead of `t`, and a rank ≥ 2 value binds `{ shape, axes, v }`. A **column-oriented** (SoA) table matching Observable Plot's tabular-data protocol, so `Plot.lineY(fork_velocity, {x:"t", y:"v"})` addresses columns by name with zero-copy from the transferred `ArrayBuffer` (design's IPC data path: bytes → `Float32Array`/`Float64Array` view). | The host evaluates the definition (Rust), decimates to the current tile budget, and binds the result under its identifier. |
| `channel(name, {lap?: number, session?: string})` | `{length, t, v, w}` (**amended 2026-09-08, ruling R127**: gains `w`) plus a `windows: {sessionId, span, colour, label}[]` descriptor, `windows[w[i]]` naming sample `i`'s window — see the note below the table | General lookup — any raw/session/synthesized/math-defined channel by name, optionally windowed to one lap and/or a non-active session (cross-session compare, e.g. an overlay). Definitions already bound as bare identifiers are also reachable this way; `channel` is required when the id needed isn't a valid bare identifier caller-side (rare) or when lap/session scoping is needed. |
| `laps` | `{ number: number, startT: number, endT: number }[]` | Active session's lap table. |
| `session` | `{ id: string, name?: string, timestampUtcMs: number }` | Active session metadata (C1). |
| `constants` | `{ [name: string]: number }` | Flattened §3.1 constants (front matter + all `const` lines). Keys may contain spaces (`constants["rider mass"]`); no per-name identifier restriction (§3.1). |
| `Plot` | module namespace | `@observablehq/plot` 0.6.17 (bundled). |
| `d3` | module namespace | `d3` 7.9.0 (bundled). |
| `Inputs` | module namespace | `@observablehq/inputs` 0.12.0 (bundled). |
| `html` | tagged-template function | Observable Framework's standard `html` helper. **Open question §8-4**: the exact package (`htl`) is not yet in T1's pinned ecosystem list — flagged, not assumed. |

**Amended 2026-09-08 (ruling R127) — the `w` column and `windows`
descriptor.** Selection is a list of *windows* (C1 §6.1, ruling R117), and
two windows over the same channel are the ordinary case (lap-to-lap
comparison, R117 item 2) — a host variable is keyed by the definition
alone, never by which windows are selected (R127 item 1: qualifying the
name would make a cell's code depend on the current selection and break
when the user clicks a second lap), so one `channel(name)` call publishes
*every* selected window's data in one payload rather than one payload per
window. `t`/`v` are the concatenation of each selected window's own
samples, in window order; `w[i]` is the index into `windows` naming which
window produced sample `i`; `windows[j]` is that window's
`{sessionId, span, colour, label}` — `colour` (a `--chart-1`…`--chart-8`
token, ruling R117 item 6) is how a chart's per-window colour is meant to
reach it, e.g. `Plot.lineY(channel("front_travel"), {x:"t", y:"v",
stroke:"w"})` with a colour `range` built from `windows[*].colour`.
**A single selected window is byte-identical to before this amendment**:
`w` is all `0` and `windows` has exactly one entry, so every cell written
before multi-window selection existed keeps working unmodified. **Two or
more windows have exactly one `NaN` row inserted between each adjacent
pair** (`t = v = w = NaN`) — Observable Plot breaks a line mark at a `NaN`
in `x` or `y`, so a cell that destructures only `{t, v}` and has no idea
`w` exists still renders *n* separate line segments instead of one line
falsely vaulting from one window's last sample to the next window's first.
The reference implementation is `app/src/routes/pages/Notebook/host/
protocol.ts`'s `combineChannelWindows`.

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
`${…}` cannot call `cumulative_trapezoid(...)`, `butter(...)`, etc. — those are
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
                | "type" ":" ("\"linear\"" | "\"log\"")          (* changed 2026-09-06 *)
y_scale       ::= "{" y_field ("," y_field)* "}"
y_field       ::= "label" ":" js_string
                | "domain" ":" "[" js_number "," js_number "]"
                | "type" ":" ("\"linear\"" | "\"log\"" | "\"sqrt\"")
color_opt     ::= "{" "legend" ":" "true" "}"
marks_array   ::= time_marks | fft_marks                          (* changed 2026-09-06 *)
time_marks    ::= "[" time_mark ("," time_mark)* "]"              (* new 2026-09-06 *)
fft_marks     ::= "[" spectrum_mark "]"                           (* new 2026-09-06, exactly one *)

time_mark     ::= "Plot." mark_name "(" channel_call "," mark_options ")"
mark_name     ::= "lineY" | "dot" | "areaY" | "rectY" | "ruleY"
channel_call  ::= "channel(" js_string ("," "{" "lap" ":" js_int "}")? ")"
mark_options  ::= "{" "x" ":" "\"t\"" "," "y" ":" "\"v\""
                       ("," "stroke" ":" css_color)?
                       ("," "strokeWidth" ":" js_number)? "}"

spectrum_mark ::= "Plot." spectrum_mark_name "(" spectrum_call "," spectrum_options ")"   (* new 2026-09-06 *)
spectrum_mark_name ::= "lineY" | "dot" | "areaY"                  (* new 2026-09-06 *)
spectrum_call ::= "spectrum(" js_string "," fft_params ")"        (* new 2026-09-06 *)
fft_params    ::= "{" "windowSize" ":" window_size ","            (* new 2026-09-06; all six required, fixed order *)
                      "hopSize" ":" hop_size ","
                      "window" ":" window_fn ","
                      "detrend" ":" detrend ","
                      "scaling" ":" scaling ","
                      "averaging" ":" averaging "}"
window_size   ::= js_int | "\"all\""                              (* new 2026-09-06 — R79 Q1 *)
hop_size      ::= js_int | "\"all\""                              (* new 2026-09-06 — R79 Q1 *)
window_fn     ::= "\"rectangular\"" | "\"hann\"" | "\"hamming\""  (* new 2026-09-06 *)
detrend       ::= "\"none\"" | "\"mean\"" | "\"linear\""          (* new 2026-09-06 *)
scaling       ::= "\"magnitude\"" | "\"density\""                 (* new 2026-09-06 *)
averaging     ::= "\"none\"" | "\"mean\"" | "\"median\"" | "\"max\""   (* new 2026-09-06 *)
spectrum_options ::= "{" "x" ":" "\"f\"" "," "y" ":" "\"m\""      (* new 2026-09-06 *)
                       ("," "stroke" ":" css_color)?
                       ("," "strokeWidth" ":" js_number)? "}"
css_color     ::= js_string                (* any valid CSS color literal *)
```

**Rules that carry the same weight as the EBNF** (added 2026-09-06, ruling
R78 L6 Task 19 Q1–Q2 / R79 L6 Task 20 Q1–Q7):

- **A cell is a time cell or an FFT cell, never both** (R78 Q2). `marks_array`
  is `time_marks` or `fft_marks`; a `marks` array containing both a
  `channel_call` mark and a `spectrum_call` mark parses to `null` (custom).
  This makes "its own cell" structural rather than an author convention: two
  x axes (seconds and Hz) cannot share one `Plot.plot`.
- **An FFT cell has exactly one mark** in v1 (R79 Q7). `fetch_fft` returns
  one spectrum and the host's `fftDriver` keys its `spectrum` action by
  `cellId`, so one cell resolves one spectrum. idl0's overlay of up to ten
  spectra is a stated parity gap (SPEC §26.6), not silently dropped.
- **All six `fft_params` keys are required**, in the order given. With every
  key mandatory there is no parameter of the picture that lives in host
  state or in a default the document does not state (CLAUDE.md §3). A
  missing key is custom code, not a default.
- **`x.type: "log"` is legal only in an FFT cell.** In a time cell `x.type`
  still admits only `"linear"` and the generator still never emits it (§8-2
  holds unchanged for time cells). In an FFT cell the generator **does**
  emit `x.type`, always, for the same reason the `fft_params` keys are
  required.
- **Mark options bind `"f"`/`"m"`, never `"t"`/`"v"`.** The spectrum host
  variable is a frequency shape; reusing `t` for Hz would be the same error
  the protocol layer forbids, and the grammar refuses it too.
- **`lap` is not expressible on `spectrum_call`.** C3 §3.6 requires
  `lap: null` until lap indexing at import lands; a grammar slot for it
  would be a promise the engine cannot keep.
- **`"all"` (`window_size`/`hop_size`) means the whole record** (R79 Q1):
  the host resolves it to the channel's `ChannelSummary.sample_count` at
  fetch time — exactly the single-segment sizing `averaging: "none"`
  requires (ruling R76). A literal sample count in the document would be
  wrong the moment the workbook is opened against another session.

**The spectrum host variable.** `spectrum(name, params)` is the one
recognisable host form — one call, one shape, mirroring `channel(...)`:
in the sandbox it is an ambient host variable resolved by lookup, never a
fetch, never DSP, returning `{ f, m, w }[]` records (`f` Hz, `m` magnitude,
`w` the window index per sample — see below) or `[]` before the host has
pushed anything. The lookup key is derived from the request, not the bare
channel name — two cells on the same channel with different `fft_params`
are different spectra — via one shared pure function,
**`spectrumKey(channelId, fftParams)`** (R79 Q2): the channel id plus the
six `fft_params` values joined in the grammar's fixed order, computed
identically on both sides so the host and the sandbox cannot drift. The
host recognises an FFT cell through `parse`, not a scan — an `fft` binding
arm on the same recogniser that binds `channel(...)` today — so custom
code cannot fetch a spectrum, exactly as custom code cannot bind a
tile-backed channel today. `spectrum(...)`'s `params` argument is ignored
at lookup time by everything except the key derivation: the host resolves
those parameters before the fetch, and the argument exists so the
document, not the host, states them (CLAUDE.md §3), and so a hand edit to
a parameter changes the code the parser reads.

**Amended 2026-09-08 (ruling R129, amending R127 item 5) — `spectrumKey`
never varies by window; the payload carries the window dimension
instead.** R127 item 5 originally had `spectrumKey` take a `windowIndex`
so *n* selected windows would publish *n* distinct spectra under *n*
distinct keys — but `spectrum_call`'s grammar has no window token, so cell
code had no way to *address* the extra keys; the addressing gap was
flagged rather than guessed by the implementer. R129 makes spectra
symmetric with channels instead (the channel amendment above): a spectrum
host variable's payload gains the same `w` column and `windows` descriptor
array a channel's does, combining *n* selected windows' own `{f, m}` into
one flat `{length, f, m, w}` array with one `NaN` break row between each
adjacent pair, exactly as `combineChannelWindows` does for `{t, v}` — the
reference implementation is `combineSpectrumWindows`, sharing its
break-insertion rule with `combineChannelWindows` via one internal
generic combiner. **A single selected window is byte-identical to before
this amendment**: `w` is all `0` and `windows` has exactly one entry, and
`spectrumKey`'s own string never varied by window in the first place. No
grammar change: a cell writes `spectrum("x", {...})` and groups by `w`,
precisely as it does for `channel("x")` — there is nothing left to
address, because there is no longer a second key to address.

**Parameter table — type, default, C3 field** (added 2026-09-06):

| Grammar slot | Props field | Type | Default | Maps to |
|---|---|---|---|---|
| chart type (which `marks_array` alternative) | `PlotProps.chart: "time" \| "fft"` | closed enum | `"time"` | nothing on the wire; selects `fetch_fft` vs the tile path |
| `spectrum_call`'s `js_string` | `SpectrumMarkProps.channel` | string | first channel in the session picker | `fetch_fft`'s `channel` |
| `spectrum_mark_name` | `SpectrumMarkProps.mark` | `"lineY" \| "dot" \| "areaY"` | `"lineY"` | none (Plot mark) |
| `windowSize` | `fft.windowSize` | positive integer, samples, or `"all"` | `2048` samples | `params.window_size` |
| `hopSize` | `fft.hopSize` | positive integer, samples, or `"all"` | `1024` samples (50 % overlap of 2048) | `params.hop_size` |
| `window` | `fft.window` | `"rectangular" \| "hann" \| "hamming"` | `"hann"` | `params.window` |
| `detrend` | `fft.detrend` | `"none" \| "mean" \| "linear"` | `"mean"` | `params.detrend` |
| `scaling` | `fft.scaling` | `"magnitude" \| "density"` | `"magnitude"` | `params.scaling` |
| `averaging` | `fft.averaging` | `"none" \| "mean" \| "median" \| "max"` | `"mean"` | `fetch_fft`'s `averaging` |
| `stroke` | `SpectrumMarkProps.stroke` | CSS colour literal | omitted | none |
| `strokeWidth` | `SpectrumMarkProps.strokeWidth` | number, CSS px | omitted | none |
| `x.type` | `XAxisProps.type` | `"linear" \| "log"` | `"log"` | none |
| `x.label` | `XAxisProps.label` | string | `"Frequency (Hz)"` | none |
| `y.type` | `YAxisProps.type` | `"linear" \| "log" \| "sqrt"` | `"linear"` | none |
| `y.label` | `YAxisProps.label` | string | `"Magnitude (<unit>)"` / `"PSD (<unit>²/Hz)"` per scaling | none |
| — no bin/point budget grammar token (R79 Q4) — | — | — | — | a host-side `bin_count` cap; above it the cell shows a note and does not fetch |

**`PlotProps` shape** (illustrative — L6 Task 20 owns the code):

```ts
export type PlotProps = TimePlotProps | FftPlotProps;
export interface TimePlotProps { chart: "time"; marks: MarkProps[]; x?: XAxisProps; y?: YAxisProps; color?: { legend: true } }
export interface FftPlotProps  { chart: "fft";  mark: SpectrumMarkProps; x?: XAxisProps; y?: YAxisProps; color?: { legend: true } }
export interface SpectrumMarkProps {
  channel: string;
  mark: "lineY" | "dot" | "areaY";
  fft: FftParams;          // all six fields required
  stroke?: string;
  strokeWidth?: number;    // px
}
```

A discriminated union rather than an optional field: `FftPlotProps` has one
`mark`, not a `marks` array, so "exactly one spectrum mark" is a type error
rather than a runtime check. Existing props gain `chart: "time"`; `parse`
supplies it, so no landed cell's code changes and every §5.3 worked example
round-trips byte-identically as before.

Every key in every object is **optional** except `marks`/`mark` (a plot
with no marks is legal but pointless — the form always seeds one) and each
`time_mark`'s `x`/`y` (always the literal pair `"t"`/`"v"`) or
`spectrum_mark`'s `x`/`y` (always the literal pair `"f"`/`"m"`) — §5.1
fixes the channel shape's field names and the spectrum shape's field
names, so there is nothing else to bind. In a time cell, `x.type` accepts
only the literal `"linear"` (equivalent to omitting the key; the generator
never emits it for a time cell) — §8-2 records this as provisional for a
future non-time x-axis, now realised in the FFT cell above. Object keys
may appear in any order; the grammar above lists them in the order
`generate()` emits, which is also the order `parse()` requires for a
**byte-identical** round-trip (`generate(parse(code)) === code` for code
the form itself produced) — a hand-edit that only reorders recognised keys
still **parses** successfully (the parser is order-insensitive) but will
not byte-round-trip until the form regenerates it, which is expected and
harmless.

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
- **(added 2026-09-06)** A `marks` array mixing a `channel_call` mark with a
  `spectrum_call` mark; a `spectrum_call` missing an `fft_params` key,
  carrying an extra key, or carrying a computed value in place of a grammar
  literal; a second mark in an FFT cell; `x`/`y` on a `spectrum_mark` that
  are not the literal strings `"f"`/`"m"`; or `x.type: "log"` on a time
  cell. Any `js` cell that parses today keeps parsing and keeps its
  byte-identical round-trip: `parse` returns `chart: "time"` for it, and
  `generate` ignores the discriminant for time cells and emits exactly what
  it emits now — no landed document changes on disk, and no cell silently
  becomes an FFT cell. A hand-written cell that calls `spectrum(...)`
  outside this grammar greys the pane exactly as a hand-written
  `channel(...)` cell outside §5.3's time-cell grammar always has, and,
  because the host binds through `parse`, it gets **no spectrum host
  variable**: `spectrum(...)` returns `[]` and the cell renders an empty
  plot.

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

*Example 5 — FFT chart, defaults, channel `fork_velocity` (unit `m/s`)*
(added 2026-09-06):
```
props = {
  chart: "fft",
  mark: { channel: "fork_velocity", mark: "lineY", fft: {
    windowSize: 2048, hopSize: 1024, window: "hann",
    detrend: "mean", scaling: "magnitude", averaging: "mean"
  } },
  x: { label: "Frequency (Hz)", type: "log" },
  y: { label: "Magnitude (m/s)" }
}
```
```js
Plot.plot({
  x: { label: "Frequency (Hz)", type: "log" },
  y: { label: "Magnitude (m/s)" },
  marks: [
    Plot.lineY(spectrum("fork_velocity", { windowSize: 2048, hopSize: 1024, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" }), { x: "f", y: "m" })
  ]
})
```
Whole-record single-segment form (ruling R76), log-magnitude axis, explicit
colour:
```js
Plot.plot({
  x: { label: "Frequency (Hz)", type: "log" },
  y: { label: "Magnitude (m/s)", type: "log" },
  marks: [
    Plot.lineY(spectrum("fork_velocity", { windowSize: "all", hopSize: "all", window: "hann", detrend: "mean", scaling: "magnitude", averaging: "none" }), { x: "f", y: "m", stroke: "#2196F3" })
  ]
})
```
Formatting follows the generator's stated policy verbatim (two-space
indent, `Plot.plot({` at column 0, each option at column 2, the mark at
column 4, no trailing newline); the `fft_params` object stays on one line,
like `mark_options` does today.

**FFT chart Properties panel controls** (added 2026-09-06, ruling R79). The
pane keeps its current structure (chart-type control at the top, then
type-specific sections); nothing about the custom-code branch changes:

1. **Chart type** — segmented control, `Time` / `FFT`. Switching regenerates
   from that type's defaults, preserving the channel selection. Switching
   away from FFT discards the FFT parameters with no confirmation dialog
   (R79 Q6) — a one-click undo by switching back, unlike custom code, which
   is unrecoverable.
2. **Channel** — the existing channel `<select>`, single-select for an FFT
   cell.
3. **Mark** — `lineY` / `dot` / `areaY`.
4. **Window function** — `Rect` / `Hann` / `Hamming`.
5. **Window size (samples)** — a `<select>` of `1024 / 2048 / 4096 / 8192 /
   16384` plus `Whole record`, with a free numeric entry for a value already
   in the document that is not in the list (opening the dialog never
   silently changes a stored non-standard value). `Whole record` emits
   `"all"`.
6. **Hop size (samples)** — numeric entry, samples, C3's own unit (R79 Q3);
   the form may display a derived overlap percentage, but the document and
   the grammar keep `hopSize` in samples.
7. **Detrend** — `None` / `Mean` / `Linear`.
8. **Averaging** — `None` / `Mean` / `Median` / `Max`. Selecting `None`
   forces window and hop to `Whole record` and disables both, with the
   reason shown in words ("a single-segment FFT covers the whole record") —
   ruling R76's rule made unreachable-by-construction rather than shown as
   a server error.
9. **Scaling** — `Magnitude` / `Density`.
10. **Frequency axis (x)** — `Lin` / `Log`, plus the existing `label` and
    `domain` fields.
11. **Magnitude axis (y)** — the existing `label`, `domain`, and
    `linear/log/sqrt` type controls, unchanged.
12. **Legend** — the existing `color.legend` checkbox, unchanged.

Every control writes through the existing single path: build the next
props, `generate`, hand the string to `onChange`. No control holds state
the document does not carry.

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
- `graph` — merged **per entry** within each of its `nodes`/`cells`
  sub-maps, same shape as `constants`, but with **no conflict note**: an
  entry (a node or cell position) changed on both sides keeps local's value
  silently, and an entry present on only one side carries through. A
  position is cosmetic, not data — injecting an HTML comment into body
  prose because two people dragged the same card on two machines would be
  noise in the document a human reads, unlike a genuinely conflicting
  constant value. An entry naming a definition or cell id absent from the
  merged result is kept, not pruned (§3.7.1) — deletion by merge is §7.2's
  job, not this key's. Full rule and rationale: §3.7.2.

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
