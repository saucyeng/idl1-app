# L8w Task 8 — implementer brief (`preview_channel_registry`, C3 §3.8, R63)

You are the implementer for L8w Task 8: a new core function deriving a
config-only preview of the SPEC §5.2 channel registry's *fixed-ID* rows
(IMU axes, wheel counters, pressure, HR) from an `idl0_config.json`
document, plus its thin Tauri wrapper. Two new `IpcErrorKind` variants
(`ConfigParse`, `ConfigUnsupportedVersion`). TDD, ONE commit, then report.

## GATE — same as every L8w task; verify before opening the worktree

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. If either fails, STOP and report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
  branch `wave2-l8w-write-amendment`.
- Do NOT touch `docs/` — this task's scope limit (below) is documented in
  code and CHANGELOG, not in a SPEC edit (unless the lead later answers
  Open Question 2 with a SPEC amendment, which is not this task).
- Do NOT push.
- **Files:** create `rust/core/src/parse/registry_preview.rs` (or a `pub fn`
  on `rust/core/src/parse/mod.rs` directly — implementer's call, document
  which and why); modify `rust/tauri/src/commands/device.rs`,
  `rust/tauri/src/error.rs`, `rust/tauri/src/lib.rs`.

- Read first: `CLAUDE.md`; plan Task 8 in full, including its "⚠ Open
  question — scope this task..." paragraph
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`);
  ruling R63 in `runs/2026-09-03/decisions.md` ("(2) `preview_channel_registry`
  covers the SPEC 5.2 fixed subset only, generic channel-id determinism is a
  question for Isaac"); `docs/IDL0_SPEC.md` §5.2 ("Current channels in
  registry at v3 launch" table, IDs 0–23, and its "24+ anything, TBD" row)
  and §8 (the full `idl0_config.json` schema example, "Per-IMU range
  resolution" — read both in full, quoted in relevant part below);
  `rust/core/src/session/mod.rs`'s `ChannelRegistryEntry` struct (the shape
  this task's own `RegistryPreviewRow` echoes, field for field, though it is
  a distinct type — `ChannelRegistryEntry` is the *wire* registry read off
  a recorded file, this task's row is a *predicted* one from config alone,
  never confuse the two); `rust/core/src/config.rs` in full — `VersionedConfig`,
  `parse_config`, `ConfigError`/`ConfigErrorKind` (`Io`/`Parse`/
  `UnsupportedVersion`) — the exact machinery this task's `DeviceConfig` type
  plugs into, same as `.idl1wb`/`.idl0t` already do; C3 §2's `config_parse`/
  `config_unsupported_version` rows (already named in the table, not yet
  implemented by any command — this task is their first implementor) and
  §3.8's `preview_channel_registry` entry (quoted below).

**No `DeviceConfig` Rust type, and no config→registry derivation function of
any kind, exist anywhere in `rust/core/src` today** (confirmed:
`grep -rn "DeviceConfig\|accel_range_g" rust/core/src` has no hits besides
IDL0_SPEC.md itself) — this is genuinely new core code, not a wrapper over
something already landed, unlike most of this lane's other tasks.

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; never override
with `-j`). While working: `cargo test -p idl-rs preview_channel_registry`
(core) and `cargo test -p idl-rs-tauri commands::device::preview_channel_registry`
(tauri), foreground, each non-zero `passed`. No `cargo fmt`, no `cargo
tarpaulin`, no `cargo doc`. One cargo process at a time.

**`pub`-change check:** `cargo check -p idl-rs-cli --tests` (new `pub` core
surface: `DeviceConfig`, `RegistryPreviewRow`, `preview_channel_registry`)
**and** `cargo check -p idl-rs-tauri` (new command + two new `IpcErrorKind`
variants).

## Scope limit — implement exactly this, no more

SPEC §5.2's "Current channels in registry at v3 launch" table fixes exact
`channel_id`s **only** for: the 18 IMU axes (0–17, per-axis enable flags
under `imuN.channels.{accel_x,accel_y,accel_z,gyro_x,gyro_y,gyro_z}`), the
two wheel-speed counters (18 `WheelFront`, 19 `WheelRear`, fixed scale 1.0,
offset 0, u32, event-driven — `sample_rate_hz: 0`), the two pressure
channels (20 `PressureFront`, 21 `PressureRear`, u16, 100 Hz, "from config"
scale/offset — SPEC's own config example has no dedicated `pressure` block;
if you find no config field that names these two channels' scale/offset
explicitly, **emit no row for 20/21** rather than guessing a source — this
is the scope gap R63/Open Question 2 already flags, not yours to close),
and the two HR channels (22 `HR_BPM` u8 1 Hz scale 1.0 offset 0, 23 `HR_RR`
u16 event-driven scale `1000.0/1024.0` offset 0, present only when
`heart_rate_monitor.enabled`). **Emit no row at all** for any
`analog.channels[]`/`digital.channels[]` entry beyond the two named
pressure slots — SPEC §5.2's own "24+ anything, TBD" row says a
`channel_id` there is not derivable from config alone. Document this scope
limit in the new function's doc comment and in this task's CHANGELOG
bullet.

## `DeviceConfig` — read only what this task needs

A `serde::Deserialize` struct over the relevant subset of SPEC §8's schema —
it does not need to round-trip or validate the whole document (SPEC §8's
own text: that's the TS validator's job, R53 Device Q1). At minimum:

```rust
#[derive(serde::Deserialize)]
pub struct DeviceConfig {
    pub config_version: u32,
    pub imu: ImuConfig,
    pub wheel_speed: Option<WheelSpeedConfig>,
    pub heart_rate_monitor: Option<HrmConfig>,
}
#[derive(serde::Deserialize)]
pub struct ImuConfig {
    pub accel_range_g: f64,
    pub gyro_range_dps: f64,
    pub imu0: Option<ImuSubConfig>,
    pub imu1: Option<ImuSubConfig>,
    pub imu2: Option<ImuSubConfig>,
}
#[derive(serde::Deserialize)]
pub struct ImuSubConfig {
    #[serde(default)]
    pub enabled: bool,
    pub accel_range_g: Option<f64>,
    pub gyro_range_dps: Option<f64>,
    pub channels: ImuChannelsConfig,
}
#[derive(serde::Deserialize)]
pub struct ImuChannelsConfig {
    pub accel_x: bool, pub accel_y: bool, pub accel_z: bool,
    pub gyro_x: bool, pub gyro_y: bool, pub gyro_z: bool,
}
#[derive(serde::Deserialize)]
pub struct WheelSpeedConfig { pub front: WheelSlot, pub rear: WheelSlot }
#[derive(serde::Deserialize)]
pub struct WheelSlot { #[serde(default)] pub enabled: bool }
#[derive(serde::Deserialize)]
pub struct HrmConfig { #[serde(default)] pub enabled: bool }

impl idl_rs::config::VersionedConfig for DeviceConfig {
    const SUPPORTED_VERSION: u32 = 1; // SPEC §8's launch value
    const LABEL: &'static str = "device config";
    fn version(&self) -> u32 { self.config_version }
}
```
Per-IMU range resolution (SPEC §8 "Per-IMU range resolution", §5.2's own
note): each `imuN`'s effective `accel_range_g`/`gyro_range_dps` is its own
sub-block value if present, else the top-level `imu.accel_range_g`/
`gyro_range_dps` default. An `imuN` sub-block that is entirely absent from
the config (not just `enabled: false`) means that IMU is not recorded at
all — no rows for its 6 axes (matches "IMU1/IMU2 presence is derived from
`imu.imuN.enabled`", SPEC §8).

**Field types**: SPEC §8's own JSON example writes `accel_range_g`/
`gyro_range_dps` as bare integers (`32`, `2000`) — deserialize as `f64` (the
division `accel_range_g / 32768.0` needs float division either way, and
`serde_json` accepts an integer literal into an `f64` field transparently).

## Interface (core)

```rust
/// One predicted SPEC §5.2 registry row, from config alone (no device I/O).
/// `data_type` is one of "i16"|"i32"|"u8"|"u16"|"u32" (SPEC §5.2's Type
/// column, restricted to what §5.2's fixed table actually uses).
pub struct RegistryPreviewRow {
    pub channel_id: u16,
    pub data_type: &'static str,
    pub sample_rate_hz: f64,
    pub scale: f64,
    pub offset: f64,
    pub name: String,
    pub units: String,
}

/// Predicts the SPEC §5.2 fixed-ID subset of the channel registry a device
/// would produce recording under `config`: the 18 IMU axes, 2 wheel
/// counters, 2 pressure channels (only if their scale/offset are named
/// explicitly in `config` — see this function's own scope-limit doc note),
/// and 2 HR channels. Emits **no row** for any `analog.channels[]`/
/// `digital.channels[]` entry beyond those two named pressure slots — SPEC
/// §5.2 itself does not fix a `channel_id` scheme for them (its own "24+
/// anything, TBD" row); inventing one here would be a guess this function
/// deliberately declines to make (ruling R63 (2)).
pub fn preview_channel_registry(config: &DeviceConfig) -> Vec<RegistryPreviewRow>;
```

IMU axis order within one IMU's 6 rows and across IMU0/1/2's 18 total
follows SPEC §5.2's table exactly (`AccelX, AccelY, AccelZ, GyroX, GyroY,
GyroZ` per IMU, IMU0 then IMU1 then IMU2) — a disabled axis contributes no
row at all (not a row with a zero scale), consistent with SPEC's "Disabled
IMU axes... have no registry entry."

## Interface (tauri)

```rust
#[derive(serde::Serialize)]
pub struct RegistryRow {
    pub channel_id: u16, pub data_type: String, pub sample_rate_hz: f64,
    pub scale: f64, pub offset: f64, pub name: String, pub units: String,
}
impl From<idl_rs::parse::registry_preview::RegistryPreviewRow> for RegistryRow { /* .to_string() the data_type */ }

#[tauri::command]
pub fn preview_channel_registry(config_json: String) -> Result<Vec<RegistryRow>, IpcError>;
```
Thin: `idl_rs::config::parse_config::<DeviceConfig>(config_json.as_bytes())`
mapping `ConfigErrorKind::{Parse, UnsupportedVersion, Io}` to
`{config_parse, config_unsupported_version, io}` (`Io` unreachable here —
`parse_config` never touches disk — map it anyway for completeness against
the full enum, matching this lane's existing `map_session_json_error`-style
completeness convention from Task 5), then call
`core::preview_channel_registry`, map each row via `RegistryRow::from`.

## New `IpcErrorKind` variants

Add `ConfigParse`, `ConfigUnsupportedVersion` to `error.rs` — additive only,
already named in C3 §2's table (not yet implemented by any prior task) with
doc comments citing `ConfigErrorKind::{Parse, UnsupportedVersion}` as their
source.

## Tests (core, in the new module, temp-free — pure function)

- All 18 IMU rows present, correctly resolved per-IMU range overrides
  (seed a config where `imu1`'s `accel_range_g` differs from the top-level
  default; assert `imu1`'s three accel rows use `16.0/32768.0`, not the
  default `32.0/32768.0`).
- An `imuN` sub-block entirely absent → no rows for that IMU's 6 axes.
- A disabled individual axis (e.g. `imu0.channels.gyro_z: false`) → exactly
  17 IMU rows, that one axis absent.
- Wheel/HR rows present only per their `enabled` flags; absent
  `wheel_speed`/`heart_rate_monitor` blocks → no rows for 18/19 or 22/23.
- HR row 23's scale is exactly `1000.0/1024.0` (SPEC §5.2's own value).
- No row is ever emitted for `channel_id` 20/21 unless your reading of the
  config schema finds an explicit source for their scale/offset — if you
  find none (expected, per this task's scope-limit note), a test asserting
  **no** pressure rows appear for a config that only sets
  `wheel_speed`/`heart_rate_monitor` is itself the coverage for this scope
  limit; do not invent a config field to make a pressure test pass.
- Malformed JSON / `config_version` above `SUPPORTED_VERSION` → typed
  `ConfigError` with the correct `kind`, via `idl_rs::config::parse_config`.

**Tests (tauri):** error-kind mapping only (`config_parse`,
`config_unsupported_version`, and a happy-path smoke test confirming the
Rust→JSON row mapping) — core's own tests already cover the derivation
logic (CLAUDE.md §4, "test what we own", not the same behaviour twice).

## The task, in order

- [ ] **Step 1: Confirm the gate**, open/reuse the worktree.
- [ ] **Step 2: Write failing core tests** for `preview_channel_registry`.
- [ ] **Step 3: Implement** `DeviceConfig` + sub-structs, `RegistryPreviewRow`,
      `preview_channel_registry`, in the new module; `impl VersionedConfig`.
- [ ] **Step 4: Add `IpcErrorKind::ConfigParse`/`ConfigUnsupportedVersion`**
      to `error.rs`.
- [ ] **Step 5: Implement the tauri wrapper** — `RegistryRow`, its `From`
      impl, `preview_channel_registry` command + its `_via`/mapping tests.
- [ ] **Step 6: Register** the command in `lib.rs`'s `handler()`.
- [ ] **Step 7: Test** — both filters, confirm non-zero `passed` each.
- [ ] **Step 8: `cargo check -p idl-rs-cli --tests` and `cargo check -p
      idl-rs-tauri`**, both clean.
- [ ] **Step 9: Commit** — explicit paths (name the new module's exact
      path) plus `tauri/src/commands/device.rs tauri/src/error.rs
      tauri/src/lib.rs` — message
      `core+tauri: preview_channel_registry, SPEC 5.2 fixed-ID subset only (C3 3.8, R63)`.

## Do not

- Do not invent a `channel_id` for any `analog.channels[]`/
  `digital.channels[]` entry beyond the two named pressure slots.
- Do not touch any existing `IpcErrorKind` variant.
- Do not attempt to make `DeviceConfig` round-trip or validate the full
  config document — only the fields this task's derivation needs.
- Do not run `cargo test -p idl-rs -p idl-rs-cli`, `--workspace`, or a bare
  `cargo test`.
- Do not edit `app/src/routes/pages/Device/config/sourcesPreview.ts` — the
  UI widening onto this command is a later L7b task, not this lane's.

## Style / hygiene

Doc comment on every public symbol; units on every numeric value
(`sample_rate_hz`: Hz; `battery_pct`-style comments not applicable here);
A/A/A tests named `thing — condition — result`; no `cargo fmt`.

## Spec discipline (say it out loud in your report)

"No spec change needed" for this task's own scope (the fixed-ID subset) —
SPEC §5.2/§8 already fix everything this task implements. The
generic-analog-channel gap (Open Question 2) stays open, carried to Task 14's
wrap-up notes and the CHANGELOG, not resolved here.

## Report back (concise)

Commit hash + `git show --stat`; both test-filter results with `passed`
counts; both `cargo check` results; whether you found any config field
naming channels 20/21's scale/offset explicitly (expected: no — confirm
what you found); the module path you chose for the new core code and why;
anything ambiguous you resolved (say how) or that needs a lead ruling (stop
and report instead of guessing — CLAUDE.md §1).
