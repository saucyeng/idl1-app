# Review: Task 7 — Wire `BtleplugBle`/`ReqwestWifi` bodies (L4 idl-transport)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l4-transport`
Branch `wave1-l4-transport`, commit `aeac6ea` on top of `4c995e1`.
Files reviewed: `transport/Cargo.toml`, `transport/src/ble_transport.rs`,
`transport/src/wifi_transport.rs`, `transport/src/device.rs`, `Cargo.lock`.

## Test command and result

```
cd C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l4-transport
cargo build -p idl-transport            → Finished (16 pre-existing `async fn in
                                           public trait` lint warnings only, no
                                           `unimplemented!` remaining — grep confirms)
cargo build -p idl-transport --release  → Finished
cargo test  -p idl-transport            → test result: ok. 28 passed; 0 failed
                                           (25 pre-existing + 3 new
                                           wifi_transport::integration tests, all
                                           present and passing)
```

Shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`: clean, on
`main`, up to date with origin — untouched by this lane, as required.
No AI attribution trailer in `aeac6ea`'s commit message (grepped for
`co-authored`/`generated with`/`claude`, no match). No tabs / no rustfmt
churn detected in the diff; style matches the surrounding hand-formatted code.

## Verification of the two flagged judgment calls

**1. ATT app error code unreachable on Windows — CONFIRMED REAL.**
Read the pinned source at
`~/.cargo/registry/src/index.crates.io-.../btleplug-0.13.0/src/winrtble/ble/characteristic.rs`,
`BLECharacteristic::write_value` (lines 67–81): it calls
`WriteValueWithOptionAsync` and branches only on `GattCommunicationStatus`
(`Success`/`Unreachable`/`ProtocolError`/`AccessDenied`) — never touches a
`GattWriteResult`/ATT app-error byte. Grepped the whole crate source for
`WriteValueWithResult`/`GattWriteResult`: no match anywhere in
`btleplug-0.13.0`. The claim is real, not an assumption.

This is documented at the `send_command` call site (`ble_transport.rs:324–343`)
with a specific citation of the file/function read, and in the commit message.
It is **not** silently swallowed: a refused write (mutex 0x03 etc.) still maps
to `GattCommunicationStatus::ProtocolError`/similar and propagates as
`Err(TransportErrorKind::Ble)` — the SPEC §7.2 "acceptance ≠ completion,
refusal ≠ success" contract holds; what's lost is only the *specific* ACK
byte (mutex vs busy vs precondition all collapse into one coarse Ble error
with btleplug's own text). This matches what the review brief asked to
confirm: the ACK check happens a different way on Windows (via
`GattCommunicationStatus` → `Result::Err`), not "ACKs are simply unchecked."
`ble_control::AckCode::from_byte` (Task 3) is genuinely unreachable from a
real `winrtble` write, as claimed — this makes Task 3's ACK-byte matching
effectively dead code on the one platform this lane ships for, worth a
line in Task 8's SPEC §14a (not yet written; §14a is Task 8/9 scope, so not
a Task 7 defect, but flagged here so it isn't dropped — see Important
finding below).

**2. MTU handling — CONFIRMED REAL.**
`btleplug::api::Peripheral::mtu(&self) -> u16` (api/mod.rs:344) is
synchronous, as claimed. `winrtble/peripheral.rs`: `mtu()` reads an
`AtomicU16` (line 462–464) seeded to `api::DEFAULT_MTU_SIZE` (= 23,
api/mod.rs:49) at construction (line 126) and updated by a
`max_pdu_size_changed` callback registered during `connect()`
(lines 505–512) — i.e. auto-negotiated post-connect with no manual
MTU-request call, exactly as the commit message describes. The code
(`ble_transport.rs:370`) computes `peripheral.mtu().saturating_sub(3).max(1)`,
which is 20 bytes whenever the callback hasn't fired yet (23 default − 3
ATT overhead) — the claimed 20-byte fallback is real default behaviour, not
a separate code path that could silently diverge from what's documented.

## Cargo.toml feature additions — bless/reject

| Addition | Verdict | Reason |
|---|---|---|
| `tokio` `rt` | **Bless** | `tokio::spawn` used in `scan` (ble_transport.rs:197) and `watch_status` (line 309) to feed a live `mpsc::Receiver` while a scan/subscription runs — required by Task 5's trait shape (live channel), only needed once Task 7 gave it a real body. |
| `tokio` `io-util` | **Bless** | `AsyncWriteExt::write_all` used in `WifiTransport::download` (wifi_transport.rs:265), against the trait's own `dyn AsyncWrite` sink parameter (fixed by Task 6). |
| `uuid` (direct dep) | **Bless** | `Uuid::parse_str`/`Uuid` used directly in `ble_transport.rs` (`characteristic_by_uuid`, `scan`, `watch_status`). Confirmed btleplug does **not** re-export `uuid::Uuid` (`use uuid::Uuid;` in `api/mod.rs`, no `pub use`) — a direct dependency is required to name the type's associated functions, this isn't scope creep. |
| `futures` (`std` only) | **Bless** | `StreamExt::next()` used to drain `btleplug`'s event/notification streams (`ble_transport.rs`) and `reqwest`'s `bytes_stream()` (`wifi_transport.rs`). Feature-gated to `default-features = false, features = ["std"]`, excluding executor/compat extras — appropriately narrow. |
| `reqwest` `json` | **Bless** | `response.json::<PingResponse>()` / `response.json::<Vec<DeviceFile>>()` used directly in `wifi_transport.rs` (`ping`, `list_files`) — both are real SPEC §6.1 JSON bodies this trait deserialises, not speculative. |
| dev-dep `tokio` `net` | **Bless** | `TcpListener` in the hand-rolled mock HTTP server (`wifi_transport.rs::integration::spawn_mock_server`) — dev-only, correctly scoped to `[dev-dependencies]`, never reaches library consumers. |

All six additions trace to real call sites in this diff; none is speculative.
`Cargo.lock` diff is minimal (two new direct-dep lines, `futures`/`uuid`,
both already present transitively) — no unexpected version bumps.

## Findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| Important | `docs/IDL0_SPEC.md` §14a (not yet written — Task 8) | The Windows ATT-app-error-code gap (confirmed above) means `AckCode::from_byte`'s documented codes (`0x80`/`0x81`/`0x82`) are unreachable on the one platform this lane ships; SPEC §14a's chunk-size paragraph documents the MTU judgment call but nothing yet documents this ACK gap for L9/future readers. | When Task 8 writes §14a, add a paragraph parallel to the MTU one: "ACK byte on Windows" — state plainly that `send_command` can only report success/failure, not which SPEC §7.2 code, and why. |
| Minor | `transport/src/ble_transport.rs:244-248` (`connect`) | `device_id` round-trips through `BDAddr::to_string()`/`FromStr` — this only works because `winrtble::PeripheralId` wraps a `BDAddr` and delegates `Display` to it (confirmed in source). On `bluez` (Linux) `PeripheralId` wraps a D-Bus `DeviceId`, not a `BDAddr`, so the same `device_id.parse::<BDAddr>()` call would fail to parse a scan-returned ID if this crate is ever built for Linux desktop. Not exercised by this lane's Windows-only Task 9 verification, so not blocking, but worth a comment or an Open question if Linux desktop is ever in scope. | Note the Windows-only assumption in a comment at the `connect` device_id parse, or file it as an Open question for whichever lane first targets Linux desktop. |
| Minor | `transport/src/wifi_transport.rs:479-503` etc. (`integration` mock-server tests) | `assert_eq!(path, ...)` inside the `route` closure runs on a nested `tokio::spawn`'d per-connection task whose `JoinHandle` is never joined/awaited — a failed assertion there panics inside an unobserved task rather than failing the test directly (the test would still likely fail via a knock-on `.unwrap()` on a malformed/short response, but with a confusing error message rather than the real assertion). | Not blocking; if reused as a pattern in later tasks, consider asserting on the client side (asserted response contents) instead of inside the server closure, or join the per-connection handles. |

No Critical findings. Build is clean, no `unimplemented!` remains, tests are
28/28 green, dependency additions are all justified against real call sites,
and both flagged judgment calls check out against the actual pinned
`btleplug` 0.13.0 source.
