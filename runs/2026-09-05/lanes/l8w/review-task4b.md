# L8w Task 4b review — `WorkbookEvent.hash` (ruling R67)

**Scope.** Two commits reviewed:
- `b30d839` in `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment` (branch `wave2-l8w-write-amendment`) — `tauri/src/commands/workbook.rs` only (48 insertions, 1 deletion).
- `3f5437f` in `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l8w-write-amendment` (branch `wave2-l8w-write-amendment`) — `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` only (4 insertions).

Both worktrees are clean at these commits (`git status --porcelain` empty); no other uncommitted or unrelated changes present.

## Test command and result

Reviewer does not build/test (CLAUDE.md §8, review-STANDING.md). Verified statically instead:

- Implementer reported `cargo test -p idl-rs-tauri watch_workbook_` → 4 passed, `cargo check -p idl-rs-tauri` clean.
- Grep for `fn watch_workbook` in `tauri/src/commands/workbook.rs` at `b30d839` finds exactly four test functions with the `watch_workbook_` prefix: `watch_workbook_external_edit_to_a_watched_workbook_event_names_only_the_changed_cell`, `watch_workbook_via_event_hash_computation_matches_save_workbook_vias_hash_for_the_same_bytes`, `watch_workbook_the_apps_own_save_hash_pre_registered_no_event`, `watch_workbook_unknown_id_not_found`. The reported count of 4 is plausible and matches exactly — confirmed, not reproduced by running.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical/Important/Minor findings. | — |

## Checks performed (all pass)

- **Hash source of bytes**: `tauri/src/commands/workbook.rs:453` (`let hash = sha256_hex(markdown.as_bytes());`) is computed from the `markdown` variable already bound by the pre-existing `std::fs::read_to_string(&watch_path)` two lines above — no second read, no second hash function. Matches the brief's "Key logic" section verbatim.
- **Wire type**: `pub hash: String` on `WorkbookEvent` (not `Option<String>`) — matches the plan's `hash: string` (required) and the lead's 2026-09-05 ruling that `hash` is always present once this task lands.
- **Required test 1 (external edit)**: the existing test `watch_workbook_external_edit_to_a_watched_workbook_event_names_only_the_changed_cell` was extended in place (not split into a sibling) with `assert_eq!(event.hash, sha256_hex(edited.as_bytes()));` — a hand-computed hash of the actual edited bytes, not a shape check, matching the file's own precedent for hash assertions and the brief's requirement. Extending vs. sibling was left to implementer judgment by the brief; the diff itself (a single added assertion line, no restructuring) makes the choice self-evident, so no separate write-up was needed.
- **Required test 2 (computation agreement)**: `watch_workbook_via_event_hash_computation_matches_save_workbook_vias_hash_for_the_same_bytes` (`tauri/src/commands/workbook.rs:980`) genuinely isolates two independent `ExpectedHashSet`s — `watcher_hashes` passed to `watch_workbook_via`, and a separate `save_hashes` passed to `save_workbook_via` — so the watcher's suppression path (`check_and_consume`) cannot match and the external-edit path fires the closure. It calls the real `save_workbook_via` to produce `save_result.hash`, then asserts `event.hash == save_result.hash` and `event.hash == sha256_hex(edited.as_bytes())`. This matches the lead's 2026-09-05 ruling exactly ("a unit test that the closure's hash computation equals `sha256_hex` over the same bytes `save_workbook_via` would hash") and is honestly framed in its own arrange-comment as testing computation agreement, not a real self-write.
- **Self-write suppression test untouched**: `watch_workbook_the_apps_own_save_hash_pre_registered_no_event` (`tauri/src/commands/workbook.rs:1015`) is byte-identical to its pre-existing form — no diff hunk touches it — and remains a meaningful, discriminating test (asserts `recv_timeout(...).is_err()`, i.e. zero events for a genuine self-write).
- **No joint self-write test added**: consistent with the lead's ruling (option b) and the R67 addendum in `decisions.md`.
- **Debounce/watcher.rs untouched**: `git show --stat b30d839` shows only `tauri/src/commands/workbook.rs` changed; `tauri/src/watcher.rs` and `tauri/src/lib.rs` do not appear in the diff. No `DEBOUNCE`/`EXPECTED_HASH_TTL`/pending-map logic touched.
- **Mid-write/unreadable path unchanged**: the pre-existing `let Ok(markdown) = std::fs::read_to_string(&watch_path) else { return };` line is unmodified; the new hash line sits after it, so the existing all-or-nothing behaviour (no partial event) is preserved. The brief's rationale for not adding a placeholder hash is consistent with the diff.
- **C3 §3.4 text amendment**: `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`'s `WorkbookEvent` block gains exactly the `hash: string` field and post-sign comment specified in the brief, byte-for-byte identical to the brief's quoted text (including the file's existing `--` convention inside TS code-comment blocks, matching the `based_on_hash` note's style precedent immediately above). `save_workbook`'s block is untouched, as directed (its `hash` field pre-exists and needed no note).
- **Rust field name/type vs. C3**: `pub hash: String` serializes (serde default) as `hash: string` — exact match, no renaming.
- **No `app/src/` changes**: confirmed absent from both diffs (`git show --stat` on each commit lists exactly one file each, neither under `app/src/`).
- **Doc comment**: the new field's doc comment (`tauri/src/commands/workbook.rs:113-121`) was written to reflect the lead's *final* R67 addendum ruling ("defence in depth... not a fix to a live Rust gap") rather than the brief's earlier draft text — a correct, deliberate improvement, not a deviation worth flagging.
- **Repo hygiene**: both commit messages are single-line, no AI attribution trailer; `git add` paths match each task's stated file list exactly; no reformatting outside the touched lines.
- **CLAUDE.md §4 (A/A/A, naming)**: both tests keep Arrange/Act/Assert with blank lines between; names are long descriptive snake_case matching this file's existing convention (not literal em-dash-delimited `thing — condition — result`, but that is this file's established house style throughout, not a new deviation).

## Note (not a finding)

The implementer skipped a `CHANGELOG.md` bullet, which is not in this task's literal file list (only `tauri/src/commands/workbook.rs` and the C3 doc are named). Given CLAUDE.md §6 requires shipped-behaviour changes to update `CHANGELOG.md` and/or `TASKS.md`, and this wave's Task 14 is the wrap-up/full-suite gate, Task 14 should carry a bullet for this field addition (`WorkbookEvent.hash`, R67) unless it was already covered by an earlier lane-wide entry — worth confirming at that gate, not a defect in this task.

## Verdict rationale

The Rust change is exactly the one-line addition to `watch_workbook_via`'s closure the brief specified, reusing the same bytes and the same `sha256_hex` helper already imported, with no touch to `watcher.rs` or `lib.rs`. Both required tests are present and genuinely discriminating: the external-edit test asserts a hand-computed hash of the real edited bytes, and the computation-agreement test correctly isolates two `ExpectedHashSet`s so the closure fires through the external-edit path rather than being suppressed, then checks the two hash computations agree — exactly what the lead's ruling called for, and it is honest about not testing a real self-write. The pre-existing self-write suppression test is byte-identical and still meaningful. The C3 §3.4 amendment matches the brief's exact text, is additive-only, and does not touch `save_workbook`'s block. No `app/src/` file appears in either diff. No Critical, Important, or Minor findings.

VERDICT: CLEAN
