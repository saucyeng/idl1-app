# L8w Task 10 review — `create_workbook` (C3 §3.4)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
branch `wave2-l8w-write-amendment`. Commits under review: `d06067d` (Task 10,
`tauri/src/commands/workbook.rs`, `tauri/src/lib.rs`) and `fde52f4` (the
review-task8 doc-comment fix, `core/src/parse/registry_preview.rs`), stacked
on Task 9 `46d6b63`. Out of scope: any commit after `d06067d` (a Task 11
implementer may already have committed; ignored per dispatch).

## Test command and result

Not re-run (reviewer does not build/test, CLAUDE.md §8). Implementer report
accepted: `cargo test -p idl-rs-tauri commands::workbook::tests::create_workbook`
reported 5 passed; `cargo check -p idl-rs-tauri` clean; lane's four-task gate
(tauri 173, idl-rs 914, cli 51) green. The five new tests in the `d06067d`
diff (`create_workbook_via_a_fresh_name_...`, `..._an_empty_name_...`,
`..._a_whitespace_only_name_...`, `..._an_all_symbols_name_...`,
`..._two_calls_with_the_same_name_...`) statically match the filter and are
traceable against landed types (`WorkbookHandle`, `parse_front_matter`,
`parse_workbook`, `sanitize_file_name_stem`) — the count is plausible.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Critical | `tauri/src/commands/workbook.rs` (`create_workbook_via`, `let markdown = format!("---\nid: {id}\nname: {name}\nversion: 3\n---\n");`) | `name` is interpolated into the hand-built YAML front matter with no escaping or quoting. A name containing YAML-significant characters produces either an unparseable file or, worse, a file that parses to a different name than the one passed in and returned in the `WorkbookHandle`. Concretely: (1) a name with an unquoted colon-space (e.g. `"Wheel: front"`) is invalid YAML block-mapping syntax — `parse_front_matter`'s `serde_yaml_ng::from_str` call fails, and every later `read_workbook`/`save_workbook` against the just-created file returns `workbook_missing_front_matter_id` even though the id line is syntactically present, yet `create_workbook` itself already returned success with a handle pointing at a file the app can never reopen. (2) a name containing an unquoted space-then-hash (e.g. `"Test #1"`) is silently truncated by YAML's comment rule — the persisted `name` becomes `"Test"`, diverging from the `name` field the caller already received in the `WorkbookHandle` — silent corruption, not a failure. Neither case is exercised by any of the five new tests, which use only `"Fork tuning"` and `"..."`. `core/src/workbook/v3/front_matter.rs` has no serializer at all (parse-only, confirmed by the implementer's own comment) — nothing else in the codebase protects this write path. This is exactly the failure mode the dispatch flagged as Critical: "a name that parses to a different value or fails to parse." | Quote/escape `name` for YAML double-quoted-scalar safety before interpolating (escape `"`, `\`, control characters, wrap in `"..."`), or serialize through a small struct with `serde_yaml_ng::to_string`. Add tests for names containing `:`, `#`, a leading `-`/`*`/`&`/`!`/`%`/`@`/backtick, and embedded quotes, each asserting the round-tripped `front_matter.name` equals the original byte-for-byte. |
| Minor | `tauri/src/commands/workbook.rs` (`create_workbook_via`'s `stem.is_empty()` branch) | Kept "defensively" per its own doc comment (matching the task brief's instruction), but the branch is unreachable with the current sanitiser and untested — acceptable as disclosed, not a real gap. | None required; leave as documented, or add a direct unit test against a hypothetical empty-stem input if the lead wants the branch exercised. |

No other Critical or Important findings.

## Checks performed (all pass)

- UUIDv4 minted via `uuid::Uuid::new_v4()` — the crate already used elsewhere in this file and in `commands/device.rs`; `Cargo.toml`/`Cargo.lock` unchanged in `d06067d`.
- `sanitize_file_name_stem` and `idl_rs::session::filename::unique_file_base` reused verbatim, identical call shape to `save_workbook_via`'s Step 2 — no second sanitiser written.
- Collision behaviour: the two-calls-same-name test asserts both files exist, the second gets a `-2` suffix, and ids differ — matches `save_workbook_via`'s own collision test and C4 §2/SPEC §15.1.
- `write_atomic(data_dir, &target, markdown.as_bytes(), None)` used, not `std::fs::write`; `None` is correct given the collision loop already guarantees `target` doesn't exist. The `AtomicWriteErrorKind` match is exhaustive against the enum's two actual variants (`Io`, `RenameConflict`, `core/src/store/atomic.rs`).
- Empty (`""`) and whitespace-only (`"   "`) names both hit `invalid_argument` before the sanitiser and before any directory is created (asserted via `!root.join("workbooks").exists()`) — order matches C3 §3.4 and the task brief's Step 1.
- Return shape: `WorkbookHandle { id, name, path, cell_count: 0 }` matches C3 §3.4's `WorkbookHandle` interface field-for-field, including the pre-existing (not introduced here) snake_case `cell_count` that C3 itself specifies.
- Error kinds returned (`invalid_argument`, `io`, `internal`) match C3 §3.4's stated set exactly; `internal` is only reachable through the defensive, documented-unreachable `RenameConflict` arm.
- `create_workbook_via` is transport-agnostic and thin; `create_workbook` (the `#[tauri::command]`) is a one-line wrapper, matching the lane's `_via` idiom.
- No catalog/index write — consistent with "the workbook is a file" (CLAUDE.md §3) and C3 §3.4 not mentioning a catalog update for this command.
- File name derives from `name`, never from the minted `id` — matches C3's explicit ruling.
- Registration in `tauri/src/lib.rs`'s `handler()` present, correctly grouped with the other `commands::workbook::*` entries.
- Tests are Arrange/Act/Assert with blank lines between phases; names follow the file's own `thing_condition_result` underscore convention; each test would fail if its named behaviour broke, traced by hand against `parse_front_matter`/`parse_workbook`/`sanitize_file_name_stem`'s actual bodies.
- Doc comments present on `create_workbook_via` and `create_workbook`.
- No `cargo fmt` churn — diff is additive/surgical, confined to the two named files plus the separately-scoped `fde52f4` doc-comment fix.
- Commit messages: both single-line, no AI attribution trailer.
- `fde52f4`'s doc-comment claim re-verified against the actual field types: `RegistryPreviewRow.channel_id: u16`/`data_type: &'static str` vs. `ChannelRegistryEntry.channel_id: u8`/`data_type: u8`, matching C3 §3.8's `RegistryRow` interface — the softened wording is now accurate; only the comment changed, no logic touched.
- `docs/` untouched by either commit; shared checkout `rust` submodule not touched; nothing under `app/src/` touched.

## Verdict rationale

The mechanics this task was asked to reuse — sanitiser, collision suffix, `write_atomic`, error kinds, return shape — are all correctly wired and match `save_workbook_via`'s established pattern and C3 §3.4 exactly, and the five tests genuinely exercise the happy path, both invalid-argument branches, and the collision case. But the one piece of genuinely new logic this task owns — hand-building the YAML front matter — has no escaping of the caller-supplied `name`, and no test with an adversarial name exists to catch it. This is not hypothetical: a name as ordinary as "Front: compression" or "Lap 1 #PB" either silently truncates on write or produces a file the app's own parser can never reopen again, while `create_workbook` still reports success. That is the exact Critical failure mode the dispatch asked me to check for, and it is present. The fix is small and mechanical (quote/escape the interpolated value) but it is a real defect, not a style nit, so this is NEEDS_FIXES rather than CLEAN.

VERDICT: NEEDS_FIXES
