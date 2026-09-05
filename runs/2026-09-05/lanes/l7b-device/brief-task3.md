# L7b Task 3 — implementer brief (the validator)

You are the implementer for L7b Task 3 — `validateConfig`, the single gate
between a `DeviceConfig` and `pushConfig`. This task adds a validation table
to `docs/IDL0_SPEC.md` §8 (spec-during). TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
  branch `wave2-l7b-device`, HEAD must be Task 2's commit, status clean.
  Verify first; if not, stop and report.
- Work ONLY there. Same "Never touch" list as Task 1/2. Do NOT push. Editing
  `docs/IDL0_SPEC.md` §8 in this worktree is this task's own spec-during
  obligation.
- **No cargo, ever.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7b-device/BRIEF.md`
  (the "load-bearing invariants" section — a config is never pushed
  unvalidated); the plan's Task 3
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7b-device-tab.md`, lines
  251–326) — your starting point, unchanged; Task 2's landed
  `Device/config/model.ts` (`DeviceConfig` and its sub-types — this task
  imports them, does not redefine any); `docs/IDL0_SPEC.md` §8's own prose
  tables (the ODR sets, the accel/gyro range lists, the GPS rate range, the
  five dynamic models, the NMEA sentence set) — every named constant below
  must match §8's stated values exactly, character for character on strings.

## The task (plan Task 3, Steps 1–3, unchanged)

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

Arrange/Act/Assert with blank lines between; every test name literally
`thing — condition — result`.

- [ ] **Step 2: Implement.**

  Every path in a `ValidationIssue` must actually address the field it's
  about (`"imu0.accel_range_g"`, `"analog.channels[2].adc_pin"`) so a later
  form (Tasks 6–7) can put the message beside the field. Cross-channel
  checks (duplicate analog key, shared pin across analog and digital) walk
  both arrays together — do not check analog against analog and digital
  against digital separately and miss the cross-kind collision.

- [ ] **Step 3: Add the validation table to `docs/IDL0_SPEC.md` §8.**

  One row per rule: path, severity, condition, citation. This gives §8's
  prose tables a machine-checkable counterpart a reviewer can check the code
  against line by line.

- [ ] **Step 4: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
  ```
  Expected: 23 new tests passed on top of the running total (20 + 23 = 43
  for this directory), 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

  ```bash
  git add app/src/routes/pages/Device/config/validate.ts app/src/routes/pages/Device/config/validate.test.ts docs/IDL0_SPEC.md CHANGELOG.md
  git commit -m "app: Device tab config validator — the gate before push_config"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not let a warning block `isPushable` — only `error` severity does.
- Do not miss the cross-kind pin collision (analog vs. digital sharing a
  physical pin) — a check that only compares within one channel kind is
  incomplete.
- Do not redefine any type from `Device/config/model.ts` — import it.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol and named constant, each citing SPEC
§8; units on every numeric value; A/A/A tests named
`thing — condition — result`. No AI attribution trailer. Never `git push`.

## Spec discipline (say it out loud in your report)

**Spec-during** — `docs/IDL0_SPEC.md` §8 gains the validation table per
Step 3 above.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line
(`passed` count, expect 43 total for the directory); per-step done/deviated;
confirmation the cross-kind pin-collision check exists and is tested;
confirmation `isPushable` treats only `error` severity as blocking; anything
ambiguous you resolved (say how) or that needs a lead ruling (stop and
report instead of guessing — CLAUDE.md §1).
