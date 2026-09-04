# Review — L5 Tauri Scaffold, Task 3 (workbook file-watcher, C4 §4)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l5-tauri`
Branch: `wave1-l5-tauri`, commit `faea0f9`
Files reviewed: `tauri/src/watcher.rs`, `tauri/Cargo.toml`, `tauri/src/lib.rs`, app-repo `CHANGELOG.md` (uncommitted, matches Task 1 precedent).

## Test commands run and results

```
cd idl-rs-worktrees/wave1-l5-tauri
cargo test -p idl-rs-tauri watcher   → 2 passed; 0 failed  (reproduced)
cargo test -p idl-rs-tauri           → 10 passed; 0 failed (reproduced, doc-tests: 0 passed, 1 ignored)
```
Both match the plan's expectations exactly.

## The deviation, worked through

Plan's own pseudocode for `ExpectedHashSet::check_and_consume` removes the entry
on first match (mirroring C4 §4's literal text: "Hash present and matches → …
consume (remove) the entry"). The implementer changed this: `check_and_consume`
now only removes an entry lazily via TTL expiry, never on a matching check —
so a matched entry stays "live" (re-matchable) for up to the full 5 s TTL, not
just for the one event that first matched it. Documented in both the doc
comment (`watcher.rs:36-44`) and the commit message, with the stated reason:
`std::fs::write` on Windows fires `Create` then `Modify` for one logical
write, both carrying identical final-content bytes; consuming on first match
left the second duplicate event unmatched, misclassified as external, failing
the plan's own self-write-suppression test.

**Is the widened window a real correctness risk (false-negative suppression
of a genuine external edit)?** Worked through precisely:

- `check_and_consume` still requires an *exact* hash match
  (`expected == actual_sha256_hex`, watcher.rs:52) — it is not "any event
  within 5 s is suppressed," it is "any event within 5 s **whose content
  hash equals the app's own last registered write** is suppressed."
- A genuinely external *edit* — by definition, a change to the file's
  content — produces different bytes and therefore a different hash. It
  fails the equality check and is correctly classified as external
  regardless of how long the matched entry lingers. The debounce/re-parse
  path is unaffected by the TTL width for this, the overwhelmingly common,
  case.
- The only way an external write is misclassified is if its bytes are
  **exactly identical** to what the app itself just wrote. In that
  degenerate case there is no information to lose: re-parsing
  byte-identical content would diff to zero changed cells, so silently
  not re-parsing is observationally the same as re-parsing.
- This degenerate case is not new to the TTL-based version — the original
  consume-on-first-match design already suppressed the *first* event that
  matched the registered hash, whichever process produced it (the app's
  own OS-level duplicate delivery, or, in principle, a coincidental
  byte-identical external write racing it). What did change quantitatively
  is the *width* of that already-present exposure window: from
  "microseconds, until the first FS event is processed" to "up to 5
  seconds." Given the equality-check argument above, this widened window
  only matters for content-identical rewrites, which are not a data-loss
  case — so C4 §4's stated guarantee ("a stale entry can never
  misclassify a later, genuinely external write") still holds under the
  meaningful reading of "genuinely external" (i.e., a write that changes
  the file).

**Verdict on the deviation: safe**, given the hash-equality gate. It is not
a "tighter fix" situation (e.g., debouncing Windows' duplicate events
before the hash check) so much as a legitimately different but
equally-correct point in the design space — the two are behaviorally
equivalent for every content-changing write, which is the only case that
matters for "did we lose an edit."

That said, two things below (findings 1–2) should be fixed before this is
fully load-bearing, because neither the deviation's safety nor its
divergence from the signed contract text is currently *proven* or
*visible* anywhere but this review and the commit message.

## Findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| Important | `docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md` §4 (not touched by this diff) | C4 §4 literally says a matched entry is "consume(d) (remove)"; the shipped code deliberately does not do this. The deviation is explained in the commit message and a code doc comment, but the signed contract itself carries no note, and C4 has an existing §8 "open questions" mechanism for exactly this kind of implementer-discovered platform reality. CLAUDE.md §7: "Cross-lane needs are contract changes, through the lead" — a behavior change to a signed contract's stated mechanism should be surfaced to the contract's owner, not just documented in the crate that deviates from it. | Add a short §8 (or §4 addendum) note to C4 recording the Windows Create+Modify duplicate-event finding and that `check_and_consume` intentionally does not remove on first match, with the hash-equality argument for why this preserves the "no misclassified external write" guarantee — flagged for lead sign-off like the file's other open items. |
| Important | `tauri/src/watcher.rs` (tests, lines 117-157) | The two shipped tests are exactly the plan's original two cases; neither locks in the property this whole review turns on — that a genuinely different external write arriving shortly after a self-write (i.e., within the lingering TTL window) is still correctly classified as external, not suppressed. Without this test, a future refactor (e.g., someone "fixing" `check_and_consume` back to spec-literal removal, or loosening the equality check) has no regression guard for the exact scenario this deviation's safety argument depends on. | Add `self_write_followed_by_a_different_external_edit_within_the_ttl_window_still_fires_callback`: register/consume a self-write, then `std::fs::write` different content to the same path shortly after, assert the callback fires with the new content. |
| Minor | `tauri/src/watcher.rs:36-53` | `check_and_consume`'s name is now misleading: it never consumes on a match (only via lazy TTL-expiry cleanup when a *stale, non-matching* lookup happens to occur). The doc comment explains this, but the name still promises "consume" semantics on the success path it deliberately no longer has. | Rename to `check` (or `is_own_write`) now that "consume" no longer describes the match branch, or keep the name but tighten the doc's first line to lead with "no longer consumes on match" rather than burying it after "True iff". |
| Minor | shared checkout `idl1-app` (`app/src-tauri/Cargo.toml`) | `git status` shows this file as modified in the shared `main` checkout, but `git diff` shows no content change — a line-ending (LF→CRLF) normalization artifact, not a real dirty change, and unrelated to this task's diff (Task 3 never touches `app/src-tauri`). Not a defect in this task, flagged only so it isn't mistaken for fallout from this review. | None required for this task; note for whoever's `core.autocrlf` config is producing it. |

## Other checks

- **AI attribution trailers:** none found in `faea0f9` or the two preceding
  Task 1/2 commits in this worktree.
- **`cargo fmt`:** not run (confirmed via `cargo fmt -- --check`, which does
  show diffs against rustfmt defaults, consistent with the rest of the
  unformatted repo — not a regression, matches CLAUDE.md §7's "match style
  by hand" instruction). Style is hand-matched to the surrounding compact
  formatting already in `error.rs`/`paths.rs`.
- **Shared checkouts clean and on `main`:** `idl1-app` shared checkout is on
  `main` (ahead 14 of origin, expected — nothing pushed), with only the
  cosmetic `Cargo.toml` line-ending non-diff and unrelated untracked review
  artifacts from other lane reviews in this same session; the `rust`
  submodule's shared checkout is on `main`, clean. Neither was touched by
  Task 3 (worktree-isolated per the plan's Global Constraints).
- **Doc comments / units:** every public symbol in `watcher.rs`
  (`ExpectedHashSet`, `new`, `expect`, `check_and_consume`, `WorkbookWatcher`,
  `WorkbookWatcher::new`) has a doc comment; `EXPECTED_HASH_TTL` and
  `DEBOUNCE` are typed `Duration`, self-documenting for units; no bare
  `// TODO`.
- **~100 ms debounce:** `DEBOUNCE: Duration = Duration::from_millis(100)`,
  used in the spawned per-path debounce thread (`watcher.rs:16,101,104`) —
  implemented as specified.
- **`Cargo.toml`/`lib.rs` wiring:** `notify = "8.2.0"` (pin matches),
  `sha2 = "0.10"`, `hex = "0.4"` added under `[dependencies]`; `tempfile =
  "3.27.0"` already present under `[dev-dependencies]` from Task 2;
  `pub mod watcher;` added to `lib.rs`. Commit message records the resolved
  `sha2 0.10.9`, `hex 0.4.3` versions per the plan's Open-Questions
  instruction.
