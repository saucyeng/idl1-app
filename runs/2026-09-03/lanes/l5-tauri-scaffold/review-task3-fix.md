# Review — L5 Tauri Scaffold, Task 3 fix-up (addressing review-task3.md's two Important findings)

Commits reviewed:
- `idl-rs-worktrees/wave1-l5-tauri` `65f4fa1` — new watcher test
  (`self_write_followed_by_a_different_external_edit_within_the_ttl_window_still_fires_callback`)
- `idl1-app-worktrees/wave1-l5-tauri` `ea6fa58` — C4 §8 item 7 (documents the
  `check_and_consume` TTL-vs-consume-on-match deviation) + rust submodule
  pointer bump to `65f4fa1`

## Test commands run and results

```
cd idl-rs-worktrees/wave1-l5-tauri
cargo test -p idl-rs-tauri watcher   → 3 passed; 0 failed  (reproduced)
cargo test -p idl-rs-tauri           → 11 passed; 0 failed (reproduced, doc-tests: 0 passed, 1 ignored)
```
Both match the fix-up's claimed counts exactly.

## Finding 1 (Important, original review): missing C4 contract note — now fixed

`docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md` §8 gained item 7,
placed after the existing items 1–6 with identical structure: numbered, bold
title with section back-reference (§4), a stated default ("keep the entry
live until TTL rather than consuming on first match"), the Windows
Create+Modify duplicate-event rationale, the hash-equality safety argument
(verbatim consistent with the code's doc comment and the original review's
own "worked through" analysis), an explicit ask for lead confirmation, and an
`— *Owner: lead.*` tag matching every other item in the section. This is a
properly-formatted contract-level note, not a passing mention — finding 1 is
resolved.

## Finding 2 (Important, original review): missing regression test — now fixed

`tauri/src/watcher.rs` gained
`self_write_followed_by_a_different_external_edit_within_the_ttl_window_still_fires_callback`,
matching the original review's suggested fix almost exactly: registers a
self-write hash, performs the real self-write (suppressed), then performs a
second real `std::fs::write` with genuinely different content to the same
path while the first entry is still live (well inside the 5 s TTL), and
asserts the callback fires with the new path. Arrange/Act/Assert sectioned
with blank lines, real filesystem + real `notify` events (not a mocked
`check_and_consume` call), 1000 ms timeout comfortably above the 100 ms
debounce. This is a genuine end-to-end exercise of the exact scenario the
deviation's safety argument depends on.

**Plausibility of the implementer's "verified non-trivial by loosening the
hash check" claim:** spot-checked from the diff rather than by editing
source (out of scope for this review). Tracing `check_and_consume`
(`watcher.rs:45-53`): if the equality gate `expected == actual_sha256_hex` on
line 52 were loosened to "any live, non-expired entry matches regardless of
hash" (the natural way to describe "loosening the hash-equality check"), then
the second write's events would also match the still-live entry (registered
at `self_content`'s hash, not yet TTL-expired) and be suppressed — no
`pending` insert, no debounce thread, no callback — so
`rx.recv_timeout(...).expect(...)` would panic on timeout and the test would
fail. This traces through cleanly: the claim is plausible and consistent
with the code as shown, and the test is not tautological — it depends on the
real hash comparison, not just on entry presence/TTL. The two original tests
(`external_write...`, `self_write_with_pre_registered_hash...`) would *not*
have caught this regression, since neither exercises "different content
while a matched entry lingers" — this is exactly the gap flagged in the
original review.

## Other checks

- **AI attribution trailers:** none found in `65f4fa1` or `ea6fa58` (`git log
  -s --format=%B | grep -i` for co-authored-by/generated-with/claude —
  no matches in either).
- **`cargo fmt`:** not run on either commit's changes. `cargo fmt -- --check`
  in the `idl-rs` worktree still shows only pre-existing diffs elsewhere in
  the tree (e.g. `cli/src/envelope.rs`), none touching `watcher.rs` —
  consistent with CLAUDE.md §7's "match style by hand," not a regression.
- **Shared checkouts clean and on `main`:** `idl-rs` shared checkout
  (`C:\...\saucyeng\idl-rs`) — `git status --short` empty, 0 lines, on
  `main` (behind origin by 16, expected/unpushed). `idl1-app` shared
  checkout — on `main` (ahead 14, expected/unpushed), only the same
  pre-existing cosmetic `app/src-tauri/Cargo.toml` LF→CRLF non-diff already
  flagged as unrelated in the original review (confirmed again here via
  `git diff`: warning-only, no content change) plus untracked review
  artifacts from other lanes' reviews. Neither shared checkout was touched
  by this fix-up.
- **Minor findings from the original review (naming of `check_and_consume`,
  the Cargo.toml line-ending artifact):** out of scope for this fix-up,
  which was scoped to the two Important findings only — correctly left
  untouched; no scope creep, no new findings introduced by the fix-up itself.

## Findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| — | — | No new findings. Both Important findings from `review-task3.md` are resolved as specified, with no regressions or scope creep introduced. | — |

## Verdict

Both Important findings from `review-task3.md` are fully addressed:
finding 1 (contract note) via a properly-formatted C4 §8 item 7 matching the
section's existing convention; finding 2 (regression test) via a real,
non-tautological end-to-end test that would fail under the claimed
loosened-equality mutation. Test counts reproduce exactly as claimed (3/3
watcher, 11/11 full crate). No AI attribution trailers, no `cargo fmt`, both
shared checkouts clean and on `main` with only pre-existing, unrelated
artifacts.

Task 3, including this fix-up, is **fully closed**. The two remaining Minor
findings from the original review (rename `check_and_consume`; the
Cargo.toml line-ending non-issue) were correctly out of scope for this
fix-up and do not block closure.
