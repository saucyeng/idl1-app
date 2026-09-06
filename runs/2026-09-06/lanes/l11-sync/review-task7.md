# Review — L11 Task 7: transport sync wire DTOs + pairing

**Commits reviewed:**
- idl-rs `5ecabdd` on `l11-sync` (worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\l11-sync`, on top of `3480daf`)
  — `transport: sync wire DTOs and pairing (L11)`
- idl1-app `a57399c` (worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\l11-sync`)
  — `docs: CHANGELOG entry for L11 Task 7`

**Files touched:** `transport/src/sync/mod.rs` (new), `transport/src/sync/wire.rs`
(new), `transport/src/sync/pairing.rs` (new, incl. tests), `transport/src/lib.rs`
(+`pub mod sync;` and a doc-comment update), `transport/Cargo.toml` (`uuid`
gains the `"v4"` feature — no new crate), `CHANGELOG.md`. All on the brief's
named list; nothing else changed. `git diff 3480daf 5ecabdd -- Cargo.lock` is
empty (uuid 1.26.0 was already resolved with `getrandom 0.4.3` in the
workspace lock from another crate's feature set, so the new feature added no
new lock entries).

**Test command:** none run — Rust lane, cargo forbidden for reviewers.
Verified statically: `transport/src/sync/pairing.rs`'s `#[cfg(test)] mod
tests` has exactly 11 `#[test]` fns, one for each of the brief's 11 named
cases, no more, no fewer — matches the implementer's claimed `cargo test -p
idl-transport sync::pairing` → 11 passed exactly.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `CHANGELOG.md:209` | The entry claims `cargo check -p idl-rs-tauri` clean, but the brief's COMPUTE RULES section for this task names only `cargo test -p idl-transport sync::pairing` and explicitly says "No `pub` change in core, so no `idl-rs-cli` check" — it says nothing about `idl-rs-tauri`, and nothing in this diff touches `idl-rs-tauri` or moves a command signature (the two triggers the rulings digest lists for that check: R68/R75, or PLAN §4's "task 12" note). This is either an unauthorised extra cargo invocation (a real cost on a one-cargo-process, memory-bound machine, CLAUDE.md §8/R13) run without the dispatch calling for it, or a copy-pasted line left over from the L8x template above it in the same CHANGELOG that was never actually run — a false claim either way needs resolving, not left standing. | Ask the implementer to confirm whether this command actually ran; if it did, note it was extra and unauthorised so the lead can decide whether it counts against the machine's cargo budget; if it did not, strike the line from the CHANGELOG entry. |
| Minor (Note, not a defect) | `transport/src/sync/pairing.rs:88-92` (`six_digit_code_from_u32`) | `Uuid::new_v4()` uses `getrandom` under the hood (workspace lock: `uuid 1.26.0` → `getrandom 0.4.3`), which is OS-CSPRNG-backed, not a weak PRNG — fine for a rate-limited pairing code. Taking `u32::from_be_bytes(..) % 1_000_000` over a full `u32` range introduces a small modulo bias: `2^32 mod 1_000_000 = 967_296`, so codes `000000..000967295`'s six-digit space is very slightly over-represented (~0.02% relative skew) versus the rest. For a 120 s TTL, 5-attempt-then-burn code this is immaterial — an attacker gains no practical edge from a ~1-in-4300 extra-density band on a 1e6-code space rate-limited to 5 guesses — so this is a note, not a finding requiring a fix. | No action needed; if the lane ever needs uniform codes (e.g. a future audit requirement), rejection-sampling the top partial range would remove the bias. |

**Notes (not findings):**
- **C3 §3.9 field names, byte-for-byte.** `wire.rs`'s `PairRequest { code,
  peer_id, name, protocol_version }` and `PairResponse { peer_id, name,
  token, protocol_version }` match PLAN §3's wire sketch (`POST
  /idl1/v1/pair { code, peer_id, name } -> { peer_id, name, token }`, with
  `protocol_version` added per C3 §3.9's `PeerStatus` widening, R88); `Peer`'s
  fields match `PeerStatus`/the peer-file shape in PLAN §8 Q7 exactly; the
  round-trip test (`wire_dtos_round_trip_through_serde_json_with_c3_field_names`)
  asserts the literal JSON key strings (`"peer_id"`, `"protocol_version"`,
  `"token"`), not just successful round-trip, catching a silent rename.
  `PairingOffer { code, expires_at_ms }` matches C3 §3.9's `PairingCode`
  exactly (default serde field names, snake_case already).
- **TTL/attempts constants and enforcement.** `PAIRING_TTL_MS = 120_000`,
  `MAX_ATTEMPTS = 5` match PLAN §8 Q3 and the brief exactly. `redeem`
  correctly treats "correct code but expired" as a hard `Sync` error without
  incrementing `failed_attempts` (checked before the comparison), and resets
  `failed_attempts` to 0 both on a fresh `offer()` and on a successful
  `redeem()` — verified by reading the five tests that exercise these paths,
  all of which assert the specific outcome (offer burnt / still valid) named
  in the brief's test list, not just "is an error."
- **Constant-time comparison.** `constant_time_eq` does an early-return only
  on length mismatch (both operands are always fixed-width six-char strings
  in practice, so this branch is never observably reached with real codes)
  and then XORs every byte with no early exit — matches "do not
  short-circuit on the first differing digit" literally.
- **Token.** `token` is a bare `Uuid::new_v4()` hyphenated string (36 chars,
  122 bits of CSPRNG entropy) minted once per successful pair on the
  offering side and returned only in `PairResponse`/stored in `Peer`; grep
  of the whole diff for `{token}`/`Display`/`log` finds no place the token
  is logged or printed — matches "do not log or Display a token." No
  constant-time comparison is implemented for the token itself in this task
  (there is no token-comparison code here at all — Task 8's auth middleware
  will compare the caller's bearer token against `Peer.token`), which is
  correctly out of this task's scope per its "no server yet" framing.
- **Peer file.** `load_peers`/`save_peers` take `peers_path: &Path` as a
  parameter with zero internal path resolution (grep confirms no
  `dirs`/`tauri`/`app_config_dir` reference anywhere in the new files) —
  satisfies PLAN §8 Q7's "outside `<data>`" placement without this crate
  ever seeing an actual path; that choice is deferred to Task 12's tauri
  glue, which is consistent with "this crate never depends on Tauri for a
  path." `load_peers` on `NotFound` returns `Ok(vec![])`; any other read
  error or a `serde_json` parse failure is a typed `Sync` error naming the
  path via `.display()`, never a panic, never silent truncation.
  `save_peers` implements its own tmp-sibling→fsync→rename→fsync-parent
  recipe rather than `core::store::atomic::write_atomic`; read against
  `core/src/store/atomic.rs`, that primitive's `RenameConflict` requires a
  caller-tracked `based_on_hash` across calls, which a stateless
  `save_peers(path, peers)` call has no way to supply — the deviation is
  real, correctly reasoned, and explicitly flagged in both the module doc
  comment and the CHANGELOG rather than hidden. This is the same style of
  documented, justified atomic-write deviation Task 5's reviewer accepted
  for `base_cache.rs`.
- **`unpair` / token removal.** Not implemented in this task — `save_peers`
  is a full-list overwrite, so a caller (Task 12) removes a peer by
  filtering it out of the `Vec<Peer>` before calling `save_peers`; this
  task correctly ships only the load/save primitives the brief's interface
  names, with no `unpair_peer` function invented ahead of its own task.
- **No manifest-synced data.** `Peer`'s five fields carry only pairing
  metadata and the bearer token; nothing session/workbook/track/profile
  shaped is present.
- **`check_protocol_version`.** Refuses on any non-matching version (not
  just "less than"), names both versions in the message
  (`"peer speaks {}, this build speaks {PROTOCOL_VERSION}"`), and the test
  asserts both numbers appear in the message text, not just that an error
  was returned — matches "never a partial pair," "naming both versions"
  literally.
- **Cargo.toml.** Only line changed is the `uuid` line gaining
  `features = ["v4"]`; no new crate row added; the comment above it explains
  why (mirrors the existing comment style for the pinned `uuid = "1"` line
  from L4). `Cargo.lock` diff is empty.
- Hand style (line lengths, brace placement, doc-comment density) matches
  `transport/src/device.rs` and `ble_status.rs`'s conventions; no
  reformatting of untouched lines in `lib.rs` beyond the doc-comment update
  and the one new `pub mod` line.
- Tests are Arrange/Act/Assert with blank lines throughout; names are
  underscore-joined descriptions of the same "thing — condition — result"
  shape used elsewhere in this lane (e.g.
  `redeem_five_wrong_codes_then_the_right_one_is_refused_offer_burnt`),
  consistent with the repo's existing test-naming convention for Rust
  (`#[test] fn` cannot contain literal em dashes).
- CHANGELOG entry is accurate against the landed code line-for-line,
  including its own flagged deviation, with the one exception noted above
  (the unrequested/unexplained `idl-rs-tauri` check line).

**Verdict rationale.** Every wire DTO field name, the TTL/attempt constants,
the constant-time comparison, the typed-error handling of an absent/malformed
peer file, the atomic-write deviation's justification, and the exact 11/11
test count all check out against C3 §3.9, PLAN §3/§8, and the brief's test
list on manual trace, with no wrong behaviour found. The modulo-bias question
the dispatch asked about is real but immaterial at this rate limit, correctly
a Note rather than a finding. The one Important item is process hygiene, not
a defect in the shipped code: the CHANGELOG's `idl-rs-tauri` check claim is
either an unauthorised extra cargo run on a memory-bound, one-cargo-process
machine or a stale copy-paste that needs striking, and either reading needs
the implementer's confirmation before this is clean.

VERDICT: NEEDS_FIXES
