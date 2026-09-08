# The scipy alignment — migration and task plan

**Brief:** R142 (criterion), R143 (keywords approved; naming policy), R146
(corrects R143 twice), and the completed survey
`runs/2026-09-08/math-language-convention.md`. The *what* is decided there and
is not re-argued here. This document plans the *how*, and the migration is the
part that decides whether the *how* is safe.

**Criterion, Isaac's words (R142):** *"the idea is to have it be a language that
has been around long enough to have models trained on it… like scipy."* The
audience includes language models; divergence from scipy/numpy costs accuracy.

Every file/line reference below was read while writing this. Rust paths are
inside the `rust/` submodule.

---

## 1. The rename set, final

| # | Today | Becomes | Class | Numbers change? |
|---|---|---|---|---|
| 1 | `variance_time(ch)` | `lap_delta_time(ch)` | false friend — worst in the catalog | no |
| 2 | `variance_dist(ch)` | `lap_delta_dist(ch)` | false friend | no |
| 3 | `fft(ch, window)` | **split**: `periodogram(…)` (single-segment, what the language does today) + `welch(…)` (segmented/averaged, what the charts already compute); `fft` **retired and reserved** for a true complex DFT | false friend + a real inconsistency between two surfaces | **yes, unless pinned** — see Q1 |
| 4 | `angle(a, b)` | `angle_between(a, b)` | false friend (`numpy.angle` is complex phase) | no |
| 5 | `p(ch, q)` | `percentile(ch, q)` | gratuitous rename | no |
| 6 | `clamp(ch, lo, hi)` | `clip(ch, lo, hi)` | gratuitous rename | no — but see the panic, §4 Task 1 |
| 7 | `if(cond, t, f)` | `where(cond, t, f)` | gratuitous rename | no (widening `cond` to accept a scalar is additive) |
| 8 | `integrate(ch)` | `cumulative_trapezoid(ch)`, with `cumtrapz` a permanent second spelling | gratuitous rename | no |
| — | `differentiate(ch)` | **unchanged.** `differentiate` → `gradient` is withdrawn (R146). | — | — |

**`differentiate` — recommendation: keep the name, add `gradient` separately.**
Ours is a backward difference with `result[0] = 0`
(`rust/core/src/statistics.rs:11-15`); `numpy.gradient` is central. Changing the
implementation to take the name would silently change every existing
suspension-velocity number — precisely the defect class this exercise exists to
remove, and it would do it under cover of a "naming" change. Keeping
`differentiate` as a deliberately different name for the causal difference is
what R143's own policy prescribes, and it leaves `gradient` free to mean exactly
what numpy means when we add it (§4 Task 11). See Q3.

**Not in this set, deliberately.** The survey also confirms `butter`
(designs *and* applies, zero-phase), `round` (half-away-from-zero vs numpy's
banker's rounding), `hilbert` (will be an envelope, not the analytic signal) and
`resample` (rate vs sample count) as false friends. R146 confirms them but rules
on none. See Q8.

---

## 2. Keyword arguments (R143 item 1)

Positional form stays valid; keywords are additive. The payoff is xarray's
spelling for C2 §3.6's named-axis reductions — `mean(spec, dim="f")` — plus a
non-overloaded spelling for the rolling form (`mean(x, window=w)`), which today
is dispatched on the *type* of a positional argument (`eval.rs:1008-1020`), a
thing nothing in numpy/scipy/pandas/xarray does.

**Grammar (C2 §3.2).** One production changes:

```
call      ::= identifier "(" [ arg { "," arg } ] ")"
arg       ::= expression | identifier "=" expression
```

Rules to state in §3.2, because a parser that leaves them implicit will be read
by a model as permissive: a keyword argument may not precede a positional one;
a name may not be bound twice (positionally and by keyword, or twice by
keyword); an unknown keyword is an error, never ignored — a silently-dropped
`prominence=` is a false friend in parameter form.

**`rust/core/src/math/token.rs`.** `'='` is currently a hard parse error unless
followed by `=` (`token.rs:200-208`). Add `TokenKind::Equals`; keep the
`did you mean "=="` message for `=` appearing where an expression is expected,
raised by the parser rather than the tokenizer.

**`rust/core/src/math/parse.rs`.** `Ast::Call { name, args }` (`parse.rs:48`)
gains `kwargs: Vec<(String, Ast)>`; `parse_args` (`parse.rs:299`) look-aheads
one token — `Ident` followed by `Equals` starts a keyword argument. **This is a
`pub` signature change in `core`** (`Ast` is public and matched on in
`eval.rs`): the task adds `cargo check -p idl-rs-cli --tests` per CLAUDE.md §8.

**Hazard, `rust/core/src/workbook/v3/math_cell.rs:98`.** `classify_line` splits
a `def_line` at the **first `=` in the line**. That stays correct with keyword
arguments (the definition's `=` is always first), but it is now load-bearing in
a way it was not: the task must add a test for
`x = where([a] > 0, mean([b], dim="t"), 0)` classifying as one `Def` with the
whole call as `expr_text`, and the same for a `const` line.

**`app/src/routes/pages/Notebook/model/mathMode.ts`.** `tokenizeMath` already
emits `=` as an `"operator"` (`mathMode.ts:127`) and needs no change to keep
highlighting correct. What it *should* gain is a distinct classification for a
keyword name inside a call, so `dim=` does not highlight as a bare identifier —
cosmetic, in the same task as the TS scanner so the two agree.

**`app/src/routes/pages/Notebook/model/mathExpr.ts`.** `MathExprCall.args:
string[]` (`mathExpr.ts:38`) is positional-only, and
`NodeCard.tsx`'s `onEditArg(argIndex, newText)` (`NodeCard.tsx:67`) and
`graphEdits.ts`'s `editLiteralArg` address arguments **by 0-based position**.
Keyword arguments break that addressing. `args` becomes
`{ name: string | null; text: string }[]`, and `editLiteralArg` addresses an
argument by name when it has one and by position otherwise. Without this, a
keyword-written call silently edits the wrong parameter from the node card —
a wrong number a rider acts on, reached by a click.

**Completion catalog.** `functionCatalog.ts`'s `signature` strings and
`CodePane.tsx`'s completion detail (`CodePane.tsx:109`) must show the keyword
form for every function whose signature has one, or the feature is invisible.

---

## 3. The migration — the mechanism

Decision 75: an update **migrates** workbooks, it does not break them. R143:
old spellings keep parsing for one revision, are rewritten on save, and the
change is reported.

### 3.1 One table, one rewriter, in `core`

**Where it lives:** a new `rust/core/src/math/alias.rs`, beside
`math/catalog.rs` (which is already the single place C3's `list_math_builtins`
and TS's `functionCatalog.ts` derive from). One table, consulted by every door:

```rust
pub enum MigrationKind {
    /// Same call, new spelling — arguments untouched.
    Rename,
    /// The call is re-spelled with different arguments (only `fft`).
    Rewrite,
}
pub struct NameMigration { pub old: &'static str, pub new: &'static str, pub kind: MigrationKind }
pub fn math_name_migrations() -> &'static [NameMigration];
```

**The rewriter is a token splice, not a re-serialisation.** `migrate_expression(
src: &str) -> (String, Vec<AppliedRename>)` tokenizes with
`math::token::tokenize`, rewrites only an `Ident` token that is immediately
followed by `LParen` and present in the table, and copies every other byte
through untouched. Two reasons: comments, spacing and the author's own
formatting survive (an AST round-trip would reflow every migrated line and turn
one rename into a whole-cell diff for L11's merge), and a `#`-comment or a
`[Channel]` named `fft` is never touched, because the tokenizer already knows
those are not call sites. This is the same posture as R145 — rewrite exactly
what we can rewrite safely, and nothing else.

**Document walk:** `migrate_document(markdown: &str) -> (String,
Vec<DocumentRename>)` applies `migrate_expression` to

- every `math` cell `def_line`/`const_line` right-hand side, and
- every `table` cell's `cells[r][c].formula` and `columns[].template`
  (C2 §4 — these are §3.2 expressions too, and are the surface a migration
  written only against math cells will miss),

and leaves prose and `js` cells alone (they name *definitions*, not functions;
R145 forbids textual rewriting of arbitrary JS). It sets front matter
`version: 4`. It is idempotent: running it on a v4 document is a no-op that
reports nothing.

### 3.2 How the change is reported

C2 §7.1's precedent is an HTML comment injected into body prose for a merge
conflict. That is the right shape for a merge, and the wrong one here — a
rename is not a conflict and should not leave sediment in the document.

**Reported through the save result, shown in the UI's existing banner slot.**
`save_workbook` (C3 §3.4, `app/src/ipc/workbook.ts:252`) already returns a
`SaveResult`; it gains `migrations: { cell_id, line, old, new }[]`, and the
notebook renders them beside `ConflictBanner.tsx` — "3 retired function names
were updated in this workbook", expandable to the list. On **open**, the same
core call runs read-only and shows a passive strip ("this workbook uses 2
retired names; saving will update them"). Nothing is rewritten without the save
gesture the user was already making, and nothing is rewritten silently.

### 3.3 Reading, for one revision

- Front matter `version: 3` **and** `4` both parse. `UnsupportedWorkbookVersion`
  (C2 §3.5) widens accordingly.
- A v3 document is migrated **in memory** before evaluation, so it evaluates
  identically whether or not it has been saved since the update. Old names are
  never a second dispatch arm in `eval::call_function` — there is exactly one
  implementation per function, and the alias table is the only place the old
  spelling exists.
- In a **v4** document an old name is a typed `UnknownFunction` whose message is
  drawn from the same table: `"fft was retired — see periodogram / welch"`. The
  error stays helpful after the compatibility window closes, which is the whole
  reason the table outlives it.

### 3.4 A workbook synced from a peer still writing old names

This is where the change is most likely to hurt, and it is invisible until two
machines meet. C2 §7.2 classifies a cell as `Changed` by **byte-identical
content** against `base`. After this update, one side's `math` cell says
`lap_delta_time` and the other's says `variance_time`; `base` says whichever was
cached last. Merged naively, the first sync after the update marks **every math
cell Changed on both sides** and produces conflict copies for the whole
document.

**Rule: normalise before merging.** `merge(local, peer, base)` runs
`migrate_document` on all three inputs first (a no-op on any already-v4 side),
then applies §7.2 unchanged. Two sides that differ only in spelling then compare
equal and merge silently, exactly as they should.

**C2 §7.1's `version` rule needs a matching amendment.** It currently calls
`version` immutable. A 3-vs-4 mismatch is not a different-file situation: the
merged result is v4 (the migrating side wins), never a refusal. Only a mismatch
in `id` remains a refusal.

### 3.5 How the deprecation ends

Not by "stopping accepting" — by migrating. A later revision:

1. raises the reader's floor to `version: 4` and deletes the v3-compat branch in
   the reader and in `merge`;
2. keeps `math_name_migrations()` and its error messages;
3. gains a v3→v4 path in `idl-rs migrate-workbook` (C2 §6), which already exists
   for `.idl0wb` v2, already has a report-and-refusal policy, and is where a
   file too stale for the app is recovered rather than lost.

A user who opens a stale file after the window closes is told which command
fixes it, and that command exists. That is the difference between a deprecation
that ends and one that strands a file.

### 3.6 The `.idl0wb` v2 path, which is also a migration surface

`idl-rs migrate-workbook` (C2 §6) reads v2 `math_channels[]` expressions written
in idl0's vocabulary — every one of which uses the *old* names. Its
`math_channels[]` row must run `migrate_expression` on each expression and emit
one report line per rename, alongside the identifier-rename lines it already
emits (C2 §6.1). Otherwise the v2 importer produces v4 documents full of retired
names.

### 3.7 The migration test must use a production-shaped workbook

Not a synthesised one-liner. The fixture is one `.idl1wb` with: front matter
with `version: 3` and a `constants` map; a `math` cell with several `def_line`s
including a trailing `# label:` comment, a `const` line, a comment line
mentioning a retired name in prose ("the old fft path"), and a call nested
inside an operator expression; a `table` cell whose JSON carries both a
`columns[].template` and a per-cell `formula`; a `js` cell with `plotForm`
output; and a prose paragraph with an inline `${…}` span. Assertions: the two
expression-bearing surfaces are rewritten, the comment and the JS cell are
byte-identical, the `# label:` text survives, whitespace elsewhere in the
rewritten lines is unchanged, and a second run reports nothing.

---

## 4. The task plan

Ordered so the tree is never broken between commits, and so **the most dangerous
false friend lands first**: a wrong `variance_*` or `fft` result is a wrong
number a rider acts on; `clamp`→`clip` is cosmetic. Each rename is reachable end
to end in the task pair that introduces it — engine, contract, completion
catalog, and any card or form that spells the name (R147).

Compute rules (CLAUDE.md §8) apply: one targeted filter per task, non-zero
`passed` count, full suite once at the lane's merge gate.

| # | Task | Lang | Test filter | Spec |
|---|---|---|---|---|
| 1 | **Fix the two crash-on-bad-data defects first** (R146): `clamp` panics when `lo > hi` or either is NaN (`math/eval.rs:1152`); `butter` panics on a cutoff ≥ Nyquist (`filters.rs:67-84` → sci-rs `iirfilter.rs:137`). Both are typed `Runtime` errors, matching the arm's existing bad-direction-string handling (`eval.rs:906`). Renaming `clamp` to `clip` over a panic would ship a false friend of a different kind. | Rust | `cargo test -p idl-rs -- math::eval::tests::clamp filters::tests::butter` | no spec change needed |
| 2 | **Migration machinery + the `lap_delta_*` rename, in core.** `math/alias.rs` (table, `migrate_expression`, `migrate_document`); `version: 4` accepted alongside 3; v3 migrated in memory before eval; `variance_time`/`variance_dist` renamed in `eval::call_function` and `math/catalog.rs`; C2 §3.3 rows, §3.5's version rule, and a new §3.8 "Retired names" table. The §3.7 fixture lands here. | Rust + docs | `cargo test -p idl-rs -- math::alias workbook::v3::tests_migration` | spec-during (C2 §3.3, §3.5, new §3.8) |
| 3 | **Make it reachable: report + catalog.** `save_workbook` returns `migrations`; C3 §3.4 amended (`SaveResult`, and `MathBuiltinDto` gains `renamed_from`); `ipc/workbook.ts`; the notebook's banner slot beside `ConflictBanner.tsx`; `functionCatalog.ts` rows and the `list_math_builtins` self-check; the on-open passive strip. **Tasks 2 and 3 gate together — 2 alone is not shippable.** | Rust (tauri) + TS + docs | `cargo test -p idl-rs-tauri -- save_workbook` and `npx vitest run app/src/routes/pages/Notebook/model/functionCatalog.test.ts app/src/ipc/workbook.test.ts` | spec-during (C3 §3.4) |
| 4 | **Merge normalisation** (§3.4): `migrate_document` on `local`/`peer`/`base` before C2 §7.2's classification; §7.1's `version` rule amended so 3-vs-4 merges to 4. The test is two documents differing *only* in spelling merging to zero conflicts. | Rust + docs | `cargo test -p idl-rs -- workbook::merge` | spec-during (C2 §7.1) |
| 5 | **`migrate-workbook` carries the renames** (§3.6): v2 expressions rewritten, one report line each; a v3→v4 input path. | Rust + docs | `cargo test -p idl-rs-cli -- migrate_workbook` | spec-during (C2 §6) |
| 6 | **The `fft` split.** `periodogram` (single-segment) and `welch` (segmented, pointed at `core::fft::welch` — the function the charts already call, `rasters.rs:508`), both with scipy's parameter names (`window`, `nperseg`, `noverlap`, `detrend`, `average`, `scaling`) and scipy's defaults; `fft` retired and reserved. Depends on Q1, and on Task 7 if the parameters are to be keywords rather than positional. **Highest numeric risk in the lane.** | Rust + docs | `cargo test -p idl-rs -- math::eval::tests::periodogram math::eval::tests::welch` | spec-during (C2 §3.3, §3.6) |
| 7 | **Keyword arguments, engine side** (§2): `TokenKind::Equals`; `Ast::Call` gains `kwargs`; binding rules and the three error cases; C2 §3.2's grammar; the `math_cell.rs:98` first-`=` test. **Changes a `pub` signature in `core`** → adds `cargo check -p idl-rs-cli --tests`. | Rust + docs | `cargo test -p idl-rs -- math::parse math::token math::eval::tests::kwarg` | spec-during (C2 §3.2, §3.5) |
| 8 | **Keyword arguments, UI side** (§2): `mathExpr.ts`'s `args` become named-or-positional; `graphEdits.editLiteralArg` addresses by name when present; `NodeCard`'s arg editing; `tokenizeMath` classifies a keyword name; completion signatures show the keyword form. | TS | `npx vitest run app/src/routes/pages/Notebook/model/mathExpr.test.ts app/src/routes/pages/Notebook/model/graphEdits.test.ts app/src/routes/pages/Notebook/model/mathMode.test.ts` | no spec change needed |
| 9 | **`angle` → `angle_between`** — engine, catalog, C2 row, `functionCatalog.ts`, retired-names table. | Rust + TS + docs | `cargo test -p idl-rs -- math::vector math::alias` and `npx vitest run app/src/routes/pages/Notebook/model/functionCatalog.test.ts` | spec-during (C2 §3.3) |
| 10 | **The cosmetic four in one commit:** `p`→`percentile`, `clamp`→`clip`, `if`→`where` (widening `cond` to accept a scalar, `eval.rs:1158`), `integrate`→`cumulative_trapezoid` with `cumtrapz` as a permanent second spelling. Machinery is proven by now; four table entries, four C2 rows, four catalog rows. | Rust + TS + docs | `cargo test -p idl-rs -- math::alias math::aggregate` and `npx vitest run app/src/routes/pages/Notebook/model/functionCatalog.test.ts` | spec-during (C2 §3.3) |
| 11 | **`differentiate` stays; `gradient` is added** as numpy's central difference, and C2 §3.3 states the backward-difference-with-`result[0]=0` behaviour in `differentiate`'s own row. Also states the whole-language NaN policy once in §3.3's preamble ("every reducer is NaN- and inf-skipping; the numpy analogue is the `nan*` form"), per the survey §1.2. | Rust + docs | `cargo test -p idl-rs -- statistics::tests::gradient` | spec-during (C2 §3.3) |
| 12 | **`dim=` reductions** (R142 item 3): C2 §3.6's positional axis string `mean(spec, "f")` gains xarray's `mean(spec, dim="f")`; positional stays valid; completion shows the keyword form. Requires Tasks 7 and 8. | Rust + TS + docs | `cargo test -p idl-rs -- math::eval::tests::dim` | spec-during (C2 §3.6) |
| 13 | **Close the lane:** `CHANGELOG.md`, `TASKS.md`, and C2 §3.8's retired-names table checked against `math_name_migrations()` by a test that reads both. | docs + Rust | `cargo test -p idl-rs -- math::alias::tests::table_matches_spec` | spec-during |

**Split:** 13 tasks — Rust 8 (1, 2, 4, 5, 6, 7, 11, plus the Rust half of 3),
TS 2 (8, and the TS half of 3), mixed Rust+TS+docs 3 (9, 10, 12), docs 1 (13).
Task 7 is the only one changing a `pub` signature in `core`.

---

## 5. Open questions for the lead

**Q1 — Does `periodogram` take scipy's normalisation, or preserve today's
numbers?** Ours is un-normalised `|rfft(w·x)|` (`fft.rs:39`); scipy's
`periodogram` divides by `fs·Σw²` (density) or `(Σw)²` (spectrum). Taking
scipy's name with our scaling installs exactly the false friend we are removing;
taking scipy's scaling changes every existing spectrum's vertical axis.
**Recommendation:** implement scipy's `density` and `spectrum` scalings
correctly, add a deliberately-named `"raw_magnitude"` for today's value, default
newly-typed `periodogram` to `"density"`, and have the migration rewrite
`fft(ch, "hann")` → `periodogram(ch, window="hann", scaling="raw_magnitude")`.
No existing workbook's numbers move; every new one is on scipy's ground.

**Q2 — The chart side.** `PropertiesForm`'s `scaling: "magnitude"`
(`model/propertiesForm.ts:105`) and the `spectrum()` host call
(`plotForm/generate.ts:83`) carry the same un-normalised value under the same
misleading word, and `fft.rs:440` computes it. **Recommendation:** rename the
option value to `"raw_magnitude"` on both surfaces in Task 6 so the two
vocabularies never diverge, but leave the chart's *parameter* alignment
(`averaging`→`average`, `nperseg`) to a follow-on in the chart lane — it is a
C3 change with its own consumers.

**Q3 — `differentiate`.** Keep the backward difference under its own name and
add `gradient`, or make it central and take the name? **Recommendation:** keep
and add (§1). Changing it silently moves every existing damper number.

**Q4 — The lap-delta spelling.** `lap_delta_time`/`lap_delta_dist` or
`delta_time`/`delta_dist`? **Recommendation:** `lap_delta_*` — it says *which*
delta, and bare `delta_time` reads as a timestep.

**Q5 — `angle_between` or `vector_angle`?** **Recommendation:**
`angle_between` — it reads as the operation, and scipy offers no competing
spelling to defer to.

**Q6 — `integrate` → `cumulative_trapezoid` is a long name.**
**Recommendation:** rename, and accept `cumtrapz` permanently as a second
spelling (not a deprecation — scipy itself carried both, so both are trained on).

**Q7 — What does the version bump look like?** `version: 4` in front matter, or
a separate `language_revision` key leaving `version: 3`? **Recommendation:**
`version: 4`. C2 §3.5 already has one version gate and one error kind for it;
a second axis of versioning is a second thing to get wrong in merge.

**Q8 — The other confirmed false friends** (`butter` designs *and* applies
zero-phase; `round` is half-away-from-zero; `hilbert` will be an envelope;
`resample` takes a rate, not a count). In this lane or a later one?
**Recommendation:** do `hilbert` → `envelope` and fix `resample`'s
parameterisation now — both are `NotImplemented` (`eval.rs:1177`), so the
migration cost is zero and the cost only rises once someone builds against the
name. Defer `butter` (splitting design from application is a behaviour change
with a real migration) and `round` (document the divergence in its §3.3 row).
Both deferred items get a §3.8 note so the next reader does not re-derive them.

**Q9 — Migration timing.** Rewrite on save only, or also silently on open?
**Recommendation:** save only, with a passive notice on open (§3.2). A file
should not change under a user who only looked at it.

**Q10 — Does a v4 document ever accept an old name?** **Recommendation:** no —
a typed `UnknownFunction` naming the replacement. The compatibility window is
the v3 branch; if v4 also accepted old names the window would never close.
