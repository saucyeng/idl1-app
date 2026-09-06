# L8x Task 4 review — `save_track` command

Commits reviewed: idl-rs `01b0f3f` (branch `l8x-data-writes`, worktree
`idl-rs-worktrees/l8x-data-writes`, on `50d8618`); idl1-app `595e6a2`
(CHANGELOG, worktree `idl1-app-worktrees/l8x-data-writes`). Files touched:
`core/src/store/catalog.rs`, `tauri/src/commands/catalog.rs`,
`tauri/src/lib.rs`, `CHANGELOG.md`. `Cargo.lock` unchanged.

Entry gate: `git merge-base --is-ancestor 81a7db3 HEAD` → GATE-OK.

Test command: none run (Rust lane, static verification only per
instructions). Team lead reported the lane's full-suite gate already passed:
tauri 221, idl-rs 1004, cli 53. Statically verified the increment this task
adds: `grep -c '#\[test\]' tauri/src/commands/catalog.rs` = 32, of which 9
are new, in a `mod save_track` block, covering every one of the brief's
8 named cases (case 7, the two stamp-freshness scenarios, is split into two
separate tests, accounting for the 9th). `core/src/store/catalog.rs` gained
3 new tests for `upsert_track`, including the delete-then-insert regression
test the brief required.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical, Important, or Minor findings. | — |

**Spec/ruling compliance.** Matches C3 §3.2's `save_track` text
(`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md:593-671`)
verbatim: one command, `track_id: None` mints a UUID v4 (canonical form,
minted by the `#[tauri::command]` wrapper, not `save_track_via`) and both
timestamps; `Some(id)` requires the artifact to exist (`not_found`
otherwise via `catalog_read::get_track`), preserves `created_at_ms`,
bumps `updated_at_ms`. Validation runs before any filesystem write
(`invalid_argument` with `detail: { field }`). Catalog upsert only when
`catalog.sqlite` is a file; failure folds into `warnings`, never fails the
call — confirmed no `?` on the catalog branch. `upsert_track` in
`core::store::catalog.rs:818-838` uses `INSERT ... ON CONFLICT(track_id) DO
UPDATE`, never delete+insert, with a doc comment explaining the
`laps.track_id ON DELETE SET NULL` hazard and a dedicated regression test
(`upsert_track_updating_a_track_with_an_existing_lap_reference_does_not_null_it_out`)
that inserts a lap row, edits the track, and asserts the lap's `track_id`
survives. `stale_session_ids` recomputes `track_library_hash` post-write
and scans `sessions/*/session.json`; a session with no stamp (`None`) is
excluded (not stale — no prior computation to invalidate), matching
PLAN §4/R86 Q5; an unreadable `session.json` folds into `warnings`. No
`reindex_laps`/`rescan_tracks` call anywhere in the diff (grep confirms).
No SQL added to `idl-rs-tauri` (`upsert_track`'s SQL lives in
`core::store::catalog`, R68). No new `IpcErrorKind` — `tauri/src/error.rs`
is untouched by this commit; `map_track_write_error` folds `Encode` into
the existing `Internal`, matching the `CatalogErrorKind::Sql`/R46
precedent, and is explicitly commented as such. `save_track` is
synchronous — no lock held across `.await` (there is no `.await` in the
function). Registered in `handler()` (`tauri/src/lib.rs:43`). The
task-3-review's Minor about an empty `track_id` is resolved at this layer:
`Some("")` routes to `catalog_read::get_track(data_dir, "")`, which joins
to `tracks/.idl0t` — a path that never exists in practice — and correctly
returns `not_found` with nothing written; confirmed by reading
`catalog_read::get_track`'s path-join and not-a-file check.

**TypeScript surface for the lead.** `SaveTrackResult` serde field names
(`track`, `stale_session_ids`, `warnings`) and `TrackDraft`'s
(`track_id`, `name`, `venue_name`, `lap_timing`, `neutral_zones`,
`sector_gates`, `reference_polyline`) match C3 §3.2's TS interfaces
character-for-character; the wire mirrors (`GateWire`, `SectorGateWire`,
`NeutralZoneWire`, `GpsFixWire`, `LapTimingWire`) reuse `get_track`'s
existing `Serialize` types with `Deserialize` added, so no new IPC type
needs inventing beyond what §7's amendment text already lists.

**Tests.** All 9 are Arrange/Act/Assert with blank-line separation and
`thing_condition_result`-shaped names (Rust identifier form). Each checks
the specific returned/on-disk value or `IpcErrorKind`, not just `is_err()`.
The "no track_id" test independently re-reads the artifact from disk via
`read_track` rather than trusting only the in-memory result. The catalog
test asserts both a fresh insert and an in-place update (row count stays 1,
name changes) via direct SQL, not just the command's return value. The
"caller-supplied `created_at_ms`" test constructs the draft from raw JSON
text specifically to prove serde drops the unknown field before it ever
reaches `save_track_via`'s body, which is a stronger proof than passing a
struct literal (there is no field to set).

**CLAUDE.md/style.** Doc comments on every new public/private symbol
(`upsert_track`, `save_track_via`, `save_track`, `map_track_write_error`,
`draft_into_track`, `stale_session_ids`); typed errors throughout
(`IpcError` with existing kinds, `TrackWriteError`), no `Err(String)` on
any command boundary (the catalog-upsert closure's internal `.map_err(|e|
e.to_string())` is folded straight into a `warnings` string, never
propagated as an error type); no `unwrap()` outside test code; no bare
`// TODO`; hand-formatted, consistent with the surrounding file's existing
`From` impl and command style. NUL-byte check clean on all three touched
Rust files. Only the four named files changed. `CHANGELOG.md` bullet
(`595e6a2`) is accurate against the diff: no new `IpcErrorKind`, the
`ON CONFLICT DO UPDATE` rationale, the `stale_session_ids` recompute, and
the `Deserialize`/`From` additions to the five wire types.

**Verdict rationale.** The commit implements C3 §3.2's `save_track` exactly
as specified, with no unrequested additions (no new error kind, no SQL in
tauri, no `rescan_tracks` call) and no gaps (every brief-named test case
present, the prior task's empty-`track_id` concern resolved by the existing
`not_found` path, the delete+insert regression test present as required).
Cross-checked against C3 text, the PLAN, and R86 line by line with no
discrepancy found.

VERDICT: CLEAN
