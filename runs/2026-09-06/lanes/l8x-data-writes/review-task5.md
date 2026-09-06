# L8x Task 5 review — `delete_track` command

Commits reviewed: idl-rs `ffc7fd3` (branch `l8x-data-writes`, worktree
`idl-rs-worktrees/l8x-data-writes`, on `01b0f3f`); idl1-app `208d4f9`
(CHANGELOG, worktree `idl1-app-worktrees/l8x-data-writes`). Files touched:
`core/src/store/catalog.rs` (+17), `tauri/src/commands/catalog.rs` (+233),
`tauri/src/lib.rs` (+1), `CHANGELOG.md`. No other files changed; `Cargo.lock`
untouched.

Entry gate: `git merge-base --is-ancestor 81a7db3 HEAD` → GATE-OK;
`save_track` present in `tauri/src/commands/catalog.rs` (from Task 4).

Test command: none run — Rust lane, read-only static verification per
instructions (no cargo). Statically verified the increment: the file has
38 `#[test]` occurrences total; `git show 01b0f3f` (Task 4) added 9, so
this commit's diff should add 6 net-new — confirmed by counting `fn
delete_track_via` occurrences in the file (7: the one production function
plus 6 test functions), all inside the new `mod delete_track` block added
by this commit, matching the implementer's report of 38 passed.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical, Important, or Minor findings. | — |

**Spec/ruling compliance.** Matches C3 §3.2's `delete_track` text
(`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md:593-671`) and
this lane's brief exactly. `delete_track_via` checks the artifact's
existence first via `track_artifact::write::delete_track` (returns `Ok(false)`
on a missing file, mapped to `not_found` before any catalog work), matching
`delete_session_via`'s ordering precedent — confirmed by reading the
function body top to bottom. Ordering/consistency on partial failure: if the
artifact is missing, `not_found` is returned before the catalog is touched
(no half-state); once the artifact is confirmed removed, a subsequent
catalog-delete failure (SQL error, missing/corrupt `catalog.sqlite`) is
caught by the `.map_err(|e| e.to_string())` chain and pushed into
`warnings`, never propagated as an `Err` — the file deletion, which already
succeeded, is not rolled back and the caller is told via `warnings`, exactly
as `save_track_via` and the C3 text ("A catalog failure is folded into
warnings, never fails the call, mirroring save_track_via") require. The one
new core function, `store::catalog::delete_track`, does one targeted
`DELETE FROM tracks WHERE track_id = ?1` (not a `rebuild_catalog`), with a
doc comment correctly citing `open_catalog`'s per-connection `PRAGMA
foreign_keys = ON` (confirmed at `core/src/store/catalog.rs:148`) as what
makes the `laps.track_id ON DELETE SET NULL` cascade fire — confirmed the
DDL itself at `core/src/store/catalog.rs:120`
(`track_id TEXT REFERENCES tracks(track_id) ON DELETE SET NULL`).
`stale_session_ids` is the same helper Task 4 introduced (not
re-implemented), called here against the library recomputed *after* the
delete, matching the brief. `session.json` is never rewritten — no call to
`write_session_json`/`reindex_laps`/`rescan_tracks` anywhere in the diff
(grep confirms), and one test independently reads the file's raw bytes
before and after and asserts byte-identity rather than trusting the
returned report. `DeleteTrackReport`'s three serde fields (`track_id`,
`stale_session_ids`, `warnings`) match C3's TS interface verbatim. No new
`IpcErrorKind` (`tauri/src/error.rs` untouched by this commit). No SQL
added outside `core::store::catalog` (R68). `delete_track` is synchronous,
no `.await` anywhere in the file (confirmed by count), so no lock-across-
await concern applies. Registered in `handler()` at `tauri/src/lib.rs:44`.
The path-traversal test (`"../decoy"`) exercises `validate_track_id`'s
existing `/`, `\`, `..` rejection (`Io` kind) and independently asserts the
decoy file outside `tracks/` still exists afterwards.

**Tests.** All 6 new tests are Arrange/Act/Assert with blank-line
separation and `thing_condition_result`-shaped names. Each checks a
specific on-disk or catalog-row fact, not just `is_err()`/`is_ok()`: the
FK-cascade test seeds a lap row via direct SQL, asserts its `track_id` is
`"t-1"` *before* the delete (fixture-sanity assertion), then asserts it is
`NULL` after — the assertion the brief asked for by name
(`assert_eq!(track_id, None, "laps.track_id must be NULL after the ON
DELETE SET NULL cascade")`), and separately asserts the `tracks` row count
is zero. The stale-stamp test computes the real post-delete
`track_library_hash`, stamps a session with the pre-delete hash, and reads
the file's raw bytes twice for a byte-identity assertion — a stronger check
than trusting the return value, matching the brief's explicit ask ("byte-
identical afterwards ... asserted, not assumed"). The no-catalog test
asserts both `warnings.is_empty()` and that no `catalog.sqlite` file was
created. The unknown-id test asserts both the `NotFound` kind and that the
real track file was untouched.

**CLAUDE.md/style.** Doc comments on the two new public items
(`DeleteTrackReport`, `store::catalog::delete_track`) and the private
`delete_track_via`; typed errors throughout (`IpcError`/`TrackWriteError`),
no `Err(String)` at any command boundary (the catalog-delete closure's
internal `.map_err(|e| e.to_string())` only ever lands in `warnings`, never
returned as the function's error type); no `unwrap()` outside test code; no
bare `// TODO`; NUL-byte check clean on all three touched Rust files
(verified byte-count, not text grep, after an initial shell-mangled grep
gave a false positive). Only the three named Rust files plus `CHANGELOG.md`
changed; `Cargo.lock` unchanged. `CHANGELOG.md` bullet (`208d4f9`) is
accurate against the diff — no new `IpcErrorKind`, the ordering
(artifact-then-catalog-row), the `ON DELETE SET NULL` cascade, the reused
`stale_session_ids` helper, and the "never rewrites session.json" guarantee
are all present and true. Both commits are single-line subjects
(`tauri: delete_track (C3 3.2)`, `docs: CHANGELOG bullet for L8x Task 5
(delete_track)`) with no AI attribution trailers.

**Verdict rationale.** The commit implements C3 §3.2's `delete_track`
exactly as specified and as the brief detailed it: correct ordering on the
existence check, the catalog-failure-into-warnings rule, the FK-cascade
delegated to SQLite rather than hand-deleting `laps` rows, no
`session.json` rewrite, `stale_session_ids` reused rather than
re-implemented, and every named test case present and asserting the
specific fact it claims to. No unrequested additions (no new error kind, no
`app/src/` touch, no SQL outside core) and no gaps found against the brief,
the C3 text, or CLAUDE.md's standing orders.

VERDICT: CLEAN
