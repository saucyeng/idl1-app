# Review — L11 Task 3: core `store::sync::diff::plan_sync`

**Commits reviewed:**
- idl-rs `59e307e` "core: sync diff -- plan_sync (L11)" on branch `l11-sync`
  (worktree `idl-rs-worktrees/l11-sync`, base `c406e7b` / lane base `52efba8`)
  — `core/src/store/sync/diff.rs` (new, 796 lines), `core/src/store/sync/mod.rs`
  (+9/-7, doc + `pub mod diff`). `Cargo.lock`/`Cargo.toml` untouched.
- idl1-app `41d5a18` "docs: CHANGELOG for L11 Task 3 -- sync diff (plan_sync)"
  (worktree `idl1-app-worktrees/l11-sync`) — `CHANGELOG.md` only.

**Test command:** none run (Rust lane — cargo forbidden for reviewers).
Verified statically: `diff.rs` contains exactly the 14 `#[test]` functions
the brief's Tests section names by scenario (blob one-sided ×1, identical
manifest, data.parquet same-pair-diff-hash, newer-importer, equal-importer-
newer-seam, unparsable-seam, equal-pair-equal-hash, session.json differing,
workbook differing, workbook rename no-op, track LWW ×3-in-1, derived
per-session, swap-mirror, run-twice), each with Arrange/Act/Assert blocks
and blank lines between sections, each asserting exactly what its name
claims — matching the reported 14 passed. No existing `pub` signature
changed (purely additive `pub mod diff`), so the reported clean
`cargo check -p idl-rs-cli --tests` is plausible from inspection.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `diff.rs:754-777` (`plan_sync_swapping_the_arguments...`) | The mirror test only exercises Blob (content-addressed) and Track (LWW), both of which produce plain `Pull`/`Push`. It never checks a `PullForMerge`-producing class (Workbook, `session.json`). This is defensible — `PullForMerge`'s `size_bytes` is legitimately direction-dependent (it always names the *remote* side's size, so `plan_sync(A,B)` and `plan_sync(B,A)` are not literal mirrors for that field) — but it means the "mirror-image" property the brief calls out is verified for two of the seven classes only. | Not required for CLEAN; a follow-up could add a workbook/session.json case to the mirror test asserting *action-kind* symmetry (`PullForMerge` both directions) without asserting identical `size_bytes`. |

No Critical or Important findings.

**Verified against C4 §6 / ruling R89 (line-by-line):** blob and derived
diff by hash set-difference, present-one-side ⇒ transfer, both ⇒ nothing
(`diff_blobs`, `diff_derived`). `data.parquet` keyed by `session_id`;
equal version pair + equal hash ⇒ nothing; equal pair + differing hash ⇒
no transfer, one `EquivalentDataParquet` note; differing pair ⇒ the newer
side's bytes transfer (`Pull`/`Push`, never regenerated); absent one side
⇒ transfer. R89's ordering is implemented exactly as ruled: `importer_version`
compared first as SemVer 2.0.0 core (major.minor.patch, pre-release/build
stripped, `parse_semver_core`), tie broken by `seam_correction_version`'s
integer after its leading `v` (`parse_seam_version`); either value failing
its own parse rule makes the whole pair incomparable (`compare_data_parquet_versions`
returns `None` via `?`, never falls back) — no action, one
`IncomparableDataParquetVersion` note naming both sides' pairs verbatim
(test `plan_sync_data_parquet_unparsable_seam_warning_and_no_item` confirms
the note's `local`/`remote` tuples byte-for-byte). `session.json` keyed by
`session_id`: equal hash ⇒ nothing, differing ⇒ `PullForMerge` (never a
bare `Pull`, per the brief's own emphasis — test name matches exactly),
absent one side ⇒ transfer (a reasonable extension of the "absence is
never a deletion" rule the brief states generally; C4 §6's table doesn't
spell out this cell explicitly but no other reading is available without
propagating a delete). Workbook keyed by `workbook_id`, never `file_name`:
equal hash ⇒ nothing (a same-id, different-`file_name`, same-hash rename
falls into this arm for free, exactly as the brief predicts and the
dedicated test confirms), differing hash ⇒ `PullForMerge`, absent one
side ⇒ transfer. Track/Profile share one `lww_diff` generic over an
`LwwFields` trait: strictly-newer-remote ⇒ `Pull`, strictly-newer-local ⇒
`Push`, equal `updated_at_ms` with differing hash ⇒ nothing, absent one
side ⇒ transfer — one rule, two classes, no duplication. No class
propagates a deletion for one-sided absence anywhere in the file. `actions`
sort by `(class_rank, key, session_id)` and `notes` by `(class_rank, key)`,
both proven deterministic by `plan_sync_run_twice_identical_plans`. No
`unwrap()` anywhere in the module (including test Arrange, which builds
structs directly); the two `.expect(...)` calls in `diff_blobs`/`diff_derived`
are internal-invariant lookups into a set the hash was just drawn from, not
on peer-supplied data that can fail. `SyncNoteReason` additions
(`IncomparableDataParquetVersion { local, remote }`, `VersionPair` alias)
are typed, not stringly; the enum necessarily drops `Copy` (the brief's
Interfaces block had it `Copy` with only `EquivalentDataParquet`) because
R89 — ruled after the brief was written — requires the note to carry both
sides' version-pair strings; this is a correct, ruling-driven interface
extension, not an unauthorised deviation. `PullForMerge`'s doc comment was
corrected from the brief's stale "(workbooks only...)" to "(workbooks and
`session.json` only...)", matching the brief's own Key Logic section
(which explicitly gives `session.json` `PullForMerge`) over its Interfaces
section's lagging comment — the right call given the two sections of the
same brief disagreed. Per ruling **R90**, the follow-up (a `SkippedEntry`
return from `build_manifest` and a "do-not-touch" rule in `plan_sync`) has
**not** landed in this commit — confirmed by grep, zero hits for
`skipped`/`SkippedEntry` in `diff.rs`. That is correct and expected: R90
states explicitly "Fix lands as the Task 2 fix commit **after Task 3
reports**," so Task 3 is not out of compliance for lacking it; a future
fix commit still owes it before this diff is depended on by Task 6/Task 11.
CHANGELOG bullet is accurate to the diff. Only the two named files
plus `mod.rs` and the `CHANGELOG.md` bullet are touched; commit is a single
line, no AI attribution; NUL-byte check on `diff.rs` returns `0`.

**Verdict rationale.** Every C4 §6 conflict rule for all seven classes is
implemented exactly as specified, R89's version-ordering ruling is followed
to the letter including its incomparable-pair edge case, no class ever
propagates a deletion for a one-sided absence, sort order is deterministic
and proven, and the 14 tests are well-formed, correctly named, and verified
by hand to assert what they claim. The interface deviations found (dropping
`Copy`, adding `IncomparableDataParquetVersion`, correcting a stale doc
comment) all trace directly to R89's post-brief ruling or to reconciling
two disagreeing sections of the same brief, not to unauthorised invention.
The one gap — the mirror test not exercising `PullForMerge` classes — is a
minor coverage note, not a correctness defect, since that field is
legitimately asymmetric by direction. R90's do-not-touch behaviour is
correctly absent per R90's own sequencing instruction.

VERDICT: CLEAN
