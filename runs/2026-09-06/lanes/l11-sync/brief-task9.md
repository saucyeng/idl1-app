# L11 Task 9 — transport: mDNS discovery

Advertise this instance as `_idl1._tcp` and watch for peers. Small, isolated,
and the one task whose tests cannot fully cover the network. TDD, ONE commit.

**Depends on Task 8.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l11-sync"
git merge-base --is-ancestor 52efba8 HEAD && echo GATE-OK
grep -c "pub async fn start" transport/src/sync/server.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md` §2/§5; this lane's `PLAN.md` §3 (the TXT records) and Q9 (the
auto-trigger rate) as the lead answered it; Task 7's `Peer` and
`PROTOCOL_VERSION`; `transport/src/ble_transport.rs`'s `scan` — its
`tokio::sync::mpsc::Receiver` shape and its comment about never creating a
runtime are the pattern to copy exactly; the `mdns-sd` 0.21.1 pin in
`docs/superpowers/specs/2026-09-02-idl1-m0-ecosystem.md`.

## Where

- **Files:** `transport/src/sync/discovery.rs` (new),
  `transport/src/sync/mod.rs`, `transport/Cargo.toml`, `CHANGELOG.md`.

## Interfaces

```rust
/// The service type this app advertises and browses.
pub const SERVICE_TYPE: &str = "_idl1._tcp.local.";

/// A peer seen on the LAN. Says nothing about whether we have paired with it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoveredPeer {
    pub peer_id: String,
    pub name: String,
    pub protocol_version: u32,
    pub addr: SocketAddr,
}

/// TXT-record helpers, kept pure so they are testable without a network.
pub fn build_txt(peer_id: &str, name: &str) -> Vec<(String, String)>;
pub fn parse_txt(txt: &[(String, String)], addr: SocketAddr) -> Option<DiscoveredPeer>;

/// Advertises this instance until dropped.
pub struct Advertisement { /* … */ }
pub fn advertise(peer_id: &str, name: &str, port: u16) -> Result<Advertisement, TransportError>;

/// Browses for peers. The receiver is fed from a task on the caller's
/// runtime — this crate never creates a runtime (see ble_transport::scan).
pub fn browse() -> Result<mpsc::Receiver<DiscoveredPeer>, TransportError>;
```

## Key logic

- TXT records are exactly `pid` (peer id), `name`, `v` (protocol version, as
  a decimal string). A record missing `pid` or `v`, or carrying a `v` that
  does not parse, yields `None` from `parse_txt` — an unparseable neighbour
  is ignored, never a hard failure.
- A peer whose `v` differs from `PROTOCOL_VERSION` is still surfaced, with
  its real version, so the UI can say "incompatible" rather than hide it.
  Deciding what to do about it is Task 10's and Task 12's job, not this one's.
- `advertise` and `browse` take no clock and no `<data>` path.
- Discovery failing (no multicast on this network, a firewall) is a typed
  `Sync` error, never a panic and never a silent no-op.
- Keep the network-touching surface as thin as possible: everything decidable
  from a TXT record lives in `build_txt`/`parse_txt`, which are pure.

## Tests

Pure tests only — no test may require multicast to pass.
- `build_txt then parse_txt — round-trips peer_id, name and version`.
- `parse_txt — a record with no pid — None`.
- `parse_txt — a v that is not a number — None`.
- `parse_txt — a v of 2 against PROTOCOL_VERSION 1 — Some, carrying 2`.
- `parse_txt — an empty name — Some, with an empty name` (a name is a label,
  not an identity).
- `build_txt — the keys are exactly pid, name, v`.
- One `#[ignore]`d integration test that advertises and browses on the real
  loopback interface, documented as manual-only — it must not run in the gate.

## COMPUTE RULES

While working: `cargo test -p idl-transport sync::discovery`, foreground,
non-zero `passed`. The `#[ignore]`d test does not count toward that.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. `build_txt`/`parse_txt`. 4. `advertise`
      and `browse` over `mdns-sd`. 5. Filter green. 6. NUL check.
      7. `CHANGELOG.md`. 8. Commit `transport: mDNS peer discovery (L11)`.

## Do not

- Do not create a tokio runtime inside this crate.
- Do not filter out unpaired or incompatible peers here.
- Do not write a test that needs real multicast to pass.
- Do not put the peer file or the token anywhere near this module.

## Spec discipline

**No spec change needed** — `_idl1._tcp` is design §7 and PLAN §3 fixes the
TXT keys. A key you need beyond those three is a STOP.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the filter's `passed` count; the `mdns-sd`
version line added; whether the `#[ignore]`d loopback test was run manually
and what it showed; anything `mdns-sd` 0.21.1 does differently from the API
this brief assumes.
