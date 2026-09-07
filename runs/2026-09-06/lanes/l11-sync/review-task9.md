# L11 Task 9 review — mDNS peer discovery

Commits reviewed: idl-rs `5132d68` (l11-sync worktree, parent `fa3d317`
Task 8, HEAD at review time `fa3d317`); idl1-app CHANGELOG `4771f87`.
Files touched: `transport/src/sync/discovery.rs` (new),
`transport/src/sync/mod.rs`, `transport/Cargo.toml`, `Cargo.lock`,
`CHANGELOG.md`. Ignored anything committed after `5132d68` (l11-fix8's
Task 8 fix lands separately).

Test command: none run — Rust lane, cargo forbidden for reviewers per
CLAUDE.md §8. Verified statically: `transport/src/sync/discovery.rs`'s
`#[cfg(test)] mod tests` has 6 `#[test]` fns
(`build_txt_then_parse_txt_round_trips_peer_id_name_and_version`,
`parse_txt_a_record_with_no_pid_none`,
`parse_txt_a_v_that_is_not_a_number_none`,
`parse_txt_a_v_of_2_against_protocol_version_1_some_carrying_2`,
`parse_txt_an_empty_name_some_with_an_empty_name`,
`build_txt_the_keys_are_exactly_pid_name_v`) plus 1
`#[tokio::test] #[ignore]` (`advertise_and_browse_round_trip_on_loopback`).
Matches the implementer's reported "6 passed, 1 ignored" and the CHANGELOG
line for `cargo test -p idl-transport sync::discovery`.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | transport/src/sync/discovery.rs:126-149 (`browse`) | The spawned task's teardown only fires on the *next* `ServiceEvent` after the caller drops the `mpsc::Receiver<DiscoveredPeer>` — `tx.send(...).await.is_err()` is only checked inside the `while let Ok(event) = events.recv_async().await` arm. If the caller drops the receiver and no further peer event ever arrives (a quiet LAN, or the peer that was found is the only one), the task stays parked in `events.recv_async().await` forever, holding the `ServiceDaemon` (and its background threads/sockets) alive indefinitely. The doc comment on `browse` promises the daemon is torn down "for as long as anyone holds the receiver" but does not actually detect the receiver being dropped without a new event to react to. | `tokio::select!` between `events.recv_async()` and `tx.closed()` (or store `tx.clone()`'s weak/strong count) so the task exits promptly when the receiver drops, independent of new mDNS traffic. |
| Minor | transport/src/sync/discovery.rs:138-140 | `SocketAddr::new(addr.to_ip_addr(), info.get_port())` drops the IPv6 zone/scope id. `mdns_sd::ScopedIp::to_ip_addr` (checked in `mdns-sd-0.21.2/src/dns_parser.rs:134-137`) unconditionally returns a bare `IpAddr::V6` with no scope, so a link-local peer address such as `fe80::1%eth0` becomes plain `fe80::1` with `SocketAddrV6::scope_id() == 0`. On a multi-interface host that address is ambiguous and a subsequent connect can fail or pick the wrong NIC — this isn't handled or noted anywhere, though it's undocumented rather than untested since no test exercises IPv6 link-local addresses (reasonable, given the "no test needs multicast" constraint). Low real-world impact since most LAN mDNS responders also publish an IPv4 A record. | Either use `mdns_sd`'s `ScopedIp` directly and construct `SocketAddr::V6` with the real `scope_id` when the address is link-local, or note in the doc comment that only globally-routable/IPv4 addresses are supported and link-local IPv6 peers may be unreachable. |

No other findings. `build_txt`/`parse_txt` are pure, total, and round-trip
correctly (checked against `PROTOCOL_VERSION` from `wire.rs`); a missing
`pid`/`v` or unparseable `v` yields `None`, never a panic, and each branch
has a dedicated test. `advertise` and `browse` never construct a tokio
runtime — `ServiceDaemon::new`/`register` are synchronous, and `browse`'s
`tokio::spawn` runs on whatever runtime is already driving the call,
matching `ble_transport::scan`'s documented pattern (confirmed by reading
the module doc comment at the top of `mod.rs` and `discovery.rs`, which
cites it explicitly). All three TXT keys (`pid`, `name`, `v`) are grepped
for hostile-input handling: `build_txt`/`parse_txt` never touch the
filesystem, and `peer_id` in `advertise` is used only as an mDNS instance
name and as `"{peer_id}.local."` — a DNS label passed to `mdns-sd`, not a
filesystem path component — so R100's shared id validator (not yet landed,
still tracked as landing separately) is not a gap for *this* task; nothing
in `discovery.rs` writes a peer id to disk. (Note for the record: the
existing `sync::server.rs` route handlers already use *session/track/
profile/workbook* ids, not peer ids, as path components ahead of R100's
landing — that's Task 7/8 territory, already reviewed, and out of this
task's scope, but flagging so it isn't lost.) `mdns-sd = "0.21.1"` matches
the crate's existing caret-pin convention (`axum = "0.8.9"`,
`tokio = "1.53.1"`, `reqwest = "0.13.4"` are all written the same
minor.patch-without-caret-symbol style, which Cargo treats as `^0.21.1`);
resolving `0.21.2` is a compatible patch bump, correctly described as such
in the CHANGELOG. `Cargo.lock` additions are exactly `mdns-sd`'s dependency
tree (`flume`, `if-addrs`, `socket-pktinfo`, `spin`) plus a `libc` patch
bump pulled in transitively — no unrelated crate touched. Only the four
named files plus `Cargo.lock`/`CHANGELOG.md` changed; tests are
Arrange/Act/Assert with blank lines and named `thing — condition — result`;
hand style matches the surrounding crate (no rustfmt reflow); doc comments
present on every public symbol; CHANGELOG entry's claims (test counts,
manual ignored-test run, pin rationale) all check out against the diff.

**Verdict rationale:** both findings are real gaps the lead specifically
asked to have checked (daemon lifetime vs. channel drop; link-local
`ScopedIp` handling), and both hold up against the crate source. Neither
is a spec violation, a panic risk, or a scope creep — the resource-leak
path only triggers post-caller-drop, and the scope-id gap is a narrow,
low-probability correctness edge case, so this is FINDINGS not a blocking
rewrite. Everything else — TXT round-trip purity/totality, no-runtime
discipline, hostile-peer-id-as-path-component (none), pin convention,
lockfile scope, test names/shape, CHANGELOG accuracy — is clean.

VERDICT: NEEDS_FIXES (0 Critical, 1 Important, 1 Minor)
