# Review — L11 Task 6 fix: retry-with-rederive for `store::sync::apply`

**Commits reviewed:**
- idl-rs `02117eb` on `l11-sync` (worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\l11-sync`,
  on top of `5ecabdd`) — `core: sync apply — route workbook/session.json writes through
  write_atomic_with_retry (L11 review-task6)`.
- idl1-app `ebcef1b` (worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\l11-sync`) —
  `docs: CHANGELOG fix for L11 Task 6 review (retry-with-rederive)`.

**Files touched:** `core/src/store/sync/apply.rs` only (+342/-12), `CHANGELOG.md`. `git diff 5ecabdd
02117eb -- Cargo.lock` is empty; no `cli/` code references `sync::apply`, `sync::session_merge`, or
`render_workbook` (unchanged from review-task6), so `cargo check -p idl-rs-cli --tests` clean remains
plausible and low-risk even unverified.

**Test command:** none run — Rust lane, cargo forbidden for reviewers. Verified statically:
`apply.rs` has exactly 16 `#[test]` fns (10 from the original task plus 6 new: two workbook-write
race tests, two session.json-write race tests, one malformed-track test, one malformed-profile
test) — matches the implementer's claimed `store::sync::apply` **16, up from 10**. NUL-byte check
(`grep -cP '[\x00-\x08\x0B\x0C\x0E-\x1F]'`) is `0`.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `core/src/store/sync/apply.rs:257,271-274` (`install_session_json`) | On the C4 §4 retry path, `rederive_session_json_write` falls back to leaving `current` bytes untouched if `parse_session_json(current)` fails — silently dropping the peer's incoming change for that retry attempt, exactly the judgment call the review-task6 dispatch asked to trace. Unlike the parallel `rederive_workbook_write` fallback (which reports itself via a distinct `InstallOutcome::KeptLocal`, visible to the caller), this path has no outcome-tracking cell at all: `install_session_json` unconditionally returns `Ok(InstallOutcome::Installed)` regardless of whether the rederive succeeded or silently fell back. So the workbook class reports this edge case and the session.json class does not — an inconsistency, not addressed in the CHANGELOG. In practice the risk is low: `current` here is always a file `write_session_json`/this module itself last wrote via `serde_json`, so a parse failure on it is nearly unreachable (the doc comment says as much: "should not happen for a file this module itself last wrote") — this is not the primary race scenario, which is correctly handled and proven by the passing race test. | Track the rederive's fallback with the same pattern used for workbooks (a captured `Cell`/outcome flag) and surface it as a distinct `InstallOutcome` (or a documented "note" field) rather than always reporting `Installed`, for parity with the workbook path. |
| Minor | `core/src/store/sync/apply.rs` (whole file) | No `SyncNoteReason` or report-level mechanism exists anywhere in this module (or its report/CHANGELOG) to record when a rederive fallback occurred — the workbook path's `KeptLocal` outcome is the only signal, and it is overloaded with the pre-existing "peer was strictly older, kept local intentionally" meaning used elsewhere in this same file (track/profile LWW), so a caller cannot distinguish "normal LWW keep" from "malformed-current rederive fallback" by outcome alone. Not blocking — both are extreme edge cases — but worth naming for whoever eventually wires user-visible sync reporting (Task 10/12). | If/when a sync report UI is built, give the rederive-fallback case its own reason code distinct from ordinary `KeptLocal`. |

**Verdict rationale.** Both of review-task6's findings are correctly closed: all three write sites
(`install_workbook`'s two, `install_session_json`'s one) now go through `write_atomic_with_retry`
with a class-appropriate `rederive` closure that re-reads the current on-disk bytes and re-runs the
same merge (workbook per-cell merge against `base`/current-local/peer; session.json per-field merge
against current-local/peer) — not a stale local, matching C4 §4 step 4's mandate exactly, confirmed
by reading both `rederive_workbook_write` and `rederive_session_json_write` line by line. The race
test for each write site injects a real concurrent write via a `#[cfg(test)]`-only `thread_local!`
hook (`SYNC_RACE_HOOK`, confirmed by grep that every call site of the hook and its firing function is
`#[cfg(test)]`-gated — it cannot exist in release code) and asserts both the peer's and the racer's
changes survive in the re-merged result; the exhaustion test for each write site asserts a typed
`SyncErrorKind::Io` and that the file holds the last racer write, not a merge computed against stale
content — both pairs of tests genuinely exercise the described behaviour, not just call the function.
The previously-swallowed `remove_file` after a workbook rename is now a typed `SyncError` propagated
with `?`. Both new malformed-bytes tests (track, profile) assert `Malformed` and that no file/directory
entry was created. Test count (16, up from 10) reconciles exactly with the six new tests found by
inspection, and the CHANGELOG's description matches the landed code. On the dispatch's specific
judgment-call question — whether a rederive's parse-failure fallback silently drops the peer's
change — the workbook path answers "no" (a distinct `KeptLocal` outcome is reported) but the
session.json path answers "yes" (always reports `Installed`), an inconsistency the fix and its
CHANGELOG entry do not mention. This is real but narrow: it is an edge case on a file class this
module exclusively writes via its own serializer, not the primary race path (which is tested and
correct), so it does not rise to Major/blocking — it is a documentation/consistency gap, not a data-
loss bug in the scenario the dispatch was built to catch. No other issues found: only `apply.rs` (+
CHANGELOG) touched, `Cargo.lock` unchanged, hand style and doc-comment/unit/typed-error discipline
match the surrounding module.

VERDICT: FINDINGS (0 Critical, 0 Major, 2 Minor)
