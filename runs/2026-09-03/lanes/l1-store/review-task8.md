# Review: Task 8 — `store/blob.rs` CAS blob store (C4 §2/§3)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store`
Branch: `wave1-l1-store`, commit `153eeab` (parent `40de92e`)
Files: new `core/src/store/blob.rs`, modified `core/src/store/mod.rs` (+`pub mod blob;`)

## Test command and result

```
cd C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store
cargo test -p idl-rs store::blob
```

```
running 5 tests
test store::blob::tests::blob_path_splits_digest_two_and_sixty_two ... ok
test store::blob::tests::write_blob_then_read_blob_round_trips_bytes ... ok
test store::blob::tests::write_blob_same_content_twice_is_a_no_op_same_digest ... ok
test store::blob::tests::blob_exists_reflects_presence ... ok
test store::blob::tests::verify_blob_detects_a_tampered_file ... ok

test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 602 filtered out
```

`cargo build -p idl-rs` also clean, no warnings.

## Spec compliance (C4 §2/§3/§4/§7)

- Blob path: `blob_path` = `data_root/blobs/sha256/<first 2 hex>/<remaining 62 hex>`,
  no extension — matches C4 §2 exactly (`&sha256_hex[0..2]` / `&sha256_hex[2..]`).
- Second write of identical content: `write_blob` checks `path.is_file()` before
  calling `write_atomic`, returns `Ok(digest)` without touching the filesystem —
  matches C4 §4 "a second write to the same hash is a verified no-op, skip rather
  than overwrite" and the plan's own annotation that this needs no retry logic
  (content-addressing makes same-hash-implies-same-bytes, so no read-back is
  required on the fast path).
- `verify_blob` reads the blob at its own path, recomputes SHA-256, and returns
  `BlobStoreErrorKind::HashMismatch` if it disagrees with the path-encoded digest
  — matches C4 §7 finding #1 ("every `blobs/sha256/<a>/<b>` file's own SHA-256
  does not match its `<a><b>` path" → error). Test
  `verify_blob_detects_a_tampered_file` corrupts the on-disk bytes directly
  (bypassing `write_blob`) and asserts the `HashMismatch` kind — this genuinely
  exercises tamper detection, not just a round-trip.
- Uses Task 7's plain `write_atomic` (not `write_atomic_with_retry`), with
  `based_on_hash: None` since the path is known not to exist at call time (just
  checked via `is_file()`) — correct per C4 §4's own scoping (blob writes have
  no conflict-retry scenario; the app serializes writes per path per §4, and a
  blob path, once it exists, is never rewritten).
- `blob_exists` is a thin existence check (`is_file()`), consistent with its
  interface contract ("does not check the file exists" is `blob_path`'s note,
  correctly distinguished from `blob_exists`'s own docstring).

No scope creep: no extra public functions, no unrequested CLI/IPC surface.

## Test quality

All 5 tests are Arrange/Act/Assert (blank-line separated) and named
`thing — condition — result` per CLAUDE.md §4:
- `blob_path_splits_digest_two_and_sixty_two` — pure function, checks the
  literal path shape, no I/O.
- `blob_exists_reflects_presence` — false before write, true after.
- `write_blob_same_content_twice_is_a_no_op_same_digest` — same digest both
  calls, content intact after second call. (Does not independently assert the
  second call performs zero I/O / doesn't touch mtime, but the C4 requirement
  is behavioral equivalence — no observable overwrite — which this does check
  indirectly by re-reading the content. Not a defect.)
- `verify_blob_detects_a_tampered_file` — genuinely tampers bytes on disk
  outside `write_blob`, exercises the hash-mismatch path for real.
- `write_blob_then_read_blob_round_trips_bytes` — round-trip, plus digest
  length sanity (64 hex chars).

All test what the module owns (path construction, no-op semantics, tamper
detection) — no assertions on `sha2`/std::fs internals.

## CLAUDE.md standing orders

- Doc comment present on every public item (`BlobStoreErrorKind`,
  `BlobStoreError`, `blob_path`, `blob_exists`, `write_blob`, `read_blob`,
  `verify_blob`).
- Errors are typed (`BlobStoreError { kind, message }`), never `Err(String)`;
  `AtomicWriteError` is converted via `From`, consistent with the rest of the
  store module.
- No numeric values requiring units in this file.
- No `// TODO` of any form present (none needed).
- No AI attribution trailer on commit `153eeab` (verified via `git show`).
- No `cargo fmt` reformatting — diff is a clean addition, no unrelated
  formatting churn.
- Shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` is
  clean and on `main` (verified via `git status` / `git branch --show-current`).

## Code quality

No findings that would change a maintainer's decision. One note, not a
finding: `blob_path`'s parameter is named `sha256_hex: &str`, shadowing the
imported free function `crate::store::atomic::sha256_hex`; `write_blob` and
`verify_blob` correctly disambiguate by calling the fully-qualified
`crate::store::atomic::sha256_hex(...)` where needed, and the crate builds
clean with no warnings — this is the interface signature the plan itself
specifies verbatim, so it is not a deviation.

## Findings table

| Severity | File:line | Finding | Fix |
|---|---|---|---|
| — | — | No findings. | — |

## Verdict

CLEAN — implementation matches the plan's Task 8 draft verbatim, satisfies
C4 §2 (path shape), §3 (identity), §4 (blob no-retry no-op rule, correct use
of plain `write_atomic`), and §7 finding #1 (tamper detection); all 5 tests
pass, are well-named A/A/A, and genuinely exercise the behaviors claimed; no
CLAUDE.md violations; shared checkout untouched.
