# Delete/truncate audit — non-test Rust, 2026-09-10

Scope: rust/core, rust/transport, rust/tauri, app/src-tauri/src. `#[cfg(test)]`
modules and tests/ excluded. Method: grep for remove_*/rename/File::create/
truncate, then read every non-test hit in context (line ranges below are the
production function, not the grep hit alone).

## (a) tmp/ or tmp/quarantine — staging, expected
- rust/core/src/store/atomic.rs:102,109 — `write_atomic`: drops the `tmp/<uuid>` scratch file on a RenameConflict before returning the error.
- rust/core/src/store/atomic.rs:177 — `write_and_fsync`: `File::create` targets the `tmp/<uuid>` scratch path only, never a final path.
- rust/core/src/store/sync/apply.rs:220 — `read_data_parquet_versions_from_bytes`: writes+removes a `tmp/sync-verify-<uuid>` scratch file.
- rust/core/src/store/quarantine.rs:271-303 — `resolve_quarantine`/`move_file`: `Discard` removes the quarantined payload; `Restore` moves it out. Both are the explicit, user-triggered resolution of an existing quarantine entry (C4 §2), not automatic.
- rust/tauri/src/commands/device.rs:492,494 — `download_via`: removes/renames only the `tmp/<uuid>` download scratch file into `blobs/`.
- rust/transport/src/sync/client.rs:436,463,478,489,572 — `download_item_with_cap` et al.: remove/truncate only `tmp/*.part` resumable-download files.
- rust/transport/src/sync/pairing.rs:183-196 — `write_json_atomic`: tmp-file write/rename/cleanup-on-failure, standard atomic-write pattern (peers.json/identity.json, outside `<data>`).

## (b) a single session's derived/ or data.parquet during rebuild
- rust/core/src/store/derived.rs:239-246 — `remove_session_derived`: `remove_dir_all` on `sessions/<id>/derived/` only, called after a `data.parquet` rebuild invalidates cached derived files (design §5). Missing dir is not an error.
- rust/core/src/store/import.rs:396-408 — `ImportPlan::Regenerate` arm: `remove_file` on `sessions/<id>/data.parquet` immediately followed by rewriting it; explicit "delete then rewrite" per C1 §4.3. `derived/` deliberately untouched here.

## (c) the inbox
- rust/tauri/src/inbox.rs:229 — `import_one`: removes the inbox file only *after* a successful import (R191). A failed import instead moves the file to `inbox/failed/` (line 245, a rename, not a delete) — "the alternative (deleting it) would lose the user's data" (line 237 comment).

## (d) catalog.sqlite and -wal/-shm sidecars (rebuildable index)
- rust/core/src/store/catalog.rs:308,313-314 — end of `rebuild_catalog`: after atomically renaming the new sqlite over the old one, removes the leftover staging file and the *old* database's `-wal`/`-shm` sidecars. Never touches `blobs/`, `sessions/`, or anything else under `<data>`.

## (e) blobs/ — must never happen except an explicit, user-confirmed delete
- Named command that does this: `delete_session` (C3 §3.2), core at rust/tauri/src/commands/catalog.rs:1012-1030 (`delete_session_via`). Only runs when the frontend passes `delete_blob: true`, and only after confirming (by reading every *other* session's `data.parquet` metadata) that no other session still references the same content hash — shared blobs are never removed. This is the one and only blob-deleting code path found in non-test Rust.
- No other blob deletion exists anywhere else in core/transport/tauri outside this explicit command.

## (f) the data root itself or the app config dir
- No code path found that removes or truncates the data root or `app_config_dir()` itself. `rust/tauri/src/paths.rs::resolve_data_dir` (lines 25-44) only ever calls `create_dir_all` — idempotent, additive, never deletes. `app/src-tauri/src/lib.rs`'s `.setup()` (lines 10-24) calls `resolve_data_dir` and nothing else; no wipe/reset code anywhere in the crate.
- `set_data_dir_via` (rust/tauri/src/commands/app.rs:152-175, C3's `set_data_dir`): writes the new override to `settings.json` and `create_dir_all`s the new root's `data` subdir. Doc comment (line 138) states explicitly: "Does not move existing files" — the old root is left untouched, nothing is deleted.

## (g) anything else
- rust/core/src/store/sync/apply.rs:440-449 — workbook merge install: after a sync-driven rename (peer's `workbook_id` wins per C4 §6), removes the *old*-named `.idl1wb` file only, single file, only when `target_path != local_path`.
- rust/core/src/track_artifact/write.rs:81-89 — `delete_track`: removes one `tracks/<track_id>.idl0t`, the explicit "delete track" action, after rejecting a `track_id` containing a path separator or `..`. A missing file is `Ok(false)`, not an error. **Added 2026-09-10** — missed by the original grep pass; the delete-guard scan test (`rust/tauri/src/delete_guard.rs`, ruling R196) is what found it, which is the point of that test.
- rust/transport/src/sync/client.rs:572 — `pull_and_install`: drops the `tmp/*.part` file once the bytes are complete, whichever way the install went (R102). Same tmp-only scope as (a)'s `download_item_with_cap` entry; named separately here because the guard test keys on the enclosing function.
- rust/core/src/store/profile.rs:112-118 — `profile::delete`: explicit single-profile-file delete, used by an explicit "delete profile" command; no-op if absent.
- rust/tauri/src/commands/catalog.rs:1029 — the `blob_path` remove_file inside `delete_session_via`, already covered under (e).

## Answers to the five questions

**(1) Dev vs release data dir.** Same. `app/src-tauri/tauri.conf.json` sets a single `identifier: "com.saucyeng.idl1"` (line 5) with no separate dev config file (no `tauri.conf.dev.json` / `--config` override found) and no dev-only branch in `lib.rs`'s `.setup()`. `tauri dev` and a release build both resolve through the same `app.path().app_data_dir()`, which Tauri derives from that one identifier — so both target `%APPDATA%\com.saucyeng.idl1`.

**(2) Reset/wipe/migrate/clear-data-dir code.** None found. Grepped `reset|wipe|clear_data|recreate|schema_version` across core/tauri/transport/app-src-tauri; the only "schema_version" hits are the catalog's `user_version` pragma (rebuild only touches catalog.sqlite, see (d)) and `session.json`'s document schema field (a data field, not a directory operation). `set_data_dir` explicitly does not move or delete files (see (f)).

**(3) Does `verify`'s repair mode delete outside tmp/quarantine?** There is no repair mode. `rust/core/src/store/verify.rs`'s module doc (lines 1-4) states: "walks `<data>`, reports every check as a `Finding`, never auto-repairs structured content." The function only reads and pushes `Finding`s; it contains no `remove_*`/`rename`/`File::create` calls at all.

**(4) Does app/src-tauri's setup clobber an existing data root?** No. `lib.rs`'s `.setup()` (lines 10-24) calls `paths::resolve_data_dir`, which (paths.rs:25-44) only reads `settings.json` for an optional override and `create_dir_all`s the fixed C4 §2 subdirectory list — every call is additive/idempotent, none can remove or truncate an existing file.

**(5) Does the Windows bundle config touch AppData on install/uninstall?** No. `app/src-tauri/tauri.conf.json`'s `bundle` section (icon list + `active`/`targets` only) has no `windows` block, no NSIS/WiX config, and no custom install/uninstall hooks or scripts anywhere in the repo.
