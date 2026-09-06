# Review — L11 Task 6: core `store::sync::apply`, `session_merge`, `workbook::v3::render_workbook`

**Commits reviewed:**
- idl-rs `44eaab0` on `l11-sync` (worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\l11-sync`,
  on top of `0f23e4a`) — `core: test recompute_derived_fields against a merged conflict's const line (L11)`
  (the review-task5.md Important-finding fix, prerequisite for this task).
- idl-rs `3480daf` — `core: verified sync install and session.json field merge (L11)`.
- idl1-app `cb51f22` (worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\l11-sync`) —
  `docs: CHANGELOG bullet for L11 Task 6`.

**Files touched:** `core/src/workbook/merge/mod.rs` (+27, one test, `44eaab0` only),
`core/src/store/sync/apply.rs` (new, +648), `core/src/store/sync/session_merge.rs` (new, +202),
`core/src/store/sync/mod.rs` (+2, module wiring), `core/src/workbook/v3/mod.rs` (+122,
`render_workbook` + 3 tests — a flagged, self-reported deviation from this task's declared file
list, ruled acceptable by R91: "`workbook::v3::render_workbook`… is core's and the only renderer"),
`CHANGELOG.md`. No other files changed. `git diff 0f23e4a 3480daf -- Cargo.lock` is empty. NUL-byte
check (`grep -cP '[\x00-\x08\x0B\x0C\x0E-\x1F]'`) is `0` on `apply.rs`, `session_merge.rs`, and
`workbook/v3/mod.rs`.

**Test command:** none run — Rust lane, cargo forbidden for reviewers. Verified statically: `apply.rs`
has exactly 10 `#[test]` fns matching the brief's own list (blob hash match/mismatch, derived,
data.parquet version match/mismatch, workbook merge-zero-conflict + base-cache-updated, workbook
rename-with-conflict, track older/newer, tmp-cleanup across three classes) — matches the
implementer's claimed `store::sync::apply` **10**. `session_merge.rs` has 5 `#[test]` fns (peer/local
different fields both survive, both-set peer-newer, both-set local-newer/tie, laps+stamps untouched,
ignored_lap_numbers-only adopted) — matches the claimed `store::sync::session_merge` **5**.
`workbook/v3/mod.rs`'s new tests (worked-example round trip, pure-prose round trip, no-prose cell
round trip) are 3 — matches the claimed `render_workbook` **3** (an ad hoc filter, correctly flagged
by the implementer as outside the brief's named filters). `workbook::merge` count re-derived by
file: `cells.rs` 15 + `front_matter.rs` 7 + `mod.rs` 11 (10 from Task 5 + 1 from `44eaab0`) +
`order.rs` 0 = **33**, matching the implementer's claim exactly and reconciling with review-task5's
17-at-the-time count (Task 5's own fix commits `6e86a3f`/`0f23e4a`, landed before this task started,
added 4 to `cells.rs` and 1 to `front_matter.rs` closing review-task4's findings). No `cli/` code
references `store::sync::{apply,session_merge}` or `render_workbook`, so `cargo check -p idl-rs-cli
--tests` clean is plausible and low-risk even unverified.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `core/src/store/sync/apply.rs:296,314,224` (`install_workbook` ×2, `install_session_json`) | All three merge-class writes use plain `write_atomic` (single attempt, no rederive), not `write_atomic_with_retry`. C4 §4 step 4 mandates the retry-with-rederive sequence for **every** write under `<data>` and names this exact scenario by class: "**Workbooks:** re-run through the same per-cell merge (design §7) used by LAN sync… a local self-write race and a sync conflict are the same code path" and "**Everything else** (`session.json`, …): re-read the current file, re-derive `B` against it… and retry the write." Every other write helper in the codebase already follows this house pattern (`write_track`, `profile::save` both use `write_atomic_with_retry`, even with a trivial LWW rederive; only content-addressed `blob.rs` correctly uses plain `write_atomic` since a second write to the same hash cannot conflict). A real race here — a local edit landing on the workbook between this function's read of `local_bytes` and its write, or two syncs racing the same `session.json` — surfaces as a bare `SyncError` instead of retrying the merge, which is exactly the case C4 §4 says must not happen. Task 5's reviewer already flagged the analogous gap in `base_cache::write_base` as a Minor and explicitly asked "Task 6/12's reviewer to confirm the caller either serialises base-cache writes… or is fine surfacing the conflict" — Task 6 neither serialises nor discusses it, so the same gap now exists in three call sites, unflagged in this task's report or CHANGELOG. | Route the workbook target write and `session.json` write through `write_atomic_with_retry`, with a `rederive` closure that re-runs `merge`/`merge_session_json` against the freshly-read `current` bytes as the new peer/local base — the exact behaviour C4 §4 already describes by name for this class. |
| Minor | `core/src/store/sync/apply.rs:315-317` (`install_workbook`, rename branch) | `std::fs::remove_file(&local_path)` after a successful rename is `let _ = …` — a failure (e.g. a transient Windows sharing violation, the same class of race §4/§5 elsewhere retry for) is silently swallowed. The result is two on-disk `.idl1wb` files both claiming the same front-matter `id`; `find_local_workbook`'s directory-order lookup then becomes non-deterministic on the next sync or edit. Not exercised by any test (the rename test doesn't simulate a locked old file). | Surface the removal failure (log or fold into the returned outcome) rather than discarding it, or retry the removal a bounded number of times matching the rename-retry convention already used elsewhere in `atomic.rs`. |
| Minor | `core/src/store/sync/apply.rs` (whole file) | The dispatch's checklist asks for "no panics on peer-supplied bytes (fuzz-ish test or explicit malformed cases)." Manual trace confirms none of the six install functions can panic on malformed peer bytes — every parse (`parse_track`, `serde_json::from_slice::<BikeProfile>`, `parse_session_json`, `std::str::from_utf8` for workbook text, `parse_workbook`) returns a typed `Result` propagated with `?`/`map_err`, no `unwrap()`/`expect()` appears outside `#[cfg(test)]` — but only the blob-hash-mismatch and data.parquet-version-mismatch malformed cases are actually tested; a malformed track/profile/workbook payload has no dedicated test. Not a spec violation (the brief's own test list doesn't call for these either), and correctness is confirmed by trace, but it is a real coverage gap on the exact property this dispatch was asked to scrutinise. | Add one malformed-bytes test each for track and profile install (not blocking; low risk given the trace). |

**Notes (not findings):**
- **Interface deviations, both self-reported and both already lead-ruled.** `install` gained a
  sixth parameter (`ctx: &InstallContext`) beyond the brief's five-parameter sketch, and
  `merge_session_json` gained two `_updated_at_ms` parameters beyond its two-parameter sketch — both
  documented in the module's own doc comment, both called out in the CHANGELOG, and both directly
  addressed by ruling **R91** ("`install` takes an `InstallContext` (peer mtime, claimed versions,
  peer file name) populated from the manifest the caller holds"). `InstallContext`'s three fields
  (`claimed_data_parquet_versions`, `peer_session_json_updated_at_ms`, `peer_workbook_file_name`)
  are each traced to a real manifest field the brief's own "Key logic" section names — none invented.
- **R91's tie rule, verified by hand.** `merge_field`'s "changed" test is "not equal to `T::default()`"
  — exactly C1 §6's own `""`/`None`/`[]` "not set" convention for every one of the 16 user-owned
  fields C1 §6 §6 names (`rider`, `bike`, `bike_comment`, `venue_name`, `event_name`,
  `event_session`, `short_comment`, `long_comment`, `tag`, `bike_profile_snapshot`, `lap_gates`,
  `sector_gates`, `reference_lap_number`, `ignored_lap_numbers`, `main_lap_number`,
  `overlay_lap_key`, `starred_lap_number` — 17 counted, matching the brief's list plus
  `bike_profile_snapshot`). One side changed → that side; both changed to the same value → either
  (no conflict); both changed differently → `local_newer` (`local_updated_at_ms >= peer_updated_at_ms`,
  a tie keeps local) — matches R91's ruling exactly, including the tie direction.
  `schema_version`/`session_id` and the four L2b-cache fields (`laps`, `track_visits`,
  `track_visits_library_hash`, `lap_detector_version`, ruling R83) are hard-kept from `local`,
  never routed through `merge_field` — confirmed by the dedicated test asserting both stamps and
  `laps` survive untouched even when the peer is given a far-newer timestamp.
- **`render_workbook` is exact reassembly, confirmed against the parser's own invariants.**
  `WorkbookDoc::trailing_prose` is `None` whenever `cells` is non-empty (`cell::scan_cells`'s own doc
  comment and code: the remainder always lands on the last cell's `prose_after` instead) — read
  directly in `core/src/workbook/v3/cell.rs`. `render_workbook`'s two branches (`cells.is_empty()` →
  emit `trailing_prose`; else → emit `prose_before`/fence/`prose_after` per cell) exhaustively cover
  this invariant with no case where text could be dropped or duplicated. `workbook::merge::merge`
  (the only other constructor of a `WorkbookDoc` besides `parse_workbook`) preserves the same
  invariant explicitly (`trailing_prose: None` in the cells-non-empty branch, confirmed by reading
  `merge/mod.rs:238-251`), so a merged document renders safely too. The worked-example round trip
  and the two edge-case round trips (pure-prose, single cell with no surrounding prose) all
  re-parse cleanly.
- **Content-addressed classes (blob, derived) verified byte-for-byte against C4 §6/design §7.**
  `install_blob`/`install_derived` both hash the received bytes and refuse (typed `SyncErrorKind::
  Malformed`, nothing written — confirmed via the dedicated test asserting `!root.join("blobs").
  exists()`) before ever calling `write_atomic`; an existing entry at the correct hash is a verified
  no-op, matching "a bad transfer cannot overwrite a good entry."
- **`data.parquet`'s embedded-metadata check is real, not a manifest-trust shortcut.**
  `read_data_parquet_versions_from_bytes` writes the received bytes to a scratch file under `tmp/`
  (the `parquet` reader needs a `File`), reads the file-level `importer_version`/
  `seam_correction_version` key-value metadata back out, and removes the scratch file
  unconditionally (`let _ = std::fs::remove_file`) whether or not the read succeeded — verified by
  the dedicated "nothing left in tmp/" test, which exercises this exact path. A mismatch against
  `ctx.claimed_data_parquet_versions` is refused before the atomic write; bytes are written verbatim
  on match, never regenerated (C1 §4.3).
- **Track/Profile LWW re-checked at install time, not trusted from the plan** — both re-read the
  local file's own `updated_at_ms` and only call the write helper when the peer is not strictly
  older, matching "defense against a race between the manifest fetch and this file's fetch"
  (confirmed by both the older-KeptLocal and newer-Installed tests).
- **Catalog correctly untouched.** The dispatch's checklist item ("`index_session` runs after a
  session/blob install so the catalog reflects it") describes command-layer responsibility (Task
  10/12, tauri glue), not this task — the brief's own "Do not" list is explicit ("Do not touch
  `catalog.sqlite` or call `index_session`"), and `apply.rs`'s module doc comment states this
  correctly (`store::catalog::index_session` runs after install, at the command layer —
  CLAUDE.md §2). No finding here; confirmed by reading, not assumed.
- CHANGELOG (`cb51f22`) is accurate line-for-line against the landed code, including both flagged
  interface deviations and the exact filter/pass counts — no overstatement found.
- Hand style (line lengths, brace placement, doc-comment density) matches the surrounding modules;
  no reformatting of untouched lines; every public symbol has a doc comment; every numeric value
  that needs a unit has one (`_ms`, `_bytes`); every error path is typed (`SyncError`/
  `SyncErrorKind`), never `Err(String)`.

**Verdict rationale.** Verification logic (blob/derived hash checks, `data.parquet` embedded-metadata
check, `session.json`'s per-field merge and its R91 tie rule, track/profile LWW, `render_workbook`'s
exactness against the parser's own invariants) all check out exactly against C4 §6, C1 §6, and R91
on manual trace, with test counts reconciling exactly to the implementer's report. The one Important
finding is a real, repeated gap against C4 §4's explicit retry-with-rederive mandate for the exact
"workbook merge race" scenario the contract names by class — a scenario Task 5's reviewer already
raised once (for `base_cache::write_base`) and asked this task's reviewer to confirm; instead of
being confirmed or addressed, the same shortcut now appears in two more call sites
(`session.json`, the workbook's own target file) with no discussion in the report or CHANGELOG. It
does not corrupt data today (a race surfaces a clean typed error rather than silently overwriting),
but it is a genuine, contract-named gap in sync's collision handling, not a nitpick — hence
NEEDS_FIXES rather than CLEAN. The two Minors (a swallowed rename-cleanup error, a real but
brief-out-of-scope coverage gap) are small and do not change the verdict on their own.

VERDICT: NEEDS_FIXES
