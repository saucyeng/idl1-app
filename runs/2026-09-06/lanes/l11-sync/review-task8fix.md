# Re-review — L11 Task 8 security fix (review-task8's Critical, R100 + amendment)

**Commits reviewed:** idl-rs `94f4531` ("transport+core: sync id
path-traversal fix -- shared id validator + safe_join, body cap, range
overflow (L11 Task 8 review-task8/R100)") on `l11-sync`
(`C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\l11-sync`, on top
of `5132d68`); idl1-app `f2a069e` ("docs: CHANGELOG entry for L11 Task 8 and
its review-task8/R100 path-safety fix") in
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\l11-sync`.

**Files touched (idl-rs):** `core/src/store/sync/apply.rs`,
`core/src/store/sync/ids.rs` (new), `core/src/store/sync/mod.rs`,
`transport/src/sync/range.rs`, `transport/src/sync/server.rs`. All on the
finding's scope; nothing unrelated changed. `Cargo.lock` untouched by this
commit (confirmed via `git show --stat`), consistent with the claim.
**Files touched (idl1-app):** `CHANGELOG.md` only.

**Test command:** none run — Rust lane, cargo forbidden for reviewers;
verified statically by reading the code and counting `#[test]`/
`#[tokio::test]` functions, and by reading `core/src/track_artifact/write.rs`
and `core/src/store/profile.rs` to test the implementer's "already validated
before it reaches them" claim.

- `core/src/store/sync/{apply,ids}.rs` + `base_cache.rs`, `diff.rs`,
  `manifest.rs`, `session_merge.rs` (all under `store::sync::`, all reachable
  by the `store::sync::` filter): `16+6+17+15+14+0+5 = 73` `#[test]` fns —
  **matches** the reported `store::sync:: 73 passed` exactly.
- `transport/src/sync/{server,range,pairing,discovery}.rs` (all reachable by
  the `sync::` filter): `server.rs` 18 (14 pre-existing + 4 new, matching
  `review-task8`'s 14 baseline), `range.rs` 10 (8 + 2 new), `pairing.rs` 11
  (unchanged), `discovery.rs` 7 (6 `#[test]` + 1 `#[ignore]`d
  `#[tokio::test]`) = **46 total, 45 non-ignored, 1 ignored** by direct
  count. Reported: `sync:: 44 passed + 1 ignored` — **one test short** of
  what is present in source (see Minor finding below; every individual new
  test read cleanly, so this reads as a stale/miscounted report line, not a
  masked failure, but it should be corrected or re-run and logged per the
  count-verification rule).

**Adversarial path-construction audit (every `.join(`/`format!` with an id,
in both crates):**

| Site | Class | Guarded by |
|---|---|---|
| `server.rs` GET/PUT track, profile, workbook | `IdClass::Uuid` | `is_valid_id` + `safe_join`, `404` on either failing |
| `server.rs` GET/PUT session `data.parquet`/`session.json`/`derived` | `IdClass::Session` | `is_valid_id` + `safe_join`, `404` |
| `server.rs` GET/PUT `blob`, GET `derived/<hash>.parquet` (hash half) | 64-hex | `is_valid_hash` (unchanged, already safe per original review) |
| `apply.rs` `install_derived`/`install_data_parquet`/`install_session_json` | `IdClass::Session` | `validated_id` + `joined_or_err` |
| `apply.rs` `install_workbook`/`install_track`/`install_profile` (id half) | `IdClass::Uuid` | `validated_id` + `joined_or_err` |
| `apply.rs` `install_workbook`'s `file_name`/`target_file_name` (display-name half, not id-shaped) | free text | `joined_or_err` only (documented as the sole defence, correctly — see below) |
| `apply.rs` `install_blob` | content-addressed sha256 computed locally from bytes | never peer-supplied as a string, safe by construction (unchanged) |
| `apply.rs` `read_data_parquet_versions_from_bytes` tmp scratch file | server-generated `Uuid::new_v4()` | not peer-supplied |

No path-construction site consumes a peer-supplied id without a shape check
and/or `safe_join` ahead of it. The Critical from `review-task8` (Windows
drive-relative `C:evil` discarding the base path via `PathBuf::join`) is
closed by the allow-list character set alone (`:` is not in
`[0-9a-f-]`), independent of `safe_join`; `safe_join` is verified (by its
own unit tests, read directly, and by hand-tracing `PathBuf::push`'s
prefix-replaces-the-buffer semantics against `normalize_lexically`) to
independently catch the same class even for a hypothetical unchecked
caller. New regression tests hit the two routes `review-task8` named
explicitly (`GET /track/C:evil` → `404`; `PUT /workbook/C:evil` on a
brand-new workbook → `404`, nothing written) and both assert on-disk state,
not just status.

**Hostile-shape checklist (§2 of the dispatch):** `C:evil`/`c:evil`
(colon rejected by charset), `\\?\C:\x` (backslash/question-mark rejected,
also directly tested), `\\server\share` (backslash rejected), `..`/`.`
(rejected — `.` is not in the hex-or-dash charset either, and is also
directly tested for the session shape), `..%2f` (axum decodes the path
segment before the handler sees it, so this is indistinguishable from a
literal `../`, i.e. still rejected by the charset), a UUID with a trailing
dot/space (rejected — the exact-length checks and the closed charset both
exclude `.`/space; Windows trimming can't make `x.`/`x ` reach a different
file than `x` because `x.`/`x ` fail the shape check and never reach a
`Path` at all), case-only difference (uppercase hex is explicitly rejected,
tested for both classes, so no lowercase/uppercase aliasing on a
case-insensitive filesystem is possible), 16-hex vs 64-hex session ids (both
accepted, matches the two id-producing paths in IDL0_SPEC/C4, both tested),
unicode look-alikes (impossible — the charset is `[0-9a-f-]` only, `ASCII`
checked first), embedded NUL (impossible — not in the hex/dash charset,
also excluded by the `is_ascii()`/per-byte check). All confirmed by reading
`ids.rs`'s `is_uuid_shape`/`is_session_shape` byte-by-byte, not by
running anything.

**`safe_join`'s post-join guard (§3 of the dispatch):** it does **not**
canonicalise against the real filesystem — it lexically normalises `.`/`..`
components on both the joined path and `data_root` and compares with
`starts_with`, explicitly because the join target (a brand-new workbook,
track, etc.) may not exist yet and `Path::canonicalize` fails on a missing
path on Windows. This is a real, reasoned engineering trade-off (and closes
the specific Critical this fix targets — confirmed by hand-tracing
`PathBuf::push`'s "a component with a prefix replaces the whole buffer"
behaviour through `normalize_lexically`, and by the direct unit tests), but
it is **not** what R100's ruling text literally says ("assert the
*canonicalised* result is still inside `data_root`") and it does **not**
defend against a symlink or junction planted **inside** `data_root` — e.g.
`data_root/tracks` replaced by a junction pointing elsewhere would still
lexically normalise to a path starting with `data_root` and pass. Exploiting
that requires an attacker who already has local filesystem write access to
`data_root` before any sync traffic occurs, which is a materially different
(and already-fatal on its own) threat model from "a paired remote peer
sending a hostile id" — the actual escape this fix closes. Flagged below as
Important: not a live remote escape, but a real gap against the ruling's
literal wording that should get an explicit lead ruling (accept the lexical
approach given the pre-existing-file constraint, or require a
canonicalize-the-parent-directory fallback) rather than stand implicitly.

**Body caps (§4):** two named constants, `MAX_DOCUMENT_BODY_BYTES` (16 MiB,
`session.json`/workbook/track/profile) and `MAX_RAW_FILE_BODY_BYTES` (512
MiB, `blob`/`derived`/`data.parquet`), each documented with its class and
sizing rationale (the 512 MiB figure is checked against IDL0_SPEC's ~200 MB
SD-card threshold, cited in the doc comment). `read_body` now distinguishes
`axum`'s length-limit error (`413`) from any other body-read failure
(`400`), matched by string rather than a new direct dependency, with the
reasoning given inline. Two new tests, one per tier
(`session_json_put_over_the_document_body_cap_is_413_and_nothing_is_written`,
`blob_put_over_the_raw_file_body_cap_is_413_and_nothing_is_written`), each
one byte over its cap, each asserting `413` **and** that nothing was
written to disk — matches the amendment exactly.

**Range overflow (§5):** `parse_range_number` now classifies a `u64`
`PosOverflow` as `Unsatisfiable` (→ `416`) and any other parse failure as
`Malformed` (→ `400`), applied to `start`, `end`, and the suffix-length
field. New tests use the dispatch's own example
(`bytes=0-99999999999999999999`) plus the suffix-length equivalent
(`bytes=-99999999999999999999`), both asserting `RangeErrorKind::Unsatisfiable`.
Fully closes the prior Minor.

**19 test-fixture id changes in `apply.rs` (§6):** read the diff directly,
not the summary. Every change is a like-for-like swap of an old
non-shape-conforming fixture id (`"s1"`, `"t-1"`) for a shape-conforming one
(`"0123456789abcdef"` for session ids, a real UUID constant `TRACK_ID` for
track ids) so the fixture still reaches the code under test instead of being
rejected by the new validator before the behaviour being asserted ever runs.
No assertion was weakened, removed, or had its expected value changed —
every `assert_eq!`/`assert!` in the diff keeps the same shape, just with the
new id substituted consistently on both the write side and the read-back
path in the same test.

**Errors, panics, unwraps, style (§7):** `validated_id`/`joined_or_err`
return typed `SyncError { kind: Malformed, .. }`, never `Err(String)`;
`is_valid_id`/`safe_join`/the shape checks contain no `unwrap()`/`expect()`
on peer data (confirmed by reading `ids.rs` end to end — the only
`unwrap()`s in the whole diff are in test code building fixtures). Route
handlers answer `404` (never `403`) on every shape/`safe_join` rejection —
confirmed for all eight id-addressed routes in `server.rs`. Commit is a
single-line summary, no AI-attribution trailer. Hand style (line length,
brace placement, doc-comment density) matches the rest of both crates; no
reformatting of untouched lines detected in either diff. `CHANGELOG.md`
entry (`f2a069e`) is accurate against the code — it correctly describes the
Critical, the fix mechanism, both cap constants and their sizing rationale,
and the range-overflow reclassification; it does not overclaim exact test
counts (defers to "this task's own commit"), which is honest given the
count mismatch noted above.

**Claim tested — "the implementer's own validators (`track_artifact::write`,
`store::profile`) were left untouched because the value is validated before
it reaches them":** True for the sync/peer surface specifically.
`track_artifact::write::validate_track_id` (unchanged, still only a
deny-list rejecting `/`, `\`, `..` — it does **not** reject a
colon-prefixed drive-relative id, i.e. it still has the exact same
Windows-drive-relative weakness `review-task8` found, on its own) and
`store::profile::save` (unchanged, has **no** id validation at all,
constructs `profiles_dir(data_root).join(format!("{}.idl0p",
profile.profile_id))` directly). But the only caller of either with
peer-controlled data is `apply.rs`'s `install_track`/`install_profile`,
both of which now call `validated_id(..., IdClass::Uuid, ...)` on `peer.id`/
`peer.profile_id` **before** calling `write_track`/`profile::save` — so the
untrusted value is provably shape-checked ahead of the weak internal
validator on the only path an attacker can reach. Grepped every other
caller of `write_track`/`delete_track`/`profile::save`/`profile::delete`
across the workspace: the rest are test fixtures or local-trust Tauri
commands (`app.rs`, `catalog.rs`, driven by the app's own user, not a synced
peer) — a different trust boundary, out of this fix's scope, and not
something `review-task8` covered.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | (process, not a line) — `runs/2026-09-03/decisions.md` R100 text: "folded into the same fix: ... the lane's full-suite run that the brief required" | No `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` result is recorded anywhere after this fix commit (`94f4531`, 2026-09-07 08:59) in `decisions.md` — the ledger's last full-suite entry is from an unrelated L2b lane. R100 explicitly named this as part of the same pass to close. | Run it (or confirm/cite it if already run and just not logged) before the lane's next gate, and add the result line to `decisions.md`. |
| Important | `core/src/store/sync/ids.rs:107-117` (`safe_join`'s doc comment and implementation) vs. R100's ruling text ("assert the *canonicalised* result is still inside `data_root`") | `safe_join` deliberately uses lexical normalisation, not real `Path::canonicalize`, because the join target may not exist yet (a defensible reason, and it does close the specific Critical this fix targets). But it therefore does **not** protect against a symlink or junction already planted inside `data_root` (e.g. `data_root/tracks` replaced by a junction) — a lexically-normalised path through such a junction still `starts_with(data_root)` and passes. This is a real deviation from the ruling's literal wording, silent (no lead ruling on record accepting the lexical-only approach). | Get an explicit lead ruling accepting the lexical-only guard given the pre-existing-file constraint (the threat model requires local write access to `data_root` first, which is already fatal on its own), or add a canonicalize-the-parent-directory fallback (the immediate parent, e.g. `data_root/tracks`, does always exist) and compare that against a canonicalised `data_root`. |
| Minor | `transport/src/sync/server.rs` test module — reported count vs. source | Direct count of `#[test]`/`#[tokio::test]` under `transport/src/sync/{server,range,pairing,discovery}.rs` is 46 (45 non-ignored + 1 `#[ignore]`), one more than the reported `sync:: 44 passed + 1 ignored` (45 total). Every individual new test reads correctly and asserts what it claims, so this looks like a stale/miscounted report line rather than a masked failure, but CLAUDE.md §8's "each run must report a non-zero passed count" implies the count itself should be trustworthy. | Re-run the `sync::` filter and log the corrected count, or explain the one-test discrepancy if it is intentional (e.g. a filter substring mismatch). |
| Minor | `core/src/store/sync/apply.rs:117-126` (`validated_id`/`joined_or_err`'s HTTP-status implication) | R100 says a path-safety rejection should answer `404`, never `403`, "so nothing leaks." `server.rs`'s own pre-checks do answer `404` for every route today, but `apply.rs`'s independent `validated_id`/`joined_or_err` failures surface through `install_response` as `422 Unprocessable Entity` with `e.message` echoed to the caller (unchanged pre-existing mapping) — a status/behaviour mismatch with the ruling's wording, currently unreachable via the HTTP surface only because `server.rs` always checks first (confirmed: `install()` has exactly one caller, `server.rs`). | No action required unless a second caller of `install()` is ever added without its own pre-check; worth a one-line doc comment on `install_response` noting the `422` path assumes the caller (currently only `server.rs`) has already enforced id-shape/`404` upstream. |

**Verdict rationale.** The Critical from `review-task8` is closed: the
allow-list character set alone eliminates the Windows drive-relative
escape, `safe_join` is a genuinely independent second layer verified by its
own unit tests and by hand-tracing `PathBuf::push`'s prefix-replacement
semantics, and both HTTP surfaces `review-task8` named explicitly (GET
`/track/C:evil`, PUT `/workbook/C:evil` on a brand-new workbook) now have
direct regression tests asserting `404` and no file touched. Every
id-addressed path-construction site in both crates is now either guarded by
the shared validator or, for the one free-text exception
(`install_workbook`'s display-name-derived file name), correctly relies on
`safe_join` alone by design. Both Important findings from `review-task8`
(unbounded body, range overflow) are also fully and correctly closed per
the amendment, with tests that assert on-disk state, not just status codes.
The claim about `track_artifact::write`/`store::profile`'s own weak
validators being safe because the value is pre-validated holds up on
inspection. What remains outstanding is process, not security: the lane's
full-suite run required by R100 is not logged, `safe_join`'s
lexical-not-canonical approach is a reasonable but silent deviation from the
ruling's literal wording that deserves an explicit ruling rather than
standing implicitly, and the reported `sync::` test count is one short of
what is actually present in source. None of these three items reopens the
remote read/write escape the fix was written to close.

VERDICT: NEEDS_FIXES (2 Important, 2 Minor — none of them the security
escape itself, which is closed)
