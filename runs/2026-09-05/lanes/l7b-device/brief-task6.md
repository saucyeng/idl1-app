# L7b Task 6 — implementer brief (source forms A: IMU ×3, GPS, Wheel front/rear)

You are the implementer for L7b Task 6 — the pure edit operations over
`DeviceConfig` and the IMU/GPS/Wheel forms built on them. This task rewrites
part of `docs/IDL0_SPEC.md` §23 in the same commit (spec-during). TDD, ONE
commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
  branch `wave2-l7b-device`. **HEAD must be Task 5's commit** ("app: Device
  tab channels table over the config model and Task 4's source preview").
  Verify with `git log -1` and `git status`; if not there, STOP and report.
- Work ONLY there. Editing `docs/IDL0_SPEC.md` §23 in this worktree is this
  lane's spec-during obligation. Never touch `rust/`, `app/src-tauri/`,
  `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`.
- **No cargo, ever. No real device available.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7b-device/BRIEF.md`; the
  plan's Task 6 (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7b-device-tab.md`,
  lines 445–485); `Device/config/model.ts` in full (the actual field names —
  `ImuBlock`, `ImuSlot`, `GpsBlock`, `WheelSlot`); `Device/config/validate.ts`
  (Task 3, expected on the branch — `ValidationIssue`, `validateConfig`, and
  the named constants `IMU_ODR_HIGH_PERF_HZ`/`LOW_POWER_HZ`,
  `ACCEL_RANGES_G`, `GYRO_RANGES_DPS`, `GPS_RATE_HZ_MIN`/`MAX`,
  `GPS_DYNAMIC_MODELS`, `NMEA_SENTENCES` — the forms constrain their
  controls to these sets); `Device/sources.ts` (Task 5, this task's forms
  are opened from `ChannelsTable.tsx`'s gear control).

## The task (plan Task 6, Steps 1–4, unchanged)

**Files:**
- Create: `Device/config/edit.ts`, `Device/config/edit.test.ts`,
  `Device/forms/ImuForm.tsx`, `Device/forms/GpsForm.tsx`,
  `Device/forms/WheelForm.tsx`
- Modify: `Device/ChannelsTable.tsx`, `docs/IDL0_SPEC.md` §23

**Interfaces:**
- `edit.ts`: pure, immutable edit operations over `DeviceConfig` —
  `setImuRate(config, hz)`, `setImuSlot(config, slot: "imu0"|"imu1"|"imu2",
  patch: Partial<ImuSlot>)`, `setImuAxis(config, slot, axis: keyof
  ImuSlot["channels"], enabled: boolean)`, `setGps(config, patch:
  Partial<GpsBlock>)`, `setWheelSlot(config, side: "front"|"rear", patch:
  Partial<WheelSlot>)`, `upsertAnalogChannel`, `removeAnalogChannel`,
  `upsertDigitalChannel`, `removeDigitalChannel` (all four are Task 7's to
  fill in — declare the signatures here if `Device/forms/AnalogForm.tsx` etc.
  need them, but leave the bodies to Task 7 if you'd rather not guess at
  their exact shape; say in your report which you did), `setHrm(config,
  patch: Partial<HrmBlock>)`, `clearHrm(config)`. Every one returns a new
  `DeviceConfig` and touches nothing else.

- [ ] **Step 1: Write the failing tests**

  - `setImuRate — changing the shared bus rate — all three IMU slots keep their own ranges and axis enables`
  - `setImuSlot — enabling imu1 — imu0 and imu2 untouched`
  - `setImuAxis — ticking gyro_z on imu2 — only that flag changes; unknown keys still present`
  - `setGps — a new dynamic model — nmea_sentences and sbas_enabled unchanged`
  - `setWheelSlot — editing front — rear untouched`
  - `every edit function — the input config object — is not mutated (immutability, checked by deep-equality against a pre-call clone)`
  - `setHrm then clearHrm — the block is removed entirely (config.heart_rate_monitor is undefined), matching idl0's Forget (SPEC §8: omitting the block equals disabled)`

- [ ] **Step 2: Implement the three forms**

  Each form edits a draft, shows `validateConfig`'s issues for its own
  paths inline (filter `ValidationIssue[]` by `path` prefix — e.g.
  `"imu.sample_rate_hz"` for the shared rate control, `"imu0."` for imu0's
  own fields), and commits through `edit.ts`. Controls are constrained to
  the valid sets from Task 3 — the ODR list (switching between the high-
  performance and low-power lists based on `low_power_mode`), the two range
  lists, the 1–10 Hz GPS range, the five dynamic models, the six NMEA
  sentences — so an invalid value is hard to produce by pointing, and
  caught by the validator when it arrives from a file or a device.

- [ ] **Step 3: `docs/IDL0_SPEC.md` §23** — the IMU/GPS/Wheel views.

- [ ] **Step 4: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
  ```
  Expected: 7 new tests passed, 0 failed.

- [ ] **Step 5: NUL-byte check**

  ```
  grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]' app/src/routes/pages/Device/config/edit.ts app/src/routes/pages/Device/config/edit.test.ts app/src/routes/pages/Device/forms/ImuForm.tsx app/src/routes/pages/Device/forms/GpsForm.tsx app/src/routes/pages/Device/forms/WheelForm.tsx app/src/routes/pages/Device/ChannelsTable.tsx docs/IDL0_SPEC.md
  ```
  Every count must print `0`.

- [ ] **Step 6: CHANGELOG + commit**

  ```bash
  git add app/src/routes/pages/Device/config/edit.ts app/src/routes/pages/Device/config/edit.test.ts app/src/routes/pages/Device/forms/ImuForm.tsx app/src/routes/pages/Device/forms/GpsForm.tsx app/src/routes/pages/Device/forms/WheelForm.tsx app/src/routes/pages/Device/ChannelsTable.tsx docs/IDL0_SPEC.md CHANGELOG.md
  git commit -m "app: Device tab IMU/GPS/Wheel forms over pure config edit ops"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not mutate the input `DeviceConfig` in any edit function.
- Do not let a form control offer a value outside Task 3's valid sets.
- Do not fully implement the analog/digital edit functions' UI here — the
  signatures may exist for Task 7 to call, but `AnalogForm.tsx`/
  `DigitalForm.tsx` are Task 7's.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Spec discipline (say it out loud in your report)

**Spec-during** — `docs/IDL0_SPEC.md` §23 gains the IMU/GPS/Wheel view
sections per Step 3.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line;
per-step done/deviated; whether `upsertAnalogChannel`/`removeAnalogChannel`/
`upsertDigitalChannel`/`removeDigitalChannel` were declared (signature only)
or left entirely to Task 7 — say which and why; confirmation no edit
function mutates its input; confirmation the NUL-byte check printed `0` for
every file; anything ambiguous you resolved (say how) or that needs a lead
ruling.
