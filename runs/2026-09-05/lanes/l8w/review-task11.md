# L8w Task 11 review — `fetch_host_channel` / `encode_host_channel_idlh` (`IDLH` v1)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
branch `wave2-l8w-write-amendment`. Commit under review: `a20b41f`
("core+tauri: fetch_host_channel, IDLH v1 encoder (C3 3.4, R59 Q3a 24-byte
header)"), on top of Task 10's `d06067d`. Files touched (matches the task's
own file list exactly): `core/src/workbook/v3/host_channel_wire.rs` (new),
`core/src/workbook/v3/mod.rs`, `tauri/src/commands/workbook.rs`,
`tauri/src/lib.rs`.

Out of scope, noted and ignored per dispatch: the worktree has an
uncommitted modification to `core/src/workbook/v3/front_matter.rs`
(`Serialize` impl for `UnitsPref`/`ConstantRaw`) — not part of `a20b41f`,
matches the dispatch's "a fix commit for Task 10 may land after `a20b41f`;
ignore it," not reviewed here.

## Test command and result

Not run (reviewers do not build/test, CLAUDE.md §8). Verified statically
instead:

- Implementer reported `cargo test -p idl-rs encode_host_channel_idlh` → 5
  passed. `host_channel_wire.rs`'s `#[cfg(test)] mod tests` contains exactly
  five `#[test]` functions (`..._round_trips_every_value_and_flag`,
  `..._an_empty_t_channel_encodes...`, `..._source_exceeds_budget...`,
  `..._source_at_or_under_budget_is_a_no_op`, `..._header_is_exactly_24_bytes_in_every_case`)
  — count matches.
- Implementer reported `commands::workbook::tests::fetch_host_channel` → 6
  passed. `tauri/src/commands/workbook.rs`'s test module gained exactly six
  new `#[test]` functions under the "Step 4: fetch_host_channel" comment
  (`budget_zero_invalid_argument`, `budget_over_65536_invalid_argument`,
  `unknown_workbook_id_not_found`, `unknown_def_name_on_a_real_workbook_not_found`,
  `a_definition_that_fails_to_evaluate_rejects...`,
  `a_successful_fetch_returns_idlh_bytes...`) — count matches.
- Both `cargo check` results (`-p idl-rs-cli --tests`, `-p idl-rs-tauri`)
  reported clean; every type used (`idl_rs::workbook::v3::eval_cells`,
  `CellDefResult::{value,error}` returning `Option<HostChannel>`/
  `Option<MathEvalError>`, `IpcError::from(idl_rs::math::MathEvalError)` at
  `tauri/src/error.rs:195`, `resolve_workbook_path`, `load_session_handle`,
  `load_lap_context`, `empty_session_handle`, `MathLapContext::empty()`) was
  traced by hand against its landed definition and type-checks.

## Findings

No Critical, Important, or Minor findings.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | none | — |

## Checks performed (all pass)

- **Byte layout, field-for-field against C3 §3.4 (24-byte header, ruling
  R59 Q3(a)).** `magic` (offset 0, `b"IDLH"`), `version` u16 LE (offset 4,
  `1`), `flags` u16 LE (offset 6, bit 0 = `has_t`), `length` u32 LE
  (offset 8), `t_length` u32 LE (offset 12), `reserved` 8 zero bytes
  (offset 16–23), `t` region at offset 24 (`t_length × f64`), `v` region at
  `24 + t_length*8`. Computed by hand from `host_channel_wire.rs:44-59` and
  matches C3 §3.4's table exactly. Total length formula
  `24 + t_length*8 + length*8` matches (`Vec::with_capacity` computation,
  line 45, and the round-trip test's final `bytes.len()` assertion).
- Tests assert literal header bytes/offsets (`bytes[0..4]`, hard offsets
  24/32/40/48/56/64, literal `24 + t_length*8` recomputed from the
  encoder's own output field, not through its internal constants) —
  satisfies the "not re-derived through the encoder's own constants" bar.
- Empty-`t` case: `t_length == 0`, flags bit 0 clear, `v` starts at offset
  24 with no gap — asserted directly.
- **Decimation choice.** Brief required reading `chart_decimation.rs`'s doc
  comment and deciding whether its bucket min/max fits; the module's doc
  comment states the bucket-pair semantics don't fit a single-value line
  series and documents the fixed-stride alternative
  (`step = ceil(len/budget)`) in the function's own doc comment, exactly as
  the brief instructed rather than silently picking one. This is the
  brief's own explicit recommendation, not an undocumented deviation — no
  Major/Note needed per the dispatch's grading rule (C3/brief are not
  silent here: the brief itself specifies stride when the tile decimation
  doesn't fit, and the encoder's doc comment states why).
- `v`/`t` decimated together at the same indices (`step_by(step)` applied
  to both) — a sample's value and time stay paired; verified against the
  paired-index test (`t[4]`/`v[4]` both landing at the same output index).
- No `budget` validation inside `encode_host_channel_idlh` (only
  `.max(1)` defensive clamp so a bypass never divides by zero) — validation
  lives in `fetch_host_channel_via`, called before any workbook/session
  touch, matching the brief's ordering.
- No repeat of the µs→s conversion — the encoder only reads `hc.t`
  (already seconds) and never touches `t_us`.
- **Evaluation approach.** `fetch_host_channel_via`'s doc comment states,
  as required, that no single-definition entry point exists in
  `idl_rs::workbook::v3::eval`/`resolve` today so it evaluates the whole
  document via `eval_cells` and picks `def_name` out — option (a),
  documented and justified, matching the brief.
- **Rejection behaviour** differs correctly from `eval_workbook_via`: a
  failing `def_name` returns `Err(IpcError::from(err.clone()))` mapped
  through the existing `MathEvalError` → `IpcErrorKind` table (line 195 of
  `error.rs`), never a partial/empty response — confirmed by the
  `..._math_kind_not_a_partial_response` test asserting
  `IpcErrorKind::MathUnknownChannel`.
- `not_found` distinguishes an unknown `workbook_id` (via the existing
  `resolve_workbook_path` helper, unmodified, reused not reimplemented)
  from an unknown `def_name` on a real workbook — two separate tests, both
  passing through different code paths in `fetch_host_channel_via`.
- Session/lap resolution reuses `load_session_handle`/`load_lap_context`/
  `empty_session_handle` verbatim, same call shape as `eval_workbook_via` —
  no duplicated resolution logic.
- Response is `tauri::ipc::Response::new(bytes)`, raw bytes, never JSON —
  confirmed in the `fetch_host_channel` command body.
- No lock across `.await` — the whole path is synchronous, no `.await`
  anywhere in the diff.
- **Scope discipline.** Exactly the four files the brief named; no
  `app/src/`, no `docs/`, no `Cargo.lock` changes; no reformatting of
  surrounding code (diff is purely additive, confirmed via `git show
  --stat` line counts — `+399/-0`, `0` deletions in existing files).
- Commit message is a single line, no AI-attribution trailer, matches the
  brief's specified text.
- Doc comments present on every new `pub` symbol (`encode_host_channel_idlh`,
  `HostChannel` unaffected, module doc comment on `host_channel_wire.rs`);
  units stated (`t`: seconds) in both the module's and the encoder's doc
  comments.
- Tests are Arrange/Act/Assert with blank lines between, named
  `thing_condition_result` in the codebase's established snake_case
  compression of that convention (Rust identifiers can't hold em dashes or
  spaces — matches every other landed test in this lane).
- `IpcErrorKind` additions: none — this task adds no new error-kind
  variants, consistent with C3 §3.4 not requiring any.

## Verdict rationale

The header layout is byte-exact against C3 §3.4's amended 24-byte table at
every offset, computed by hand and cross-checked against the tests, which
assert literal offsets rather than re-deriving through the encoder's own
constants. The decimation approach (fixed stride) is exactly what the
brief itself prescribes once `chart_decimation`'s bucket-pair semantics are
correctly judged not to fit, and the choice is documented in the function's
doc comment as required — not an undocumented deviation. The
whole-workbook-then-pick-by-name evaluation approach is documented and
justified per the brief's option (a), the rejection-on-failure behaviour is
correct and tested, session/lap resolution reuses existing helpers
verbatim, the response is raw bytes via `tauri::ipc::Response`, and the
diff is scoped to exactly the four named files with no reformatting, no
spec-directory touches, and a single-line commit message. Both reported
test-filter counts match the actual number of new `#[test]` functions in
the diff, and every new type usage traces cleanly to its landed definition.

VERDICT: CLEAN
