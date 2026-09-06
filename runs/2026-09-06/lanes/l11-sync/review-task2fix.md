# Review — L11 Task 2 fix (ruling R90): core `store::sync::{manifest,diff}`

**Commits reviewed:**
- idl-rs `a3309a5` "core: sync manifest CAS-trust + skipped-entry reporting,
  plan_sync local-skip (L11 Task 2 fix, ruling R90)" on branch `l11-sync`
  (worktree `idl-rs-worktrees/l11-sync`, on top of `59e307e`) — files:
  `core/src/store/sync/diff.rs`, `core/src/store/sync/manifest.rs`, 481
  insertions / 71 deletions total. No other file touched; `Cargo.lock`/
  `Cargo.toml` untouched (confirmed by diff against the merge-base
  `52efba8`).
- idl1-app `dfcf58a` "docs: CHANGELOG for L11 Task 2 fix (ruling R90) —
  manifest skipped entries, plan_sync local-skip" (worktree
  `idl1-app-worktrees/l11-sync`) — `CHANGELOG.md` only.

**Test command:** none run — Rust lane, cargo forbidden for reviewers.
Verified statically: `manifest.rs` has 14 `#[test]` fns, `diff.rs` has 17,
total 31 — matches the implementer's reported `store::sync::` 31 passed.
Every test body traced by hand against the corresponding function; each
asserts what its name claims, Arrange/Act/Assert with blank lines. No
`pub` signature in `idl-rs-cli` or `idl-rs-tauri` calls `build_manifest`
or `plan_sync` (grepped the whole `rust/` tree, both worktrees) — the
signature changes (`build_manifest` now returns `(Manifest,
Vec<SkippedEntry>)`, `plan_sync` gains a third `local_skipped` parameter)
have no callers outside this module and its own tests, so the reported
clean `cargo check -p idl-rs-cli --tests` is consistent with the diff,
though not independently run.

## R90 compliance

**(1) CAS-trust, not re-hash.** `collect_blobs` now builds `sha256` from
the shard directory name plus file name (`manifest.rs:433-443`) instead of
reading and hashing file bytes; the derived-channel loop does the same
from the file's stem (`manifest.rs:496-510`). Tracks and profiles still
legitimately read and hash bytes, because their identity key
(`track_id`/`profile_id`) comes from parsed file *content*, not a
CAS-named path — that is not inconsistent with the ruling, which only
concerned CAS-named files. The new test
`build_manifest_a_blob_whose_bytes_were_tampered_still_lists_under_its_path_hash`
tampers a blob's bytes in place and asserts the manifest still reports the
original path hash and the tampered size — exactly the case the prior
review's Important finding described, and the doc comment on
`collect_blobs` (`manifest.rs:422-427`) states verify is where tampering
is caught, not this walk. Matches the ruling and the prior review
precisely.

**(2) Skipped entries, `(Manifest, Vec<SkippedEntry>)`.** `SkippedEntry
{ path, reason }` is a plain local struct — `Serialize`/`Deserialize` for
IPC convenience only, not a field of `Manifest`, so C4 §6's wire shape is
provably unchanged (the manifest JSON round-trip test is untouched by
this diff). Every malformed branch the ruling named is covered with its
own skip-push and its own test: `data.parquet` unparseable metadata
(`manifest.rs:484-490`, tested), `session.json` unreadable/non-parsing —
now gated through `crate::store::session_json::parse_session_json`, not
just bytes-readable (`manifest.rs:519-531`, tested), workbook unreadable /
non-UTF-8 / front-matter-parse-failure (three separate skip pushes,
`manifest.rs:564-586`, front-matter case tested), track and profile
filename/id mismatch (newly added, addressing the prior review's Minor
#1, `manifest.rs:612-626` and `:669-677`, both tested). `build_manifest`'s
doc comment (`manifest.rs:369-375`) now states the omission is recorded,
not silent, matching the ruling's text exactly.

**`plan_sync(local, remote, local_skipped)`.** `apply_local_skips` in
`diff.rs` recognises the two path shapes ruling R90 names —
`sessions/<id>/session.json` and `workbooks/<file_name>.idl1wb` — retains
only actions that don't match a skipped item's class and key, and always
pushes a `SyncNoteReason::LocalFileSkipped { path, reason }` note. Three
new tests: a skipped local `session.json` with a good remote copy asserts
`plan.actions.is_empty()` and exactly one `LocalFileSkipped` note keyed by
`session_id` (this is the concrete bug the ruling exists to fix — without
`local_skipped` this scenario would previously plan a `Pull` that
overwrites the malformed local file); a skipped local workbook matched to
a remote `workbook_id` by `file_name`, same assertions keyed by
`workbook_id`; a skipped workbook with no matching peer entry anywhere,
falling back to `file_name` as the note's key, still asserted non-empty.
No push-side test exists, but by construction a skipped path is absent
from `local`'s manifest, so it can never source a Push action in the
first place — "no push may claim it" holds trivially, not by a specific
guard that could regress silently, but there is nothing to regress.
`SyncNoteReason`/`SyncPlan` are plain enums/structs with no
`Serialize`/`Deserialize` derive — this is core-internal wiring, not part
of any wire contract, so adding a variant is not a contract change and
needs no C3/C4 amendment.

## Other checks

- **Task 3's "duplicate `PathBuf` type"** — the dispatch names this as
  something to verify removed. Grepped `diff.rs` and `manifest.rs` for
  `PathBuf`; the only hit is a local test helper's return type
  (`fn temp_root() -> std::path::PathBuf`), not a duplicate type
  declaration. No duplicate `PathBuf` type found anywhere in the current
  diff or file state — either this was already resolved before this
  commit or the concern doesn't apply to what landed; nothing to flag.
- **`parse_session_json` / C1 additive rule.** `SessionJson` derives
  `Serialize, Deserialize` with no `#[serde(deny_unknown_fields)]`, and
  its optional fields carry `#[serde(default)]`. A `session.json` with
  unknown extra fields (e.g. written by a newer build) still parses under
  serde's default "ignore unknown fields" behaviour, so gating the
  manifest's inclusion of `session_json` on
  `parse_session_json(&bytes).is_ok()` (`manifest.rs:519`) does not reject
  an otherwise-valid file for having unrecognised additive fields —
  consistent with C1's additive rule.
- **Cargo.lock/Cargo.toml** — untouched (confirmed by diff against the
  merge-base).
- **Files touched** — only `manifest.rs` and `diff.rs` in the fix commit
  (plus their `#[cfg(test)]` blocks); `mod.rs` untouched by this commit
  (its `pub mod sync` wiring was already done in the base Task 2/3
  commits). No unrelated reformatting: every changed line traces to
  either a signature change propagated to a call site, a new skip-push
  branch, or a new/updated test.
- **CHANGELOG (`dfcf58a`)** — both the Task 2 and Task 3 bullets were
  rewritten to describe the fixed behaviour (CAS-trust, `SkippedEntry`,
  the three-argument `plan_sync`, the `LocalFileSkipped` note). Text
  checked against the actual diff; accurate, no overclaiming.
- **Doc comments / typed errors / hand style** — every new/changed public
  item keeps a doc comment; no `Err(String)`; no `unwrap()` outside test
  arrange code; single-line commit message, no AI attribution trailer;
  line style (width, `let ... else` idiom, comment placement) matches the
  surrounding hand-formatted code, not rustfmt output.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `manifest.rs:618-622`, `:670-673` | New comments cite "this task's review, Minor #1" by name instead of by ruling/ID — fine as a one-off breadcrumb, but if this convention spreads it will rot the moment review numbering is renumbered or the review doc moves. | No action needed now; if it recurs, prefer dropping the review self-reference from the comment text since there is no ruling number for this Minor (R90 only closed the two Majors). |

No Critical or Important findings. Both prior Important-severity gaps
(re-hashing CAS-named files, silent workbook/session.json omission) are
closed exactly as R90 specifies, with tests that reproduce the original
bug scenario and assert the fix. The prior review's two Minor findings
(track/profile fail-closed behaviour undocumented and untested; a doc
comment overstating a struct-visibility claim) were also both addressed,
though R90 didn't require it. `plan_sync`'s new parameter and
`LocalFileSkipped` note are core-internal (not `Serialize`), so no C3/C4
amendment is owed. Static verification (test count, logic tracing,
CAS/no-callers/Cargo.lock checks) found nothing that contradicts the
implementer's reported 31 passed / clean cli check.

**Verdict rationale.** The fix closes both R90 Majors precisely as ruled,
with dedicated tests reproducing each original failure mode; it also
folds in the unforced Minor fixes from the prior review. Nothing touches
files outside the two named modules, the wire contract is unchanged, and
CHANGELOG is accurate. The one Minor is a style breadcrumb, not a defect.

VERDICT: CLEAN
