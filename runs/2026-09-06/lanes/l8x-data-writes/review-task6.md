# Review — L8x Task 6: core quarantine module + `verify_and_repair`

**Commits reviewed:** idl-rs `897ffc5` (branch `l8x-data-writes`, on `571e410`,
ancestor `81a7db3` confirmed) — `core/src/store/quarantine.rs` (new, 529
lines), `core/src/store/verify.rs` (+129), `core/src/store/mod.rs` (+1
export). idl1-app `2e9c485` — `CHANGELOG.md` (+20).

**Test command:** none run (Rust lane, static review only per CLAUDE.md §8).
Counts verified by reading the test modules directly:
`core/src/store/quarantine.rs` `#[cfg(test)] mod tests` — 10 `#[test]` fns,
matches reported `store::quarantine` 10 passed.
`core/src/store/verify.rs` `#[cfg(test)] mod tests` — 12 `#[test]` fns
(9 pre-existing `verify` tests, unmodified, + 3 new `verify_and_repair`
tests), matches reported `store::verify` 12 passed.
`cargo check -p idl-rs-cli --tests` claim: `cli/src/main.rs:1176` is the only
CLI reference to `store::verify` (`findings.iter().any(|f| f.severity ==
verify::Severity::Error)`), and `verify`'s signature/`Finding`/`Severity`
are unchanged, so nothing in `cli` could break — claim is plausible on
static inspection, not independently built.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `core/src/store/verify.rs:238-261` (tests at :583-600) | The only "not auto-repaired" test (`verify_and_repair_a_missing_blob_finding_3_not_quarantined`) uses a **Warning**-severity finding, which is excluded by the `finding.severity != Severity::Error` half of the guard before `is_repairable_finding_path` is ever called. No test exercises an **Error**-severity, non-repairable finding (#2 malformed `session.json`, #4 `data.parquet` identity mismatch, #8 track filename/id mismatch) through `verify_and_repair`, so the doc comment's central claim — "decided structurally... never by message text, so a look-alike message on an unrelated path can never be mis-repaired" — is exactly the property left unverified. Reading `is_repairable_finding_path` confirms it is correct (only matches the `blobs/sha256/<2>/<62>` and `sessions/<id>/derived/<64>.parquet` shapes), so this is a coverage gap, not a functional bug. | Add one test that runs `verify_and_repair` against e.g. a malformed `session.json` (or a mis-copied `data.parquet`, both Error severity) and asserts `quarantined.is_empty()`. |
| Minor | `core/src/store/quarantine.rs:452-473` (`resolve_quarantine_restore_onto_an_occupied_path...`) | Test asserts the payload and the occupying file both survive but never asserts the sidecar file also survives an `Occupied` failure (code returns before the `remove_file(sidecar_path(...))` call, so it should still be there — correct behaviour, just unverified). | Add `assert!(sidecar_path(&root, &entry_id).exists());` to the same test. |

No other findings. Specifics checked and confirmed compliant:

- **Sidecar shape** (`SidecarDoc`) is field-for-field `{ entry_id,
  original_path, reason, quarantined_at_ms }` — no `path` field — matching
  C4 §2's 2026-09-06 post-sign amendment verbatim
  (idl1-app-worktrees/l8x-data-writes, C4 §2 lines ~158-165). The IPC-facing
  `QuarantineEntry` (which does carry `path`) is a distinct struct never
  serialised to the sidecar file — correct separation.
- `original_path` is stored as given by the caller (the finding's/write's
  absolute path under `<data>`), never re-derived from a hardcoded root, so
  a moved data directory restores correctly as long as the caller passes an
  absolute path under the current root — consistent with how `verify`
  produces `Finding.path` (absolute, from `data_root.join(...)`).
- `verify_and_repair` selects only C4 §7 findings #1/#5 **structurally**
  (`is_repairable_finding_path` matches path shape, `blobs/sha256/<2
  hex>/<62 hex>` or `sessions/<id>/derived/<64 hex>.parquet`), gated first
  by `Severity::Error`; never inspects `finding.message`. Confirmed against
  C4 §7's full ten-item list — only #1 and #5 are named repairable.
- Sidecar-then-rename ordering, with a documented crash story
  (`quarantine.rs:121-135`): if the process dies between the sidecar write
  and the payload move, the source file is untouched at its original path
  (rename hadn't run) and a stray sidecar is left; `list_quarantine` treats
  an orphan sidecar (payload absent) as a half-finished resolve and skips
  it (test: `list_quarantine_a_sidecar_with_no_payload_skipped`). Consistent
  and recoverable — a later `verify_and_repair` re-quarantines the same
  source under a fresh `entry_id`.
- Atomic rename within the data dir via `std::fs::rename`; cross-device
  fallback is copy + `sync_all` + `remove_file` (`move_file`,
  `quarantine.rs:290-311`), matching the brief.
- `entry_id` is validated (`validate_entry_id`) against empty/`/`/`\`/`..`
  before any path join, and the listing parser uses a fixed 36-char slice
  (not split-on-first-`-`), so a UUID's own internal dashes never break
  parsing — exercised implicitly by every test using a real `Uuid::new_v4()`
  string as `entry_id` (the corrupt-blob test, the two resolve/restore
  tests, etc., all round-trip correctly through `list_quarantine`).
- `resolve_quarantine` on a path-traversal `entry_id`
  (`../blobs/sha256/ab/22...`) is caught by `validate_entry_id` (contains
  `..`) before any lookup — returns `Io`, matches the "`NotFound` or `Io`"
  test assertion, decoy file outside `tmp/` verified to survive.
- `quarantined_at_ms` is a plain `i64` parameter with no clock access
  anywhere in `quarantine.rs`/the new `verify.rs` code — injected by the
  caller (`fixed_ids`/literal `42`/`1` in tests), matching "no clock in
  core".
- No panics on a corrupt sidecar: `list_quarantine` maps a
  `serde_json::from_slice` failure on the sidecar to `Err(QuarantineError {
  kind: Encode, .. })`, which propagates as a `Result`, never an `unwrap`.
  (Not explicitly tested with a deliberately-corrupt sidecar JSON, but the
  code path has no unwrap and CLAUDE.md's bar is "no panic," which is met.)
- `verify`'s existing signature (`pub fn verify(data_root: &Path) ->
  Vec<Finding>`) and all 9 pre-existing tests are byte-identical to before
  this commit — confirmed by diff; `verify_and_repair` is a separate new
  function.
- Tests: consistent Arrange/Act/Assert with blank-line separation; names
  follow `thing — condition — result` (rendered as
  `snake_case_with_the_words_in_order`, matching this repo's established
  convention elsewhere in the same files).
- Hand style matches surrounding code (no `cargo fmt` artifacts visible:
  long argument lists kept on one line elsewhere in the file, consistent
  wrapping).
- Only the four named files touched; `Cargo.lock` has zero diff at this
  commit (`git diff 897ffc5^ 897ffc5 --stat -- Cargo.lock` empty) — no new
  dependency, consistent with using only already-vendored `serde_json`/
  `uuid` (dev-dep, tests only).
- NUL-byte check: `grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]'` returns `0` for
  both touched core files.
- CHANGELOG bullet (`2e9c485`) accurately describes the module, the
  sidecar-before-move ordering and its crash rationale, the cross-device
  fallback, and `verify_and_repair` as sole repair-path caller — matches
  the code.
- `Do not` list honoured: findings #2/#3/#7/#8 are never quarantined
  (confirmed structurally above); no uuid/clock generation in core; no
  catalog access anywhere in `quarantine.rs` or the new `verify.rs` code.

**Verdict rationale:** The implementation matches the brief's interfaces
exactly, the C4 §2/§7 amendment is honoured field-for-field, the repair
selection is genuinely structural (verified by reading
`is_repairable_finding_path`), and the crash-safety story is sound and
partially tested (the orphan-sidecar half is covered). The one real gap is
that the test suite never actually exercises the structural-selection logic
against an Error-severity finding that isn't #1/#5 — the sole
"not-repaired" test is trivially excluded one guard-clause earlier by
severity — which is a test-completeness gap worth a follow-up test, not a
functional defect (the code itself is correct on inspection). Nothing here
blocks landing.

VERDICT: NEEDS_FIXES
