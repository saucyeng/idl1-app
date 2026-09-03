# Review — Task 6: `WifiTransport` trait and `reqwest`-backed skeleton (SPEC §6)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l4-transport`
Branch: `wave1-l4-transport`, commit `4c995e1` (on `b4b46c8`)
Files reviewed: `transport/src/wifi_transport.rs`, `transport/Cargo.toml`, `Cargo.lock`

## Test commands run and results

```
cd C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l4-transport
cargo test -p idl-transport wifi_transport::
```
Result: **6 passed; 0 failed; 0 ignored** (`parse_content_range` x3, `range_header` x2,
`verify_device_identity` x1) — matches the claimed 6/6.

```
cargo test -p idl-transport
```
Result: **25 passed; 0 failed; 0 ignored** — matches the claimed 25/25, no regressions
(ble_config 8, ble_control 4, ble_status 5, error 2, wifi_transport 6 = 25). Doc-tests: 0/0.

```
cd C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust
git status ; git branch --show-current
```
Result: clean working tree, on `main` (up to date with `origin/main`) — untouched by this lane,
as required.

## Deviation checks

1. **`reqwest` pin** — `transport/Cargo.toml` line 16: `reqwest = { version = "0.13.4",
   default-features = false, features = ["stream"] }`, comment cites "lead ruling R7". Matches
   `docs/superpowers/specs/2026-09-02-idl1-m0-ecosystem.md` line 28 (`0.13.4`) exactly.
   `Cargo.lock` resolves `reqwest` at `0.13.4` (line 3007). Correct, not a guess.

2. **`PingResponse` renames** — `#[serde(rename = "proto")] pub proto_version: u32` and
   `#[serde(rename = "battery")] pub battery_pct: u8` (wifi_transport.rs:51-58). Confirmed
   against `docs/IDL0_SPEC.md` §6.1's `/ping` JSON body (lines 461-470): wire keys are exactly
   `proto` and `battery`. The rename attributes correctly preserve the original wire field
   names while giving the Rust struct fields unit-suffixed identifiers matching
   `ble_status::DeviceStatus::battery_pct`'s convention. Documented in-line as a judgment call
   with rationale, not a silent change. Reasonable, not scope creep.

3. **`unimplemented!()` per-method bodies** — every `WifiTransport` method on `ReqwestWifi`
   (wifi_transport.rs:156-192) is individually `unimplemented!("Task 7 implementer: ...")` with
   an implementer note, rather than the plan's literal `// Task 6 implementer fills in each
   method` empty-impl-block prose (which wouldn't compile — a trait impl must supply every
   method body). This is exactly the pattern Task 5 already established for `BtleplugBle`
   (`ble_transport.rs:119-152`, committed one step earlier, same per-method `unimplemented!()`
   with an implementer-note string). Not a new pattern invented in Task 6 — it reuses Task 5's
   own precedent. Reasonable.

## Other findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| Minor | `transport/src/wifi_transport.rs:259-280` | `verify_device_identity_matching_name_ok_mismatched_name_wifi_error` asserts two distinct conditions/outcomes (match→Ok, mismatch→Err) in one test function, and its name doesn't match the plan's suggested `verify_device_identity_mismatched_name_returns_wifi_error`. | Cosmetic only — the crate already has this table/dual-assertion style precedent in Task 3/4 (`ack_code_is_success_true_only_for_0x00`, `configs_match_identical_bytes_true_differing_bytes_false`), so this is consistent with established local convention, not a new problem; no fix required unless the lead wants strict one-condition-per-test going forward. |

No Critical or Important findings. Doc comments present on every public symbol added in this
diff (`DEVICE_BASE_URL`, `range_header`, `parse_content_range`, `PingResponse` and its fields,
`verify_device_identity`, `WifiTransport` and each of its methods, `ReqwestWifi` and its fields/
constructor). Unit suffixes correct throughout (`resume_from_bytes`, `start_byte`, `end_byte`,
`total_bytes`, `battery_pct`; `proto_version`/`file_index` correctly left unsuffixed as ordinals,
with rationale given in the doc comment). No bare `// TODO` (grep clean); the one prior
`TODO(idl0):` blocking `reqwest` was correctly resolved and removed, not left dangling. No AI
attribution trailer in the commit message. No `cargo fmt` reformatting — style (4-space indent,
brace placement, doc-comment format) matches the rest of the crate (`error.rs`, `ble_transport.rs`)
by hand. `TransportErrorKind` was not extended (only `Wifi`/`Config` variants already in scope are
used). `rust/transport` still has no `tauri`/`idl-rs` core dependency.

## Verdict

CLEAN — Task 6 as executed matches the plan and SPEC §6.1 exactly, both flagged deviations
(reqwest pin sourcing, serde renames, unimplemented!() precedent) are verified reasonable and
non-silent, and the claimed test counts (6/6, 25/25) reproduce exactly with no regressions.
