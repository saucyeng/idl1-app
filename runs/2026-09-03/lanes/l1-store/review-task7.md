# Review: Task 7 — `store/atomic.rs` (C4 §4), wave1-l1-store

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store`,
branch `wave1-l1-store`, commit `7c7d1b7` on top of `df80120`.

**Test command run:**
```
cd C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store
cargo test -p idl-rs store::atomic 2>&1 | tail -40
```
**Result:** 4 passed; 0 failed (matches plan's expected "all 4 tests ok").
`cargo build -p idl-rs` also clean, no warnings surfaced in output.

Additionally confirmed: `core/src/store/atomic.rs` is byte-for-byte identical
(`diff` empty) to the code block the plan prescribes in Task 7 Step 2 — the
implementer transcribed the plan's code verbatim rather than deviating from it.

---

## Findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| Important | `core/src/store/atomic.rs:59-74` (doc comment), and absent anywhere in the plan's later store tasks (checked `write_session_json`, `write_derived_parquet`, `write_track` — all just `write_atomic(...)?`) | C4 §4 step 4 requires the optimistic-concurrency race to be handled with **retry bounded at 3 attempts before surfacing an error**. `write_atomic` deliberately performs zero retries itself (reasonable — it has no callback to re-derive `bytes`), and says so in its doc comment, delegating the 3-attempt loop to "the caller." But no caller introduced anywhere in this plan (session_json, derived, track writers) implements that loop — each one simply propagates `RenameConflict` via `?` on the very first collision. As it stands, a real external-edit race surfaces an error to the user on attempt 1, not after 3 retries as the contract requires, and there is no `// TODO(idl0):` marking this as deferred/unimplemented. This may be intentionally out of scope for wave 1 (like the expected-hash-set is explicitly scoped to L5/L11 in this task's own scope note), but unlike that case, nothing in the plan says so for the 3-attempt retry — it's simply promised in a doc comment and never delivered. | Either add a `// TODO(idl0):` on `write_session_json`/`write_derived_parquet`/`write_track` marking the retry loop as not-yet-implemented, or (better) confirm with the lead whether a later task owns it and cite that task number in the doc comment instead of stating it as already-covered caller behavior. |
| Important | `core/src/store/atomic.rs:127-148` (`rename_with_retry`) — no test | The Windows sharing-violation rename-retry path is real, non-stub code (`std::fs::rename` retried up to 5×, ~50 ms backoff, matching C4 §4) and runs unconditionally on this platform, but none of the 4 tests exercise it — no test opens `target` with a share mode lacking `FILE_SHARE_DELETE` (e.g. via `std::fs::OpenOptions` without delete-sharing, or a `File` kept open across the call) to force at least one `ERROR_SHARING_VIOLATION` and confirm retry-then-succeed (and, separately, retry-then-fail-after-5). This is the one C4 §4 §4-step-5 behavior this task explicitly calls out as needing to be "real, exercised code, not a stub" on Windows, and it is real but not exercised. | Add a Windows-only (or platform-generic, using a held-open file handle) test that holds `target` open in a way that causes the first 1-2 renames to fail, then releases it, asserting `write_atomic` still succeeds — and ideally a second test asserting failure after 5 exhausted attempts (e.g. via a mock/seam, or accept as a known gap and note it explicitly). |
| Minor | `core/src/store/atomic.rs:31-34` (`AtomicWriteError`) | `pub kind` and `pub message` fields have no individual doc comments, only the struct-level one. CLAUDE.md §5 says "doc comment on every public symbol." | Not unique to this task — `config.rs::ConfigError` and `math/error.rs::MathEvalError` follow the same undocumented-fields pattern, so this matches existing repo convention rather than introducing a new one; low priority, but a field doc line on `kind`/`message` (as `session/seam_correction.rs::ImportWarning` already does) would close the gap. | Add one-line doc comments to `kind` and `message`, matching `ImportWarning`'s style, in a follow-up sweep rather than blocking this task. |

## Confirmed correct / non-findings (explicitly checked per review brief)

- **Step ordering vs. C4 §4:** Steps 1 (uuid + write tmp), 2 (fsync tmp fd), 5
  (rename with Windows retry), 6 (POSIX parent fsync, `#[cfg(unix)]` /
  `#[cfg(not(unix))]` no-op split matching the spec's "Windows does not need —
  or expose — an equivalent") are all present and in the correct order.
  Step 3 (expected-hash-set insert-before-rename, the "load-bearing ordering"
  note) is **not present at all** — this matches the plan's own scope note
  (Task 7 interfaces section): C4 §4's expected-hash-set/watcher machinery is
  explicitly scoped to `<data>/workbooks` only, owned by L5/L11, not this
  primitive. Confirmed this is a deliberate, documented scope decision, not an
  oversight — no finding.
- **5-second TTL on expected-hash-set entries:** not implemented, and correctly
  so per the same scope note above — the whole expected-hash-set (of which the
  TTL is a property) is out of scope for this file. No finding.
- **Optimistic-concurrency abort-and-error behavior:** re-reads `target`'s
  *current* on-disk hash (not a cached value) at rename time, compares against
  `based_on_hash`, discards `tmp/<uuid>` and returns `RenameConflict` on
  mismatch, leaves `target` untouched — verified both by code inspection and
  test `write_atomic_stale_based_on_hash_is_a_rename_conflict_and_leaves_target_untouched`,
  which asserts the target still holds the external writer's bytes after the
  conflicting write is rejected. The bounded-3-attempts *retry* itself is the
  Important finding above, not the detection/abort logic, which is correct.
- **`store/mod.rs` alphabetical claim:** the implementer's note that
  `pub mod store;` was placed in true alphabetical order (after `statistics`,
  before `table`) despite the plan's literal instruction saying "after
  `spectrogram`, before `statistics`" is correct — `lib.rs`'s full `pub mod`
  list (`calibration, chart_decimation, clip_reconstruct, config, estimate,
  export, fft, filters, gps, histogram, integration, laps, math, parse,
  rotation, scatter, session, spectrogram, statistics, store, table,
  track_artifact, track_projection, tracks, variance, workbook`) is genuinely
  alphabetically sorted end-to-end, and "statistics" < "store" lexicographically
  (`stat...` < `stor...`), so the plan's own inline instruction was the one
  that was wrong; the implementer's deviation from the plan's literal text is
  the spec-compliant reading. No finding.
- **No AI attribution trailer** in commit `7c7d1b7` ("store: atomic-write
  primitive (C4 §4)"). Confirmed clean.
- **No `cargo fmt` reformatting**: commit touches only `lib.rs` (+1 line) and
  the two new `store/` files; no pre-existing file shows unrelated formatting
  churn.
- **Test naming convention:** all 4 test names read as
  `write_atomic_<condition>_<expected>` — reasonably close to the mandated
  `thing — condition — result` shape in spirit (Rust test names can't contain
  em dashes as idiomatic identifiers; snake_case concatenation is the accepted
  local convention elsewhere in this crate). Arrange/Act/Assert with blank
  lines between sections present in all 4. No finding.
- **Shared checkout** `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  confirmed still on `main`, `git status` clean, untouched by this review.
- **Layer discipline (CLAUDE.md §2):** `core/src/store/atomic.rs` uses only
  `std::fs`, `std::path`, `std::time`, `sha2`, `uuid` — no Tauri, no async
  runtime, no network. Correct for the `core` (`idl-rs`) layer.
- **Typed errors (CLAUDE.md §5):** `AtomicWriteError { kind, message }` with a
  `Copy` discriminant enum, never `Err(String)`. Correct.
