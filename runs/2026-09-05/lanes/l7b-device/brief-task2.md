# L7b Task 2 — implementer brief (the config model: types, defaults, parse, serialise)

You are the implementer for L7b Task 2 — the TypeScript mirror of
`docs/IDL0_SPEC.md` §8's `idl0_config.json`. Everything the rest of this lane
builds sits on this file's types and the lenient `parseConfig` /
`serializeConfig` pair. This task rewrites part of §8 in the same commit
(spec-during). TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
  branch `wave2-l7b-device`, HEAD must be Task 1's commit, status clean.
  Verify first; if not, stop and report.
- Work ONLY there. Same "Never touch" list as Task 1's brief. Do NOT push.
  Editing `docs/IDL0_SPEC.md` §8 in this worktree is this task's own
  spec-during obligation.
- **No cargo, ever.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7b-device/BRIEF.md`; the
  plan's Task 2 (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7b-device-tab.md`,
  lines 136–248) — your starting point, unchanged for this task; **`docs/IDL0_SPEC.md`
  §8 in full** — every field, default, valid-value set, and read-only rule in
  this task's model must trace to a specific sentence in §8; do not invent a
  default or a field §8 doesn't state. Read §8's own worked-example JSON
  block before writing `parseConfig`'s golden test — your test's fixture
  should be that exact document, not a paraphrase.

## The task (plan Task 2, Steps 1–4, unchanged)

**Files:**
- Create: `Device/config/model.ts`, `Device/config/model.test.ts`,
  `Device/config/defaults.ts`
- Modify: `docs/IDL0_SPEC.md` §8, `CHANGELOG.md`

**Interfaces** — a TypeScript mirror of SPEC §8, field for field,
**snake_case keys** (C3 §1's JSON naming rule; these keys go to firmware
verbatim):

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
throwing — and `serializeConfig(config: DeviceConfig): string`, which
re-emits `unknown` keys at the top level and never re-orders or drops a key
it read.

**A deliberate difference from idl0, worth carrying into the code comment on
`parseConfig`:** idl0's `ImuSettingsDialog` snapped a stored 800 Hz to the
nearest valid ODR on open, silently. This model keeps the read value and
reports it as a `Repair`/later a validation error (Task 3) instead — snapping
edits a user's device configuration without telling them.

- [ ] **Step 1: Write the failing tests**

- `parseConfig — SPEC §8's worked example verbatim — every field lands typed, zero repairs`
- `parseConfig then serializeConfig — SPEC §8's worked example — round-trips to the same parsed value (idempotent)`
- `parseConfig — a top-level key the app has never seen — kept in unknown and re-emitted by serializeConfig verbatim`
- `parseConfig — heart_rate_monitor block absent — parses as enabled false (SPEC §8's stated equivalence)`
- `parseConfig — imu sub-blocks absent — all three IMUs inherit the top-level accel/gyro ranges (SPEC §8's per-IMU range resolution)`
- `parseConfig — imu.sample_rate_hz is 800, not a valid ODR — value kept as read and a Repair recorded, never silently snapped`
- `parseConfig — analog.channels holds a non-object entry — that entry is dropped with a Repair, the rest survive`
- `parseConfig — device_id missing — empty string plus a Repair; the field is read-only, never invented`
- `parseConfig — not an object at all — returns defaultConfig with one Repair, never throws`
- `serializeConfig — a config with no HRM block — omits the key rather than emitting enabled:false (SPEC §8's equivalence, kept minimal)`
- `defaultConfig — every field — matches SPEC §8's stated defaults exactly (wheel slots disabled, gps 5 Hz automotive, analog 100 Hz, empty channel arrays)`

Arrange/Act/Assert with blank lines between; every test name literally
`thing — condition — result`.

- [ ] **Step 2: Implement.**

- [ ] **Step 3: Add the app-side config-model note to `docs/IDL0_SPEC.md` §8.**

  State: the app parses leniently and reports repairs; unknown keys and the
  two read-only fields survive a round trip; and — §8 says this itself —
  `analog.sample_rate_hz` has no defined valid set, so the app accepts any
  positive integer there and flags nothing (R53 Device Q2), pending a spec
  answer.

- [ ] **Step 4: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
  ```
  Expected: 11 new tests passed on top of Task 1's 9 (20 total for this
  directory), 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

  ```bash
  git add app/src/routes/pages/Device/config/model.ts app/src/routes/pages/Device/config/model.test.ts app/src/routes/pages/Device/config/defaults.ts docs/IDL0_SPEC.md CHANGELOG.md
  git commit -m "app: Device tab config model — types, defaults, lenient parse/serialise"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not invent a default or valid-value set §8 doesn't state — if a field's
  behaviour is genuinely unclear from §8's text, stop and report rather than
  guessing (CLAUDE.md §1).
- Do not snap an out-of-range value to the nearest valid one — keep it as
  read and record a `Repair`.
- Do not drop `unknown` keys, `device_id`, or `config_version` on a round
  trip.
- Do not build the validator (`validateConfig`) — that's Task 3.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol, including every interface field; units
on every numeric value (Hz, g, dps, mm, ms); A/A/A tests named
`thing — condition — result`. No AI attribution trailer. Never `git push`.

## Spec discipline (say it out loud in your report)

**Spec-during** — `docs/IDL0_SPEC.md` §8 gains the app-side config-model note
per Step 3 above.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line
(`passed` count, expect 20 total for the directory); per-step done/deviated;
confirmation the SPEC §8 worked example round-trips with zero repairs;
confirmation no value is silently snapped; confirmation `unknown` keys and
the two read-only fields survive a round trip; anything ambiguous you
resolved (say how) or that needs a lead ruling (stop and report instead of
guessing — CLAUDE.md §1).
