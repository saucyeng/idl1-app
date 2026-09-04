# L3 pre-read — Tasks 2–5 vs. signed contracts and landed `main` (`76b640a`)

Read-only pass. Line refs: plan = `docs/superpowers/plans/2026-09-03-idl1-wave1-l3-workbook.md`;
code = shared checkout `rust/core/src` on `main`. L3 worktree is still at `76b640a`
(Task 1 uncommitted), so every Task 2 premise rests on Task 1's *plan text*, not landed code.

---

## Task 2 — Structural validation errors (plan 233–256)

**Gaps**

- **G2.1 — plan-internal contradiction, Task 2 ↔ Task 3.** Plan 243 demands *one exact
  message string per kind*, literal-asserted ("pure transcription check"). Plan 269
  (Task 3) emits a **second, different** `InvalidIdentifier` message ("noting the line
  couldn't be parsed as `const NAME = value`…"). Consequence: Task 2's
  `invalid_identifier_message_matches_c2_exactly` test and Task 3's stray-line behaviour
  cannot both hold; the reviewer flags one of them.
- **G2.2 — stale premise: R7 already ruled these.** Plan 269 and 481 tell the implementer to
  "log this as Open Question 1/2 … assigned to the lead". `runs/2026-09-03/decisions.md` R7,
  "Approved as drafted": *"L3: the stray-math-line and malformed-table-JSON error-kind
  defaults"*. Consequence as drafted: the implementer re-raises a closed question and blocks
  or hedges for no reason.
- **G2.3 — `WorkbookError.cell_id` has no source.** C2 §3.5 (spec 465–467) fixes errors as
  `{cell_id, message}` with `cell_id` = the owning fence id or `"front-matter"`. Task 3's
  `parse_math_cell_body(body: &str)` (plan 265) and Task 4's `merge_constants(front_matter,
  const_lines)` (plan 297) both *return* `WorkbookError`s and neither takes a cell id.
  Consequence: `cell_id` gets `""` or a caller patch-up loop, and per-cell surfacing
  (C3 §3.4 `CellOutput.error`) has nothing to key on.
- **G2.4 — C3 has no IPC kind for any of the seven.** C3 §2's table (spec 132–164) carries
  `math_*` ×9 but nothing `workbook_*`; the nearest is `invalid_argument` scoped to
  `save_workbook`. Consequence: L5's `open_workbook`/`eval_workbook` wrapper has no kind for
  `MissingFrontMatterId`/`UnsupportedWorkbookVersion` — the two Task 1 makes fatal. Same
  shape as the `import_*` gap R7 closed for L2. **Lead-owned, not L3's to edit.**
- **G2.5 — message bytes.** C2 §3.5.A's `InvalidIdentifier` row contains a literal em dash
  (U+2014) and an ASCII apostrophe in "don't"; `ReservedName` likewise ("can't"). A
  transcription that normalises either fails Task 2's own literal assertions.
- **G2.6 — error trait surface omitted.** Plan 247 asks only for `Clone + Debug + PartialEq`.
  `MathEvalError` (`math/error.rs:44-50`) implements `Display` + `std::error::Error`;
  CLAUDE.md §5 wants typed failures. Consequence: `WorkbookError` can't be `?`-boxed or
  formatted like every other core error.

**Proposed rulings**

- **L3-R1.** `WorkbookError` mirrors `MathEvalError`'s shape exactly: `{cell_id: String, kind:
  WorkbookErrorKind, message: String}`, `#[derive(Debug, Clone, PartialEq)]`, plus `impl
  Display` (writes `message`) and `impl std::error::Error`. One constructor per kind, each
  producing C2 §3.5.A's template byte-for-byte, em dash and apostrophes included; the tests
  assert the literal string. No line numbers in `message` and no `line` field — C2 fixes the
  message shape and this lane does not widen it. *Cost if wrong: one struct field, no
  consumers yet.*
- **L3-R2.** Every function that can raise a cell-scoped error takes the owning cell id:
  `parse_math_cell_body(cell_id: &str, body: &str)`, and `merge_constants`' const-line
  argument becomes `&[ConstLine { cell_id, name, value, unit_display }]` (a struct, not a
  4-tuple). Front-matter-sourced errors use the literal `"front-matter"`. *Cost if wrong: one
  parameter, caught at the first call site.*
- **L3-R3.** The stray-math-line default is **ruled by R7 — code it, do not re-raise.**
  Mechanics, to keep L3-R1's one-template-per-kind invariant: a line matching none of C2
  §3.1's four `math_line` forms is `InvalidIdentifier` with the *unmodified* C2 template,
  `<name>` substituted with the line's trimmed text (up to the first `=` if one exists, else
  the whole trimmed line). No second message variant. *Cost if wrong: a diagnostics string.*
- **L3-R4 (lead, not L3).** Amend C3 §2 with `workbook_*` kinds before L5's workbook-command
  task — at minimum `workbook_missing_front_matter_id` and `workbook_unsupported_version`
  (the two Task 1 makes fatal); the other five ride inside per-cell error lists and need no
  command-level kind. Precedent: R7's `import_*` amendment. *Cost if wrong: additive kinds,
  unshipped.*

**Compute note.** Filter `cargo test -p idl-rs workbook::v3::error`. New module only — no
existing `pub` signature changes; `cargo check -p idl-rs-cli --tests` not required.

---

## Task 3 — Math-cell definition grammar (plan 259–288)

**Gaps**

- **G3.1 — there is no `regex` crate.** `rust/core/Cargo.toml:10-21` lists sci-rs, nalgebra,
  rustfft, realfft, serde, serde_json, arrow, parquet, rusqlite, uuid, sha2. Plan 271 says
  "`identifier` regex: …" and plan 203/Task 1 says "constant unit-suffix regex". Plan 25-29
  ("existing deps only plus two new ones") forbids a third. Consequence: either a silent
  third dependency (more compile load under R13) or an implementer stalling.
- **G3.2 — `const` prefix vs. a definition named `constant`.** C2 §3.1's `const_line` requires
  `"const" /[ \t]+/`. A naive `trimmed.starts_with("const")` misclassifies `constant = [X]`
  as a malformed const line. Consequence: a legal definition silently becomes an error.
- **G3.3 — trailing-comment split is not string-literal-aware.** C2 §3.2's grammar has string
  literals (`butter(2, 5, "low", [X])`, `detrend([X], "none")`). Splitting a `def_line` at the
  first ` #` breaks any expression whose string argument contains `#`. Low probability, silent
  corruption when it hits.
- **G3.4 — definition names may shadow session channels.** C2 §3.5.A's `ReservedName` row
  covers `const`, the universal four, and the eight host vars — **not** base/synthesized
  channel names. `Time = [X] * 2` is legal v3; Task 6 layers defs over `lookup`, so `[Time]`
  then resolves to the definition, not `synthesis.rs`'s seconds channel, everywhere in the
  document. Consequence: silent, document-wide shadowing of the time axis.
- **G3.5 — operator keywords are legal identifiers.** `and` / `or` / `not` match C2's
  `identifier` regex and are not in the `ReservedName` list. `const and = 5` parses; a bare
  `and` in primary position then resolves as a constant literal (`parse.rs:242-256` reaches
  `constant_value` only in primary position, so the infix operator still wins). Cosmetic
  today, confusing later.
- **G3.6 — Step 2 edits a file Task 3's Files line omits.** Plan 263 lists
  `math_cell.rs` + `mod.rs` + `error.rs`; Step 2 (plan 277) puts whole-document flattening and
  `DuplicateDefinition`/`DuplicateConstant` in `mod.rs`, overlapping Task 4's constants merge.

**Proposed rulings**

- **L3-R5.** No `regex` crate. C2's `/…/` terminals are *specifications*; implement them as
  hand-written scanners, matching `math/token.rs` (hand-written tokenizer) and
  `math/resolve.rs:24` (`channel_refs`, explicitly "regex-free"). `identifier` is a 6-line
  char scan. *Cost if wrong: a dependency we can still add later.*
- **L3-R6.** Line classification order and rules, stated once: (1) strip a trailing comment by
  scanning for `#` **outside** a double-quoted string, preceded by whitespace; (2) blank →
  `Blank`; (3) leading `#` → `Comment`; (4) `const` **followed by at least one space/tab** →
  `const_line`; (5) contains `=` → `def_line`; (6) otherwise L3-R3. *Cost if wrong: one
  function, fully unit-tested.*
- **L3-R7.** A definition name equal to a base/synthesized channel id is **not** an error this
  wave (C2 does not list one), but `resolve_workbook_defs`' layering order — definitions win
  over session channels — is stated in the module doc and covered by a test
  (`definition named Time shadows the synthesized Time channel — documented, deterministic`).
  Flagged to the lead as a candidate C2 §3.5.A `ReservedName` widening (`Time`, `Distance`),
  which L3 may not make unilaterally. *Cost if wrong: a doc line plus, later, one more
  reserved-name check.*

**Compute note.** Filter `cargo test -p idl-rs workbook::v3::math_cell`. New module only; no
`pub` signature change reaching `idl-rs-cli`.

---

## Task 4 — Constants (plan 291–319)

**Gaps**

- **G4.1 — the task's test gate runs zero tests and passes.** Plan 315:
  `cargo test -p idl-rs "constants|parse_with_constants"`. `cargo test`'s filter is a
  **substring**, not a regex — `constants|parse_with_constants` matches no test name. The
  plan's own success check (`grep -E "^test result"`, expect `0 failed`) is satisfied by
  `ok. 0 passed; 0 failed`. Exactly R13's "targeted gate" trade with the safety net removed.
- **G4.2 — Step 1's expected message is not the landed one.** Plan 301 expects
  `Parse error "unexpected identifier 'nope'"`. `parse.rs:254-256` emits
  `Unexpected identifier "nope" — did you mean [nope] for a channel reference?`
  (capital U, double quotes, em dash, hint clause).
- **G4.3 — Step 1's fixture does not compile.** `&[("k", 9.81)].into()` cannot produce
  `&HashMap<String, f64>`: `&str ≠ String`, and `[T; 1]` has no `into` to `HashMap`.
- **G4.4 — `merge_constants` under-enforces `ReservedName`.** Plan 309 rejects only
  `pi`/`tau`/`e`/`g`. C2 §3.5.A's row: *"A definition **or constant** is named `const`, one of
  the four universal constants, or a host-var name (`Plot`/`d3`/`Inputs`/`html`/`laps`/
  `session`/`constants`/`channel`)"*. Front-matter constants never pass through Task 3's
  parser, so `constants: { session: 5 }` would reach the JS `constants` object and collide
  with the `session` host variable (C2 §5.1) with no error anywhere.
- **G4.5 — spaced front-matter constant names are unreachable from math.** Correctly allowed
  by C2 §3.1 and by the plan's own test, but the tokenizer cannot produce a spaced bare
  identifier, so such a constant is JS-only (`constants["rider mass"]`). Not stated anywhere
  the implementer will read it.

**Confirmed correct as drafted** (no change): the resolution order in `parse_primary` —
`constant_value` (universal four) first, table lookup second, then error — matches C2 §3.2's
"never shadowable" rule and `parse.rs:250-256`; and `parse(e) == parse_with_constants(e, &{})`
is a free refactor (`HashMap::new()` does not allocate).

**Proposed rulings**

- **L3-R8.** Task 4's gate is **two** runs, both plain substrings:
  `cargo test -p idl-rs workbook::v3::constants` and `cargo test -p idl-rs parse_with_constants`.
  Each must report a non-zero `passed` count — a targeted filter that matches nothing is a
  failed gate, not a pass. Apply the same "assert non-zero passed" rule to every task in this
  lane. *Cost if wrong: none; strictly a stricter gate.*
- **L3-R9.** Step 1's expectations are rewritten against landed text: assert
  `err.kind == MathEvalErrorKind::Parse` and `err.message.contains("Unexpected identifier
  \"nope\"")` (substring, so the hint clause is not re-transcribed); the fixture is
  `HashMap::from([("k".to_string(), 9.81)])`. *Cost if wrong: a test literal.*
- **L3-R10.** `merge_constants` is the **single enforcement point** for the full C2 §3.5.A
  `ReservedName` set — `const`, `pi`/`tau`/`e`/`g`, and the eight host vars — applied to
  **both** sources (front matter and `const` lines), case-sensitive, before the merged table
  is returned; a reserved name is reported and **not** merged, so `parse_with_constants` never
  sees one. Its doc comment states that precondition, and that `identifier`-shape restriction
  applies to `const`-line names only while `ReservedName` applies to both. Tests add
  `front-matter constant named "session" — ReservedName, not merged` and
  `front-matter constant named "const" — ReservedName`. *Cost if wrong: a list constant,
  shared with Task 3 via one `const RESERVED_NAMES: [&str; 13]` so the two cannot drift.*

**Compute note.** Filters above. `math/parse.rs` gains a `pub fn` (additive; no existing
signature changes), so `cargo check -p idl-rs-cli --tests` is not mandated — run it anyway,
it is seconds and this lane's first touch of a `pub` core module.

---

## Task 5 — Time model (plan 323–429)

**Gaps** — the plan's own dependency premise is the biggest one.

- **G5.1 — "L1 picks this up" is now impossible.** Plan 333–338 leaves populating
  `LookupChannel.t_us` inside `SessionHandle` to "L1's implementer … made together if pairing
  as a team". L1 landed at `76b640a`; the ledger's L1 LANDED entry records both L1 worktrees
  retired and all L1 teammates stopped. Plan 73–88's whole "L1↔L3 agent team sharing one
  worktree" framing, and its grep fallback gate, are stale (the grep *would* match —
  `session/mod.rs:137` — but it points at the **shared** checkout path, R9's class of error).
  Consequence as drafted: a mandatory field nothing populates, and an implementer waiting for
  a teammate that does not exist.
- **G5.2 — the derived-channel round trip destroys the new axis.** `math/resolve.rs:75` calls
  `handle.store_math(&name, out.sample_rate_hz, out.samples)`; `handle.rs:562-568` builds the
  stored channel with `Channel::from_f64`, which (`session/mod.rs:206-212`) **synthesizes**
  `t_us[i] = round(i * 1e6 / rate)` and discards the real one. Consequence with Step 2's
  identical-`t_us` rule: on any burst-corrected session (Isaac's own file: nominal 800 Hz,
  true 812.348 Hz), `[MathA] + [IMU0_AccelZ]` raises a `Runtime` error although both are the
  same length and rate — a working expression starts failing.
- **G5.3 — table cells have no time axis and rate 0.0.** `table/eval.rs:154-166`'s
  `CellLookup::lookup` returns `sample_rate_hz: 0.0` deliberately, from `slice_by_time` /
  `materialize_f64`, which return `Vec<f64>` only (no `t_us` accessor exists —
  `handle.rs:627,638`). Plan 380-384's synthetic-axis formula divides by that 0.0:
  `f64::INFINITY as i64` saturates to `i64::MAX` for every sample. And Step 2's
  identical-`t_us` rule would then break `{col_a[]} - {col_b[]}`, which works today.
- **G5.4 — `{col[]}` genuinely has no axis.** `eval.rs:275-288` builds a rate-0 channel from
  `lookup_cell_column`. There is no time to synthesize; same for `Channel::from_f64`'s
  rate-0 branch, which emits `vec![0; len]` — not strictly increasing, and two unrelated
  rate-0 channels compare *equal*, so the new rule is vacuous exactly where it is loosest.
- **G5.5 — a landed doc comment is now false, and lap windows drift.** `eval.rs:573-591`
  (`resolve_time_base`) says *"Time is the synthesized uniform ramp (value i/rate), so the
  closed form is exact"*. L1's `synthesis.rs:9-24,64` replaced that: `Time`'s samples are
  `t_us[i] / 1e6` from the source channel's **real** `t_us`, `RawColumn::F64`, precisely
  because `i/rate` is what C1 §3.5 invariant 4 forbids. `current_lap()` (`eval.rs:905-908`)
  and `sector_number()` (`eval.rs:992-999`) still compute `i as f64 / rate` and compare it to
  `MathLapContext.main_lap_bounds` (real seconds, `eval.rs:164-167`). At 812.348 vs 800 Hz
  that is ~1.5 % drift — ≈1.8 s at the end of Isaac's validated 120 s session.
- **G5.6 — the same 1.5 % is baked into the DSP functions.** `integrate` uses
  `dt = 1.0/sample_rate_hz` (`integration.rs:24`); `differentiate` multiplies by
  `sample_rate_hz` (`statistics.rs:19`); `butter` passes it as the sampling rate for the
  Nyquist normalisation (`eval.rs:665-672`); `declip`, `fft` likewise. Task 5's headline doc
  comment ("NEVER derived from `sample_rate_hz`") would sit in a file whose arithmetic
  contradicts it.
- **G5.7 — `require_ref_channel` is a 3-tuple.** `eval.rs:542` returns
  `(Arc<[f64]>, f64, String)`, 3 call sites, feeding `variance_time`/`variance_dist`
  (`variance_geom.rs:211,278`, which rebuild `ChannelValue` with `main_rate`).
- **G5.8 — Step 4 violates R13 and R19.** Plan 425: `cargo test --workspace`. R13 standing
  rule (c): full suite once per lane at the merge gate only. R19 item 4: the merge gate is
  `-p idl-rs -p idl-rs-cli`, **explicitly not** `--workspace`, because that builds
  `idl-rs-tauri`'s Tauri graph for nothing. The R13 addendum records this exact dependency
  graph OOM-killing the machine at `jobs = 4`.
- **G5.9 — minor plan-text slips.** `EvalOutput.t_us` is declared `Vec<i64>` (plan 354) but
  Step 2 (plan 408-410) writes `Arc::from([])` for it; and `Arc::from([])` needs a type
  annotation either way. `Channel.t_us` is `Vec<i64>`, so `SessionHandle::lookup` must copy it
  per lookup (~800 KB for a 100 k-sample IMU channel, alongside the existing `materialize()`
  copy) — acceptable, `MemoLookup` (`eval.rs:81-109`) makes it once per expression, but the
  cache clone must copy the `Arc`, not the `Vec`.
- **G5.10 — a second, now-redundant time source is unmentioned.** `ChannelLookup::sample_times`
  (`eval.rs:66-72`, seconds, event-driven only) is already derived from `t_us`
  (`handle.rs:328-344`) and is consumed by `estimate/run.rs:110`. The plan never says whether
  it stays.

**Proposed rulings**

- **L3-R11.** **L3 owns the `SessionHandle` side.** Strike plan 333–338's "L1's file" clause
  and plan 73–88's agent-team/gate framing from the brief. In this task: `SessionHandle::lookup`
  (`handle.rs:908-915`) populates `t_us: Arc::from(c.t_us.as_slice())`; a new
  `store_math_with_times(channel_id, sample_rate_hz, samples, t_us)` wraps
  `Channel::from_f64_with_times` (`session/mod.rs:233`) and `math/resolve.rs:75` switches to
  it, so a derived math channel keeps its source's real axis. `store_math` stays for the
  estimator's eight outputs and tests. Same crate, L1's lane closed — no cross-lane hop.
  *Cost if wrong: two call sites.*
- **L3-R12.** **Empty `t_us` is the "no time axis" marker.** Two `Value::Channel` operands must
  carry identical `t_us` **only when both are non-empty**; if either is empty the op proceeds
  and the result inherits the non-empty axis (or empty if both are). Rate-0 sources —
  `CellLookup::lookup` (`table/eval.rs:165`), `{col[]}` (`eval.rs:284`), scalar results —
  return `Arc::from(&[] as &[i64])`, **never** a synthetic axis. This preserves table-column
  arithmetic exactly as it behaves today (verified: the rate check already passes there,
  0.0 == 0.0) and avoids the `INFINITY as i64` saturation. No new
  `slice_by_time_t_us` accessor in this task. Tests: `{col_a[]} - {col_b[]} — both empty t_us
  — still evaluates`; `channel with t_us + channel with empty t_us — result carries the
  non-empty axis`. *Cost if wrong: the rule is one `match` arm.*
- **L3-R13.** **Nominal-rate arithmetic is out of Task 5's scope but must stop lying.** Do not
  rewrite `integrate`/`differentiate`/`butter`/`fft`/`declip`/`resolve_time_base` in this task
  (that is a behaviour change to every shipped math result — see Q1). Instead: delete the
  false sentence in `eval.rs:577-578` ("Time is the synthesized uniform ramp (value i/rate),
  so the closed form is exact"), replace it with a `// TODO(idl0):` naming
  `synthesis.rs:64` and the measured drift, and word `LookupChannel::t_us`'s doc comment so it
  claims only what is true: *`t_us` traces to recorded time; the DSP functions in this file
  still assume uniform `1/nominal_rate_hz` spacing and are a tracked follow-up.* The lead
  records it as a ledger "Tracked" entry with an owner. *Cost if wrong: a comment; the
  numbers are already what they are.*
- **L3-R14.** **Test scope for Task 5**, per R13/R19: per-group runs while working
  (`cargo test -p idl-rs math::`, then `table::`, then `estimate::`, then `session::handle`),
  then **one** end-of-task run `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`.
  Never `--workspace`. `cargo check -p idl-rs-cli --tests` is **mandatory** here (three `pub`
  structs change shape) — the R18-addendum standing rule. *Cost if wrong: none; strictly less
  load than the plan.*
- **L3-R15.** `ChannelLookup::sample_times` stays unchanged this task (already `t_us`-backed
  at `handle.rs:335-344`, one consumer at `estimate/run.rs:110`); its doc comment gains one
  line saying it is a seconds view of `t_us`, kept for the estimator, and that new code reads
  `LookupChannel.t_us` instead. `MathLapContext`'s seconds units get the same one-line
  restatement, since µs and seconds now meet in this file. *Cost if wrong: two comments.*

**Compute note.** Filters above; `cargo check -p idl-rs-cli --tests` mandatory. Call-site
count for the reviewer's sizing: 19 `channel(...)` helper calls + 7 direct `ChannelValue {}`
in `eval.rs`, 2 in `variance_geom.rs`, 2 in `vector.rs`, 3 `require_ref_channel` call sites,
and 5 `LookupChannel {}` constructors outside `eval.rs`
(`session/handle.rs`, `table/eval.rs`, `estimate/run.rs`, `math/tests_ahrs.rs`,
`math/tests_parity.rs`) — plus ~19 in `eval.rs`'s own test doubles.

---

## Task 5 verdict — is the time-model design still coherent?

**Yes for the C1 §8 item 5 resolution itself; no for the plan's implementation route.**

Verified against landed code, the resolution holds exactly as plan 358–372 states it:

- There is no bare `t` primary in the grammar. `parse.rs:242-256`: a bare identifier is a
  `Call` only when followed by `(`, else `constant_value` (`pi`/`tau`/`e`/`g` only), else a
  `Parse` error. `t` is not reachable as an expression term. C2 §2.5's departures list
  independently records `deriv(fork_travel, t)` as shorthand.
- `Time` is a real channel in **seconds** (`synthesis.rs:64`, `unit: "s"`,
  `RawColumn::F64`), addressed as `[Time]`, and never collides with C1's `t` column name.
- The collision is therefore only at the JS host boundary (C2 §5.1's `{length, t, v}`,
  seconds `f64`), and `to_host_channel` (Task 8) is a sound single conversion point.

No conflict with anything L1 landed: `data.parquet`'s `t` column (C1 §4.1) never crosses into
`math`; `store::parquet` is untouched; `Session::duration_ms` (`session/mod.rs:328`) is ms and
unrelated. The `Channel` shape the plan assumed — `t_us: Vec<i64>` session-relative µs,
`t_recorded_us: Option<Vec<i64>>`, `nominal_rate_hz` metadata-only — matches
`session/mod.rs:127-184` field for field.

What does **not** survive contact: the plan's assumption that L1 would populate the field
(G5.1), its synthetic-axis rule for rate-0/no-axis sources (G5.3/G5.4), the derived-channel
round trip through `Channel::from_f64` (G5.2), and its `--workspace` gate (G5.8). L3-R11
through L3-R14 close all four without touching the resolution itself.

---

## Questions only Isaac can answer

**Q1 — Do the nominal-rate DSP functions get corrected to real per-sample time now, or is it
deferred?** On his own validated session the device's true ODR is 812.348 Hz against a
configured nominal of 800 Hz (ledger, Task 16). Every `integrate`/`differentiate`/`butter`
result, and every `current_lap()`/`sector_number()` window, is currently computed on the 800
figure — ~1.5 % off, ≈1.8 s of lap-boundary drift by the end of a 120 s run. Correcting it is
mechanically straightforward but changes **every** number the math engine has ever produced,
including anything he has been comparing against idl0 for parity. Deferring keeps parity and
keeps the error. Not derivable from any contract: C1 §3.5 invariant 4 governs `t_us`
provenance, not the DSP step size. *Recommendation if no answer: defer (L3-R13), tracked with
an owner, so Task 5 lands the axis without silently moving results underneath him.*

---

PRE-READ COMPLETE: 27 gaps, 15 proposed rulings, 1 Isaac question
