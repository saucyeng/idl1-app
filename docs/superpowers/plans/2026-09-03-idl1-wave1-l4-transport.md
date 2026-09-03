# idl1 wave 1 — L4 `idl-transport` desktop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec discipline:** spec-during. `docs/IDL0_SPEC.md` §6 (WiFi Protocol), §7 (BLE Protocol) and
§8 (Configuration Schema) are current and unchanged by this lane — every wire detail below
(UUIDs, command bytes, ACK codes, endpoints, JSON schema) is read from them as-is, never
rewritten. Task 8 adds one new app-side subsection, `docs/IDL0_SPEC.md` §14a (placed directly
after §14 Error Handling, before §15, so no existing section is renumbered), recording the
trait shapes, chunk/timeout defaults and retry policy this lane actually builds — the kind of
app-side architectural fact CLAUDE.md's header says belongs in a lane's own SPEC section, not
in §6–8.

**Goal:** Extend the `idl-transport` stub (M0 Task 2 Step 8: `TransportError`/
`TransportErrorKind::{Ble,Wifi,Config,Sync}` only) into a working desktop client for the IDL0
device: BLE scan/connect/status/control (`btleplug`), WiFi file listing and resumable download
plus the config-push fallback (`reqwest`), and BLE config push/read-back framing — all behind
traits shaped so a later Tauri mobile plugin (L9, wave 2–3, Isaac's lane) can implement the same
traits against the platform BLE/WiFi stack. `rust/transport` stays I/O-only: no DSP, no config
*schema* knowledge (that is `ConfigErrorKind`/`parse_config`, owned by `idl-rs` core per C3 §3.8
— transport moves and byte-compares an already-validated JSON string, never parses it), never
depends on Tauri.

**Architecture:** One crate, `idl-transport`, gains five new modules alongside the existing
`error.rs`:

```
rust/transport/src/
  error.rs           existing — TransportError / TransportErrorKind, untouched by this lane
  device.rs           NEW — shared plain-data types: DiscoveredDevice, ConnectionInfo, DeviceFile
  ble_status.rs        NEW — SPEC §7.3 status-characteristic parser (pure)
  ble_control.rs        NEW — SPEC §7.2 control command bytes + ACK code (pure)
  ble_config.rs          NEW — SPEC §7.2 config push/read-back chunk framing (pure)
  ble_transport.rs         NEW — BleTransport trait + btleplug-backed BtleplugBle (I/O)
  wifi_transport.rs         NEW — WifiTransport trait + reqwest-backed ReqwestWifi (I/O)
```

The pure/parseable protocol logic (status lines, ACK bytes, chunk math, HTTP Range header
math) lives in its own module with no `btleplug`/`reqwest` types in its signatures, so it is
unit-testable with fake byte streams — this is how the crate gets close to CLAUDE.md §4's >90%
Rust coverage target despite most of the crate being I/O glue that can't run without real
hardware. `ble_transport.rs` and `wifi_transport.rs` are the thin, largely-untested glue that
wires the pure logic to `btleplug`/`reqwest`; their real proof is Task 9's manual step.

**Layer boundary this lane leans on (C3 §3.8, `push_config`):** `push_config` "validates
[config JSON] locally before transmission via the same `parse_config` path core already has" —
`ConfigErrorKind` is listed in C3 §2 as a **core** error enum, not a transport one. So
`idl-transport` never deserialises `idl0_config.json` (SPEC §8's schema is core's problem, via
whatever `idl-rs` core module owns `parse_config` — out of this lane's scope entirely); every
trait method here that touches config takes/returns an opaque `&[u8]`/`Vec<u8>` and the one
piece of config-shaped logic this crate does own — SPEC §7.2's "compares it (compact JSON) to
what it sent" read-back check — is byte equality, not JSON parsing.

**Tech stack:** Rust 2021, `btleplug` `0.13.0` (pinned, `docs/superpowers/specs/2026-09-02-idl1-m0-ecosystem.md`),
`tokio` `1.53.1` (pinned, same report), `reqwest` (**no pin in the ecosystem report — Open
question 1**), `serde`/`serde_json` (already workspace-present, loose `"1"` pin matching the
existing `transport/Cargo.toml` style). Native `async fn` in traits (stable since Rust 1.75, no
extra crate) — see Open question 2 for why this crate adds no `async-trait`/`futures` dependency.

**Spec:** `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md` §7 (Transport and sync);
`docs/IDL0_SPEC.md` §6 (WiFi Protocol), §7 (BLE Protocol), §8 (Configuration Schema);
`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` §2 (error kinds), §3.8 (Device
commands), open question 6 (this lane resolves `ble_scan`'s shape).

## Global Constraints

**Corrected post-Task-1 (2026-09-03) — this plan's original text gave the shared submodule
checkout as "the working directory for every step" while separately calling for "own worktree,"
a direct contradiction. Task 1 as actually executed checked out `wave1-l4-transport` directly in
the shared `C:\...\idl1-app\rust` checkout (no separate worktree directory), which the lead
converted post-hoc into a real worktree at the path below without losing any commits — see
`runs/2026-09-03/decisions.md`. Every task from here on uses the corrected path.**

- Worktree: branch `wave1-l4-transport`, own worktree, independent of L1/L2/L3 — no shared
  files, starts immediately. Setup (idempotent — skip if `git -C rust worktree list` already
  shows this path, as it does after Task 1's post-hoc correction):
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app/rust"
  git worktree add -b wave1-l4-transport "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l4-transport" main
  ```
  A task that needs to touch the idl1-app top-level repo (CHANGELOG.md, TASKS.md, docs/IDL0_SPEC.md
  §14a) also needs a matching top-level worktree, wired to this one exactly like C1's own M0
  precedent (`idl1-app` Task 3 Step 6) and like L1's plan (Task 1 Steps 2):
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
  git worktree add -b wave1-l4-transport "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l4-transport" main
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l4-transport"
  git -C rust remote add local-wave1 "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l4-transport"
  git -C rust fetch local-wave1 wave1-l4-transport
  git -C rust checkout -B wave1-l4-transport FETCH_HEAD
  ```
- Working directory for every Rust step:
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l4-transport` (the crate is
  `transport/`), unless a step says otherwise. **Never** the shared
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` checkout — that stays on `main`.
- **idl-rs is not rustfmt-formatted; never run `cargo fmt`.** Match the existing `error.rs`
  style by hand (4-space indent, doc comments on every public item, no trailing blank lines).
- **No AI attribution trailers in commits. Never `git push`; Isaac pushes.**
- Every fallible operation returns `TransportError`; extend `TransportErrorKind` **not at all**
  in this lane — the four variants (`Ble`, `Wifi`, `Config`, `Sync`) are C3-fixed and
  unprefixed by design (C3 §2). If a genuinely new failure class turns up that doesn't fit any
  of the four, it is an Open question here, not a new variant.
- TDD: Arrange/Act/Assert with a blank line between each; test names `thing_condition_result`
  (the existing two tests in `error.rs` — `transport_error_display_carries_kind_and_message`,
  `transport_error_serialises_kind_as_snake_case` — already follow this; nothing to fix there).
- Doc comment on every public symbol; units on every numeric value (`_ms`, `_bytes`, `_pct`
  suffixes, matching C3's own naming); `// TODO(idl0):` never bare `// TODO`.
- `rust/transport` never depends on `tauri` or on `idl-rs` core (layer rule, CLAUDE.md §2).

---

## File Structure

- Modify: `rust/transport/Cargo.toml` (new deps), `rust/transport/src/lib.rs` (new `pub mod`s).
- Create: `rust/transport/src/device.rs`, `ble_status.rs`, `ble_control.rs`, `ble_config.rs`,
  `ble_transport.rs`, `wifi_transport.rs`.
- Modify: `docs/IDL0_SPEC.md` (new §14a, Task 8).
- Modify: `CHANGELOG.md`, `TASKS.md` (Task 9).

---

### Task 1: Crate dependencies and module skeleton

**Files:**
- Modify: `rust/transport/Cargo.toml`, `rust/transport/src/lib.rs`
- Create: `rust/transport/src/device.rs`

**Interfaces:**
- Produces: the crate compiles with five new empty-but-documented modules; `device.rs`'s plain
  data types, used by every later task.

- [ ] **Step 1: Extend `Cargo.toml`**

```toml
[package]
name = "idl-transport"
version = "0.1.0"
edition = "2021"
license = "AGPL-3.0-or-later"
description = "Device transport (BLE, WiFi transfer, config push) and LAN sync for idl1. I/O only; no DSP."

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
btleplug = "0.13.0"
tokio = { version = "1.53.1", features = ["sync", "time", "macros"] }
# TODO(idl0): reqwest has no pin in docs/superpowers/specs/2026-09-02-idl1-m0-ecosystem.md —
# do not guess a version (CLAUDE.md §1). Get the exact pin from the lead (Open question 1)
# before uncommenting; until then WiFi-transport code (Task 6+) does not compile.
# reqwest = { version = "<PIN>", default-features = false, features = ["stream"] }

[dev-dependencies]
serde_json = "1"
```

`tokio` features are deliberately narrow: this is a library, not a binary — no `rt`/
`rt-multi-thread` (the Tauri app crate owns the runtime; this crate only uses `tokio::sync`
channels and `tokio::time::timeout`, never spawns its own runtime). `reqwest`'s `default-tls`
is dropped (`default-features = false`) because every WiFi endpoint (SPEC §6) is plain HTTP
against `192.168.4.1` — no TLS stack needed, smaller build, matches "offline-first means
bundled" (nothing to fetch a cert chain for).

- [ ] **Step 2: `device.rs` — shared plain-data types**

```rust
//! Plain data shared by the BLE and WiFi transports — no protocol logic, no
//! I/O. Kept separate so `ble_transport.rs`/`wifi_transport.rs` (I/O glue)
//! and the pure protocol modules can both depend on it without a cycle.

/// One device seen during a BLE scan (SPEC §7.4 step 1).
#[derive(Debug, Clone, PartialEq)]
pub struct DiscoveredDevice {
    /// Platform BLE address/identifier — opaque, passed back verbatim to `connect`.
    pub device_id: String,
    /// Advertised local name, e.g. `"IDL0-A3F2"`.
    pub name: String,
    /// Received signal strength, dBm. Negative; closer to 0 is stronger.
    pub rssi_dbm: i32,
}

/// Result of a successful BLE connect + GATT setup (SPEC §7.4 steps 2–4).
#[derive(Debug, Clone, PartialEq)]
pub struct ConnectionInfo {
    pub device_id: String,
    /// From the first status read/notification's `Firmware:` line (SPEC §7.3).
    pub firmware_version: String,
    pub connected: bool,
}

/// One entry from `GET /files` (SPEC §6.1).
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
pub struct DeviceFile {
    pub name: String,
    pub size_bytes: u64,
    /// 32 lowercase hex chars, or `None` if the file's header was unreadable
    /// (SPEC §6.1: "omitted only if the header is unreadable").
    #[serde(default)]
    pub session_id: Option<String>,
}
```

Note the `DeviceFile` field is `size_bytes` here (unit-suffixed per this lane's convention)
while SPEC's JSON key is `size` — `#[serde(rename = "size")]` belongs on this field once
Task 6 adds the actual `GET /files` deserialisation path; recorded here as an Open question
(3) rather than guessed, because the JSON key rename interacts with whether `list_device_files`
(C3 §3.8) reuses this exact struct or maps it — see Open question 3.

`lib.rs`:
```rust
//! Device transport and LAN sync for idl1.
//!
//! This crate owns every byte that leaves or enters the machine: BLE to the
//! logger, WiFi transfer against the device's HTTP protocol (SPEC §6), config
//! push (SPEC §8), and peer sync on the pit-lane LAN. It never processes
//! signals — that is `idl-rs` — and `idl-rs` never depends on this crate.
//!
//! M0 shipped only the typed error. L4 (this lane) adds the desktop BLE/WiFi
//! device client; L11 later adds LAN peer sync beside it.

pub mod ble_config;
pub mod ble_control;
pub mod ble_status;
pub mod ble_transport;
pub mod device;
pub mod error;
pub mod wifi_transport;

pub use device::{ConnectionInfo, DeviceFile, DiscoveredDevice};
pub use error::{TransportError, TransportErrorKind};
```

- [ ] **Step 3: Build**

Run: `cargo build -p idl-transport 2>&1 | tail -20`
Expected: fails only on the commented-out `reqwest` line being needed later — at this step the
five new modules are empty stubs (`ble_config.rs` etc. each just their module doc comment for
now, filled in Tasks 2–7) plus `device.rs`, so `Finished` is expected. If any module file is
missing, `cargo build` names it — create an empty doc-commented stub, do not skip ahead.

---

### Task 2: BLE status characteristic parser (SPEC §7.3)

**Files:**
- Create (fill in): `rust/transport/src/ble_status.rs`

**Interfaces:**
- Produces: `parse_status(text: &str) -> DeviceStatus`, consumed by `ble_transport.rs` (Task 5)
  for FF04 notifications and by `wifi_transport.rs` (Task 6) for `/ping`'s mirrored fields
  (SPEC §6.1: "`ble` is `on` until `/handoff`... the remaining fields mirror the §7.3 status
  characteristic").

- [ ] **Step 1: Write the failing tests**

```rust
//! SPEC §7.3 status-characteristic parsing. UTF-8, newline-delimited,
//! case-insensitive keys, unknown lines ignored so the set may grow without
//! breaking older parsers. Never fails — a block with no recognised lines
//! yields `DeviceStatus::default()` (CLAUDE.md §5: never a crash on bad data).

/// One snapshot of device status, decoded from either the FF04 notify
/// payload (idle/recording modes) or `/ping`'s JSON body flattened to the
/// same line shape by the caller (SPEC §6.1, §7.3) — both carry the same
/// field set.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct DeviceStatus {
    pub wifi_on: Option<bool>,
    pub logging: Option<bool>,
    pub battery_pct: Option<u8>,
    pub sd: Option<SdState>,
    pub gps: Option<GpsState>,
    pub imu: Option<ImuState>,
    /// Running image's `esp_app_desc_t.version`, e.g. `"1.5.0"`.
    pub firmware: Option<String>,
    /// `true` only while the `OTA: PENDING_VERIFY` line is present.
    pub ota_pending_verify: bool,
    /// Raw HR line value (`ABSENT`, `SEARCHING`, `"CONNECTED 132"`, …) — kept
    /// as a string pending a typed enum decision, see Open question 4.
    pub hr: Option<String>,
    pub hr_battery_pct: Option<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SdState { Ok, Full, Error, Absent }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GpsState { Fix, NoFix, Absent }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImuState { Ok, Partial, Error, Absent }

/// Parses a §7.3-shaped status block. Unknown lines are ignored; a
/// malformed value for a known key (e.g. `Battery: NN%` with non-numeric
/// `NN`) leaves that field `None` rather than failing the whole parse.
pub fn parse_status(text: &str) -> DeviceStatus {
    let mut status = DeviceStatus::default();
    for line in text.lines() {
        let Some((key, value)) = line.trim().split_once(':') else { continue };
        let key = key.trim().to_ascii_lowercase();
        let value = value.trim();
        match key.as_str() {
            "wifi" => status.wifi_on = Some(value.eq_ignore_ascii_case("on")),
            "logging" => status.logging = Some(value.eq_ignore_ascii_case("running")),
            "battery" => status.battery_pct = value.trim_end_matches('%').parse().ok(),
            "sd" => status.sd = parse_sd_state(value),
            "gps" => status.gps = parse_gps_state(value),
            "imu" => status.imu = parse_imu_state(value),
            "firmware" => status.firmware = Some(value.to_string()),
            "ota" => status.ota_pending_verify = value.eq_ignore_ascii_case("pending_verify"),
            "hr" => status.hr = Some(value.to_string()),
            "hr_battery" => status.hr_battery_pct = value.trim_end_matches('%').parse().ok(),
            _ => {} // unknown line — SPEC §7.3, ignored so the set may grow
        }
    }
    status
}

fn parse_sd_state(v: &str) -> Option<SdState> {
    match v.to_ascii_uppercase().as_str() {
        "OK" => Some(SdState::Ok),
        "FULL" => Some(SdState::Full),
        "ERROR" => Some(SdState::Error),
        "ABSENT" => Some(SdState::Absent),
        _ => None,
    }
}

fn parse_gps_state(v: &str) -> Option<GpsState> {
    match v.to_ascii_uppercase().as_str() {
        "FIX" => Some(GpsState::Fix),
        "NOFIX" => Some(GpsState::NoFix),
        "ABSENT" => Some(GpsState::Absent),
        _ => None,
    }
}

fn parse_imu_state(v: &str) -> Option<ImuState> {
    match v.to_ascii_uppercase().as_str() {
        "OK" => Some(ImuState::Ok),
        "PARTIAL" => Some(ImuState::Partial),
        "ERROR" => Some(ImuState::Error),
        "ABSENT" => Some(ImuState::Absent),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_status_full_block_recording_mode_reads_every_field() {
        // Arrange
        let text = "WiFi: OFF\nLogging: RUNNING\nBattery: 87%\nSD: OK\nGPS: FIX\nIMU: PARTIAL\n\
                    Firmware: 1.4.0\nHR: CONNECTED 132\nHR_Battery: 91%";

        // Act
        let status = parse_status(text);

        // Assert
        assert_eq!(status.wifi_on, Some(false));
        assert_eq!(status.logging, Some(true));
        assert_eq!(status.battery_pct, Some(87));
        assert_eq!(status.sd, Some(SdState::Ok));
        assert_eq!(status.gps, Some(GpsState::Fix));
        assert_eq!(status.imu, Some(ImuState::Partial));
        assert_eq!(status.firmware, Some("1.4.0".to_string()));
        assert_eq!(status.hr, Some("CONNECTED 132".to_string()));
        assert_eq!(status.hr_battery_pct, Some(91));
        assert!(!status.ota_pending_verify);
    }

    #[test]
    fn parse_status_ota_pending_verify_line_present_sets_flag() {
        // Arrange
        let text = "WiFi: OFF\nOTA: PENDING_VERIFY";

        // Act
        let status = parse_status(text);

        // Assert
        assert!(status.ota_pending_verify);
    }

    #[test]
    fn parse_status_unknown_line_ignored_known_fields_still_parse() {
        // Arrange
        let text = "WiFi: ON\nSomeFutureField: 42\nBattery: 50%";

        // Act
        let status = parse_status(text);

        // Assert
        assert_eq!(status.wifi_on, Some(true));
        assert_eq!(status.battery_pct, Some(50));
    }

    #[test]
    fn parse_status_lowercase_keys_and_values_parse_case_insensitively() {
        // Arrange
        let text = "wifi: on\nsd: ok\ngps: nofix";

        // Act
        let status = parse_status(text);

        // Assert
        assert_eq!(status.wifi_on, Some(true));
        assert_eq!(status.sd, Some(SdState::Ok));
        assert_eq!(status.gps, Some(GpsState::NoFix));
    }

    #[test]
    fn parse_status_empty_block_returns_default() {
        // Arrange
        let text = "";

        // Act
        let status = parse_status(text);

        // Assert
        assert_eq!(status, DeviceStatus::default());
    }
}
```

- [ ] **Step 2: Run the tests**

Run: `cargo test -p idl-transport ble_status:: 2>&1 | grep -E "^test |^test result"`
Expected: 5 tests `ok`, `0 failed`.

---

### Task 3: BLE control commands and ACK protocol (SPEC §7.2)

**Files:**
- Create (fill in): `rust/transport/src/ble_control.rs`

**Interfaces:**
- Produces: `ControlCommand` (the nine single-byte commands), `AckCode::from_byte`, consumed by
  `ble_transport.rs` (Task 5).

- [ ] **Step 1: Write the failing tests**

```rust
//! SPEC §7.2 control-characteristic (FF03) command bytes and the ACK
//! protocol every write to it returns.

/// Single-byte commands written to the Control characteristic (FF03),
/// Write with Response (SPEC §7.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum ControlCommand {
    WifiOn = 0x01,
    WifiOff = 0x02,
    StartLogging = 0x03,
    StopLogging = 0x04,
    CalibrateImu = 0x05,
    OtaConfirm = 0x06,
    ConfigBegin = 0x07,
    ConfigCommit = 0x08,
    ConfigReadBegin = 0x09,
}

impl ControlCommand {
    /// The single byte written to FF03 for this command.
    pub fn as_byte(self) -> u8 {
        self as u8
    }
}

/// The GATT write-response ACK code every Control write returns (SPEC
/// §7.2). `0x00` means only "accepted and dispatched" — not "completed";
/// completion is the corresponding FF04 status notify.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AckCode {
    Success,
    /// `0x03` — mutex or precondition refusal (SPEC §7.2 "Mutex").
    WriteNotPermitted,
    /// `0x80` — reserved (SPEC §7.2 `IDL0_ACK_BUSY`).
    Busy,
    /// `0x81` — reserved (SPEC §7.2 `IDL0_ACK_PRECONDITION`).
    Precondition,
    /// `0x82` — reserved (SPEC §7.2 `IDL0_ACK_NOT_IMPLEMENTED`).
    NotImplemented,
    /// A code SPEC §7.2 doesn't document — SPEC reserves the space for
    /// firmware growth; never treated as success.
    Unknown(u8),
}

impl AckCode {
    pub fn from_byte(b: u8) -> Self {
        match b {
            0x00 => AckCode::Success,
            0x03 => AckCode::WriteNotPermitted,
            0x80 => AckCode::Busy,
            0x81 => AckCode::Precondition,
            0x82 => AckCode::NotImplemented,
            other => AckCode::Unknown(other),
        }
    }

    /// `true` only for `0x00` — every other code, including `Unknown`, is a refusal.
    pub fn is_success(self) -> bool {
        matches!(self, AckCode::Success)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn control_command_as_byte_matches_spec_table_for_every_variant() {
        // Arrange
        let commands = [
            (ControlCommand::WifiOn, 0x01),
            (ControlCommand::WifiOff, 0x02),
            (ControlCommand::StartLogging, 0x03),
            (ControlCommand::StopLogging, 0x04),
            (ControlCommand::CalibrateImu, 0x05),
            (ControlCommand::OtaConfirm, 0x06),
            (ControlCommand::ConfigBegin, 0x07),
            (ControlCommand::ConfigCommit, 0x08),
            (ControlCommand::ConfigReadBegin, 0x09),
        ];

        // Act / Assert
        for (cmd, byte) in commands {
            assert_eq!(cmd.as_byte(), byte);
        }
    }

    #[test]
    fn ack_code_from_byte_documented_codes_map_correctly() {
        // Arrange
        let codes = [
            (0x00u8, AckCode::Success),
            (0x03, AckCode::WriteNotPermitted),
            (0x80, AckCode::Busy),
            (0x81, AckCode::Precondition),
            (0x82, AckCode::NotImplemented),
        ];

        // Act / Assert
        for (byte, expected) in codes {
            assert_eq!(AckCode::from_byte(byte), expected);
        }
    }

    #[test]
    fn ack_code_from_byte_undocumented_code_is_unknown_not_success() {
        // Arrange
        let byte = 0x7f;

        // Act
        let code = AckCode::from_byte(byte);

        // Assert
        assert_eq!(code, AckCode::Unknown(0x7f));
        assert!(!code.is_success());
    }

    #[test]
    fn ack_code_is_success_true_only_for_0x00() {
        // Arrange
        let codes = [
            AckCode::Success,
            AckCode::WriteNotPermitted,
            AckCode::Busy,
            AckCode::Precondition,
            AckCode::NotImplemented,
            AckCode::Unknown(0x99),
        ];

        // Act
        let successes: Vec<bool> = codes.iter().map(|c| c.is_success()).collect();

        // Assert
        assert_eq!(successes, [true, false, false, false, false, false]);
    }
}
```

- [ ] **Step 2: Run the tests**

Run: `cargo test -p idl-transport ble_control:: 2>&1 | grep -E "^test |^test result"`
Expected: 4 tests `ok`, `0 failed`.

---

### Task 4: BLE config push/read-back framing (SPEC §7.2)

**Files:**
- Create (fill in): `rust/transport/src/ble_config.rs`

**Interfaces:**
- Produces: `chunk_config`, `validate_config_size`, `reassemble_config_reads`,
  `configs_match` — pure functions Task 5 wires to real FF05/FF06 GATT calls.
- Consumes: nothing (no dependency on `idl-rs` core's `parse_config` — this module never
  interprets the JSON, only its byte length, per the layer-boundary note above).

- [ ] **Step 1: Write the failing tests**

```rust
//! SPEC §7.2 config push/read-back byte framing. This module treats
//! `idl0_config.json` as an opaque byte string throughout — SPEC schema
//! validation is `idl-rs` core's `parse_config`/`ConfigErrorKind` (C3 §3.8),
//! never this crate's job (CLAUDE.md §2 layer rule: transport is I/O only).

use crate::{TransportError, TransportErrorKind};

/// SPEC §7.2: "opening an 8 KB reassembly buffer on the device."
pub const CONFIG_BUFFER_MAX_BYTES: usize = 8 * 1024;

/// SPEC §7.2: Config TX (FF06) "each read returns the next ≤200-byte chunk."
pub const CONFIG_READ_CHUNK_MAX_BYTES: usize = 200;

/// Client-side pre-check before starting a BEGIN/chunk/COMMIT sequence — SPEC
/// §7.2 says the device itself rejects an over-size buffer at COMMIT
/// (`0x80`/`0x81`), so this is a chosen-not-spec'd optimisation: refuse
/// locally rather than spend a full BLE round trip on a doomed push. See
/// Open question 5 — drop this check if a reviewer prefers matching the
/// device's own rejection point exactly.
pub fn validate_config_size(json: &[u8]) -> Result<(), TransportError> {
    if json.len() > CONFIG_BUFFER_MAX_BYTES {
        return Err(TransportError::new(
            TransportErrorKind::Config,
            format!(
                "config is {} bytes, exceeds the device's {}-byte reassembly buffer",
                json.len(),
                CONFIG_BUFFER_MAX_BYTES
            ),
        ));
    }
    Ok(())
}

/// Splits `json` into `chunk_size`-byte pieces (the last shorter) for
/// sequential Write-with-Response calls to Config RX (FF05). `chunk_size`
/// comes from the connection's negotiated MTU minus ATT overhead (Task 5 —
/// see Open question 6 on why the exact value isn't fixed here).
pub fn chunk_config(json: &[u8], chunk_size: usize) -> Vec<&[u8]> {
    if chunk_size == 0 || json.is_empty() {
        return Vec::new();
    }
    json.chunks(chunk_size).collect()
}

/// Reassembles the Config TX (FF06) read loop: calls `read_chunk` repeatedly
/// and concatenates until it returns an empty `Vec` (SPEC §7.2 "until an
/// empty read signals EOF"). `read_chunk` is injected so this logic is
/// testable without a real GATT read.
pub fn reassemble_config_reads(
    mut read_chunk: impl FnMut() -> Result<Vec<u8>, TransportError>,
) -> Result<Vec<u8>, TransportError> {
    let mut out = Vec::new();
    loop {
        let chunk = read_chunk()?;
        if chunk.is_empty() {
            return Ok(out);
        }
        out.extend_from_slice(&chunk);
    }
}

/// SPEC §7.2's push-verification check: "compares it (compact JSON) to what
/// it sent." Byte equality — normalising to compact form (if the two ever
/// differ in whitespace) is core's job upstream of this call, not this
/// crate's (see the layer-boundary note above).
pub fn configs_match(sent: &[u8], read_back: &[u8]) -> bool {
    sent == read_back
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_config_size_under_limit_returns_ok() {
        // Arrange
        let json = vec![0u8; CONFIG_BUFFER_MAX_BYTES];

        // Act
        let result = validate_config_size(&json);

        // Assert
        assert!(result.is_ok());
    }

    #[test]
    fn validate_config_size_over_limit_returns_config_error() {
        // Arrange
        let json = vec![0u8; CONFIG_BUFFER_MAX_BYTES + 1];

        // Act
        let result = validate_config_size(&json);

        // Assert
        let err = result.unwrap_err();
        assert_eq!(err.kind, TransportErrorKind::Config);
    }

    #[test]
    fn chunk_config_ten_bytes_chunk_size_four_yields_three_chunks_last_shorter() {
        // Arrange
        let json = b"0123456789";

        // Act
        let chunks = chunk_config(json, 4);

        // Assert
        assert_eq!(chunks, vec![&b"0123"[..], &b"4567"[..], &b"89"[..]]);
    }

    #[test]
    fn chunk_config_empty_input_yields_no_chunks() {
        // Arrange
        let json: &[u8] = b"";

        // Act
        let chunks = chunk_config(json, 20);

        // Assert
        assert!(chunks.is_empty());
    }

    #[test]
    fn reassemble_config_reads_three_chunks_then_empty_concatenates_in_order() {
        // Arrange
        let mut reads = vec![b"abc".to_vec(), b"def".to_vec(), Vec::new()].into_iter();
        let read_chunk = move || Ok(reads.next().unwrap());

        // Act
        let result = reassemble_config_reads(read_chunk).unwrap();

        // Assert
        assert_eq!(result, b"abcdef");
    }

    #[test]
    fn reassemble_config_reads_immediate_empty_returns_empty_vec() {
        // Arrange
        let read_chunk = || Ok(Vec::new());

        // Act
        let result = reassemble_config_reads(read_chunk).unwrap();

        // Assert
        assert!(result.is_empty());
    }

    #[test]
    fn reassemble_config_reads_propagates_read_error() {
        // Arrange
        let read_chunk = || {
            Err(TransportError::new(TransportErrorKind::Ble, "disconnected"))
        };

        // Act
        let result = reassemble_config_reads(read_chunk);

        // Assert
        assert!(result.is_err());
    }

    #[test]
    fn configs_match_identical_bytes_true_differing_bytes_false() {
        // Arrange
        let sent = b"{\"a\":1}";
        let same = b"{\"a\":1}";
        let different = b"{\"a\":2}";

        // Act / Assert
        assert!(configs_match(sent, same));
        assert!(!configs_match(sent, different));
    }
}
```

- [ ] **Step 2: Run the tests**

Run: `cargo test -p idl-transport ble_config:: 2>&1 | grep -E "^test |^test result"`
Expected: 8 tests `ok`, `0 failed`.

---

### Task 5: `BleTransport` trait and the `btleplug`-backed implementation

**Files:**
- Create (fill in): `rust/transport/src/ble_transport.rs`

**Interfaces:**
- Produces: `pub trait BleTransport`, `pub struct BtleplugBle` (the desktop implementation),
  `pub mod uuids`. This is the trait L9's mobile plugins implement later (design §7); nothing
  in this lane's code calls into `app/src-tauri` or `tauri` — L5 does that wiring.
- Consumes: `ble_status::parse_status`, `ble_control::{ControlCommand, AckCode}`,
  `ble_config::*` (Tasks 2–4), `device::{DiscoveredDevice, ConnectionInfo}` (Task 1).

- [ ] **Step 1: SPEC §7.1 UUIDs**

```rust
//! `BleTransport`: the trait L9's mobile plugins implement against, and
//! `BtleplugBle`, the `btleplug`-backed desktop implementation (SPEC §7).

use std::time::Duration;
use tokio::sync::mpsc;

use crate::device::{ConnectionInfo, DiscoveredDevice};
use crate::ble_status::DeviceStatus;
use crate::ble_control::ControlCommand;
use crate::{TransportError, TransportErrorKind};

/// SPEC §7.1 GATT service and characteristic UUIDs.
pub mod uuids {
    /// Service UUID scanned for (SPEC §7.4 step 1).
    pub const SERVICE: &str = "000000ff-0000-1000-8000-00805f9b34fb";
    pub const IMU_DATA: &str = "0000ff01-0000-1000-8000-00805f9b34fb";
    pub const GPS_DATA: &str = "0000ff02-0000-1000-8000-00805f9b34fb";
    pub const CONTROL: &str = "0000ff03-0000-1000-8000-00805f9b34fb";
    pub const STATUS: &str = "0000ff04-0000-1000-8000-00805f9b34fb";
    pub const CONFIG_RX: &str = "0000ff05-0000-1000-8000-00805f9b34fb";
    pub const CONFIG_TX: &str = "0000ff06-0000-1000-8000-00805f9b34fb";
}
```

- [ ] **Step 2: The trait**

```rust
/// Abstraction over the BLE control/status/config link to one IDL0 device
/// (SPEC §7). `BtleplugBle` (below) implements it for desktop; a Tauri
/// mobile plugin (L9) implements it against the platform BLE stack behind
/// the same trait, so `idl-rs-tauri`'s device commands (C3 §3.8) are one
/// code path on every platform — the desktop and mobile Tauri app crates
/// each pick their concrete implementation at compile time (separate build
/// targets), so this trait does not need to be `dyn`-safe; see Open
/// question 2.
pub trait BleTransport {
    /// Scans for `uuids::SERVICE` for up to `timeout`. Devices found are
    /// sent on the returned channel as they're discovered — resolves this
    /// lane's shape for C3 §3.8's `ble_scan` (C3 open question 6: "the
    /// transport crate's actual `btleplug` usage will make the natural
    /// shape obvious" — a live channel, not a batch return, because
    /// `btleplug`'s own scan API is event-based). L5 drains this channel
    /// into the command's `Channel<DeviceDiscovered>` argument.
    async fn scan(
        &self,
        timeout: Duration,
    ) -> Result<mpsc::Receiver<DiscoveredDevice>, TransportError>;

    /// Connects, negotiates MTU (see Open question 7 — `btleplug`'s MTU API
    /// is not uniform across platforms), enables Status notifications and
    /// reads the initial status (SPEC §7.4).
    async fn connect(&mut self, device_id: &str) -> Result<ConnectionInfo, TransportError>;

    async fn disconnect(&mut self) -> Result<(), TransportError>;

    /// One-shot status read (SPEC §7.4 step 4).
    async fn read_status(&self) -> Result<DeviceStatus, TransportError>;

    /// Subscribes to Status (FF04) notifications; each parsed `DeviceStatus`
    /// is sent on the returned channel until `disconnect` or the sender is
    /// dropped device-side.
    async fn watch_status(&self) -> Result<mpsc::Receiver<DeviceStatus>, TransportError>;

    /// Writes one command byte to Control (FF03), Write with Response, and
    /// maps the ACK (SPEC §7.2). Returns `Ok(())` only for `AckCode::Success`
    /// — any other code is a `TransportErrorKind::Ble` with the code in the
    /// message (mutex refusals per SPEC §7.2 "Mutex" included — this trait
    /// does not special-case them, callers read the message).
    async fn send_command(&self, cmd: ControlCommand) -> Result<(), TransportError>;

    /// Pushes an already-validated config JSON string over FF05, framed
    /// BEGIN/chunks/COMMIT (SPEC §7.2, `ble_config::chunk_config`). Returns
    /// once COMMIT is ACKed `Success` — the device then reboots; awaiting
    /// the reboot/reconnect and the read-back verify (SPEC §7.2) is the
    /// caller's job (L5), composed from this method plus `connect` and
    /// `read_config`, not folded into one call here.
    async fn push_config(&self, config_json: &[u8]) -> Result<(), TransportError>;

    /// Reads the live config back via CMD_CONFIG_READ_BEGIN + the FF06 read
    /// loop (SPEC §7.2, `ble_config::reassemble_config_reads`). Returns
    /// `TransportErrorKind::Ble` if READ_BEGIN ACKs `0x81` (no config file).
    async fn read_config(&self) -> Result<Vec<u8>, TransportError>;
}
```

- [ ] **Step 3: `BtleplugBle` — desktop implementation**

```rust
/// `btleplug`-backed desktop `BleTransport`. Holds the platform `Manager`/
/// `Adapter` and, once connected, the `btleplug::platform::Peripheral`.
pub struct BtleplugBle {
    // btleplug::platform::{Manager, Adapter, Peripheral} fields — exact
    // shape follows btleplug 0.13.0's actual API once Task 5 is
    // implemented (not pinned by any contract; see Open question 8).
}

impl BtleplugBle {
    /// Creates a manager and picks the first available adapter. Returns
    /// `TransportErrorKind::Ble` if no Bluetooth adapter is present.
    pub async fn new() -> Result<Self, TransportError> {
        unimplemented!("Task 5 implementer: btleplug::platform::Manager::new(), \
            .adapters().await, pick adapters[0] or error TransportErrorKind::Ble \
            \"no Bluetooth adapter\"")
    }
}

impl BleTransport for BtleplugBle {
    // Task 5 implementer fills in each method against btleplug 0.13.0's
    // actual Central/Peripheral trait API (Manager::adapters, Adapter::
    // start_scan(ScanFilter), CentralEvent::DeviceDiscovered, Peripheral::
    // connect/discover_services/write/read/subscribe/notifications). No
    // real-hardware unit tests here (Task 9 verifies against the device);
    // keep each method a thin translation to/from Tasks 2–4's pure types
    // so review can check it against SPEC line by line.
}
```

The body is intentionally `unimplemented!`/prose here: `btleplug`'s exact 0.13.0 API (which
traits are in scope, whether `Peripheral` methods take `&self` or `&mut self`, the notification
stream type) is not fixed by any contract and is exactly the kind of "state your chosen
approach, flag genuine uncertainty" item CLAUDE.md §1 allows working through in the
implementation task itself rather than guessed here — see Open question 8. The trait in Step 2
*is* fixed by this plan; the struct's internals are the implementer's job, checked by Task 9's
real-device step, not by a unit test.

- [ ] **Step 4: Build**

Run: `cargo build -p idl-transport 2>&1 | tail -20`
Expected: `Finished` (the `unimplemented!()` bodies compile; they only panic if called, and
nothing calls them yet).

---

### Task 6: `WifiTransport` trait and the `reqwest`-backed implementation (SPEC §6)

**Blocked on Open question 1** (`reqwest` pin) — do not start until the lead has added a pin to
`docs/superpowers/specs/2026-09-02-idl1-m0-ecosystem.md` or answered directly; do not guess.

**Files:**
- Create (fill in): `rust/transport/src/wifi_transport.rs`
- Modify: `rust/transport/Cargo.toml` (uncomment `reqwest` with the real pin)

**Interfaces:**
- Produces: `pub trait WifiTransport`, `pub struct ReqwestWifi`, `PingResponse`,
  `range_header`/`parse_content_range` (pure, unit-tested), `list_files`/`download`/
  `push_config`/`handoff`/`wifi_off`/`delete`/`push_ota` methods covering every SPEC §6.1
  endpoint.
- Consumes: `device::DeviceFile` (Task 1).

- [ ] **Step 1: Pure Range-header helpers — failing tests first**

```rust
//! `WifiTransport`: the trait L9's mobile plugins implement for the WiFi
//! side, and `ReqwestWifi`, the `reqwest`-backed desktop implementation
//! (SPEC §6). SPEC §6.2's Android network-binding proxy is explicitly out
//! of scope here (design §7: "Mobile ... WiFi-network binding are Tauri
//! mobile plugins ... Isaac's lane"; SPEC §6.2: "On every other platform
//! the app talks to 192.168.4.1 directly and the user joins the AP in
//! system settings") — desktop always talks to the fixed AP IP directly.

use crate::device::DeviceFile;
use crate::{TransportError, TransportErrorKind};

/// The device's fixed WiFi-mode IP (SPEC §6, AP mode, no router).
pub const DEVICE_BASE_URL: &str = "http://192.168.4.1";

/// Builds the `Range` request header for a resumed download starting at
/// `resume_from` bytes (SPEC §6.1 `/download`: "`Range: bytes=START[-END]`
/// supported").
pub fn range_header(resume_from: u64) -> String {
    format!("bytes={resume_from}-")
}

/// Parses a `Content-Range` response header of the form `bytes start-end/total`
/// (or `bytes start-end/*` if the device doesn't report total size). Returns
/// `None` for anything not matching that shape.
pub fn parse_content_range(header: &str) -> Option<(u64, u64, Option<u64>)> {
    let rest = header.strip_prefix("bytes ")?;
    let (range, total) = rest.split_once('/')?;
    let (start, end) = range.split_once('-')?;
    let start: u64 = start.parse().ok()?;
    let end: u64 = end.parse().ok()?;
    let total = if total == "*" { None } else { total.parse().ok() };
    Some((start, end, total))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn range_header_resume_from_1000_bytes_formats_open_ended_range() {
        // Arrange
        let resume_from = 1000u64;

        // Act
        let header = range_header(resume_from);

        // Assert
        assert_eq!(header, "bytes=1000-");
    }

    #[test]
    fn range_header_resume_from_zero_formats_bytes_zero_dash() {
        // Arrange
        let resume_from = 0u64;

        // Act
        let header = range_header(resume_from);

        // Assert
        assert_eq!(header, "bytes=0-");
    }

    #[test]
    fn parse_content_range_known_total_returns_start_end_total() {
        // Arrange
        let header = "bytes 1000-1999/5000";

        // Act
        let parsed = parse_content_range(header);

        // Assert
        assert_eq!(parsed, Some((1000, 1999, Some(5000))));
    }

    #[test]
    fn parse_content_range_unknown_total_star_returns_none_total() {
        // Arrange
        let header = "bytes 0-999/*";

        // Act
        let parsed = parse_content_range(header);

        // Assert
        assert_eq!(parsed, Some((0, 999, None)));
    }

    #[test]
    fn parse_content_range_malformed_header_returns_none() {
        // Arrange
        let header = "not a content-range header";

        // Act
        let parsed = parse_content_range(header);

        // Assert
        assert_eq!(parsed, None);
    }
}
```

- [ ] **Step 2: Run the pure-logic tests**

Run: `cargo test -p idl-transport wifi_transport:: 2>&1 | grep -E "^test |^test result"`
Expected: 5 tests `ok`, `0 failed`.

- [ ] **Step 3: `PingResponse` and the identity check**

```rust
/// `GET /ping` response body (SPEC §6.1).
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
pub struct PingResponse {
    pub device: String,
    pub fw: String,
    pub proto: u32,
    pub battery: u8,
    pub sd: String,
    pub mode: String,
    pub ble: String,
}

/// Checks `/ping`'s `device` field against the name the app expects before
/// trusting the link (SPEC §6.1: "the app verifies it against the expected
/// device before trusting the link — every IDL0 AP shares `192.168.4.1`").
pub fn verify_device_identity(
    ping: &PingResponse,
    expected_name: &str,
) -> Result<(), TransportError> {
    if ping.device != expected_name {
        return Err(TransportError::new(
            TransportErrorKind::Wifi,
            format!("connected to {}, expected {}", ping.device, expected_name),
        ));
    }
    Ok(())
}
```

Add a test `verify_device_identity_mismatched_name_returns_wifi_error` (matching name → `Ok`,
mismatched name → `Err` with `TransportErrorKind::Wifi`) following the Task 4 pattern.

- [ ] **Step 4: The trait**

```rust
/// Abstraction over the WiFi/HTTP link to one IDL0 device in WiFi mode
/// (SPEC §6). `ReqwestWifi` implements it for desktop; L9's mobile plugin
/// implements it wrapping the platform's network-binding proxy (SPEC §6.2)
/// behind the same trait.
pub trait WifiTransport {
    /// `GET /ping` (SPEC §6.1) — status + identity check.
    async fn ping(&self) -> Result<PingResponse, TransportError>;

    /// `POST /handoff` (SPEC §6.1) — idempotent.
    async fn handoff(&self) -> Result<(), TransportError>;

    /// `POST /wifi_off` (SPEC §6.1) — the normal WiFi-exit path.
    async fn wifi_off(&self) -> Result<(), TransportError>;

    /// `GET /files` (SPEC §6.1).
    async fn list_files(&self) -> Result<Vec<DeviceFile>, TransportError>;

    /// `GET /download?file=N`, resumable via `Range` (SPEC §6.1). Streams
    /// into `sink` starting at `resume_from` bytes (`0` for a fresh
    /// download); calls `on_progress(done_bytes, total_bytes)` as chunks
    /// arrive. Returns the total bytes written this call (not including
    /// `resume_from`). `sink`/`on_progress` are generic so this trait names
    /// no `idl-rs` core or Tauri type (CLAUDE.md layer rule) — L5 supplies a
    /// temp-file sink and forwards progress into a `Channel<Progress>`.
    async fn download(
        &self,
        file_index: u32,
        resume_from: u64,
        sink: &mut (dyn tokio::io::AsyncWrite + Unpin + Send),
        on_progress: &mut (dyn FnMut(u64, Option<u64>) + Send),
    ) -> Result<u64, TransportError>;

    /// `GET /delete?file=N` (SPEC §6.1).
    async fn delete(&self, file_index: u32) -> Result<(), TransportError>;

    /// `POST /config` (SPEC §6.1) — the WiFi fallback path; BLE
    /// (`BleTransport::push_config`) is primary (SPEC §7.2). Same opaque
    /// `&[u8]` contract as the BLE method — no schema knowledge here either.
    async fn push_config(&self, config_json: &[u8]) -> Result<(), TransportError>;

    /// `POST /ota` (SPEC §6.1) — raw firmware image body,
    /// `Content-Type: application/octet-stream`, `Content-Length` set.
    async fn push_ota(&self, firmware_image: &[u8]) -> Result<(), TransportError>;
}
```

- [ ] **Step 5: `ReqwestWifi` — desktop implementation**

```rust
/// `reqwest`-backed desktop `WifiTransport`, always against
/// `DEVICE_BASE_URL` (SPEC §6.2: desktop joins the AP in system settings,
/// no network-binding proxy).
pub struct ReqwestWifi {
    client: reqwest::Client,
    base_url: String,
}

impl ReqwestWifi {
    /// `base_url` is a constructor parameter (not hardcoded to
    /// `DEVICE_BASE_URL`) so tests can point it at a local mock HTTP server
    /// (Task 8) without touching a real device.
    pub fn new(base_url: impl Into<String>) -> Self {
        Self { client: reqwest::Client::new(), base_url: base_url.into() }
    }
}

impl WifiTransport for ReqwestWifi {
    // Task 6 implementer fills in each method: build the request against
    // `self.base_url`, map non-2xx/network errors to
    // TransportErrorKind::Wifi (io-level) — `download` is the one method
    // needing real logic (send with the `range_header` for `resume_from`,
    // stream `.bytes_stream()` into `sink` via `tokio::io::AsyncWriteExt::
    // write_all`, call `on_progress` per chunk, parse the response's
    // `Content-Range` via `parse_content_range` to know the total if
    // present). No `unwrap()` on a response body — a malformed `/files` or
    // `/ping` JSON body is `TransportErrorKind::Wifi`, not a panic.
}
```

- [ ] **Step 6: Build**

Run: `cargo build -p idl-transport 2>&1 | tail -20`
Expected: `Finished`.

---

### Task 7: Wire `BtleplugBle`/`ReqwestWifi` bodies against a fake peer (mocked, automatable)

**Files:**
- Modify: `rust/transport/src/ble_transport.rs`, `rust/transport/src/wifi_transport.rs`
  (implement the bodies left `unimplemented!`/prose in Tasks 5–6)
- Create: test-only fixtures for a fake HTTP server (WiFi side) — no fake BLE peripheral is
  attempted; `btleplug` has no first-party in-process fake, so BLE-side coverage stops at
  Tasks 2–4's pure logic plus Task 9's real device (see Open question 9).

**Interfaces:**
- Produces: working `BtleplugBle`/`ReqwestWifi` bodies. `WifiTransport` is proved end-to-end
  against a mock server in-process; `BleTransport` is proved only at Task 9 (real hardware).

- [ ] **Step 1: Implement `BtleplugBle`'s methods**

Fill in every `BleTransport` method against `btleplug` 0.13.0's actual `Manager`/`Adapter`/
`Peripheral` API (`Central`/`Peripheral` traits, `ScanFilter`, `CentralEvent`,
`Peripheral::write`/`read`/`subscribe`/`notifications`). Each method's job is thin: translate
the trait's plain types to/from `btleplug` calls and hand byte payloads to Tasks 2–4's pure
functions (`ble_status::parse_status` on every notification/read from FF04; `ble_control::
AckCode::from_byte` on every FF03 write-response; `ble_config::{chunk_config,
reassemble_config_reads, configs_match}` for the two config methods). No protocol decision gets
made twice — if a method's logic isn't a straight call into Tasks 2–4, stop and check this plan
covers it (it should) before inventing new framing.

Run: `cargo build -p idl-transport 2>&1 | tail -20`
Expected: `Finished`, no more `unimplemented!` bodies in `ble_transport.rs`.

- [ ] **Step 2: Implement `ReqwestWifi`'s methods**

Fill in every `WifiTransport` method. `list_files` deserialises the `GET /files` JSON array
directly into `Vec<DeviceFile>` (Task 1's struct — resolve Open question 3's rename here).
`download` is the one with real control flow: build the request with `range_header
(resume_from)` when `resume_from > 0`, stream the response body, `write_all` into `sink`,
call `on_progress` per chunk, and if the response is `206`, cross-check its `Content-Range`
via `parse_content_range` against the requested offset (mismatch → `TransportErrorKind::Wifi`,
not silently trusted).

- [ ] **Step 2: A minimal mock HTTP device server for tests**

```rust
// In a test module (rust/transport/src/wifi_transport.rs, #[cfg(test)] mod
// integration, or a tests/ file — implementer's choice, matching existing
// crate test-layout conventions).
//
// Spin up a `tokio::net::TcpListener` on 127.0.0.1:0 (OS-assigned free
// port) inside the test, hand-write minimal HTTP/1.1 responses for /ping,
// /files, and a /download that supports Range, and point `ReqwestWifi::new`
// at `http://127.0.0.1:<port>`. This does not need axum or any new
// dependency — a hand-rolled response is a handful of lines per endpoint
// and keeps this crate's dependency list to what SPEC actually requires.
```

- [ ] **Step 3: Integration-shaped tests over the mock server**

Write tests (Arrange/Act/Assert, `thing_condition_result` names) for: `ping` against a
matching-then-mismatching `device` field (via `verify_device_identity`, already unit-tested in
Task 6 — this test proves the two compose: `ping()` then `verify_device_identity` on the
result); `list_files` against a two-entry JSON array, including one entry with `session_id`
omitted; `download` against a mock server that serves a known byte string, first as a full
`200` response, then resumed from a mid-point offset via `206` + `Content-Range`, asserting the
sink's bytes match exactly the un-fetched suffix and `on_progress` fires with increasing
`done_bytes`.

Run: `cargo test -p idl-transport wifi_transport::integration 2>&1 | grep -E "^test |^test result"`
Expected: every test `ok`, `0 failed`.

---

### Task 8: SPEC §14a — Transport Trait Architecture, and the composed download+config flow

**Files:**
- Modify: `docs/IDL0_SPEC.md` (new `### 14a.` subsection, inserted directly after §14's content
  and before `## 15. Session & File Model`; `14a` rather than renumbering §15–§33, which is out
  of this lane's scope — flagged for the lead as a numbering choice, not a re-derivation of
  SPEC's structure)
- Create: a short composed test (in `ble_transport.rs` or a `tests/` file) proving the
  download+config *sequencing* — BLE `send_command(WifiOn)` → poll `read_status`/
  `watch_status` until `wifi_on == Some(true)` → WiFi `ping` + `list_files` → `download` — using
  the fake peer pieces from Task 7 plus a stub `BleTransport` impl that returns canned
  responses (no real GATT), since this sequencing logic is what L5 will actually call and is
  worth proving once here rather than only at the real device.

**Interfaces:**
- Consumes: everything from Tasks 2–7.
- Produces: the SPEC subsection L5/L9 read before wiring Tauri commands / mobile plugins.

- [ ] **Step 1: Write `docs/IDL0_SPEC.md` §14a**

Working directory for this step only: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l4-transport`
(`docs/IDL0_SPEC.md` lives in the idl1-app top-level repo, not the `rust` submodule — every
other step in this task works in `idl-rs-worktrees\wave1-l4-transport` as usual). Do not commit
yet — Task 9 Step 4 commits this alongside CHANGELOG/TASKS.

```markdown
### 14a. Transport Trait Architecture (idl1)

Added by idl1 lane L4 (`rust/transport`, crate `idl-transport`). Fixes the app-side facts §6–8
leave to the implementation: the Rust trait shapes every platform's device connection code
implements, and the timeout/retry/chunking defaults this lane chose where §6–8 leave them to
the client.

**Traits.** `BleTransport` and `WifiTransport` (`rust/transport/src/ble_transport.rs`,
`wifi_transport.rs`) — one method per §6.1/§7 operation the app needs. Desktop implements both
with `btleplug`/`reqwest` in this crate; a Tauri mobile plugin (L9) implements the same two
traits against the platform BLE stack and WiFi-network-binding proxy (§6.2). Because desktop
and mobile are separate compiled targets, neither trait needs to be object-safe (`dyn`-callable)
— each platform's Tauri app crate picks its concrete type at compile time.

**Config is opaque to this layer.** Both traits' config methods take/return `&[u8]`/`Vec<u8>`
never a parsed struct — §8's schema is validated by `idl-rs` core's `parse_config` before a
byte reaches either trait (contract C3 §3.8). The one config-shaped check this layer owns is
§7.2's push-verification byte comparison (read the pushed config back, compare bytes) — not
JSON parsing.

**BLE scan is a live channel, not a batch return** (resolves contract C3 §2 open question 6):
`BleTransport::scan` returns a `tokio::sync::mpsc::Receiver<DiscoveredDevice>` fed as
`btleplug` reports each discovery, for the duration of the timeout — matching `btleplug`'s own
event-based scan API and C3's `ble_scan(timeout_ms, progress: Channel<DeviceDiscovered>)`
shape, which the Tauri command layer (L5) fulfils by draining this channel into the IPC
`Channel`.

**Chunk size for config push (§7.2 "MTU-sized chunks").** Defaults to 20 bytes (the default
BLE ATT MTU of 23 bytes minus 3 bytes of write-request overhead) when the negotiated MTU can't
be read back from `btleplug` on the connecting platform; uses the negotiated MTU minus 3 when
it can. See Open question 7 in the L4 plan for why this isn't uniform across platforms.

**Download resume.** `WifiTransport::download`'s `resume_from` parameter is the caller's job to
determine (typically: bytes already on disk for a partially-downloaded blob) — this trait
issues the `Range` request and trusts the server's `206`/`Content-Range` echo, erroring
(`TransportErrorKind::Wifi`) rather than silently resuming from the wrong offset if the two
disagree.

**Timeouts.** BLE scan: caller-supplied (`Duration` argument). BLE connect, GATT read/write,
and WiFi requests: no default fixed by this lane — see Open question 10.
```

- [ ] **Step 2: The composed sequencing test**

```rust
// rust/transport/src/ble_transport.rs, #[cfg(test)] mod sequencing (or a
// tests/ file) — a canned-response BleTransport stub (not btleplug) plus
// Task 7's mock WiFi server, proving: send_command(WifiOn) succeeds →
// watch_status/read_status eventually reports wifi_on == Some(true) →
// ReqwestWifi::ping/list_files/download against the mock server succeed in
// that order. This is the sequence L5's `download_file`/`list_device_files`
// Tauri commands (C3 §3.8) actually run; proving it once here means L5's
// own tests can focus on the IPC glue, not re-derive this ordering.
```

Run: `cargo test -p idl-transport sequencing 2>&1 | grep -E "^test |^test result"`
Expected: the test `ok`.

- [ ] **Step 3: Run the whole crate's tests**

Run: `cargo test -p idl-transport 2>&1 | grep -E "^test result|FAILED|error"`
Expected: every `test result:` line `0 failed`; no `error` lines.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l4-transport"
git add transport
git commit -m "transport: BLE/WiFi device client for desktop (SPEC §6-8), traits for L9 mobile

idl-transport gains BleTransport (btleplug) and WifiTransport (reqwest):
status parsing, control commands + ACK protocol, config push/read-back
framing, file listing and resumable download."
```
`docs/IDL0_SPEC.md` lives in `idl1-app`, not the `rust` submodule — its §14a addition is a
separate commit in the `idl1-app-worktrees/wave1-l4-transport` worktree, done in Task 9 Step 3
alongside CHANGELOG/TASKS. The commit above covers only `rust/transport`'s own files.

---

### Task 9: Real-device verification, CHANGELOG/TASKS, lane exit

**Files:**
- Modify: `CHANGELOG.md`, `TASKS.md` (idl1-app repo)
- Modify: `docs/IDL0_SPEC.md` (commit the §14a addition from Task 8, in the idl1-app repo)

- [ ] **Step 1: Automatable pre-check**

Run: `cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l4-transport" && cargo test -p idl-transport 2>&1 | grep -E "^test result"`
Expected: every line `0 failed` (re-confirms Task 8 Step 3 after any Task 7/8 fixes).

Run: `cargo build -p idl-transport --release 2>&1 | tail -5`
Expected: `Finished` — the release profile (used by `npm run tauri dev` per the workspace's
`[profile.dev.package."*"] opt-level = 3` note) links cleanly with the real `btleplug`/
`reqwest` backends, not just the `dev`/test profile.

- [ ] **Step 2: Manual (Isaac, required before lane exit) — download + config against the real device**

Precedent: M0 Task 4 Step 6 / Task 5 Step 6 (every automatable step gets an `Expected:`; the
one step needing physical hardware is called out separately and does not block the rest of
this plan).

With an IDL0 device powered on, in range, and (for the WiFi half) with this Windows machine
joined to its `IDL0-XXXX` AP in Windows network settings:

1. Write a small throwaway `main.rs`/example (or a `#[test] #[ignore]` test run with
   `cargo test -p idl-transport -- --ignored`) that: `BtleplugBle::new()` → `scan(Duration::
   from_secs(5))` and print discovered devices → `connect(<device_id>)` → `read_status()` and
   print it → `send_command(ControlCommand::WifiOn)` → poll `read_status`/`watch_status` for
   `wifi_on == Some(true)`.
   Expected: the device's serial/status LED (or the app's future status panel, not built yet)
   shows WiFi mode entered; the printed `DeviceStatus` has `wifi_on: Some(true)`.
2. `ReqwestWifi::new("http://192.168.4.1")` → `ping()` → assert `device` matches the scanned
   name → `list_files()`.
   Expected: prints at least one file (a prior recorded session) with a `size_bytes` matching
   what's visible via the device's own file browser, if any exists on the SD card; if the card
   is empty, this step instead confirms `list_files()` returns an empty `Vec`, not an error.
3. `download(file_index, 0, sink, on_progress)` on one listed file, to a local file.
   Expected: the downloaded file's byte length matches `DeviceFile::size_bytes`; re-running
   with `resume_from` set to half the file's length (simulating an interrupted download)
   produces the same total bytes when the two halves are concatenated.
4. `push_config(config_json)` with a config JSON that changes one harmless field (e.g.
   `bike_profile.name`) — get `config_json` from `idl-rs` core's (not yet built, out of this
   lane's scope) `parse_config`/serialise path if available by this point, or hand-author a
   valid `idl0_config.json` matching SPEC §8 exactly for this manual step only.
   Expected: the device reboots (~500 ms), BLE reconnects, `read_config()` returns bytes that
   `configs_match` reports equal to what was sent (allowing for the case both are already
   compact JSON with no differing whitespace — verify this by eye if `configs_match` reports
   `false` on a whitespace-only difference, and note it as a follow-up for whichever lane owns
   `parse_config`'s compact-serialisation guarantee).

Record the date, device firmware version (from `ConnectionInfo::firmware_version`), and pass/
fail of each of the four numbered checks in `CHANGELOG.md` (Step 3).

- [ ] **Step 3: CHANGELOG.md and TASKS.md**

`CHANGELOG.md`, under `## [Unreleased]` → `### Added`:
```markdown
- **L4 `idl-transport` desktop device client (<date>).** BLE (`btleplug`) scan/connect/status/
  control/config-push, WiFi (`reqwest`) file listing, resumable download, config-push fallback
  — all behind `BleTransport`/`WifiTransport` traits L9's mobile plugins implement later. SPEC
  gains §14a (trait shapes, chunk/timeout defaults). Verified against a real IDL0 device from
  Windows on <date>, firmware <version> — see `### Verified`.
```

`CHANGELOG.md`, under (new heading if not already present) `### Verified`:
```markdown
- BLE scan/connect/status/WiFi-mode entry, WiFi file list + resumable download, BLE config
  push + read-back verify, real IDL0 device (firmware <version>), Windows desktop, <date>.
```

`TASKS.md`, tick `- [ ] L4 idl-transport desktop` under `## Wave 1 (after M0)` to `- [x]`.

- [ ] **Step 4: Commit (idl1-app)**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l4-transport"
git add docs/IDL0_SPEC.md CHANGELOG.md TASKS.md
git commit -m "docs: L4 transport — SPEC §14a, CHANGELOG/TASKS, real-device verification"
```

- [ ] **Step 5: Write the lane brief**

`runs/2026-09-03/lanes/l4-transport/BRIEF.md` — scope, this plan's path, dependency gate
(none), branch `wave1-l4-transport`, done-criteria, SPEC sections touched (§14a only; §6–8
untouched). Written once, after Task 9 Step 4, not per-task.

---

## Self-review

**Spec coverage (design §10 L4 row):** "BLE (`btleplug`), WiFi transfer, config push; traits
the mobile plugins implement" → Tasks 5 (`BleTransport`), 6–7 (`WifiTransport`), config push
covered by both (`BleTransport::push_config`/`read_config`, `WifiTransport::push_config`
fallback, Task 4's framing). "Done when: Download + config against the real device from
Windows" → Task 9 Step 2, marked Manual/Isaac, not blocking Tasks 1–8.

**Layer rule (CLAUDE.md §2):** no `tauri` dependency anywhere in `rust/transport/Cargo.toml`
across all nine tasks; no DSP (nothing here computes a signal-processing result, only moves
and frames bytes); config *schema* knowledge deliberately kept out (layer-boundary note, Task
1's architecture section) — the one place this could have leaked (config verification) is
byte comparison, not parsing.

**Error discipline (CLAUDE.md §5):** every fallible function across Tasks 2–7 returns
`Result<_, TransportError>`; `TransportErrorKind` is not extended (four variants stay four);
no `Err(String)` anywhere in the code blocks above.

**Placeholder scan:** the only bracketed tokens are `<date>`/`<version>` (Task 9, filled in at
run time) and `<PIN>`/`<device_id>`/`<file_index>` (Task 6's blocked Cargo.toml line and Task
9's manual-step variables, both inputs supplied at execution time, not guesses). `unimplemented!
()` bodies in Task 5 Step 3 are deliberate — filled in by Task 7 Step 1, not left unresolved at
plan's end.

**Type consistency:** `DeviceFile`/`DiscoveredDevice`/`ConnectionInfo` defined Task 1, used
Tasks 5–7; `ControlCommand`/`AckCode` defined Task 3, used Task 5; `ble_config`'s four functions
defined Task 4, used Task 5 Step 3/Task 7 Step 1; `DeviceStatus` defined Task 2, used Tasks 5–8;
`range_header`/`parse_content_range`/`PingResponse`/`verify_device_identity` defined Task 6,
used Task 7.

---

## Open questions

1. **RULED (2026-09-03, lead ruling R7) — resolved.** `reqwest` `0.13.4` (MIT OR Apache-2.0,
   released 2026-05-25), verified against crates.io's own API, added to
   `docs/superpowers/specs/2026-09-02-idl1-m0-ecosystem.md`'s Versions table. Task 6 is unblocked.

2. **No `async-trait`/`futures` dependency — native `async fn` in traits chosen instead.**
   `BleTransport`/`WifiTransport` (Tasks 5–6) use plain `async fn` in the trait definition
   (stable since Rust 1.75, well before this lane), not the `async-trait` crate. This means
   neither trait is `dyn`-safe without extra work (`Box<dyn BleTransport>` doesn't compile as
   written). Chosen because desktop and mobile are separate compiled targets (no runtime
   swapping between `btleplug` and a mobile plugin needed), so no code path actually needs a
   trait object — see SPEC §14a. **Assigned: L5** — if L5's Tauri command layer turns out to
   need runtime polymorphism (e.g. a mock transport injected for its own tests) that this
   assumption doesn't support, it adds `async-trait` (or hand-written boxing) at that point;
   this plan does not add the dependency pre-emptively.

3. **`DeviceFile.size_bytes` vs SPEC's JSON key `size`.** Task 1 names the field
   `size_bytes` (unit-suffixed, this lane's convention) but SPEC §6.1's `/files` JSON uses the
   bare key `size`. Task 7 Step 2 needs a `#[serde(rename = "size")]` (or a `From` conversion
   from a wire-shaped struct) — not written out in Task 1 because the exact mechanism (rename
   attribute vs. two structs) is a Task 7 implementation detail, not a shape decision. **Assigned:
   L4 implementer (Task 7)** — either is fine; whichever is chosen, `DeviceFile` (the type this
   crate exports) keeps the `size_bytes` name so C3 §3.8's `DeviceFile.size_bytes: u64` (already
   signed) matches without a second rename at the Tauri layer.

4. **`DeviceStatus.hr` is a raw string, not a typed enum.** SPEC §7.3's `HR` line has five
   states, one (`CONNECTED N`/`NO_CONTACT N`) carrying a trailing BPM integer. A typed
   `HrState { Absent, Searching, Connected(u16), NoContact(u16), Suspended }` is straightforward
   but wasn't in this lane's explicit scope (SPEC §7.5's HRM central-role config lives in `idl0_
   config.json`, and channel-level HR data (channels 22/23) is core's/L1's parsing job, not
   transport's — this lane only surfaces the *status line*). **Assigned: lead** — decide whether
   a typed `HrState` belongs in `idl-transport` (status display) now or is deferred to whichever
   lane builds the Device tab's HR UI (design §10 L7 row lists "all seven source-config views
   incl. HRM" — L7, wave 2), which may prefer to parse the raw string itself.

5. **`validate_config_size`'s client-side 8 KB pre-check (Task 4) is not itself required by
   SPEC** — SPEC only says the *device* enforces its 8 KB buffer at COMMIT (`0x80`/`0x81`).
   Added here purely to fail fast without a wasted BLE round trip. **Assigned: reviewer** — flag
   for removal if it's judged to duplicate the device's own error path in a way that could drift
   (e.g. if a future firmware raises the buffer size, this constant needs updating in lockstep,
   whereas relying solely on the device's own rejection never goes stale).

6. **Config-push chunk size ("MTU-sized chunks" per SPEC §7.2) is not fixed by any contract.**
   SPEC's own wording defers to whatever MTU was negotiated. Task 5/SPEC §14a states a working
   default (negotiated MTU − 3, falling back to 20 bytes when the MTU can't be read). **Assigned:
   L4 implementer (Task 5/7)** — confirm against Open question 7 below once real GATT MTU
   behaviour on Windows is observed at Task 9.

7. **`btleplug`'s MTU-negotiation API is not uniform across platforms** — some `btleplug`
   backends (BlueZ/Linux) expose an explicit MTU request; CoreBluetooth (macOS/iOS) and
   WinRT (Windows) generally negotiate MTU automatically without a manual request API, and
   `btleplug` 0.13.0's exact surface for reading the negotiated value back (rather than
   requesting one) isn't confirmed by the M0 ecosystem report (which checked platform support
   for scan/connect/GATT/notify, not MTU specifically). **Assigned: L4 implementer (Task 5)** —
   resolve empirically against the real device at Task 9 on Windows; if no negotiated-MTU
   readback exists on this platform, Task 5/§14a's 20-byte fallback is what actually ships,
   not a fallback path that's never exercised.

8. **`BtleplugBle`'s internal fields/method bodies (Task 5 Step 3) are left as `unimplemented!`
   in this plan, filled in by Task 7 Step 1.** `btleplug` 0.13.0's exact `Manager`/`Adapter`/
   `Peripheral` trait API (method names, whether calls are `&self` or `&mut self`, the
   notification stream's concrete type) is not pinned by any contract — the ecosystem report
   (finding 3) confirms platform support, not the API shape. **Assigned: L4 implementer (Task
   7)** — read `btleplug` 0.13.0's own docs.rs page at implementation time rather than this plan
   guessing a shape that may not match the pinned version.

9. **BLE-side code has no automated test beyond Tasks 2–4's pure logic** — `btleplug` has no
   first-party in-process fake peripheral, unlike the WiFi side's hand-rolled mock HTTP server
   (Task 7 Step 2). This means `BtleplugBle`'s actual GATT calls (Task 7 Step 1) are unverified
   until Task 9's real device. **Assigned: lead** — accept this gap (consistent with M0's own
   precedent of a manual step for hardware-dependent verification) or, if a `btleplug` mock/fake
   backend exists that this research didn't surface, revisit with a lighter automated check;
   not blocking, since Task 9 exists precisely to close this gap before lane exit.

10. **RULED (2026-09-03, lead ruling R7).** Desktop `idl-transport` carries its own fixed,
    non-configurable timeout constant per operation class, rather than pushing a `Duration`
    argument to every trait method/caller — simpler for wave 1, and desktop has no network-binding
    reconciler to share a policy with anyway. Match SPEC §6.2's existing numbers for consistency
    rather than inventing new ones: **15 s** per BLE GATT operation (connect, read, write) and
    per WiFi HTTP request (mirroring §6.2's 15 s op-wait), no retry/backoff at this layer (desktop
    has no reconciler — a caller that wants retries composes it above this crate). If L9's mobile
    plugins later need per-call control (matching §6.2's own 1 s/2 s/4 s backoff), the trait
    gains a `with_timeout`/config-struct variant then — not invented speculatively now.
