# Review — Task 11: `store/session_json.rs` (C1 §6, replaces `.idl0w`)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store`
Branch: `wave1-l1-store`, commit under review: `e001565` (on top of `5e82ad0`)
Scope: `git show e001565` — `core/src/store/session_json.rs` (new), `core/src/store/mod.rs` (modified).
Note: uncommitted `core/src/store/derived.rs` change present in the worktree (separate Task 10
fix-up) — confirmed out of scope, not part of `e001565`, ignored throughout.

## Test command and result

```
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo test -p idl-rs store::session_json
```

```
running 5 tests
test store::session_json::tests::future_schema_version_is_rejected_typed ... ok
test store::session_json::tests::malformed_json_is_a_typed_parse_error_not_a_panic ... ok
test store::session_json::tests::omitted_optional_fields_are_absent_from_the_json_not_null ... ok
test store::session_json::tests::write_then_write_again_uses_the_optimistic_concurrency_hash ... ok
test store::session_json::tests::empty_session_json_round_trips_through_write_and_read ... ok

test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 622 filtered out; finished in 0.05s
```
Reproduced: 5/5 pass, matching the plan's Step 4 expectation.

`cargo build -p idl-rs` (whole crate, background run): clean, no warnings, no errors.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `core/src/store/session_json.rs:222-226` | `SessionJsonError`'s `pub kind`/`pub message` fields carry no doc comments (CLAUDE.md §5: "doc comment on every public symbol"). Not a new deviation — `AtomicWriteError`/`ConfigError` (Tasks 4/7, already merged) have the identical gap, so this task is matching established repo precedent, not introducing a new one. | Add one-line `///` doc comments on both fields (repo-wide cleanup, not blocking this task). |

No Critical or Important findings.

## Checks performed (all pass)

- **Field-for-field vs. C1 §6**: every field in `SessionJson`, `LapGateJson`, `SectorGateJson`,
  `LapJson`, `SectorJson`, `NeutralZoneVisitJson`, `OverlayLapKeyJson`, `TrackVisitJson` matches
  the contract's JSON shape and type (string/i64/f64/u32/Option/Vec) exactly. `schema_version`,
  `session_id` required (no default); all metadata strings `#[serde(default)]` with `""` default,
  never `null` — matches "`""` = not set, no null representation".
- **Omitted-when-empty convention**: `reference_lap_number`, `main_lap_number`,
  `overlay_lap_key`, `starred_lap_number`, `track_visits_library_hash` are
  `skip_serializing_if = "Option::is_none"`; `ignored_lap_numbers` and nested
  `TrackVisitJson::laps` are `skip_serializing_if = "Vec::is_empty"` — matches spec's "omitted
  when empty" annotations exactly, and top-level `lap_gates`/`sector_gates`/`laps`/`track_visits`
  (not annotated "omitted" in the spec) correctly have no `skip_serializing_if`, always
  serializing as `[]`. `bike_profile_snapshot` (spec: `object | null`, no "omitted" note)
  correctly has no `skip_serializing_if`, serializing as explicit `null` when unset. Verified by
  test `omitted_optional_fields_are_absent_from_the_json_not_null` and by inspection.
- **Decimal-degrees convention**: `LapGateJson`'s `lat1_deg`/`lon1_deg`/`lat2_deg`/`lon2_deg` are
  plain `f64` decimal degrees with no `× 1e7` scaling anywhere in this file (`grep -n "1e7"` on
  `session_json.rs` returns nothing) — correctly does not reintroduce the old ×1e7 assumption.
  Per the plan's own Task 14 draft, the ×1e7 ⇄ decimal-degree boundary conversion is owned by
  `gate_synthesis.rs` (a later task), not this one — consistent with C1 §6's "L1 converts once at
  the `session.json` ⇄ `Gate`/`GpsFix` boundary," which this task correctly leaves to the
  boundary-owning code rather than doing partial/duplicate conversion here.
- **`Copy` removal (E0204 fix)**: the plan's draft had `#[derive(..., Copy, ...)]` on both
  `LapGateJson` (contains `name: String`) and `OverlayLapKeyJson` (contains `session_id: String`)
  — invalid Rust, since neither type is `Copy`. The committed code drops `Copy` from both structs'
  derives, keeping `Clone`. Checked the rest of the plan (Task 14's `gate_synthesis`/`renumber`,
  the only later task that constructs/consumes these types) for any call site relying on `Copy`
  semantics (implicit copy-on-move, `*gate` deref, etc.) — none found; all constructors return
  owned values and all consumers take ownership or clone explicitly. Minimal, correct fix; nothing
  the plan intended `Copy` for is lost.
- **`OverlayLapKeyJson` field naming**: plan flagged its own draft's `session_id_ref` rename (with
  a since-refuted collision rationale) as a bug to fix. Committed code correctly names the field
  `session_id` (undecorated, no `#[serde(rename)]` needed), matching C1 §6's wire shape
  `{"session_id": "…", "lap_number": 0}` exactly.
- **Error typing**: `SessionJsonError { kind: SessionJsonErrorKind, message: String }`, `Display`,
  `std::error::Error`, `From<ConfigError>`, `From<AtomicWriteError>` — never `Err(String)`
  (CLAUDE.md §5). `SessionJsonErrorKind` variants (`Io`, `Parse`, `UnsupportedVersion`) each carry
  a doc comment.
- **Write path**: `write_session_json` builds `<data_root>/sessions/<session_id>/session.json`
  and delegates to `store::atomic::write_atomic` (single-attempt primitive, no retry) — same
  pattern already established by Task 9 (`store::parquet`) and Task 10 (`store::derived`), both of
  which also call `write_atomic` directly rather than `write_atomic_with_retry`; retry-wrapping is
  consistently deferred to a higher layer across all three writers, not a new inconsistency
  introduced here.
- **Doc comments / units**: every other public struct, field, const, fn, and enum variant in the
  file has a `///` doc comment; all `*_ms`/`*_deg`/`*_secs` fields state their unit in the doc
  comment, per CLAUDE.md §5.
- **Tests**: Arrange/Act/Assert with blank lines between, in the repo's established
  `snake_case_condition_result` naming convention (matches existing precedent in
  `store/atomic.rs`'s tests — "`thing — condition — result`" is realized as underscore-joined
  identifiers in Rust, since literal em-dashes aren't valid in identifiers). All 5 tests exercise
  wiring this task owns (round-trip, optimistic-concurrency hash plumbing, omitted-field
  serialization, typed-error paths) — none re-test `write_atomic`'s own conflict-detection logic
  (already covered in Task 7's tests), consistent with "test what we own."
- **Repo hygiene**: commit `e001565` has a single-line message, no AI attribution trailer; no
  `cargo fmt` artifacts (hand-formatted style matches the rest of `core/src/store/`); shared
  checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` is clean and on `main`.

## Verdict

CLEAN — one Minor, pre-existing-pattern doc-comment gap; no Critical or Important findings; tests
reproduce 5/5; spec conformance verified field-for-field against C1 §6; the reported `Copy` fix is
correct and loses nothing.
