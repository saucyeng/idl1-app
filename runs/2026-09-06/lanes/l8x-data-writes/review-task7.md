# Review — L8x Task 7: quarantine + verify commands

**Commits reviewed:** idl-rs `cfe2ee1` (branch `l8x-data-writes`, on `897ffc5`,
`git merge-base --is-ancestor 897ffc5 HEAD` trivially true as direct parent) —
`tauri/src/commands/maintenance.rs` (new, 376 lines), `tauri/src/commands/mod.rs`
(+1), `tauri/src/error.rs` (+69), `tauri/src/lib.rs` (+3). idl1-app `0a29001` —
`CHANGELOG.md` (+16).

**Test command:** none run (Rust lane, static review only per CLAUDE.md §8).
Counts verified by reading the test modules directly:
`tauri/src/commands/maintenance.rs`'s `#[cfg(test)] mod tests` — 11 `#[test]`
fns (`list_quarantine_via` empty/two-entries, `resolve_quarantine_via`
restore/discard/retry/unknown-entry/occupied-path, `verify_data_dir_via`
repair-false/repair-true/healthy-tree/serialised-report) — matches reported
`commands::maintenance::` 11 passed.
`tauri/src/error.rs`'s three new tests (`quarantine_error_not_found_kind_...`,
`..._occupied_kind_...`, `..._encode_kind_...`) — matches reported
`quarantine_error` 3 passed.
`cargo check -p idl-rs-tauri` claim: plausible on static inspection — the new
module only calls already-landed core functions (`store::quarantine::{list_quarantine,
resolve_quarantine, quarantine_file}`, `store::verify::{verify, verify_and_repair}`)
with signatures matching Task 6 exactly, and the three commands use the same
`tauri::State<'_, DataDir>` idiom as `commands/app.rs` — not independently built.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | report scope (no source line) | The brief's "Report back" section asked for the exact `app/src/ipc/maintenance.ts` declarations the lead must add; that TS is lead-owned per PLAN §8 and correctly absent from this commit (no `app/src/` touched, matching "Do not"), so this is a report-content nit, not a code finding. | Confirm the implementer's report text included the declarations for the lead to lift; no code change needed. |

No other findings. Specifics checked and confirmed compliant:

- **DTO field names byte-for-byte against C3**: `QuarantineEntry { entry_id,
  path, original_path, reason, quarantined_at_ms }` and `VerifyReport
  { findings, quarantined, elapsed_ms }` with `VerifyFinding { severity, path,
  message }` — no `#[serde(rename...)]` needed since Rust field names are
  already the C3 snake_case wire names, matching the sibling `commands/app.rs`
  convention (no camelCase renames anywhere in the command layer; Tauri's own
  arg-name camelCasing on the JS side is unaffected by this).
- `severity_str` maps `Severity::{Info,Warning,Error}` to `"info"|"warning"|"error"`
  by explicit `match`, never `Debug` formatting — verified by reading the
  function and the `serialised_verify_report` test which asserts the three
  strings directly against `serde_json::to_value`.
- `action` mapping: `"restore"` → `Restore`, `"discard"` → `Discard`, anything
  else (including the retired `"retry"`) → `invalid_argument` with
  `detail: { "action": <value> }` — the `resolve_quarantine_via_retry_...`
  test locks Q2 in exactly as the brief required, and `"retry"` is never
  aliased.
- `QuarantineErrorKind` → `IpcError` mapping matches the brief exactly:
  `NotFound` → `not_found`, `Occupied` → `invalid_argument` (with the doc
  comment explaining "the caller can free the path and retry, so this is not
  an I/O failure" — same rationale as the brief), `Io` → `io`, `Encode` →
  `internal` (R46 precedent, no new `IpcErrorKind` variant). Confirmed no new
  `IpcErrorKind` enum variant added anywhere in the diff.
- `restore` moves the payload back to `original_path` (core-side, already
  reviewed in Task 6) and refuses onto an occupied path with
  `invalid_argument` — exercised by `resolve_quarantine_via_restore_onto_an_occupied_path_invalid_argument`.
  No re-indexing of any session/blob is triggered by resolve — correct per
  C3 §3.2's "a resolve never touches the catalog," and the tauri layer adds
  no catalog call.
- `discard` removes both payload and sidecar — `resolve_quarantine_via_discard_both_files_are_gone`
  asserts both `entry.path` and `source` (the pre-quarantine location) are
  gone, and `list_quarantine_via` afterward is empty (sidecar gone too).
- Unknown `entry_id` → `not_found`, confirmed by
  `resolve_quarantine_via_an_unknown_entry_id_not_found`.
- `entry_id` is never joined into a path in the tauri layer itself; it is
  passed straight through as `&str` to core's `resolve_quarantine`, which
  (per the Task 6 review) validates it against `..`/`/`/`\` before any path
  join — no new traversal surface introduced here.
- `verify_data_dir(repair: false)` calls only `store::verify::verify` (the
  read-only C4 §7 scan) and never `verify_and_repair`; the
  `verify_data_dir_via_repair_false_...` test asserts the corrupted blob's
  bytes are byte-identical (`b"corrupted"`) and the path still exists after
  the call — a direct, non-structural proof of no writes.
- `verify_data_dir(repair: true)` mints a fresh uuid v4 and reads wall-clock
  `now_ms` inside the `#[tauri::command]` function itself, never in core —
  matching the plan's "UUID v4 minting and `now_ms` happen here, not in
  core" rule and Task 6's injected-clock requirement.
- `elapsed_ms` timing follows the same `Instant::now()` /
  `.elapsed().as_millis() as u32` pattern as `rebuild_catalog`
  (`tauri/src/commands/catalog.rs:836/861`) — same idiom, not reinvented.
- All three commands declared in `commands/mod.rs` (`pub mod maintenance;`)
  and registered in `lib.rs`'s `handler()` list, alongside the other App-group
  commands.
- Tests are Arrange/Act/Assert with blank-line separation and
  `thing_condition_result` names consistent with this repo's established
  snake_case rendering of the naming convention (matches Task 6's reviewed
  style).
- Hand style matches the surrounding crate: long struct-literal-in-one-line
  patterns (e.g. the `VerifyFinding` conversion) appear elsewhere in this
  codebase (`app.rs`'s equivalent conversions); no `cargo fmt` reformatting of
  untouched lines.
- Only the four named tauri-crate files touched, plus `CHANGELOG.md` in
  idl1-app; `git diff 897ffc5^ cfe2ee1 --stat -- Cargo.lock` is empty — no
  new dependency (only already-vendored `uuid`, already a dependency per
  Task 6's review, and `std::time`).
- NUL-byte check (`grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]'`) returns `0` for
  all four touched tauri files.
- CHANGELOG bullet (`0a29001`) accurately describes the three commands, the
  action-rename/rejection behaviour, the App-group placement rationale, the
  error-kind mapping and the injected-ids/now_ms seam — matches the code and
  cites ruling R86 correctly.
- No `IpcErrorKind` variant added (confirmed by diff — only a new `From` impl
  for an existing enum's variants).
- No lock held across `.await` — the module has no `async fn` and no mutex;
  not applicable here.
- Commit message is single-line, no AI attribution trailer, matches the
  Steps section's prescribed text.

**Verdict rationale:** The three commands are exactly as thin as the brief
specified, delegate to Task 6's already-reviewed core module without adding
any new logic (path validation, sorting, structural repair selection all stay
in core), the DTO shapes and error-kind mapping match C3 §3.2/§3.10 and the
brief's ruling text verbatim, and the eleven `maintenance` tests plus three
`error.rs` tests between them exercise every documented behaviour: the
`"retry"` rejection, the occupied-restore rejection, the unknown-entry
rejection, and — critically, closing the one gap the Task 6 review flagged as
unverified at the core layer — `repair: false`'s no-write guarantee is now
asserted directly (byte-identical corrupted content, path still present)
rather than only structurally. Nothing here blocks landing.

VERDICT: CLEAN
