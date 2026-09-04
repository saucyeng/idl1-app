# L3 pre-read — Tasks 6–9 vs. signed contracts, R20's rulings, and landed code

Read-only pass. Line refs: plan = `docs/superpowers/plans/2026-09-03-idl1-wave1-l3-workbook.md`;
v3 code = L3 worktree at `e018db9` (**working tree clean — Task 2 has not started there**);
everything else = shared checkout `rust/core/src` on `main`.

**R20 rulings that bind Tasks 6–9.** L3-R1 (`WorkbookError` = `{cell_id, kind, message}` +
`Display`) → Task 7's error. L3-R2 (every cell-scoped error takes its cell id) → Task 7's
signature, directly violated. L3-R7 as **widened** (`Time`/`Distance` are `ReservedName`,
`RESERVED_NAMES` = 15) → Task 6's layering rule, and it kills L3-R7's own named test.
L3-R8 ("a filter matching nothing is a failed gate", standing) → Task 8's gate, dead as written.
L3-R11 (`LookupChannel.t_us` populated by L3) and L3-R12 (empty `t_us` = "no axis") → Task 6's
overlay and Task 8's `to_host_channel`, which has no rule for the empty case. L3-R13 (DSP
correction deferred) → no new exposure in 6–9.

---

## Task 6 — Cross-cell resolver (plan 433–471)

**Gaps**

- **G6.1 — `MathCellDef` does not exist and cannot be built from Task 3's output.** Plan 439
  types `defs: &HashMap<String, MathCellDef>`. Task 3 (plan 265) produces
  `MathCellLine::Def { name, expr_text, label }` — no cell id, no source position. The only
  similarly-named landed type is v2's `math::channel_def::MathChannelDef { name, expression }`.
  Consequence: Task 6 invents a type Task 9 then cannot use — Task 9 Step 1 (plan 603–607) needs
  "which cell declared each identifier", and a `HashMap` has no document order for Step 3's
  ordering requirement (plan 630–635).
- **G6.2 — the constants table has no way in.** Plan 439's signature has no constants
  parameter, while plan 439's own prose and Step 2 (plan 452) require
  `parse_with_constants`. Nothing on the landed `WorkbookDoc` (`v3/mod.rs:21-41`) holds a merged
  table either — it carries `constants_raw: HashMap<String, ConstantRaw>` only, and neither
  Task 3 Step 2 nor Task 4 Step 3 says to store `merge_constants`' output anywhere.
- **G6.3 — `parse_with_constants` + `eval` silently drops memoization.** Plan 452 routes around
  `evaluate()`, but `evaluate` (`math/eval.rs:206-215`) is what wraps the lookup in
  `MemoLookup`; `eval` (`eval.rs:254`) does not, and `MemoLookup` (`eval.rs:81`) is **private**.
  Consequence: a channel referenced N times in one definition is `materialize()`d N times
  instead of once — the exact cost `MemoLookup`'s doc comment (`eval.rs:13-17`) exists to avoid.
- **G6.4 — L3-R7's named test is now impossible.** R20 approved L3-R7 *and* widened it so a
  definition named `Time` is `ReservedName` and never reaches the resolver. The test L3-R7
  names (`definition named Time shadows the synthesized Time channel`) can no longer be
  written. The layering *direction* it ruled ("definitions win over session channels") is
  therefore untested and also contradicts landed precedent: `SessionHandle::lookup`
  (`handle.rs:908-915`) documents "Base + synthesized channels win over the math store."
- **G6.5 — the overlay must carry `t_us` or L3-R12 breaks one task later.** Task 6's overlay
  lookup builds a `LookupChannel` from each resolved `EvalOutput`. If it fills `t_us` with
  `Arc::from(&[] as &[i64])`, every `[MathA] + [BaseB]` becomes axis-less under L3-R12 and
  Task 8's `to_host_channel` gets nothing to convert. `EvalOutput.t_us` is a `Vec<i64>` per
  Task 5 (plan 354), so a per-lookup clone is an ~800 KB memcpy per reference.
- **G6.6 — plan 441's `channel_refs` instruction is a no-op.** `math/resolve.rs:23` is already
  `pub(crate)`; "promote to `pub(crate)` visibility from `workbook::v3` too" describes nothing.
  Use it as-is. (Its `[Name]` scan is not string-literal-aware — same class as G3.3, and
  harmless here: a stray `[` inside a string yields a bogus dep name that simply isn't in `defs`.)

**Proposed rulings**

- **L3-R16.** Define `pub struct MathCellDef { pub cell_id: String, pub name: String,
  pub expr_text: String, pub label: Option<String>, pub order: usize }` in `workbook/v3/mod.rs`
  beside `ConstLine` (R20 addendum's placement rule). `parse_workbook` populates two new
  `WorkbookDoc` fields: `pub defs: Vec<MathCellDef>` (document order, then `def_line` order
  within a cell — `order` is the index) and `pub constants: HashMap<String, f64>`
  (`merge_constants`' output). Task 6 takes `&[MathCellDef]`, not a `HashMap`; it builds its
  own name index internally. `host_constants` (Task 8) and Task 9's per-cell split then both
  have a real source. *Cost if wrong: two struct fields and one container type, no shipped
  consumers.*
- **L3-R17.** Corrected signature:
  `resolve_workbook_defs(defs: &[MathCellDef], constants: &HashMap<String, f64>,
  lookup: &dyn ChannelLookup, lap_ctx: &MathLapContext) -> HashMap<String, Result<EvalOutput,
  MathEvalError>>`. To keep memoization, `math/eval.rs` gains
  `pub fn evaluate_with_constants(expression: &str, constants: &HashMap<String, f64>,
  lookup: &dyn ChannelLookup, lap_ctx: &MathLapContext) -> Result<EvalOutput, MathEvalError>`
  and `evaluate` becomes a zero-constants call to it — additive, exactly mirroring Task 4's
  `parse`/`parse_with_constants` equivalence, with the same equivalence test. Task 6 calls
  `evaluate_with_constants`, never `parse` + `eval` by hand. *Cost if wrong: one additive
  `pub fn` in a file this lane already modifies.*
- **L3-R18.** Overlay rules, stated once. (a) **Definitions win over session channels** —
  L3-R7's direction stands; its now-impossible `Time` test is replaced by
  `definition named after a base channel — the definition's value is returned, not the base
  channel's`, and the module doc states this deliberately inverts `SessionHandle::lookup`'s
  base-wins precedence (`handle.rs:909-910`) because in v3 the document is the source of truth.
  (b) The overlay converts each resolved `EvalOutput.t_us` into an `Arc<[i64]>` **once**, when
  it is inserted, and clones the `Arc` per lookup — never the `Vec`. (c) Leftovers after the
  fixed point (cycle members, dependents of a failed def) get
  `MathEvalErrorKind::UnknownChannel`, per plan 445, with the message naming the unresolved
  dependency. *Cost if wrong: one `match` arm and one doc paragraph.*

**Compute note.** `cargo test -p idl-rs workbook::v3::resolve`, then
`cargo test -p idl-rs math::eval` (L3-R17 touches `math/eval.rs`). Non-zero `passed` required
(L3-R8). No existing `pub` signature changes — `cargo check -p idl-rs-cli --tests` not mandated.

---

## Task 7 — Table cells (plan 474–505)

**Gaps**

- **G7.1 — plan 481's "Interfaces" paragraph does not describe anything compilable.** It
  argues itself in a circle and lands on "`kind` set to a new, plan-local constant string
  embedded in the message rather than a new enum variant". `WorkbookError.kind` is a
  `WorkbookErrorKind` enum (`v3/error.rs:32-36`, landed); it cannot hold a string.
- **G7.2 — stale premise: R7 already closed this.** Plan 481 says "flag this as **Open Question
  2** below, assigned to the lead". `decisions.md` R7 approved "the stray-math-line **and
  malformed-table-JSON** error-kind defaults". Same failure mode as G2.2: the implementer
  re-raises a closed question and blocks.
- **G7.3 — L3-R2 violated.** `parse_table_cell(fence_body: &str)` (plan 481) returns a
  `WorkbookError` and takes no cell id.
- **G7.4 — Step 3 edits files the Files line omits.** Plan 479 lists only
  `workbook/v3/table_cell.rs`; Step 3 (plan 493–497) adds a field to `CellDoc` (`v3/cell.rs`)
  and changes `parse_workbook` (`v3/mod.rs`). Same slip as G3.6.
- **G7.5 — the round-trip test as written cannot fail.** Step 1 (plan 485) compares
  `parse_table_cell` against `serde_json::from_str::<TableModel>` on the same text — both sides
  are the same call, so any deserialization defect is invisible. What actually needs checking:
  C2 §4's worked example (spec 519–534) **omits** `template` on `c0` and `context` nowhere, and
  uses `{}` cells. Verified by reading `table/model.rs:13-58`: every optional field is a bare
  `Option<T>` with no `#[serde(default)]`, which serde's derive does permit to be missing
  (`missing_field` → `visit_none` for `Option<T>` only) — so the example parses, but nothing in
  the plan asserts it.
- **G7.6 — C2 §4's field table lists `context` as a `TableModel` field.** Spec 510 puts
  `context | RowContext?` between `rows` and `cells` at the top level. It is `Row.context`
  (`table/model.rs:27`). An implementer transcribing the table adds a phantom field.
- **G7.7 — the model is parse-safe but not round-trip-safe.** No `deny_unknown_fields` (unknown
  keys silently vanish) and no `skip_serializing_if` (a re-serialized `{}` cell becomes
  `{"formula":null,"literal":null,"name":null}`). Not Task 7's bug — Task 7 is parse-only — but
  it is load-bearing for the save path and for C2 §7's per-cell merge, where every table cell
  would read as changed after one save. `table::model` is shared with v2 `.idl0wb`, so the plan's
  "v2 code is untouched" rule forbids fixing it here.

**Proposed rulings**

- **L3-R19.** `parse_table_cell(cell_id: &str, fence_body: &str) -> Result<TableModel,
  WorkbookError>` (L3-R2). Malformed JSON is a **new** `WorkbookErrorKind::InvalidTableJson`
  with message `"Table cell JSON is malformed: <serde_json error text>"` — a real variant, not a
  string smuggled through `message`, because C3's per-cell routing keys on `kind`. R7 ruled the
  default; do not re-raise it. The variant's doc comment marks it provisional pending the C2
  §3.5.A amendment batch that already owns `InvalidFrontMatter`, `InvalidCellId` (ledger,
  2026-09-04) and L3-R4's `workbook_*` C3 kinds. **Lead-owned to land in C2; L3 codes it now.**
  *Cost if wrong: one enum variant and one message, both inside this lane.*
- **L3-R20.** Task 7's Files line is `workbook/v3/table_cell.rs` (create),
  `workbook/v3/cell.rs` + `workbook/v3/mod.rs` + `workbook/v3/error.rs` (modify). `CellDoc`
  gains `pub table: Option<TableModel>` (`TableModel` derives `Debug + Clone + PartialEq`, so
  `CellDoc`'s derives still hold); `parse_workbook` fills it for `kind_token == Table` and
  pushes the error into the collected `Vec<WorkbookError>` on failure. `table::validate` is
  **not** run at parse time (dimension/cycle problems are evaluation-time, `table/eval.rs`) —
  stated so a reviewer does not demand it. Step 1's test becomes: C2 §4's literal example
  parses `Ok`, `columns[0].template == None`, `rows[0].context == Some(RowContext{session_id:
  "s1", lap_index: 1})`, `cells[0][1] == Cell::default()`. A `// TODO(idl0):` on
  `parse_table_cell` records G7.7 (no `deny_unknown_fields`, no `skip_serializing_if`) as the
  save path's problem, naming `table/model.rs`. No serde attribute is changed — that is a v2
  `.idl0wb` byte change. *Cost if wrong: one struct field and a comment.*

**Compute note.** `cargo test -p idl-rs workbook::v3::table_cell`, plus
`cargo test -p idl-rs table::` once (L3-R20 adds no behaviour there, but `CellDoc` is a shared
struct). No `pub` signature reaching `idl-rs-cli` changes.

---

## Task 8 — JS cells, `${…}` spans, host data (plan 509–577)

**Gaps**

- **G8.1 — `to_host_channel` has no rule for L3-R12's empty `t_us`, and the plan's own test
  enshrines the wrong one.** Step 1 (plan 536–537) tests `empty input — HostChannel with
  length 0`. Under L3-R12 an *axis-less but non-empty* result is routine — every rate-0 source
  (`table/eval.rs:165`, `{col[]}` at `eval.rs:284`, every scalar definition such as
  `avg = mean([X])`). If `length` follows `t`, those definitions silently bind a host variable
  with zero samples; if `to_host_channel` synthesizes a ramp, it violates L3-R12 and C1's
  "time is recorded, not assumed".
- **G8.2 — `HostSession.name` has no source anywhere.** `Session` (`session/mod.rs:341-362`)
  has `session_id`, `device_id`, `timestamp_utc_ms`, `config_checksum`, `source_format`,
  `channels` — no name. `SessionJson` (`store/session_json.rs:19-92`) has `rider`, `bike`,
  `venue_name`, `event_name`, `event_session`, `short_comment`, `tag` — no name. C3's
  `SessionSummary` (spec 200–226) and `SessionDetail` (spec 240–270) likewise. C2 §5.1's
  `session.name?` is unsourced. → Q2.
- **G8.3 — `host_session(session: &Session)` is uncallable from anything this lane builds.**
  `SessionHandle.session` is private (`handle.rs:102`) with no accessor, and Task 9's
  `eval_cells(doc, lookup, lap_ctx)` (plan 596) takes no `Session`.
- **G8.4 — `HostLap.number` is not a lap number.** `MathLapContext` (`eval.rs:163-176`) carries
  only `main_lap_bounds: Vec<(f64,f64)>`; the engine indexes it 1-based
  (`eval.rs:567`: `.get(n - 1)`). Real lap numbers live on `laps::model::Lap.lap_number` /
  `LapJson.lap_number`, and `session.json`'s `ignored_lap_numbers` can make them
  non-contiguous. `index + 1` is right *by engine convention* and wrong if a caller ever hands
  in a filtered bounds list — nothing says so.
- **G8.5 — `channel()`'s signature cannot do what its own prose requires.** Plan 524 takes no
  `MathLapContext`, yet plan 552–555 windows by `MathLapContext` bounds; plan 556–558 says a
  cross-session lookup "needs a second `ChannelLookup` — accept an optional second lookup
  parameter", which is not in the signature; and it returns a "`not_found`-shaped
  `WorkbookError`" — there is no such `WorkbookErrorKind`, and a missing channel is
  evaluation-time (C2 §3.5.B → `MathEvalErrorKind::UnknownChannel` → C3 §2's existing
  `math_unknown_channel`, spec 150).
- **G8.6 — C2 §5.1's JS field names are camelCase; the plan's Rust fields are snake_case.**
  Spec 556–557: `{number, startT, endT}`, `{id, name?, timestampUtcMs}`. C3 §1 (spec 61–62)
  fixes IPC payloads as snake_case "matching the Rust struct field names verbatim". These are
  host variables injected into the sandbox, not IPC field names — but nothing says which rule
  wins, and serde defaults would ship `start_t` to L6.
- **G8.7 — `HostChannel` is a full-array shape; C2 §5.1's own source column is not.** Spec 554:
  "The host evaluates the definition (Rust), **decimates to the current tile budget**, and
  binds the result", shape `Float64Array` (transferred `ArrayBuffer`). CLAUDE.md §2: heavy
  arrays cross IPC as raw bytes, never JSON. C3 §3.4's `CellOutput.value` is JSON. Nothing in
  C3 says how host channels reach the sandbox in bytes, and no decimation appears anywhere in
  this plan. The bill lands on L5, not L3 — but only if it is written down now.
- **G8.8 — `host_constants(doc)` reads a field that does not exist.** Plan 529 says "already on
  `WorkbookDoc`"; `v3/mod.rs:21-41` has only `constants_raw`. Closed by L3-R16.
- **G8.9 — `find_inline_exprs`' depth counter is wrong twice.** Plan 531 specifies "a simple
  depth counter over `{`/`}`". It mis-parses `${ x + "}" }` (brace inside a JS string) and it
  will happily extract `${…}` out of a fenced code block sitting inside prose — `v3/cell.rs`'s
  own test (`cell.rs:215-227`) proves an inert ```` ```bash ```` fence lands inside
  `prose_before` verbatim.

**Proposed rulings**

- **L3-R21.** `pub fn to_host_channel(t_us: &[i64], v: &[f64]) -> HostChannel`, with
  **`length = v.len()`** — values are never dropped. `t` is `t_us[i] as f64 / 1e6` over
  `min(t_us.len(), v.len())` entries, so `t` is **empty when the source has no recorded axis**
  (L3-R12) and is documented as such: *"`t.len() == length` for any channel with a recorded
  axis; `t` is empty for a scalar or table-sourced result, and a consumer must not plot such a
  value against `t`. A time axis is never synthesized (C1 §3.5 invariant 4)."* Tests:
  `t_us = [0, 1_000_000, 2_500_000] — t = [0.0, 1.0, 2.5]`;
  `empty t_us, three values — length 3, t empty, v preserved`;
  `both empty — length 0`. *Cost if wrong: one field's meaning, one doc line.*
- **L3-R22.** `pub fn channel(lookup: &dyn ChannelLookup, name: &str, lap: Option<u32>,
  lap_ctx: &MathLapContext, other_session: Option<(&str, &dyn ChannelLookup)>)
  -> Result<HostChannel, MathEvalError>`. Failure kinds: `UnknownChannel` for an unknown name,
  `UnknownChannel` for a requested `session` id with `other_session == None` or a mismatched
  id, `NoLapContext` for a `lap` with empty `main_lap_bounds`. No `WorkbookError` — this is
  C2 §3.5.B territory and C3 §2 already carries every kind. The lap window converts
  seconds→µs once (`(t_secs * 1e6).round() as i64`) and is **inclusive at both ends**, matching
  `SessionHandle::slice_by_time` (`handle.rs:632-641`); that conversion site gets its own test.
  *Cost if wrong: two parameters, one error type, caught at the first call site.*
- **L3-R23.** `HostLap`/`HostSession`/`HostChannel` derive `Serialize` with
  `#[serde(rename_all = "camelCase")]` — C2 §5.1's `startT`/`endT`/`timestampUtcMs` are the
  signed JS-visible names, and a doc comment records that this is a deliberate, host-variable-only
  exception to C3 §1's snake_case rule (these are Observable module-scope bindings, not IPC
  payload fields). `host_laps` numbers laps `index + 1` and its doc comment states this is the
  engine's 1-based index into `main_lap_bounds` (`eval.rs:567`), equal to `Lap.lap_number` only
  when the caller built the bounds from an unfiltered ascending lap list. `HostSession.name` is
  `None` with a `// TODO(idl0):` pointing at Q2. `host_session`/`host_laps`/`host_constants` are
  standalone functions with **no caller in wave 1** — `eval_cells` does not call them (host-var
  injection is L6's, plan 96–101); stated so nobody threads a `Session` into Task 9. If a caller
  later needs one from a handle, `SessionHandle` gains `pub fn session(&self) -> &Session` —
  additive, same lane-ownership precedent as L3-R11. **Lead-owned flag (batch with L3-R4):**
  C3 has no byte path for host channels (G8.7); `HostChannel`'s doc comment says it is an
  in-process shape, not an IPC payload, and that decimation is the host's job per C2 §5.1, not
  `to_host_channel`'s. *Cost if wrong: serde attributes and comments.*
- **L3-R24.** `find_inline_exprs(prose: &str) -> Vec<InlineExpr>` scans raw text with a brace
  depth counter that **skips `'…'`, `"…"` and `` `…` `` string literals (honouring `\`
  escapes)**, and skips byte ranges that `pulldown-cmark` reports as `Event::Code` or
  `CodeBlock` in `prose` (collected in one prior pass — the parser is already a dependency and
  `scan_cells` already uses `into_offset_iter`). Nested `${}` inside a template literal is out
  of scope and documented. `start`/`end` are byte offsets **into the `prose` slice passed in**,
  not into the document — stated on the struct, since L6 splices with them and L11 merges near
  them. Adds tests: `"${ x + \"}\" }" — one InlineExpr, brace inside the string ignored`;
  `${…} inside a fenced code block in prose — not extracted`. *Cost if wrong: one scanner, fully
  unit-tested.*

**Compute note.** Plan 573's gate `cargo test -p idl-rs "workbook::v3::(host|js_cell)"` matches
**zero tests** — libtest filters are substrings, not regexes. Per L3-R8 (standing) run two:
`cargo test -p idl-rs workbook::v3::host` and `cargo test -p idl-rs workbook::v3::js_cell`, each
asserting non-zero `passed`. No `pub` signature reaching `idl-rs-cli` changes.

---

## Task 9 — Cell evaluation orchestrator (plan 581–645)

**Gaps**

- **G9.1 — structural errors have no delivery path.** C2 §3.5 (spec 465–467) scopes *both*
  layers to a cell, and C3 §3.4's `CellOutput.error` is the only per-cell error field.
  `CellEvalResult.error: Option<MathEvalError>` (plan 594) cannot carry a `WorkbookError`, and
  `eval_cells(doc, lookup, lap_ctx)` never receives the `Vec<WorkbookError>` that
  `parse_workbook` returns alongside the doc (`v3/mod.rs:58`). Consequence: `DuplicateDefinition`,
  `InvalidIdentifier`, `ReservedName`, `InvalidTableJson` are computed and then dropped — the
  entire structural half of C2 §3.5 never reaches a cell.
- **G9.2 — C3 §3.4 has a `"prose"` cell kind; C2 does not, and neither does the code.**
  C3 spec 453: `kind: "math" | "table" | "js" | "prose"`. C2 §2.4 (spec 113–119) makes prose a
  *span attached to a cell*, and landed `CellKindToken` (`v3/cell.rs:15-20`) has three variants.
  Plan 626 says "JS/prose cells produce one `CellEvalResult` each" — there are no prose cells to
  produce one for, and a prose span has no `cell_id` to put in one.
- **G9.3 — "one entry per cell" (C3) vs "one entry per definition" (plan 611–616).** The plan's
  stated default makes `cell_id` non-unique across the returned `Vec`, breaking any frontend
  keying on it, and contradicts C3 §3.4's literal "one entry per cell, in document order"
  (spec 449). Logged as the plan's Open Question 3 — still open; R20 covered Tasks 2–5 only.
- **G9.4 — a table cell's success is indistinguishable from its failure.** Plan 618–625 leaves
  `host_value`/`error` both `None` for table cells and tells L5 to read `CellDoc.table`. C3
  §3.4 says `value` is "present when evaluation succeeded" — so a successful table cell and a
  silently-skipped one serialize identically.
- **G9.5 — inputs missing from `eval_cells`.** It must reach Task 6's resolver, which under
  L3-R17 needs `&[MathCellDef]` and the merged constants — both now on `WorkbookDoc` (L3-R16),
  so the signature needs no extra parameter for them, but it does need the structural errors
  (G9.1). `CellKindToken` has no serde derive; L5 does that mapping, not L3.

**Proposed rulings**

- **L3-R25.** **One `CellEvalResult` per cell** (C3 §3.4 literally), closing the plan's Open
  Question 3 against its stated default:
  ```
  pub struct CellDefResult { pub name: String, pub label: Option<String>,
                             pub value: Option<HostChannel>, pub error: Option<MathEvalError> }
  pub enum CellError { Structural(WorkbookError), Eval(MathEvalError) }
  pub struct CellEvalResult { pub cell_id: String, pub kind: CellKindToken,
                              pub defs: Vec<CellDefResult>,      // math cells; def_line order
                              pub errors: Vec<CellError> }       // structural + cell-level
  pub fn eval_cells(doc: &WorkbookDoc, structural: &[WorkbookError],
                    lookup: &dyn ChannelLookup, lap_ctx: &MathLapContext) -> Vec<CellEvalResult>;
  ```
  `cell_id` stays unique, per-definition addressing survives for L6 (C2 §5.1 binds one host
  variable per definition), and `structural` errors are routed to their owning cell by
  `WorkbookError.cell_id` (L3-R2), with `"front-matter"`-scoped ones dropped here — they are
  already fatal or returned separately by `parse_workbook`. Ordering: document order, and
  within a math cell, `def_line` source order via `MathCellDef.order`. Tests as plan 639, plus
  `a cell with a DuplicateDefinition error — the error appears on that cell, siblings still
  evaluate`. **PROVISIONAL** — see L3-R26. *Cost if wrong: one nesting level; no shipped
  consumer (L5's mapping is not written).*
- **L3-R26 (lead, not L3).** Three C3 §3.4 corrections to land with L3-R4's amendment batch,
  before L5's workbook-command task: (a) drop `"prose"` from `CellOutput.kind` — prose travels
  as `prose_before`/`prose_after` on its owning cell (C2 §2.4), and a prose span has no id;
  (b) state that a `table` cell's `value` is the `TableModel` plus `table::eval`'s
  `CellResult` grid, so success is representable (G9.4); (c) add the `workbook_*` kinds L3-R4
  already asks for, now including `workbook_invalid_table_json` (L3-R19), since `CellOutput.error`
  is the only channel structural errors have. *Cost if wrong: additive contract text, unshipped.*
- **L3-R27 (cross-task).** Gates for Tasks 6–9, per L3-R8/L3-R14: per-module filters while
  working (`workbook::v3::resolve`, `::table_cell`, `::host`, `::js_cell`, `::eval`, plus
  `math::eval` for L3-R17), each asserting non-zero `passed`; **one** end-of-batch
  `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`; never `--workspace` (R13/R19).
  *Cost if wrong: none; strictly less load than the plan.*

**Compute note.** Filters above. Tasks 6–9 change no existing `pub` signature reaching
`idl-rs-cli` (`evaluate_with_constants` and `channel` are additive; `WorkbookDoc`/`CellDoc`
field additions are v3-only), so `cargo check -p idl-rs-cli --tests` is not mandatory here —
it is already mandatory in Task 5, which lands first.

---

## Questions only Isaac can answer

**Q2 — What is a session's *name*?** C2 §5.1 gives JS cells `session = {id, name?,
timestampUtcMs}`, but no layer has a name field: not C1 `Session`, not `session.json`, not C3's
`SessionSummary`/`SessionDetail`. The candidates already recorded per session are `rider`,
`bike`, `venue_name`, `event_name`, `event_session`, `short_comment`, `tag`, and the start
timestamp. This is what a rider reads at the top of a notebook, so it is a product call, not a
derivation. *Recommendation if no answer: `name: None` (C2 marks it optional, so `None` is
contract-legal), tracked with a `// TODO(idl0):` — no synthesized "Venue — 2026-08-30" string
invented in Rust, since a display rule chosen here would be very hard to change later.*

---

## Note on channel

The brief names no `questions.md`; per the exemplar and R20's handling of Q1, questions and
lead-owned rulings are raised in this file. L3-R19's new error kind, L3-R23's `HostChannel`
IPC-path flag and all of L3-R26 are **lead-owned contract amendments** — L3 codes the
recommended behaviour now and marks L3-R25 PROVISIONAL against L3-R26.

PRE-READ COMPLETE: 26 gaps, 12 proposed rulings, 1 Isaac question
