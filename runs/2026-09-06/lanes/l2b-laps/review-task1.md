# L2b Task 1 review — `store::lap_index` (pure core)

Commits: `idl-rs@4c91e92` (core: store::lap_index -- track library hash,
visits, per-visit laps (pure)); `idl1-app@15b5769` (docs: L2b Task 1 --
IDL0_SPEC 17.4 import-time lap indexing, CHANGELOG bullet).

Files touched: `core/src/store/lap_index.rs` (new, 530 lines),
`core/src/store/mod.rs` (+1 line, `pub mod lap_index;`), `docs/IDL0_SPEC.md`
(§17.4 rewritten, old text kept below a divider), `CHANGELOG.md` (+1 bullet).
`Cargo.lock`/`Cargo.toml` unchanged — confirmed `sha2 = "0.10.9"` was already
a dependency of `core`, nothing added.

Test command: per the dispatch's explicit "Read-only: run no cargo/npm",
no cargo command was run in this review. Implementer-reported result:
`cargo test -p idl-rs store::lap_index::` → 11 passed; `cargo check -p
idl-rs-cli --tests` clean. Cross-checked: the file contains exactly 11
`#[test]` functions, consistent with the reported count.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | core/src/store/lap_index.rs:34-36, 116-121 | `LapIndexError.kind`/`.message` and `LapIndex`'s four fields are `pub` with no per-field doc comment, only a struct-level one. Sibling DTOs in the same crate (`session_json.rs`'s `LapJson`/`SectorJson`/`TrackVisitJson`) document every field individually, and CLAUDE.md §5 says "doc comment on every public symbol." | Add a one-line `///` per field, matching the sibling DTOs' style. |
| Minor | core/src/store/lap_index.rs:297-304 | `track_library_hash_of_empty_library_hashes_the_empty_string` computes its expected value by calling the exact same `Sha256::digest(b"")` the production code calls — it doesn't independently corroborate the hex string, so it mainly checks "no special-cased early return for empty input" rather than the digest value itself. | Not worth blocking on; could hardcode the known SHA-256 hex of the empty string for a true oracle if this file is touched again. |

**Spec/ruling compliance.** Matches the brief and R83 closely: pure function
(no fs writes, `load_track_library` only reads `<data_root>/tracks/*.idl0t`
and that's the one I/O surface the brief explicitly allows), `Result`/no
`Err(String)`, `LapIndexErrorKind::Track` kept unused-but-present exactly as
the brief's interface spelled it out. `track_library_hash` ports idl0's
algorithm byte-for-byte (build `"id:updated_at_ms"`, sort, join `'|'`, hash,
prefix) with the documented `sha1`→`sha256` substitution, tested for
order-independence and change-on-update. `visit_id` is deterministic
(sha256, 16 hex chars, no UUID), matching ruling R83 Q4. `compute_lap_index`
wires `detect_visits` (no param overrides, `VisitParams::default()`) →
per-window `resolve_visit` (track lookup by id, `timing: None` and
missing-track both fall back to `laps: []` + a warning while still emitting
the `TrackVisitJson`) → `detect_laps` restricted to the window →
`renumber_session_laps` for the top-level array, taking `.lap` and correctly
leaving each visit's own `laps[]` at its per-visit numbering (verified by
the two-visit test: top-level 1..4, each visit restarts at 1). Field-for-field
DTO conversion (`lap_to_json`/`sector_to_json`/`neutral_zone_visit_to_json`)
checked against the real `Lap`/`Sector`/`NeutralZoneVisit`/`LapJson`/
`SectorJson`/`NeutralZoneVisitJson` definitions — every field lines up,
including `Lap::start_ms` → `LapJson::start_timestamp_ms` as the brief
specified. Empty-library and no-window cases return an honest empty
`LapIndex` with the hash still set, never a panic or an `Err`. Only the two
core files and the two allowed doc files were touched; nothing in `laps/`,
`tracks/`, `track_artifact/`, or `session_json.rs` was modified. NUL-byte
check on both touched Rust files: 0.

**Tests.** All 11 follow Arrange/Act/Assert with blank lines and are named
`thing — condition — result` in substance (Rust identifiers, not literal
em-dashes, which matches the repo's existing test-naming convention in the
files this brief pointed at). Each test asserts something meaningful: hash
order-independence and hash-changes-on-update are real oracles; the two
end-to-end lap-detection tests build real GPS fixture geometry (the
there-and-back-and-there track, reused/extended for the two-track case) and
assert lap counts, per-visit vs. session-wide numbering, and warning
presence — not just "doesn't panic." The one test targeting the
structurally-unreachable "track_id absent from library" branch calls the
private `resolve_visit` directly with a deliberately mismatched `tracks`
slice, and its comment correctly explains why this can't be reached through
`compute_lap_index` itself; that's honest test design rather than a
contrived end-to-end scenario.

**CLAUDE.md/SPEC discipline.** SPEC section (`docs/IDL0_SPEC.md` §17.4) was
written spec-first per the brief, correctly scopes itself to what Task 1
delivers, explicitly flags `lap_detector_version` as landing in Task 2, and
keeps the superseded idl0/`Workspace` wording below a divider rather than
deleting it. CHANGELOG bullet is accurate and matches the diff (sha2 in
place of sha1, no file I/O, deterministic `visit_id` per R83 Q4). Commit
messages are single-line, no AI attribution. No `unwrap()`/`expect()` in any
non-test code path.

**Verdict rationale.** The only findings are two Minors — missing per-field
doc comments on two new public structs (a real but small CLAUDE.md §5 gap)
and one test whose oracle is slightly tautological. Neither affects
correctness, safety, or the contract; both are cheap for a maintainer to fix
in five minutes without touching logic. Everything that matters — purity,
determinism, the detect→laps→renumber wire-up, the ignored-lap threading
through to `renumber_session_laps`, honest-empty behaviour, and file scope —
checks out against the brief, the SPEC section, and the underlying `laps`/
`tracks`/`track_artifact` code it calls.

VERDICT: CLEAN
