# L11 Task 7 — transport: wire DTOs and pairing

The first transport task: the protocol's types, the 6-digit pairing code and
the per-peer token store. No server and no client yet. TDD, ONE commit.

**Depends on Task 6.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l11-sync"
git merge-base --is-ancestor 52efba8 HEAD && echo GATE-OK
grep -c "pub fn install" core/src/store/sync/apply.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md` §2 (transport is I/O only, never Tauri) and §5; this lane's
`PLAN.md` §3 and open questions 1, 2, 3, 7 as the lead answered them;
Task 1's landed C3 §3.9 text (`start_pairing`, `PeerStatus`'s new fields);
`transport/src/error.rs` (`TransportErrorKind::Sync` already exists — use
it, do not add a kind); `transport/src/device.rs` for this crate's DTO
style; `core/src/store/atomic.rs` for the atomic write of the peer file.

## Where

- **Files:** `transport/src/sync/mod.rs` (new),
  `transport/src/sync/wire.rs` (new), `transport/src/sync/pairing.rs` (new),
  `transport/src/lib.rs`, `transport/Cargo.toml`, `CHANGELOG.md`.

## Interfaces

```rust
/// The protocol version this build speaks. Bumped only by a contract change.
pub const PROTOCOL_VERSION: u32 = 1;

/// A peer we have paired with. Serialised to the peer file (PLAN Q7).
pub struct Peer {
    pub peer_id: String,
    pub name: String,
    pub token: String,
    pub protocol_version: u32,
    pub paired_at_ms: i64,
}

/// A pairing code offered by this instance. Single-use, short-lived.
pub struct PairingOffer { pub code: String, pub expires_at_ms: i64 }

/// `POST /idl1/v1/pair`'s body and response.
pub struct PairRequest  { pub code: String, pub peer_id: String, pub name: String,
                          pub protocol_version: u32 }
pub struct PairResponse { pub peer_id: String, pub name: String, pub token: String,
                          pub protocol_version: u32 }

/// The live pairing state of one app instance. Holds at most one open offer.
pub struct PairingState { /* … */ }

impl PairingState {
    /// Mints a fresh offer, replacing any outstanding one.
    pub fn offer(&mut self, now_ms: i64) -> PairingOffer;
    /// Checks a presented code. Consumes the offer on success; counts and
    /// burns the offer after `MAX_ATTEMPTS` failures.
    pub fn redeem(&mut self, code: &str, now_ms: i64) -> Result<(), TransportError>;
}

/// The peer file, outside `<data>` so tokens never sync (PLAN Q7).
pub fn load_peers(peers_path: &Path) -> Result<Vec<Peer>, TransportError>;
pub fn save_peers(peers_path: &Path, peers: &[Peer]) -> Result<(), TransportError>;
```

## Key logic

- **Code**: exactly six decimal digits, derived from `uuid::Uuid::new_v4()`'s
  bytes — no `rand` dependency (PLAN Q2). Lifetime `PAIRING_TTL_MS = 120_000`,
  `MAX_ATTEMPTS = 5`; the fifth failure burns the offer so a new one must be
  minted. Leading zeros are preserved — the code is a string, never an int.
- **Token**: a `uuid` v4 hyphenated string, per peer, minted by the side that
  offered the code and returned once in `PairResponse`.
- Comparison of the presented code against the offer is constant-time over
  the fixed six bytes; do not short-circuit on the first differing digit.
- A `PairRequest` whose `protocol_version` this build does not speak is
  refused with a `Sync` error naming both versions — never a partial pair.
- `load_peers` on an absent file is `Ok(vec![])`, not an error. A malformed
  file is a `Sync` error naming the path; it is never silently truncated.
- `save_peers` writes atomically (`tmp` sibling → fsync → rename). This crate
  must not depend on Tauri for the path — the path is passed in.
- No clock inside this module: `now_ms` is a parameter everywhere.

## Tests

- `PairingState::offer — the code is six digits and may start with 0`.
- `redeem — the correct code inside the TTL — Ok, and a second redeem of the
   same code fails (single use)`.
- `redeem — the correct code after the TTL — Sync error`.
- `redeem — five wrong codes then the right one — refused; the offer is burnt`.
- `redeem — with no outstanding offer — Sync error`.
- `offer — called twice — the first code no longer redeems`.
- `PairRequest — an unknown protocol_version — refused, naming both versions`.
- `load_peers — an absent file — an empty list`.
- `load_peers — a malformed file — Sync error naming the path`.
- `save_peers then load_peers — the same peers, tokens intact`.
- `wire DTOs — round-trip through serde_json with the C3 §3.9 field names`.

## COMPUTE RULES

While working: `cargo test -p idl-transport sync::pairing`, foreground,
non-zero `passed`. No `pub` change in core, so no `idl-rs-cli` check.
Note `-p idl-transport` — this task does not build core's tests.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. `wire.rs` DTOs. 4. `pairing.rs`.
      5. `lib.rs` module + re-exports. 6. Filter green. 7. NUL check.
      8. `CHANGELOG.md`. 9. Commit
      `transport: sync wire DTOs and pairing (L11)`.

## Do not

- Do not add `rand`, `tower-http`, or any crate outside the M0 pins. If the
  lead's Q1 answer added `idl-rs` as a dependency, that is the only new entry
  in `Cargo.toml` this lane makes without asking.
- Do not depend on `tauri`. Do not resolve a path from an app handle.
- Do not log or `Display` a token.
- Do not start a runtime; this module is synchronous.

## Spec discipline

**No spec change needed** — Task 1 wrote `start_pairing` into C3 §3.9. A
field the wire needs and C3 does not name is a STOP.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the filter's `passed` count; the exact
`Cargo.toml` lines added and why; how the six-digit code is derived from
`uuid`; the TTL and attempt constants shipped.
