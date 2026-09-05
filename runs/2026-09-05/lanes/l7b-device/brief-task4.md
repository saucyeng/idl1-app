# L7b Task 4 — implementer brief (channel preview: enable/rate/unit only — NARROWED by R53 Q1)

You are the implementer for L7b Task 4. **This task is not the plan's Task
4 as written.** R53 ruled Device Q1 **(c) now, (b) later — not (a)**: the
plan's `previewRegistry()` — which derives `channel_id`, `data_type` and
`scale = range / 32768` in TypeScript — is **not built in wave 2**. That
derivation is the wire contract's own formula (SPEC §3), which
`core::parse` already owns in Rust; a second copy in TypeScript is the kind
of drift the standing reviewer brief calls a finding. The full derivation
becomes `preview_channel_registry(config_json) -> RegistryRow[]`
(IPC-NEEDS.md need 12) in the Rust write-amendment lane; **this task's job
is smaller: enable state, sample rate, and units only, per source.** This is
a spec-during task on `docs/IDL0_SPEC.md` §8. TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
  branch `wave2-l7b-device`. **HEAD must be Task 3's commit** (the
  validator — expected commit message rewrites `docs/IDL0_SPEC.md` §8 with
  a validation table; check `git log --oneline -5` for a commit adding
  `Device/config/validate.ts`). Verify with `git log -1` and `git status`;
  **if Task 3's commit is not there, STOP and report** — do not start this
  task from Task 2's commit (`4f388b6`, the config model) alone. Task 3 is
  expected to export from `Device/config/validate.ts`: `ValidationIssue`,
  `validateConfig(config: DeviceConfig): ValidationIssue[]`,
  `isPushable(issues): boolean`, and named constants including
  `IMU_ODR_HIGH_PERF_HZ`, `IMU_ODR_LOW_POWER_HZ`, `ACCEL_RANGES_G`,
  `GYRO_RANGES_DPS`, `GPS_RATE_HZ_MIN`/`MAX`, `GPS_DYNAMIC_MODELS`,
  `NMEA_SENTENCES`, `DIGITAL_KINDS`, `BLE_ADDRESS_RE` — this task does not
  use the validator directly, but it must exist on the branch since Task 5
  (channels table, next) will read validation issues per source.
- Work ONLY there. Editing `docs/IDL0_SPEC.md` §8 in this worktree is this
  lane's spec-during obligation. Never touch `rust/`, `app/src-tauri/`,
  `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`.
- **No cargo, ever. No real device available** — this task never asserts
  against a live radio.
- Read first: `CLAUDE.md` §1/§2 (the ruling's own citation — "Rust = numbers,
  JS = pictures", and a layer placement not fixed by contract is a
  question, not an inference); `runs/2026-09-05/lanes/l7b-device/BRIEF.md`
  (Q1's full text); `runs/2026-09-03/decisions.md` R53 "Device (L7b)" Q1 (the
  ruling itself); `runs/2026-09-05/lanes/l7/IPC-NEEDS.md` need 12
  (`preview_channel_registry` — filed, conditional, joins the Rust lane
  later, not this task); `Device/config/model.ts` (already on the branch —
  `DeviceConfig`, `ImuBlock`, `ImuSlot`, `GpsBlock`, `AnalogChannel`,
  `DigitalChannel`, `WheelSlot`, `HrmBlock`, read the actual file, field
  names below are copied from it verbatim).

## The task (narrowed scope — replaces the plan's Task 4 text entirely)

**Files:**
- Create: `Device/config/sourcesPreview.ts`, `Device/config/sourcesPreview.test.ts`
- Modify: `docs/IDL0_SPEC.md` §8, `CHANGELOG.md`

**Interfaces:**
```ts
/** One row of the channel-enable preview the Device tab's channels table
 *  (Task 5) shows per configurable source — enable state, sample rate, and
 *  units only. Deliberately narrower than SPEC §5.2's full registry entry
 *  (channel_id, data_type, scale, offset): those are the wire contract's
 *  own numbers (SPEC §3), computed by core::parse, and this preview does
 *  not duplicate that arithmetic in TypeScript (R53 Device Q1). When
 *  `preview_channel_registry` (IPC need 12) lands, this module is replaced
 *  wholesale, not extended. */
export interface SourcePreviewRow {
  sourceKey: string;
  label: string;
  enabled: boolean;
  /** Hz; null for an event-driven source (wheel pulse counters, a digital
   *  marker) — never a fabricated rate. */
  sampleRateHz: number | null;
  units: string;
}
export function previewSources(config: DeviceConfig): SourcePreviewRow[];
```
Ported from idl0's source list, **stopping short of `resolveRegistryEntries()`**:
IMU0/1/2 (enabled iff the slot's `enabled` is true; rate is the shared
`imu.sample_rate_hz`; units "g / dps" as a combined label, since a preview
row is one row per IMU, not one per axis — Task 5's channels table expands
axes separately once it reads `ImuSlot.channels`); GPS (rate
`gps.sample_rate_hz`; units "deg / m/s" as a combined label); Wheel
front/rear (event-driven, `sampleRateHz: null`; units "count"); one row per
`analog.channels[]` entry (rate the shared `analog.sample_rate_hz`; units
the entry's own `units` field); one row per `digital.channels[]` entry
(event-driven, `sampleRateHz: null`; units "event"); HRM (enabled iff
`heart_rate_monitor?.enabled`; rate `null` — SPEC §5.2 fixes `HR_BPM` at
1 Hz and `HR_RR` event-driven, two different rates in one source, so this
preview reports neither rather than picking one; units "bpm / ms").

- [ ] **Step 1: Write the failing tests**

  - `previewSources — SPEC §8's worked example — one row per fixed source (imu0/1/2, gps, wheel front/rear) plus one row per analog/digital entry, plus hrm`
  - `previewSources — a disabled imu slot — enabled false, sampleRateHz still reported (the bus rate is shared and always known, unlike a per-axis rate)`
  - `previewSources — wheel front enabled, rear disabled — front's row enabled true, rear's enabled false, both sampleRateHz null`
  - `previewSources — two analog channels — one row per entry, each carrying its own units`
  - `previewSources — heart_rate_monitor absent — hrm row present with enabled false (SPEC §8: absence equals disabled), sampleRateHz null`
  - `previewSources — heart_rate_monitor enabled — hrm row enabled true, sampleRateHz null (two different rates, HR_BPM and HR_RR — reported as neither, not a guess)`
  - `previewSources — no source's sampleRateHz claims a value SPEC §5.2 does not state — an event-driven source is always null, never 0`

- [ ] **Step 2: Implement**

- [ ] **Step 3: Document the narrowed scope in `docs/IDL0_SPEC.md` §8**

  Add a short note next to (or replacing, if Task 4's plan text already
  wrote something here — check first) any existing registry-preview
  language: wave 2 shows enable state, rate and units only; the full
  registry preview (channel id, data type, scale, offset) is deferred to
  `preview_channel_registry` (IPC need 12) once the Rust write-amendment
  lane lands it, per R53 Device Q1's ruling that the `scale = range /
  32768` derivation belongs in `core::parse`, not a second TypeScript copy.

- [ ] **Step 4: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
  ```
  Report the exact `passed` count — do not assume the plan's original "11
  new tests" figure, which was written for the wider derivation this task
  does not build.

- [ ] **Step 5: NUL-byte check**

  ```
  grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]' app/src/routes/pages/Device/config/sourcesPreview.ts app/src/routes/pages/Device/config/sourcesPreview.test.ts docs/IDL0_SPEC.md
  ```
  Every count must print `0`.

- [ ] **Step 6: CHANGELOG + commit**

  CHANGELOG bullet stating plainly that this is the narrowed R53 Q1 scope,
  not the plan's original wider preview, and naming what IPC need 12 will
  add later.

  ```bash
  git add app/src/routes/pages/Device/config/sourcesPreview.ts app/src/routes/pages/Device/config/sourcesPreview.test.ts docs/IDL0_SPEC.md CHANGELOG.md
  git commit -m "app: Device tab channel-enable preview (R53 Q1 narrowed scope, no scale/channel_id)"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not compute `scale = range / 32768` or any per-axis scale/offset in
  TypeScript — that is exactly what R53 Q1 forbade.
- Do not derive or display a predicted `channel_id` or `data_type` — both
  are IPC need 12's job, not this task's.
- Do not name the module `registry.ts` or the function `previewRegistry` —
  those names belong to the wider derivation the plan originally specified
  and this task deliberately does not build; using them would make a later
  reviewer think need 12 already landed. Use `sourcesPreview.ts` /
  `previewSources` as given above.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Spec discipline (say it out loud in your report)

**Spec-during** — `docs/IDL0_SPEC.md` §8 gains the narrowed-scope note per
Step 3.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line
(state the actual `passed` count, do not assume the plan's original
figure); per-step done/deviated; confirmation no `scale`/`channel_id`/
`data_type` appears anywhere in `sourcesPreview.ts`; confirmation the
module and function names are `sourcesPreview.ts`/`previewSources`, not
`registry.ts`/`previewRegistry`; confirmation the NUL-byte check printed
`0` for every file; anything ambiguous you resolved (say how) or that needs
a lead ruling.
