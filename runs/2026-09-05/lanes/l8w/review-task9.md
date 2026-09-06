# L8w Task 9 review — `eval_workbook`'s `lap_context` argument (C3 §3.4, R52 Q5, R64.1, R73)

**Scope:** idl-rs commit `46d6b63` (`tauri: eval_workbook lap_context argument, additive (C3 3.4, R52 Q5)`)
on branch `wave2-l8w-write-amendment` in worktree
`C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`, on top of
Task 8 (`41d3865`). Files touched: `tauri/src/commands/workbook.rs`,
`tauri/src/session_source.rs` — matches the task's file list, nothing else.

Plus idl1-app commit `f72a438` (`docs: C3 3.4 lap_context overlay_laps same-session note (R64.1)`)
in worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l8w-write-amendment` —
touches only `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`.

Out of scope: any commit after `46d6b63` on the idl-rs branch (a possible Task 10) — not reviewed.

## Test command and result

Per CLAUDE.md §8 and the L8w standing brief, reviewers do not build or test; the harness's
classifier also denied a `cargo test` invocation attempted here. Verified the implementer's
reported counts by static filter-matching instead:

- `cargo test -p idl-rs-tauri commands::workbook::tests::eval_workbook` — implementer reports
  **11 passed**. Grepped `tauri/src/commands/workbook.rs` for `fn eval_workbook` (substring match,
  the filter's own matching rule): 11 test functions contain `eval_workbook` in their name
  (`eval_workbook_a_math_cell_over_a_bound_session_...`, the new
  `eval_workbook_via_lap_context_none_output_byte_identical_to_the_pre_task9_fixture`,
  `eval_workbook_a_math_cell_referencing_an_unknown_channel_...`,
  `eval_workbook_duplicate_definitions_...`,
  `eval_workbook_no_session_bound_...`, `eval_workbook_front_matter_version_2_...`,
  `eval_workbook_a_table_cell_value_...`, the new
  `eval_workbook_via_lap_context_main_lap_absent_...`, the new
  `eval_workbook_via_lap_context_overlay_laps_absent_...`, the new
  `eval_workbook_via_lap_context_none_and_explicit_empty_selection_...`, and
  `eval_workbook_via_first_cells_prose_before_renders_...`). Count matches (11).
- `session_source::tests::load_lap_context` — implementer reports **5 passed**. Grepped
  `tauri/src/session_source.rs` for `fn load_lap_context` inside `mod tests`: 5 test functions
  (`load_lap_context_no_selection_session_json_with_two_laps_two_bounds`,
  `load_lap_context_no_session_json_empty_context`,
  `load_lap_context_selection_naming_a_main_lap_absent_from_laps_invalid_argument_with_detail_lap`,
  `load_lap_context_selection_naming_overlay_laps_absent_from_laps_invalid_argument_names_the_first_offender`,
  `load_lap_context_explicit_empty_selection_matches_no_selection_output`). Count matches (5).
- `cargo check -p idl-rs-tauri` clean — not independently re-run (reviewer does not build);
  traced every new/changed call site by hand (all 8 `eval_workbook_via`/`load_lap_context` call
  sites in the diff, listed below) and confirmed argument counts/types line up with the new
  signatures, so a clean check is plausible and consistent with the diff.

Both reported counts reproduce statically; no discrepancy found.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `tauri/src/session_source.rs:143` (`overlay_lap_jsons.first().map(...)` building `MathOverlay` via `Arc::new(handle.clone())`) | `SessionHandle::clone()` (`core/src/session/handle.rs:109`) is a deep clone of the session's `Session`, synthesized-ids, warnings and the entire `derived` cache — not a cheap `Arc` share. Building `MathOverlay.lookup` this way means every `eval_workbook` call with a non-empty, resolvable `overlay_laps` will deep-copy the whole session's channel data on every evaluation. Currently unreachable (`laps[]` is always empty, so `unknown_lap` fires first — confirmed by tracing `load_lap_context`'s control flow), so no behavioural or performance regression ships today. | When lap indexing lands and this path becomes reachable, share an `Arc<SessionHandle>` constructed once (e.g. in `eval_workbook_via`) rather than cloning per call — flag for whoever does the lap-indexing amendment; not a blocker for this task since the branch is provably dead code right now. |
| Minor | `tauri/src/commands/workbook.rs:963` (regression-fixture test's Arrange comment) | The "byte-identical to the pre-Task-9 fixture" claim rests on a hand-captured JSON literal with a comment saying it was produced by manually running the pre-change two-argument `eval_workbook_via` once and pasting the output — this is the right method (a literal captured-before value, not a re-derived one), but there's no way for a reviewer to independently confirm the literal was actually captured pre-change rather than post-change (both would currently produce the same string, since the `None` path is unchanged). Traced the `None` branch in both `eval_workbook_via` and `load_lap_context` and confirmed the code path taken (`session_id: Some(_)` → `load_lap_context(..., None)` → the `let Some(lc) = selection else { ... }` branch) is byte-for-byte the same construction as the function's pre-change body (same field order, same `..MathLapContext::empty()` spread), so the claim holds by code inspection even though the fixture-literal provenance itself is only auditable by trust. | None needed — this is a process-trust gap inherent to fixture tests, not a code defect; noting it as a Minor rather than blocking since static inspection of the `None` path confirms it is in fact unchanged. |

No Critical or Important findings.

## Checks performed (all pass)

- **Additive-only signature.** `eval_workbook(id, session_id, lap_context, data_dir)` — `session_id`
  is not reordered or removed; `lap_context: Option<LapContext>` is strictly trailing before the
  managed `data_dir` state argument. `eval_workbook_via` gained the same trailing
  `Option<&LapContext>` parameter. Confirmed via `lib.rs`'s registration line is untouched (task's
  own brief states this and the diff doesn't touch `lib.rs`).
- **`None` path byte-identical.** Traced `eval_workbook_via`'s `Some(sid)` branch: `load_lap_context(data_dir, sid, &handle, None)` hits the `let Some(lc) = selection else { return Ok(MathLapContext { main_lap_bounds: ..., main_lap_number: ..., ..MathLapContext::empty() }) }` branch, which is textually the same construction the pre-change function used (same field list, same `session.json` read, same `..empty()` spread) — genuinely unchanged, not just "compiles the same." The new test
  `eval_workbook_via_lap_context_none_output_byte_identical_to_the_pre_task9_fixture` asserts a
  literal captured JSON string via `serde_json::to_string`, which is the Critical check the
  standing brief calls out by name, and it is present and correctly shaped (see Minor finding
  above re: fixture provenance, which does not undermine the static-inspection confirmation).
- **`LapContext` shape matches C3 §3.4 exactly.** `pub struct LapContext { main_lap: Option<u32>, overlay_laps: Vec<u32> }` matches the quoted TS `interface LapContext { main_lap: number | null; overlay_laps: number[]; }` field-for-field, including C3's own snake_case naming for this nested type (no `rename_all` needed, and none is applied elsewhere in this file for other command args either — consistent with the established pattern of `session_id`/`data_dir` staying snake_case at the Tauri boundary).
- **Error kind and detail shape.** `unknown_lap(lap)` builds `IpcError::with_detail(IpcErrorKind::InvalidArgument, ..., json!({"lap": lap}))` — matches C3 §3.4's "Errors (command-level, added): `invalid_argument` ... with `detail { lap }`" verbatim. `IpcErrorKind::InvalidArgument` is a pre-existing variant (`error.rs:27`), not a new one — no enum-variant-addition risk.
- **Validation order.** `main_lap` is checked before `overlay_laps`, and `overlay_laps` is scanned in the caller's own order (`for &n in &lc.overlay_laps`, first `.ok_or_else` failure short-circuits via `?`) — matches the task brief's "checked `main_lap` first, then `overlay_laps` in order" and the test asserting `detail.lap == 2` for `overlay_laps: vec![2, 3]`.
- **No `MathOverlay` construction assumption invented beyond R64.1/R73.** `overlay` is built only from the *same* `handle`/session (R64.1, and the diff never threads a second session id anywhere), and only from the *first* entry of `overlay_laps` (R73 — "first entry is the overlay window") — both correctly documented in `load_lap_context`'s doc comment, satisfying R73's "documented on `load_lap_context`" requirement.
- **Units.** `MathOverlay.lap_start_ms`/`lap_end_ms` are raw epoch ms per its own doc comment (`core/src/math/eval.rs:159-161`); `LapJson.start_timestamp_ms`/`end_timestamp_ms` are i64 epoch ms (`core/src/store/session_json.rs:138-141`) — the `as f64` cast is a unit-preserving type conversion, not a scale conversion, so no ms/s bug. `lap_start_uniform_sec` is populated from `LapJson.start_time_secs` (session-relative seconds, `session_json.rs:147-148`), matching `MathOverlay`'s own doc comment ("uniform-time seconds"). Checked both structs' field doc comments directly rather than assuming names imply units.
- **`session_id: None` ignores `lap_context` silently (R73).** Confirmed: the `None` branch of `eval_workbook_via`'s outer `match session_id` never reads `lap_context` at all — documented explicitly in the function's doc comment ("`lap_context` is ignored — there is no session to validate a lap selection against").
- **No DSP in tauri.** `load_lap_context`/`eval_workbook_via` only select, validate, and wrap pre-existing `core` types (`MathLapContext`, `MathOverlay`) — no windowing/interpolation/math performed in the tauri crate.
- **All 8 call sites of `eval_workbook_via`/`load_lap_context` in the diff updated consistently** (7 existing tests plus the one production call site inside `eval_workbook`), none of their original assertions altered — verified via full-file grep.
- **Repo hygiene.** Single-line commit message, no AI attribution trailer, on both commits; `git add` scoped to the two files (idl-rs) and the one C3 file (idl1-app); `Cargo.lock` untouched; nothing under `docs/` touched by the idl-rs commit; `docs/` touch by the idl1-app commit is the expected spec-during amendment for this task, not a scope violation.
- **Doc comments.** `LapContext`, both its fields, `unknown_lap`, `load_lap_context`, `eval_workbook_via`, and the amended `eval_workbook` doc comment all present and substantive (unit/behaviour-bearing, not restated field names).
- **Test naming.** All new tests follow `thing — condition — result` (e.g. `eval_workbook_via_lap_context_none_and_explicit_empty_selection_produce_the_same_cell_output`) with Arrange/Act/Assert and blank lines between sections.
- **C3 amendment (`f72a438`) matches R64.1's exact ruling** — "`overlay_laps` names laps of `session_id`'s own session in wave 2 ... cross-session overlay is a wave-3 amendment carrying a `{ session_id, lap }[]` shape" mirrors R64.1's ledger text closely, and the diff carries the required "*Added post-sign (2026-09-05, lead ruling R64.1).*" note. Confined to the one file the standing brief allows for a spec-during change.
- **No unexplained `.unwrap()`/`.expect()` on production-path data** — the new code uses `.ok_or_else(|| unknown_lap(n))?` throughout instead of unwrapping; `.unwrap()` only appears in test bodies (allowed).
- **No reformatting** — diff is additive/surgical to the two named files; no whitespace churn on untouched lines.

## Verdict rationale

The implementation is additive exactly as C3 §3.4 and R59 require: `lap_context` is a new
trailing `Option`, `None` demonstrably reproduces the pre-change output (confirmed by static
trace of the unchanged code path, not just the fixture literal), the `invalid_argument` gate
matches C3's error shape and detail field verbatim, and the same-session, first-entry-wins
`overlay` construction correctly implements R64.1 and R73 with both documented on
`load_lap_context` as required. The one real design concern — `Arc::new(handle.clone())` deep-
copying the whole session on the (currently unreachable) overlay path — is scoped as Minor
because the path is provably dead code today (`laps[]` is always empty, so `unknown_lap` always
fires first) and is explicitly flagged for whoever lands lap indexing next. No Critical or
Important findings; nothing here would change a maintainer's decision to merge.

VERDICT: CLEAN
