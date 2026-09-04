# Review: Task 10 fix-up — sharded blob path (C4 §2)

Worktree reviewed: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l5-tauri` @ `68d63d3` (on top of `dc5388a`), branch `wave1-l5-tauri`. File under review: `tauri/src/commands/device.rs`.

## Test command run and result

- `cargo test -p idl-rs-tauri` (run from the worktree root, which is itself the `rust/` workspace): **26 passed, 0 failed, 0 ignored**. This includes `watcher::tests::self_write_with_pre_registered_hash_never_fires_callback`, which passed on this run — no regression beyond the already-tracked, separately-scoped flakiness in `runs/2026-09-03/decisions.md` (not re-litigated here).

## Spec compliance — the Critical finding from `review-task10.md`

C4 §2 ("Path patterns, fixed") reads: `blobs/sha256/<first 2 hex of the digest>/<remaining 62 hex>`, split 2+62, lowercase hex.

`download_via` (device.rs:227–232) now does:

```rust
let blob_dir = data_dir.join("blobs/sha256").join(&sha256[..2]);
std::fs::create_dir_all(&blob_dir)...
let blob_path = blob_dir.join(&sha256[2..]);
```

`sha256_hex` (device.rs:115–120) uses `hex::encode`, which is lowercase — matches C4 §2's `[0-9a-f]{64}` requirement. This is a correct, exact match to the spec's split: **verified by reading the code**, not inferred from the commit message. No other blob-write site exists in `tauri/src` (checked via grep across `tauri/src` for `blobs/sha256`/`blob_dir`/`blob_path`) — `paths.rs` only creates the `blobs/sha256` parent directory at startup, doesn't write blob files.

## TODO(idl0) presence

Present, correct form, at device.rs:184–188, directly above `download_via`, noting the duplication of L1's not-yet-merged `idl_rs::store::blob` writer and the intent to replace this hand-rolled split once L1 lands. Matches CLAUDE.md §5's required form (`// TODO(idl0):`, not bare `// TODO`).

## New test — does it prove the right thing?

`download_via_shards_the_blob_path_by_the_first_two_hex_chars_of_the_digest` (device.rs:650–673):

- Arranges content by brute-force search for a counter value whose SHA-256 digest starts with `ab` (not hand-picked/hardcoded to dodge a bug), then asserts `expected_hash.starts_with("ab")` before proceeding — a genuine, non-trivial fixture.
- Asserts `result.path` equals `data_dir/blobs/sha256/ab/<62 remaining chars>` exactly, and that the file exists at that path with the right content. This proves the *specific* sharded path, not merely "download succeeded with no error."
- The pre-existing `download_via_writes_blob_and_returns_matching_hash_and_size` test (device.rs:600–648) was updated in the same commit to assert the sharded path AND to explicitly assert the flat (unsharded) path does **not** exist (line 643–646) — this is a good belt-and-suspenders addition; it rules out "the file happens to also be reachable via the old flat path" as a silent leftover bug.
- `download_via_redownloading_identical_content_is_a_no_op_second_write` (654 in file terms, 677–700) and `download_via_unknown_file_name_errors_not_found_before_any_write` (702–715) were left correctly untouched/still consistent — the former reads back via `second.path` (not a hardcoded path), the latter asserts the top-level `blobs/sha256` dir doesn't exist when no write should have happened. Neither hardcodes the flat convention.

Both tests are named `thing — condition — expected` in the repo's snake_case convention and both follow Arrange/Act/Assert with blank lines between (checked device.rs:600–620, 651–673).

## Repo hygiene

- No AI attribution trailer in the commit (`git show 68d63d3 -s` — author `isaacallen73 <isaacallen73@gmail.com>`, body ends after the test description, no `Co-Authored-By`).
- No `cargo fmt` reformatting: diff is a minimal, hand-styled patch consistent with the surrounding code's manual line-wrapping (e.g., the doc-comment rewrap at lines 172–188 is prose-wrapped by hand, not rustfmt's mechanical wrapping; the long single-line test assertions like device.rs:640 match the file's pre-existing style of not wrapping `assert_eq!`/method-chain lines).
- Shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` (the git submodule) is clean and on `main` (`git -C rust status` → "nothing to commit, working tree clean").
- `idl1-app` itself still shows the same pre-existing, content-empty CRLF/LF-only diff on `app/src-tauri/Cargo.toml` already noted and dismissed as unrelated in `review-task10.md` — unchanged by this fix-up, Task 10's file list never touches it.

## Findings

None. No Critical, Important, or Minor findings against this fix-up itself.

(For completeness, not new findings: `review-task10.md`'s two pre-existing Minor findings — unpinned `uuid = "1"` version and C3 §3.8's `wifi` error-kind being currently unreachable — were out of scope for this fix-up, which touched only the blob-path bug, and remain open as previously logged. They do not block closing Task 10's Critical finding.)
