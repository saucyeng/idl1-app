# L8x Task 3 review — core `validate_track`, `delete_track`, shared `validate_track_id`

Commits reviewed: idl-rs `50d8618` (branch `l8x-data-writes`, worktree
`idl-rs-worktrees/l8x-data-writes`, on `0e8cbb2`); idl1-app `450cb1c`
(CHANGELOG, worktree `idl1-app-worktrees/l8x-data-writes`). Files touched:
`core/src/track_artifact/validate.rs` (new), `core/src/track_artifact/mod.rs`,
`core/src/track_artifact/write.rs`, `CHANGELOG.md`. `Cargo.lock` unchanged.

Entry gate: `git merge-base --is-ancestor 81a7db3 HEAD` → GATE-OK.

Test command: none run (Rust lane, static verification only per instructions).
Implementer-reported `cargo test -p idl-rs track_artifact` → 26 passed,
verified statically: `grep -rc "#\[test\]" core/src/track_artifact/*.rs` gives
model.rs=2, read.rs=6, validate.rs=10, write.rs=7 = 25, plus one unrelated
substring match `import_file_gpx_with_malformed_track_artifact_...` in
`core/src/store/import.rs` (name contains "track_artifact") = 26. Count
reconciles exactly. `cargo check -p idl-rs-cli --tests` not independently run
(no cargo allowed); no `pub` symbol in this diff is consumed by `idl-rs-cli`
today, so the check's only value is compile-sanity, already covered by the
`cargo test` build step the implementer ran.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | core/src/track_artifact/write.rs:43 | `validate_track_id` only rejects `/`, `\`, `..`; an empty `track_id` (e.g. `""`) passes through to `tracks/.idl0t`, not the id it should have named. Brief only asked for separator/`..` rejection, so this is in-scope-compliant, but worth a ruling if `save_track`'s command layer (Task 4/5) doesn't already guarantee a non-empty string before calling in. | Note for Task 4/5 review: confirm the command layer never calls `write_track`/`delete_track` with an empty id, or add an `EmptyId` guard here. |
| Minor | (process) | The dispatch's check list asked to verify "every C3 validation rule enforced and each reported in one pass (all failures listed, not first-only)". The brief (`brief-task3.md` lines 75, 106) explicitly specifies first-failure-wins and "Do not collect", and the landed C3 §3.2 text (`invalid_argument` failed validation, above) does not require a multi-error batch. Per CLAUDE.md's ambiguity policy and the review rubric ("the brief's rulings override the plan text"), first-failure-wins is correct; the dispatch's phrasing appears to be a generic template line, not a task-specific requirement. | No code change; flag to lead that the dispatch template's "one pass, all failures" line doesn't apply to this task's own brief. |

No Critical or Important findings.

**Spec compliance.** `validate_track` walks name → `lap_timing` (one or two
gates) → each `sector_gates[i]` (name then gate) → each `neutral_zones[i]`
(name then enter then exit) → `reference_polyline[i]`, exactly the brief's
walk order, with first-failure-wins and no uniqueness check on sector/zone
names (locks PLAN Q6, and matches the landed C3 §3.2 sentence "Duplicate
sector or neutral-zone names are allowed"). `TrackValidationErrorKind`
ships exactly `EmptyName | EmptyChildName | CoordinateOutOfRange |
DegenerateGate`, matching the brief's interface verbatim. Field paths match
the brief's example shape (`sector_gates[1].gate`, `lap_timing.start_finish`,
`reference_polyline[0]`). An empty polyline is legal (tested); a non-empty
polyline's fixes are range-checked (tested), matching "Key logic". A
`Circuit`/`PointToPoint` gate with identical endpoints is `DegenerateGate`
(tested for Circuit only — `PointToPoint` with `start == finish` is not
separately tested, but shares the same `validate_gate` call path already
exercised once per gate type, a defensible economy given the shared helper).
`delete_track` matches the signature and doc exactly: `Ok(false)` on
absent file, no catalog/`session.json`/quarantine touch (brief's "Do not"
list honoured — nothing in the diff references `store::catalog` or
`session.json`). `write_track` gained the same `validate_track_id` guard
(brief: "the same guard belongs nowhere else; `write_track` gets it too").
No `Clock`/`now_ms`/`uuid` anywhere in the diff. `DeleteTrackReport` /
`stale_session_ids` / catalog cascade are correctly **absent** — those
belong to Task 5's command layer per PLAN §4 and this brief's own scope
fence; the team lead's check list names them but the brief and PLAN put
them one task later, so their absence here is compliant, not a gap.

**Tests.** All ten brief-named cases are present and each is
Arrange/Act/Assert with blank-line separation and names of the form
`thing_condition_result` (Rust identifier form of `thing — condition —
result`). Each assertion checks the specific `kind` and `field`, not just
`is_err()`. The path-separator test seeds a decoy file outside `tracks/`
and asserts survival, as the brief specified. The `write_track` `..` test
asserts the `tracks/` directory was never created, proving the guard runs
before any I/O.

**CLAUDE.md/style.** Doc comments on every public symbol including the new
`validate_track`, `TrackValidationErrorKind` variants, and
`delete_track`; typed errors throughout (`TrackValidationError`,
`TrackWriteError`), no `Err(String)`; no `unwrap()` outside test code; no
`// TODO` added; hand-formatted, matching the surrounding file's style
(inline `Gate`/`SectorGate` field access, `format!` field paths); NUL-byte
check clean on all three touched files; only the three named `core` files
plus `CHANGELOG.md` changed, nothing else. `CHANGELOG.md` bullet (`450cb1c`)
accurately restates the shipped kinds, the field-path behaviour, PLAN Q6,
and the shared guard — verified true against the diff.

**Verdict rationale.** The commit does exactly what its brief specifies —
no more (no catalog/session/quarantine reach, no clock/UUID, no uniqueness
rule) and no less (every named test case, both call sites guarded). The two
Minor items are a forward-looking scope note for the next task and a
process observation about the dispatch's check template conflicting with
the brief's own explicit instruction; neither is a defect in this commit.

VERDICT: CLEAN
