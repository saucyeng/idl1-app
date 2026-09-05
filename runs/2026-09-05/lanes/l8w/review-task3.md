# L8w Task 3 review — App group: list_profiles/save_profile/delete_profile (C3 §3.10)

Commit reviewed: `4f0bd2a` on branch `wave2-l8w-write-amendment`,
worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`.
Files touched: `tauri/src/commands/app.rs` (+241), `tauri/src/lib.rs` (+3). Pure
additions — no existing line in either file was modified or removed
(`git diff 4f0bd2a~1 4f0bd2a` shows a single `-` line, the diff hunk marker
only). `Cargo.lock` unchanged. No file under `app/src/` or `docs/` in the diff.

Test command reported: `cargo test -p idl-rs-tauri commands::app::` → 15
passed (9 carried from Task 2 + 6 new). Verified by static count: the file
now has 15 `#[test]` functions total, and Task 2's review (`review-task2.md`)
recorded 9 before this commit — 9 + 6 = 15, consistent. `cargo check -p
idl-rs-tauri` reported clean; the three new commands are `pub fn`s with
correct `#[tauri::command]` signatures matching the plan's interface exactly
and are registered in `lib.rs`'s `handler()` list. Not rerun (CLAUDE.md §8;
reviewers do not build).

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No findings. | — |

## Verdict rationale

Wire shapes match C3 §3.10 field-for-field: `BikeProfileDto` (profile_id,
profile_name, created_at_ms/updated_at_ms as documented milliseconds i64,
config as `serde_json::Value`) and `ProfileLoadReport { profiles, skipped:
{path, reason}[] }` are byte-for-byte identical to the spec's TS interfaces,
including `skipped` sort order (profiles sorted by `profile_name` ascending,
inherited from core's `load_all`) and the doc comment on the config field
copied verbatim from C3. `save_profile` validates `config.is_object()` before
calling `store::profile::save`, raising `invalid_argument` and writing
nothing on rejection (test `save_profile_via_a_non_object_config_is_rejected_and_nothing_is_written`
asserts `list_profiles_via` is empty afterward). `delete_profile_via` checks
`path.is_file()` before calling core's idempotent `delete` and raises
`not_found` for an unknown id (ruling R59 F2); its test
(`delete_profile_via_an_unknown_id_returns_not_found_and_does_not_touch_other_files`)
saves one profile, deletes a different unknown id, asserts `NotFound` and
that the other profile still loads — proves the other file is untouched, as
the brief asked. `list_profiles_via`'s malformed-file test proves a bad
`*.idl0p` file lands in `skipped` (path + non-empty reason) while the good
profile still loads and the call doesn't fail (F3, objects with named keys,
not tuples). All four error kinds used (`NotFound`, `InvalidArgument`, `Io`,
`Internal`) are pre-existing `IpcErrorKind` variants — nothing new added, so
no additive-enum concern applies. C3 does not specify a `profile_id` format,
and the implementation correctly does not invent validation for it (matches
the "say the store does [nothing]" branch of the review instruction — the
store just uses the id verbatim as a filename component). `profiles_dir` was
correctly not made `pub`; the one-line path join is duplicated in the
command layer per the brief's explicit instruction. Doc comments present
on every public symbol with units named on both `i64` millisecond fields.
Tests follow the established `_via`/temp-dir/A-A-A pattern with `thing —
condition — result` names, matching `commands/catalog.rs` and Task 2's own
file. `Device/ipcStubs.ts` was not touched (confirmed by reading the file —
it still throws `NotImplementedError` for all three commands, unchanged).
Registration in `lib.rs` mirrors the other command groups exactly. No scope,
layering, or hygiene violations found.

VERDICT: CLEAN
