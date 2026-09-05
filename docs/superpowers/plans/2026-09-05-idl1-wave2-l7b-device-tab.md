# idl1 Wave 2 — L7b: Device tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port idl0's Device tab — connection, live status, the config card
with its channels table, all seven source-configuration views (IMU ×3, GPS,
Wheel, Analog, Digital, HRM), bike profiles, config push, and device file
download — onto C3 §3.8's five landed commands. The centre of the lane is
**one typed config model**: a TypeScript mirror of `docs/IDL0_SPEC.md` §8's
`idl0_config.json`, with its validators, that serialises to exactly the JSON
string `push_config` accepts. That model is pure and heavily tested; the seven
source views are forms over it.

**Architecture:** One lane, one directory: `app/src/routes/pages/Device/`.
idl0 spread the config across seven `ChannelSource` subclasses, each a Flutter
widget reaching into a `Map<String, dynamic>` with `as` casts and defaults
scattered per accessor. idl1 inverts that: **one `DeviceConfig` type, one
parser, one validator, one serialiser**, and seven dumb forms that read and
write typed fields. Every rule idl0 encoded as a dropdown's item list (the
LSM6DSO32 ODR set, the accel/gyro ranges, the GPS 1–10 Hz range, the five
dynamic models) becomes a named constant in the model with a test, so the rule
lives in one place instead of in a widget.

The lane calls only `app/src/ipc/device.ts` (C3 §3.8: `ble_scan`,
`ble_connect`, `list_device_files`, `download_file`, `push_config` — all
landed). Everything else the tab needs — live device status, recording
start/stop, WiFi/idle mode transitions, config **pull**, profile persistence,
calibration — has no C3 command and goes through a lane-local typed stub
(operating brief §3), listed in `runs/2026-09-05/lanes/l7/IPC-NEEDS.md`.

**Tech Stack:** React 19 + TypeScript + Vite + vitest at the M0 ecosystem
report's pins. **No new npm dependency.** No JSON-schema library: the config
schema is SPEC §8, a fixed document, and a hand-written validator returning a
typed issue list is both smaller than a schema runtime and testable against
the spec's own tables.

**Spec:**
- `CLAUDE.md` (§1 ambiguity — this lane raises rather than infers; §2 layers; §4 testing; §5 typed errors; §7 hygiene; §8 compute).
- `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §2, §3, §4 — binding.
- `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md` §3, §7 (device transport), §10 (L7 row), §12.
- `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` §1, §2, §3.8, §4.
- **`docs/IDL0_SPEC.md` §8 (Configuration Schema)** — the authority for every field, default, valid-value set and read-only rule in this lane. Also §5.2 (channel registry entry), §5.7, §7.2 (config push over BLE), §7.5 (HRM), §7.6 (IMU calibration), §10.4 (RF coexistence: BLE control is suspended in WiFi mode), §23 (Tab — Device, the section this lane rewrites).
- `rust/tauri/src/commands/device.rs` — what `push_config` **actually** accepts today: `push_config(device_id: String, config_json: String)`, whose local validation is `serde_json::from_str::<serde_json::Value>` only. There is no `DeviceConfig` type in core, so `config_parse` / `config_unsupported_version` (C3 §3.8) are currently unraisable and a malformed-but-parseable config reaches the device. **This is why the lane's own validator is load-bearing.**
- Read-only reference: `C:\Users\isaac\Documents\Saucy\saucyeng\idl0-app\app\lib\ui\tabs\device\`, `...\lib\data\channel_sources\*.dart`, `...\lib\data\channel_source.dart`.
- Offline docs: `docs/vendor/react-19/`, `docs/vendor/tauri-v2/`.

**Spec discipline (CLAUDE.md §6), declared per task:**
- Tasks 2, 3, 4 — **spec-during**, all three writing to **`docs/IDL0_SPEC.md` §8**: Task 2 adds the "app-side config model" note stating that `analog.sample_rate_hz`'s valid set is still undefined (§8 says so itself) and how the app behaves meanwhile; Task 3 adds the validation table the app enforces before a push, field by field, so §8's prose tables have a machine-checkable counterpart; Task 4 documents the app's registry preview and its exact relationship to the firmware's own §5.2 registry.
- Tasks 5, 6, 7, 8, 9 — **spec-during** on **`docs/IDL0_SPEC.md` §23 (Tab — Device)**, one section each: the channels table (T5), the source views (T6, T7), push/profiles (T8), files and status (T9).
- Task 1 — **no spec change needed.**
- Every task appends a `CHANGELOG.md` bullet; `TASKS.md`'s L7b line is ticked only by Task 9.

## Global Constraints

- **Worktree and branch**, before Task 1:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
  git worktree add -b wave2-l7b-device "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7b-device" main
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7b-device"
  git submodule update --init -- rust
  ```
  `npm ci` once at setup, never inside a task.
- **No cargo, ever** — not `cargo check`, not `npm run tauri`. The §8 hook denies it under `idl1-app-worktrees/wave2-*`.
- **No new npm dependency**, no `npm install` inside a task.
- **Files this lane owns:** `app/src/routes/pages/Device/**`, its own `*.test.ts`, and additive type fixes only in `app/src/ipc/device.ts` where it disagrees with C3 as written. **Never** `rust/`, `app/src-tauri/`, or any lead-owned shared file.
- **The app shell does not change.** Task 1 leaves `app/src/routes/pages/DevicePage.tsx` as a one-line re-export.
- **No real device is available to a task.** Every command this lane calls will reject without hardware. That is expected: the pure modules carry the testable behaviour, and hardware verification happens when Isaac runs the app against the device (design §10's L4 "done when"). A task never asserts against a live radio.
- **Gate, every task** (operating brief §4):
  ```
  cd app && npx tsc --noEmit && npx vitest run <the filter this task names>
  ```
  Non-zero `passed` required; `tsc` silent.
- **Testing** (CLAUDE.md §4): Arrange / Act / Assert with blank lines; names `thing — condition — result`; `*.test.ts` beside the module; > 80 % on the pure modules. **No rendering tests.**
- **A config is never pushed unvalidated.** `pushConfig` is called only after `validateConfig` returns zero **error**-severity issues. This is the lane's single most important invariant: `push_config`'s Rust side checks syntax only, and SPEC §8 says an off-list `imu.sample_rate_hz` "produces undefined chip behavior" — the app is the only thing standing between a typo and undefined hardware behaviour.
- **Unknown config keys are preserved verbatim** through parse → edit → serialise. SPEC §8: "Firmware ignores unknown JSON fields", and `device_id` / `config_version` are read-only fields "the app preserves on push, never user-edited". Dropping a key the app does not understand would silently reconfigure a device.
- Doc comment on every exported symbol; units on every numeric value; `// TODO(idl0):` never bare.
- **No AI attribution trailers.** **Never `git push`.**

---

### Task 1: `DevicePage.tsx` → `Device/`, connection state, scan and connect

**Spec discipline:** no spec change needed.

**Files:**
- Create: `app/src/routes/pages/Device/index.tsx`, `Device/connection.ts`, `Device/connection.test.ts`, `Device/errors.ts`, `Device/errors.test.ts`, `Device/ipcStubs.ts`
- Modify: `app/src/routes/pages/DevicePage.tsx` (→ `export { default } from "./Device";`)

**Interfaces:**
- `connection.ts`: a pure reducer over `ConnectionState = { phase: "idle" | "scanning" | "connecting" | "connected" | "failed", discovered: DeviceDiscovered[], connected: ConnectionInfo | null, error: string | null }` with actions `SCAN_START`, `DEVICE_DISCOVERED` (a C3 §3.8 payload), `SCAN_END`, `CONNECT_START`, `CONNECTED`, `DISCONNECTED`, `FAILED`.
- `errors.ts`: `describeIpcError` for the kinds this tab sees — `ble`, `wifi`, `config`, `config_parse`, `config_unsupported_version`, `not_found`, `io`, `internal` — each with text that says what the user can do (a `ble` failure asks them to check the adapter and that the device is awake; `config` says the device rejected it).
- `ipcStubs.ts`: `NotImplementedError extends Error { command: string }` plus the lane's stubs. **A stub is never an `IpcError` kind** — C3 §2's vocabulary is additive-only and shipping a `not_implemented` kind for a placeholder would put a placeholder in a signed contract.

- [ ] **Step 1: Write the failing tests**

`connection.test.ts`:
- `connectionReducer — DEVICE_DISCOVERED twice for the same device_id — one entry, the newer rssi kept`
- `connectionReducer — DEVICE_DISCOVERED — list stays sorted by rssi_dbm descending (strongest first)`
- `connectionReducer — SCAN_END with nothing found — phase idle, discovered empty, no error`
- `connectionReducer — CONNECTED — phase connected, the ConnectionInfo's firmware_version retained`
- `connectionReducer — FAILED during connect — phase failed, previously discovered devices retained so the user can retry another`
- `connectionReducer — DEVICE_DISCOVERED after SCAN_END — ignored, no state change`

`errors.test.ts`:
- `describeIpcError — kind ble — text names Bluetooth, not a stack trace`
- `describeIpcError — kind config — text says the device rejected the config, distinct from config_parse's local-validation text`
- `describeIpcError — an unknown kind — generic text, never throws (C3 §5: kinds are additive)`

- [ ] **Step 2: Implement and move the page**

`index.tsx` renders the tab's three regions as stubs for now — a hero region
(scan/connect), a status line, and an empty config region — with `bleScan`
and `bleConnect` wired through `app/src/ipc/device.ts`. `bleScan` takes a
timeout and an `onDiscovered` callback; the reducer receives each discovery.

**Note on connection lifetime:** `rust/tauri/src/commands/device.rs` connects,
acts, and disconnects **inside each command** — there is no managed
cross-command BLE session, and its own module doc says so. So
`ConnectionInfo.connected` describes the moment GATT setup finished in that
one call, not a link the tab can assume still exists. This lane therefore
treats "connected" as **"last connect attempt succeeded"**, shows it as such,
and never gates a later action on it as if the link were live. A persistent
connection manager is an IPC need, not something this lane can fake.

- [ ] **Step 3: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
```
Expected: 9 new tests passed, 0 failed.

- [ ] **Step 4: CHANGELOG + commit**

---

### Task 2: The config model — types, defaults, parse, serialise

**Spec discipline:** **spec-during** (`docs/IDL0_SPEC.md` §8).

**Files:**
- Create: `Device/config/model.ts`, `Device/config/model.test.ts`, `Device/config/defaults.ts`
- Modify: `docs/IDL0_SPEC.md` §8, `CHANGELOG.md`

**Interfaces:** a TypeScript mirror of SPEC §8, field for field, **snake_case
keys** (C3 §1's JSON naming rule; these keys go to firmware verbatim):

```ts
/** `idl0_config.json` (SPEC §8) as the app models it. Field names, defaults
 *  and units are the spec's; nothing here is invented. Keys the app does not
 *  know are preserved in `unknown` and re-emitted verbatim on serialise —
 *  SPEC §8's "firmware ignores unknown JSON fields" cuts both ways. */
export interface DeviceConfig {
  /** App-managed, read-only in the UI (SPEC §8). */
  config_version: number;
  /** 12-char lowercase hex of the device MAC (SPEC §3.6). Read-only. */
  device_id: string;
  bike_profile: { name: string; default_rider: string };
  imu: ImuBlock;
  gps: GpsBlock;
  analog: { sample_rate_hz: number; channels: AnalogChannel[] };
  digital: { channels: DigitalChannel[] };
  wheel_speed: { front: WheelSlot; rear: WheelSlot };
  /** Omitting the block is equivalent to `enabled: false` (SPEC §8). */
  heart_rate_monitor?: HrmBlock;
  /** Every top-level key the app did not recognise, re-emitted verbatim. */
  unknown: Record<string, unknown>;
}

export interface ImuBlock {
  /** Hz. Shared across all three IMUs — the SPI bus reads them in lockstep. */
  sample_rate_hz: number;
  /** g. Top-level default; per-IMU `accel_range_g` overrides it (SPEC §8). */
  accel_range_g: number;
  /** dps. Same default-then-override rule. */
  gyro_range_dps: number;
  low_power_mode: boolean;
  high_performance_mode: boolean;
  imu0: ImuSlot; imu1: ImuSlot; imu2: ImuSlot;
  orientation?: { imu0_rotation_matrix: number[][]; imu1_rotation_matrix: number[][]; imu2_rotation_matrix: number[][] };
  bias?: { imu0: number[]; imu1: number[]; imu2: number[] };
}
export interface ImuSlot {
  enabled: boolean;
  accel_range_g: number;   // g
  gyro_range_dps: number;  // dps
  channels: { accel_x: boolean; accel_y: boolean; accel_z: boolean; gyro_x: boolean; gyro_y: boolean; gyro_z: boolean };
}
export interface GpsBlock {
  sample_rate_hz: number;  // Hz, integer 1..10
  dynamic_model: "portable" | "pedestrian" | "automotive" | "sea" | "airborne";
  nmea_sentences: string[];
  sbas_enabled: boolean;
}
export interface AnalogChannel { key: string; label: string; adc_pin: number; units: string; scale: number; offset: number; enabled: boolean }
export interface DigitalChannel { key: string; label: string; kind: "marker" | "level" | "pwm"; gpio_pin: number; active_low: boolean; debounce_ms: number; enabled: boolean }
export interface WheelSlot { enabled: boolean; points_per_revolution: number; wheel_circumference_mm: number }
export interface HrmBlock { enabled: boolean; device_address: string; device_name: string }
```

Functions: `defaultConfig(deviceId: string): DeviceConfig` (SPEC §8's stated
defaults, and only those), `parseConfig(json: unknown): ParseResult` where
`ParseResult = { config: DeviceConfig; repairs: Repair[] }` — **lenient**, a
malformed field falls back to its default and records a `Repair` rather than
throwing, because a device or an old profile may hold anything and refusing to
open the tab is worse than showing a repaired value — and
`serializeConfig(config: DeviceConfig): string`, which re-emits `unknown` keys
at the top level and never re-orders or drops a key it read.

- [ ] **Step 1: Write the failing tests**

- `parseConfig — SPEC §8's worked example verbatim — every field lands typed, zero repairs`
- `parseConfig then serializeConfig — SPEC §8's worked example — round-trips to the same parsed value (idempotent)`
- `parseConfig — a top-level key the app has never seen — kept in `unknown` and re-emitted by serializeConfig verbatim`
- `parseConfig — heart_rate_monitor block absent — parses as enabled false (SPEC §8's stated equivalence)`
- `parseConfig — imu sub-blocks absent — all three IMUs inherit the top-level accel/gyro ranges (SPEC §8's per-IMU range resolution)`
- `parseConfig — imu.sample_rate_hz is 800, not a valid ODR — value kept as read and a Repair recorded, never silently snapped`
- `parseConfig — analog.channels holds a non-object entry — that entry is dropped with a Repair, the rest survive`
- `parseConfig — device_id missing — empty string plus a Repair; the field is read-only, never invented`
- `parseConfig — not an object at all — returns defaultConfig with one Repair, never throws`
- `serializeConfig — a config with no HRM block — omits the key rather than emitting enabled:false (SPEC §8's equivalence, kept minimal)`
- `defaultConfig — every field — matches SPEC §8's stated defaults exactly (wheel slots disabled, gps 5 Hz automotive, analog 100 Hz, empty channel arrays)`

**A deliberate difference from idl0, worth stating:** idl0's `ImuSettingsDialog`
**snapped** a stored 800 Hz to the nearest valid ODR on open, silently, so the
dropdown could render it. This lane keeps the read value and reports it as a
validation error instead. Snapping edits a user's device configuration without
telling them; SPEC §8 calls off-list values undefined behaviour, which is
worth an error, not a silent correction.

- [ ] **Step 2: Implement**

- [ ] **Step 3: Add the app-side config-model note to `docs/IDL0_SPEC.md` §8**

State: the app parses leniently and reports repairs; unknown keys and the two
read-only fields survive a round trip; and — §8 says this itself —
`analog.sample_rate_hz` has **no defined valid set**, so the app accepts any
positive integer there and flags nothing, pending a spec answer (Open
question 2).

- [ ] **Step 4: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
```
Expected: 11 new tests passed, 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

---

### Task 3: The validator

**Spec discipline:** **spec-during** (`docs/IDL0_SPEC.md` §8 — adds the
validation table the app enforces).

**Files:**
- Create: `Device/config/validate.ts`, `Device/config/validate.test.ts`
- Modify: `docs/IDL0_SPEC.md` §8, `CHANGELOG.md`

**Interfaces:**
```ts
/** One problem found in a config, addressed by a dotted path into the
 *  document so a form can put it beside the field that caused it. */
export interface ValidationIssue {
  /** e.g. "imu.sample_rate_hz", "analog.channels[2].adc_pin". */
  path: string;
  /** `error` blocks a push; `warning` does not. */
  severity: "error" | "warning";
  message: string;
}
export function validateConfig(config: DeviceConfig): ValidationIssue[];
/** True iff no issue has severity "error". The only gate on pushConfig. */
export function isPushable(issues: ValidationIssue[]): boolean;
```

Named constants, each with SPEC §8 as its citation:
`IMU_ODR_HIGH_PERF_HZ = [12.5, 26, 52, 104, 208, 416, 833, 1666]`,
`IMU_ODR_LOW_POWER_HZ = [1.6, 12.5, 26, 52, 104, 208]`,
`ACCEL_RANGES_G = [4, 8, 16, 32]`, `GYRO_RANGES_DPS = [125, 250, 500, 1000, 2000]`,
`GPS_RATE_HZ_MIN = 1`, `GPS_RATE_HZ_MAX = 10`,
`GPS_DYNAMIC_MODELS`, `NMEA_SENTENCES = ["GGA","RMC","GSA","GSV","GLL","VTG"]`,
`DIGITAL_KINDS = ["marker","level","pwm"]`,
`BLE_ADDRESS_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/`.

- [ ] **Step 1: Write the failing tests**

- `validateConfig — SPEC §8's worked example — no issues at all`
- `validateConfig — imu.sample_rate_hz 800 in high-performance mode — one error naming the valid ODR set`
- `validateConfig — imu.sample_rate_hz 1666 with low_power_mode true — an error: 1666 is high-perf only (SPEC §8's two rate tables)`
- `validateConfig — imu0.accel_range_g 20 — an error listing ±4/8/16/32 g`
- `validateConfig — imu0 enabled with every axis false — a warning, not an error: an enabled IMU logging nothing is a mistake, not undefined hardware behaviour`
- `validateConfig — gps.sample_rate_hz 0 and 11 — an error each, naming the 1..10 Hz range`
- `validateConfig — gps.sample_rate_hz 5.5 — an error: the spec says integer`
- `validateConfig — gps.dynamic_model "car" — an error listing the five valid models`
- `validateConfig — gps.nmea_sentences empty — a warning: the parser needs GGA and RMC`
- `validateConfig — two analog channels sharing a key — one error per duplicate, naming the key`
- `validateConfig — an analog channel with an empty key — an error; the key addresses the entry in the array`
- `validateConfig — an analog channel with scale 0 — an error: every sample would read as the offset`
- `validateConfig — two analog channels on the same adc_pin — an error naming both paths`
- `validateConfig — a digital channel with kind "level" — a warning: the schema reserves it but Spec 1 firmware does not ship it`
- `validateConfig — a digital channel with debounce_ms negative — an error`
- `validateConfig — two channels (one analog, one digital) sharing a gpio/adc pin number — an error: one physical pin, two claims`
- `validateConfig — wheel slot enabled with points_per_revolution 0 — an error: a divide-by-zero in every speed derivation`
- `validateConfig — wheel slot enabled with wheel_circumference_mm 0 — an error`
- `validateConfig — wheel slot disabled with nonsense values — no issue: a disabled slot is not pushed to hardware`
- `validateConfig — HRM enabled with a lowercase address — an error naming the uppercase colon-separated format (SPEC §8)`
- `validateConfig — HRM enabled with an empty address — an error`
- `validateConfig — HRM disabled with an empty address — no issue: enabled false retains a saved address, and none is fine`
- `isPushable — issues contain only warnings — true; one error — false`

- [ ] **Step 2: Implement**

- [ ] **Step 3: Add the validation table to `docs/IDL0_SPEC.md` §8**

One row per rule: path, severity, condition, citation. This gives §8's prose
tables a counterpart a reviewer can check the code against line by line.

- [ ] **Step 4: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
```
Expected: 23 new tests passed, 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

---

### Task 4: The channel-registry preview

**Spec discipline:** **spec-during** (`docs/IDL0_SPEC.md` §8 — documents the
preview and its relationship to the firmware's §5.2 registry).

**Dispatch gate:** this task is **blocked on Open question 1** (whether the
registry derivation may live in TypeScript at all). Do not dispatch it until
the lead answers. Tasks 5–9 do not depend on it — the channels table (Task 5)
renders enable state and labels from the config, and shows registry columns
only when this module exists.

**Files:**
- Create: `Device/config/registry.ts`, `Device/config/registry.test.ts`
- Modify: `docs/IDL0_SPEC.md` §8, `CHANGELOG.md`

**Interfaces:**
```ts
/** One row of the channel registry the device will write at session start
 *  (SPEC §5.2) as the app predicts it from the current config. A preview for
 *  the user, never a source of truth: the firmware builds its own registry
 *  and the parser reads that one. */
export interface RegistryPreviewRow {
  channel_id: number;
  data_type: "i16" | "i32" | "u8" | "u16" | "u32";
  /** Hz; 0 means event-driven (SPEC §5.7). */
  sample_rate_hz: number;
  scale: number;
  offset: number;
  name: string;
  units: string;
}
export function previewRegistry(config: DeviceConfig): RegistryPreviewRow[];
```
Ported from idl0's `resolveRegistryEntries()` across all six source classes:
IMU axes are `i16` with `scale = range / 32768` (accel range in g, gyro in dps)
and the shared bus rate; the eight GPS channels are the §5.7 set at
`gps.sample_rate_hz`; wheel slots are event-driven `u32` pulse counters; analog
entries are `u16` at the shared analog rate with the entry's own scale/offset;
digital `marker` is event-driven `u8`, `level` is `u8` at 50 Hz, `pwm` is `u32`
at 50 Hz; HRM contributes `HR_BPM` (id 22, `u8`, 1 Hz, bpm) and `HR_RR`
(id 23, `u16`, event-driven, scale `1000/1024`, ms) — **fixed ids per SPEC
§5.2**, emitted only when the block is enabled.

- [ ] **Step 1: Write the failing tests**

- `previewRegistry — SPEC §8's worked example — the expected row count and every id contiguous from the base`
- `previewRegistry — a disabled IMU — contributes no rows even when its axes are ticked`
- `previewRegistry — an enabled IMU with three axes ticked — exactly three rows, in accel-x..gyro-z order`
- `previewRegistry — imu0 accel_range_g 32 — accel rows carry scale 32/32768; gyro_range_dps 2000 — gyro rows carry 2000/32768`
- `previewRegistry — an IMU whose slot omits its ranges — inherits the top-level defaults (SPEC §8)`
- `previewRegistry — GPS — the eight §5.7 channels with their spec'd data types and units`
- `previewRegistry — a wheel slot enabled — one event-driven u32 row named WheelFront/WheelRear`
- `previewRegistry — HRM enabled — HR_BPM at id 22 and HR_RR at id 23, ids fixed regardless of what precedes them`
- `previewRegistry — HRM disabled — neither row present`
- `previewRegistry — a digital marker channel — sample_rate_hz 0, units "event"`
- `previewRegistry — no channel id is used twice across every source in one config`

- [ ] **Step 2: Implement**

- [ ] **Step 3: Document the preview in `docs/IDL0_SPEC.md` §8**

Say plainly: the app's preview is advisory, the firmware's registry is
authoritative, the parser reads the firmware's, and a divergence between them
is a bug in this preview — not something the app corrects for.

- [ ] **Step 4: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
```
Expected: 11 new tests passed, 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

---

### Task 5: The channels table

**Spec discipline:** **spec-during** (`docs/IDL0_SPEC.md` §23, channels table).

**Files:**
- Create: `Device/sources.ts`, `Device/sources.test.ts`, `Device/ChannelsTable.tsx`
- Modify: `Device/index.tsx`, `docs/IDL0_SPEC.md` §23

**Interfaces:**
- `sources.ts`: `listSources(config): SourceView[]` — the tab's source list, one entry per configurable source (`imu0`, `imu1`, `imu2`, `gps`, `wheel_front`, `wheel_rear`, one per analog entry, one per digital entry, `hrm`), each with `{ sourceKey, label, enabled, sampleRateHz: number | null, channels: ChannelRowView[] }`. Labels are idl0's: "IMU0 (sprung)", "IMU1 (front fork)", "IMU2 (rear)", "GPS", "Wheel Front", "Wheel Rear", "Heart Rate Monitor — <device_name>" when a name is saved.

- [ ] **Step 1: Write the failing tests**

- `listSources — SPEC §8's worked example — the six fixed sources in a stable order, hardware-pinned ones first`
- `listSources — two analog entries — one source each, keyed analog/<key>, after the fixed sources`
- `listSources — an HRM with a device_name — label carries the name; without one — the bare label`
- `listSources — GPS — sampleRateHz from the config; wheel and marker sources — null (event-driven)`
- `listSources — a disabled source — present in the list, marked disabled (idl0 shows IMU/GPS/HRM even when off)`
- `listSources — an IMU — six axis rows regardless of which are enabled, each carrying its own enable state`

- [ ] **Step 2: Implement the table**

One row per source with its enable state, rate and channel count; expanding a
source lists its channels with name, units, scale, offset and enable state —
and, when Task 4 has landed, the predicted `channel_id` and data type. A gear
control per source opens that source's form (Tasks 6–7).

- [ ] **Step 3: Rewrite `docs/IDL0_SPEC.md` §23's channels-table section**

- [ ] **Step 4: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
```
Expected: 6 new tests passed, 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

---

### Task 6: Source forms A — IMU ×3, GPS, Wheel front/rear

**Spec discipline:** **spec-during** (`docs/IDL0_SPEC.md` §23, source views).

**Files:**
- Create: `Device/config/edit.ts`, `Device/config/edit.test.ts`, `Device/forms/ImuForm.tsx`, `Device/forms/GpsForm.tsx`, `Device/forms/WheelForm.tsx`
- Modify: `Device/ChannelsTable.tsx`, `docs/IDL0_SPEC.md` §23

**Interfaces:**
- `edit.ts`: pure, immutable edit operations over `DeviceConfig` — `setImuRate`, `setImuSlot`, `setImuAxis`, `setGps`, `setWheelSlot`, `upsertAnalogChannel`, `removeAnalogChannel`, `upsertDigitalChannel`, `removeDigitalChannel`, `setHrm`, `clearHrm`. Every one returns a new config and touches nothing else — this is where "editing the fork rate must not clear the analog channels" is actually guaranteed.

- [ ] **Step 1: Write the failing tests**

- `setImuRate — changing the shared bus rate — all three IMU slots keep their own ranges and axis enables`
- `setImuSlot — enabling imu1 — imu0 and imu2 untouched`
- `setImuAxis — ticking gyro_z on imu2 — only that flag changes; unknown keys still present`
- `setGps — a new dynamic model — nmea_sentences and sbas_enabled unchanged`
- `setWheelSlot — editing front — rear untouched`
- `every edit function — the input config object — is not mutated (immutability, checked by deep-equality against a pre-call clone)`
- `setHrm then clearHrm — the block is removed entirely, matching idl0's Forget (SPEC §8: omitting the block equals disabled)`

- [ ] **Step 2: Implement the three forms**

Each form edits a draft, shows `validateConfig`'s issues for its own paths
inline, and commits through `edit.ts`. Controls are constrained to the valid
sets from Task 3 — the ODR list, the two range lists, the 1–10 Hz GPS range,
the five dynamic models, the six NMEA sentences — so an invalid value is hard
to produce by pointing, and caught by the validator when it arrives from a
file or a device.

- [ ] **Step 3: `docs/IDL0_SPEC.md` §23** — the IMU/GPS/Wheel views.

- [ ] **Step 4: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
```
Expected: 7 new tests passed, 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

---

### Task 7: Source forms B — Analog, Digital, HRM, and "+ Add channel…"

**Spec discipline:** **spec-during** (`docs/IDL0_SPEC.md` §23, source views).

**Files:**
- Create: `Device/forms/AnalogForm.tsx`, `Device/forms/DigitalForm.tsx`, `Device/forms/HrmForm.tsx`, `Device/forms/AddChannelPicker.tsx`, `Device/config/newChannel.ts`, `Device/config/newChannel.test.ts`
- Modify: `Device/ChannelsTable.tsx`, `docs/IDL0_SPEC.md` §23

**Interfaces:**
- `newChannel.ts`: `newAnalogChannel(config): AnalogChannel` and `newDigitalMarker(config): DigitalChannel` — generate a **unique** `key` against the config's existing entries (idl0 used a literal `"__new__"` key, which collides the moment a user adds two), seed SPEC §8's defaults, and pick a free pin where one is derivable. Plus `addChannelOptions(config)`: the picker's entries — Wheel front, Wheel rear (which toggle a flag rather than adding an entry), Analog channel, Marker button — each disabled with a reason when it is not available (both wheel slots already enabled, say).

- [ ] **Step 1: Write the failing tests**

- `newAnalogChannel — an empty config — key "analog_1"`
- `newAnalogChannel — a config already holding analog_1 — key "analog_2", never a duplicate`
- `newAnalogChannel — defaults — enabled true, scale 1, offset 0, matching SPEC §8's example entry shape`
- `newDigitalMarker — defaults — kind "marker", active_low true, debounce_ms 20 (SPEC §8's example)`
- `addChannelOptions — both wheel slots already enabled — both wheel entries disabled with a reason`
- `addChannelOptions — always — level and pwm digital kinds absent (SPEC §8: reserved, not exposed)`

- [ ] **Step 2: Implement the three forms and the picker**

Analog and Digital forms edit one entry and offer Delete. The HRM form carries
idl0's whole flow: enable toggle, a **Search nearby** action that runs
`bleScan` and lets the user pick a strap (prefilling address and name and
auto-enabling), manual uppercase address entry, an informational device name,
the "logs HR_BPM (22) and HR_RR (23) when enabled" note, and **Forget**, which
removes the block. The scan is the same C3 §3.8 `ble_scan` the tab already
uses — it lists whatever is advertising; filtering to heart-rate straps by
service UUID is not possible through C3's `DeviceDiscovered` shape (see
Parity gaps).

- [ ] **Step 3: `docs/IDL0_SPEC.md` §23** — the Analog/Digital/HRM views and the picker.

- [ ] **Step 4: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
```
Expected: 6 new tests passed, 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

---

### Task 8: Profiles, and pushing a config

**Spec discipline:** **spec-during** (`docs/IDL0_SPEC.md` §23, config card and push).

**Files:**
- Create: `Device/profiles.ts`, `Device/profiles.test.ts`, `Device/push.ts`, `Device/push.test.ts`, `Device/ProfileBar.tsx`, `Device/PushConfigBar.tsx`
- Modify: `Device/index.tsx`, `Device/ipcStubs.ts`, `docs/IDL0_SPEC.md` §23

**Interfaces:**
- `profiles.ts`: a pure reducer over the profile library — `{ profiles: ProfileView[], activeId: string | null }` — with select / create / rename / duplicate / delete, where `ProfileView` mirrors core's landed `store::profile::BikeProfile` (`profile_id`, `profile_name`, `created_at_ms`, `updated_at_ms`, `config`). **Persistence is a stub** (`ipcStubs.listProfiles` / `saveProfile` / `deleteProfile`): core already has `store::profile::{load_all, save, delete}` and C4 §2 already fixes `profiles/<profile_id>.idl0p`, but **no C3 command exposes any of it**. Until the Rust write lane lands them the library is in-memory for the session, and the tab says so.
- `push.ts`: `preparePush(config): { ok: true; json: string } | { ok: false; issues: ValidationIssue[] }` — validate, then serialise, in that order, never the reverse — and `describePushResult(reconnected, verified)`, idl0's four post-push messages.

- [ ] **Step 1: Write the failing tests**

`profiles.test.ts`:
- `profilesReducer — CREATE — the new profile becomes active and carries defaultConfig`
- `profilesReducer — DUPLICATE — a new id, a distinct name, and a deep copy of the config (editing the copy must not touch the original)`
- `profilesReducer — RENAME to an existing name — allowed, names are not unique; ids are`
- `profilesReducer — DELETE the active profile — activeId moves to another profile, or null when none remain`
- `profilesReducer — DELETE a profile that is not active — activeId unchanged`

`push.test.ts`:
- `preparePush — a valid config — ok, and the JSON parses back to the same config`
- `preparePush — a config with one error-severity issue — not ok, no JSON produced, the issues returned`
- `preparePush — a config with only warnings — ok: warnings never block a push`
- `preparePush — a config carrying unknown keys — they survive into the pushed JSON verbatim`
- `describePushResult — reconnected and verified — "config applied and verified"; reconnected and mismatched — the try-again text; reconnect failed — the "reconnect when it's back" text; verify unavailable — the plain applied text`

- [ ] **Step 2: Implement**

The push bar mirrors idl0: **Push config** (enabled only when a device
connected in this session, a profile is active, and `isPushable` holds) and
**Pull from device** (a stub — C3 has no read-config command). A push shows
the SPEC §7.2 consequence up front: the device reboots to apply. Round-trip
verification needs the pull command, so with the stub in place
`describePushResult` reports the "applied, not verified" arm — which is the
honest one, not a claim of verification the app cannot make.

**Idle-mode gating:** SPEC §10.4 and §23 require idle mode for a push (BLE
control is suspended in WiFi mode). The app cannot read the device's mode —
that is an IPC need — so the push bar **states** the requirement instead of
enforcing it, and a device that refuses the push surfaces as `kind: "config"`
or `kind: "ble"` through `describeIpcError`. Silently pushing while the device
records is prevented by the device, not by us; pretending otherwise would be a
fake guarantee.

- [ ] **Step 3: `docs/IDL0_SPEC.md` §23** — the config card, profiles, push, and what verification currently does and does not prove.

- [ ] **Step 4: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
```
Expected: 10 new tests passed, 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

---

### Task 9: Device files, the status hero, and the lane's wrap-up

**Spec discipline:** **spec-during** (`docs/IDL0_SPEC.md` §23, hero and files).

**Files:**
- Create: `Device/files.ts`, `Device/files.test.ts`, `Device/DeviceFiles.tsx`, `Device/HeroCard.tsx`
- Modify: `Device/index.tsx`, `Device/ipcStubs.ts`, `docs/IDL0_SPEC.md` §23, `CHANGELOG.md`, `TASKS.md`

**Interfaces:**
- `files.ts`: a pure reducer over the device-file list and the download queue — `{ files: DeviceFileView[], queue: DownloadItem[] }` — where a `DeviceFileView` carries C3 §3.8's `DeviceFile` plus a **`isNew`** flag (its `session_id` is not among the session ids the Data tab's catalog knows, which is how idl0's "(N new)" badge was computed) and `DownloadItem` tracks a `Channel<Progress>` byte count. Plus `newCount(files)` and `formatTransferRate(doneBytes, elapsedMs)`.

- [ ] **Step 1: Write the failing tests**

- `toFileViews — a device file whose session_id is already in the catalog — isNew false`
- `toFileViews — a device file with session_id null — isNew true (the device has not assigned one; it cannot already be imported)`
- `newCount — a mixed list — counts only the new ones`
- `downloadReducer — PROGRESS then SUCCEEDED — the DownloadResult's sha256 and path recorded, status done`
- `downloadReducer — FAILED with kind not_found — status failed, the other queued files untouched`
- `downloadReducer — PROGRESS with total null — a byte count shown, no percentage invented`
- `formatTransferRate — a byte count over an elapsed span — reads in KB/s; a zero elapsed span — reads "—", never Infinity`

- [ ] **Step 2: Implement**

The files view calls `listDeviceFiles(deviceId)` and downloads one file at a
time through `downloadFile(deviceId, name, onProgress)`, showing bytes and rate.
A completed download lands a blob under `<data>/blobs/sha256/` (C3 §3.8's
`DownloadResult`); **importing it is the Data tab's job** and the two tabs do
not call each other in wave 2 — the view tells the user the file is downloaded
and where to import it. Automatic import-after-download is a cross-tab
behaviour needing shared state (Open question 3).

The hero card renders what the tab can actually know: last connect result,
firmware version, and the actions that exist. **Live status, mode, recording
start/stop, sensor health, battery and link activity are all stubbed** — none
has a C3 command (see Parity gaps and IPC-NEEDS). The hero shows them as
"unavailable" rather than as plausible-looking zeros; a fake battery reading on
a race day is worse than a blank one.

- [ ] **Step 3: `docs/IDL0_SPEC.md` §23** — the hero, the files view, and an explicit list of what the idl1 Device tab does not yet know about the device.

- [ ] **Step 4: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
```
Expected: 7 new tests passed, 0 failed. Then the lane merge gate:
`npx tsc --noEmit && npx vitest run` over the whole TS suite.

- [ ] **Step 5: CHANGELOG + TASKS**

The `TASKS.md` line is ticked only if it names what is outstanding (R50):
the IPC needs, and the parity gaps below.

- [ ] **Step 6: Commit**

---

## Parity gaps

| idl0 feature | Source | Disposition | Reason |
|---|---|---|---|
| Live device status — SD card, GPS fix, IMU health, HR, battery | `device_hero_card.dart`, `device_provider.dart` | Stubbed | SPEC §7.3 defines a BLE status characteristic and L4's transport reads it, but **no C3 command exposes it**. IPC need 8. Rendered as "unavailable", never as zeros. |
| Recording start / stop, the recording timer | `device_hero_card.dart`, `mode_controller.dart` | Stubbed | SPEC §7.2's control commands exist in `idl_transport::ble_control::ControlCommand`; no C3 command wraps them. IPC need 9. |
| Mode (idle / WiFi / recording) and mode-transition refusals | `mode.dart`, `mode_controller.dart`, `mode_result_listener.dart` | Stubbed | Same missing command. The push bar states the idle requirement rather than enforcing it. IPC need 9. |
| Pull config from device | `push_config_button.dart` `_pull` | Stubbed | No C3 read-config command. IPC need 10. Its absence also means a push cannot be round-trip verified (SPEC §7.2), which the UI says plainly. |
| Profile persistence (library, import, export) | `profile_provider.dart`, `profile_dialogs.dart` | Stubbed, in-memory for the session | Core has `store::profile` and C4 §2 has `profiles/<id>.idl0p`; **no command exposes them**. IPC need 11. |
| IMU calibration — bias capture, rotation matrices | `calibration_panel.dart`, SPEC §7.6 | **Deferred to wave 3** | Needs a BLE calibration command (SPEC §7.6) plus a UI for a physical procedure. The `orientation` and `bias` config blocks are parsed and preserved verbatim by Task 2, so calibration data survives a round trip untouched. |
| Firmware update / OTA | `firmware_update_section.dart`, `firmware_update_provider.dart` | **Deferred to wave 3** | The operating brief §3 defers it explicitly; `push_ota` exists on the transport trait with no C3 command. Lives in Settings anyway (L7c). |
| Android WiFi bind-follows-mode controller | `wifi_bind_controller.dart` | **Dropped for wave 2** | Platform WiFi binding is L9's mobile lane (design §7: "mobile BLE and WiFi-network binding are Tauri mobile plugins"). |
| HRM scan filtered to heart-rate straps | `hrm_pair_dialog.dart` | Partial | `ble_scan` streams `DeviceDiscovered { device_id, name, rssi_dbm }` — no advertised service UUIDs, so the app cannot filter to the heart-rate service. It lists everything and the user picks. Filtering would need a C3 §3.8 shape change (C3 §6 item 6 already has `ble_scan`'s shape open, assigned to L4). |
| Link activity RX/TX blink | `link_activity.dart` | **Dropped** | Cosmetic, and it depends on transport-internal counters no command exposes. |
| Digital `level` and `pwm` channel kinds | `digital_source.dart` | **Not exposed** (parsed, validated, preserved) | SPEC §8: reserved in the schema, not shipped in Spec 1 firmware. A config that already carries one round-trips intact and gets a warning. |
| Per-channel analog rate overrides | SPEC §8 | **Not exposed** | SPEC §8: "forward-compatible but not yet implemented". |
| "Connect and forget" auto-download on connect | `settings_provider.autoSyncOnOpen` | **Dropped for wave 2** | The setting lives in L7c; the behaviour needs cross-tab state and an import handoff (Open question 3). |

## Open questions (need a lead ruling before dispatch)

1. **May the channel-registry preview (Task 4) live in TypeScript?** It derives `channel_id`, data type, sample rate and — for IMU axes — `scale = range / 32768` from the config. CLAUDE.md §2 says "Rust = numbers, JS = pictures" and "no number the sync model depends on is computed in JavaScript". These numbers are not synced and not persisted; they predict what the *device* will write, and the parser reads the device's own registry, not this. But they are unmistakably physics-adjacent, and a divergence between this preview and the firmware would mislead. Options: **(a)** TS, as this plan writes it, labelled advisory; **(b)** a core function plus a new command `preview_channel_registry(config_json) -> RegistryRow[]` (IPC need 12), one derivation shared with whatever else needs it; **(c)** drop the preview and show only enable state, rate and units. **Recommendation: (a) for wave 2**, because the preview's only consumer is this table and (b) puts a UI convenience into the engine's public surface. But this is exactly CLAUDE.md §1's case — a layer placement not stated by any contract — so it is the lead's call, and Task 4 is gated on the answer.
2. **`analog.sample_rate_hz` has no valid value set.** SPEC §8's own table says "Not yet defined. ADC chip and valid rate set unspecified — define before implementing analog parsing." Options: **(a)** accept any positive integer, warn nothing (this plan's assumption); **(b)** warn on anything outside a provisional range; **(c)** block analog channels entirely until the spec answers. **Recommendation: (a)**, with the gap restated in the §8 note Task 2 writes — inventing a range would put a guess in the spec.
3. **Does a completed download trigger an import?** idl0's "connect and forget" downloaded and indexed in one flow. In idl1 the download lands a blob (C3 §3.8) and the import is C3 §3.3, owned by L7a. Options: **(a)** no handoff in wave 2 — the Device tab says "downloaded, import it from the Data tab" (this plan's assumption); **(b)** the lead adds a small shared slice to `state/AppState.tsx` carrying "blobs awaiting import", and both lanes read it. **Recommendation: (a) for wave 2, (b) as a wave-3 shell task** — a cross-lane shared-state change mid-wave conflicts with three concurrent lanes.
4. **Is `ConnectionInfo.connected` usable as a gate at all?** `rust/tauri/src/commands/device.rs` connects and disconnects inside every command, so nothing is connected between calls. This plan treats it as "the last attempt succeeded" and gates nothing on it being live. Options: **(a)** as written; **(b)** the Rust write lane adds a managed connection (IPC need 13) so the tab can show and gate on real link state. **Recommendation: (a) now, (b) in the same Rust lane as the status and control commands** — those three needs are one piece of work, not three.
5. **Seven source views, or six?** The operating brief says "the seven device source-config views incl. HRM". idl0 ships **six** dialogs (IMU, GPS, Wheel, Analog, Digital, HRM) over **six** `ChannelSource` classes plus a factory registry, and the seventh file in `channel_sources/` is `factories.dart`, not a view. This plan builds six forms plus the "+ Add channel…" picker, which is the seventh *view* if the picker counts. Flagging it so the count in the brief and the count in the plan are not read as a missing feature.
</content>
