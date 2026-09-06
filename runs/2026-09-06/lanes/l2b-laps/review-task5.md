# Review — L2b Task 5: `LapDetail.sectors`/`.neutral_zone_visits` typed concretely

**Commits reviewed:**
- idl-rs `7c16570a137d9bd250601fd7c9ccdd139ca4aa56` (branch `l2b-laps`,
  `C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l2b-laps`)
  — files: `core/src/store/catalog_read.rs`, `tauri/src/commands/catalog.rs`
- idl1-app `c3981b3659104d284daaba99f240e5eef331b362` (branch `l2b-laps`,
  `C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/l2b-laps`)
  — files: `CHANGELOG.md`,
  `docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md`,
  `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`

Both commits touch only the files the brief named. `Cargo.lock` unchanged
(last touched at `13aafa4`, well before this commit).

**Test command run:** `cargo test -p idl-rs-tauri commands::catalog::`
→ **17 passed; 0 failed; 0 ignored; 174 filtered out.** Matches the
implementer's reported count exactly.

`cargo test -p idl-rs store::catalog_read::` was blocked twice by the
sandbox's cargo-process classifier (consistent with CLAUDE.md §8's "one
cargo process at a time" — another agent likely held the lock at the time).
Not rerun a third time per the compute rules' no-retry-loop instruction.
Static review of the added `catalog_read` test
(`get_session_lap_with_sectors_and_a_neutral_zone_visit_carries_typed_fields_through`)
confirms it exercises the typed `sectors`/`neutral_zone_visits` fields
correctly (asserts both sector entries and the one neutral-zone entry
field-by-field) and would pass given the diff; the reported 12-passed count
for this filter is accepted on that basis, not independently reproduced.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No findings. | — |

**Verdict rationale.** R53 Q5 pinned the deferral ("element shape fixed in
C1 §6 when lap indexing lands, not before"); lap indexing landed at Task 4,
so this task is in scope and does exactly what the ruling and C3 item 11
call for: it replaces the `serde_json::Value` placeholders with the landed
`SectorJson { name, start_ms, end_ms, start_time_secs, end_time_secs }` /
`NeutralZoneVisitJson { name, enter_ms, exit_ms }` shapes verified against
`core/src/store/session_json.rs:171-193`, correctly deferring to the landed
struct over C3's guessed `sector_name`/`sector_time_ms` per the ambiguity
policy (landed truth wins over a signed contract's guess). The core layer
re-exports the core types directly in `catalog_read::LapDetail` (internal,
never crosses IPC); the Tauri layer instead redefines two new
`#[derive(Serialize)]` DTOs (`LapSector`, `LapNeutralZoneVisit`) with
`From` impls, matching this module's existing idiom that no core type is
serialized across the IPC boundary directly — both choices are documented
in doc comments and the CHANGELOG bullet, as the brief asked. The
byte-identical-JSON claim is proven by
`lap_detail_serialises_sectors_and_neutral_zone_visits_byte_identical_to_the_old_value_path`,
which builds its expected value with a literal `json!` independent of the
module's own code — exactly the test the brief specified, and a second
test proves the empty-array (not `null`) case. Field names/units in the
amended C3 §3.2 and C1 §6 blocks match the serde output verbatim (`i64,
UTC ms` for `start_ms`/`end_ms`/`enter_ms`/`exit_ms`; `f64, seconds,
recording-time (t=0-anchored)` for `start_time_secs`/`end_time_secs`),
following the surrounding file's existing comment idiom exactly, including
at the lap level where an epoch-ms field and a t=0-anchored-seconds field
already coexist for `start_timestamp_ms`/`start_time_secs` — the new
sector-level pairing is the same established pattern, not a new
redundancy. `app/src/ipc/catalog.ts` was left untouched (confirmed:
`sectors`/`neutral_zone_visits` still typed `unknown[]`), and the
CHANGELOG bullet names the exact two TypeScript interfaces the lead's
shell task must add, matching C3 field-for-field. C3 §6 item 11 is marked
CLOSED with the date and reasoning; CHANGELOG bullet is accurate to the
diff. No unrelated files touched, no reformatting of untouched lines, no
`unwrap()` on data (the old `unwrap_or_else` fallback for failed JSON
conversion is gone because the conversion itself is gone — a plain field
copy can't fail), single-line commit messages with no AI attribution.

VERDICT: CLEAN
