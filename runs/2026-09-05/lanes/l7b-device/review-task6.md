# L7b Task 6 review — IMU/GPS/Wheel source forms + pure edit ops

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
branch `wave2-l7b-device`. Commit under review: `e9bdfb5` ("app: Device tab
IMU/GPS/Wheel forms over pure config edit ops"). In scope: `app/src/routes/pages/Device/config/edit.ts`,
`edit.test.ts`, `forms/ImuForm.tsx`, `forms/GpsForm.tsx`, `forms/WheelForm.tsx`,
`ChannelsTable.tsx`, `index.tsx`, `docs/IDL0_SPEC.md` §23.3.1–§23.3.3, `CHANGELOG.md`.
Out of scope (present as uncommitted working-tree changes at review time,
not part of `e9bdfb5`): a Task 5 review-fix follow-up touching `index.tsx`
(`hasPulledConfig` banner) and `sources.ts`/`sources.test.ts` — verified via
`git show e9bdfb5:<path>` that these are not in the reviewed commit; not
reviewed here.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Device
```
Output: `tsc --noEmit` printed nothing (clean). Vitest: `Test Files 7 passed (7)`,
`Tests 69 passed (69)`, 0 failed.

This is 69, not the 67 the implementer reported. The difference is explained
by the out-of-scope follow-up commit's working-tree changes to `sources.ts`/
`sources.test.ts` being present in the worktree at review time (2 additional
tests), not by anything in `e9bdfb5` itself — confirmed by diffing `git show
e9bdfb5 --stat` against the working tree's modified-file list. The gate's
requirement (non-zero `passed`, `tsc` clean) is satisfied either way.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `app/src/routes/pages/Device/forms/ImuForm.tsx:87,95,105,120` | Four of `ImuForm`'s controls (`low_power_mode`, `high_performance_mode`, top-level `accel_range_g`, top-level `gyro_range_dps`) construct a raw `{ ...config, imu: { ...config.imu, X } }` object literal inline in the JSX `onChange` handler instead of going through a pure function in `config/edit.ts`, unlike every other control in the same form (`setImuRate`, `setImuSlot`, `setImuAxis`). This breaks the task's own stated architecture ("pure, immutable edit operations... forms... commit through edit.ts") for exactly these four fields: their merge logic is untested (no `edit.test.ts` coverage of a `low_power_mode`/`high_performance_mode`/top-level-range setter, since none exists) and inconsistent with the rest of the file. It is also what makes the SPEC claim below inaccurate. | Add `setImuMode(config, patch: Partial<Pick<ImuBlock, "low_power_mode" \| "high_performance_mode" \| "accel_range_g" \| "gyro_range_dps">>)` (or fold into an existing setter) in `edit.ts`, route all four controls through it, and add an immutability/merge test for it. |
| Important | `docs/IDL0_SPEC.md:2138` | §23.3.1 states "Every field commits immediately through `Device/config/edit.ts` (`setImuRate`/`setImuSlot`/`setImuAxis`)" — this overstates what's shipped: the four fields above bypass `edit.ts` entirely, per the finding above. The standing reviewer brief calls out checking SPEC accuracy against the shipped forms specifically. | Once the `edit.ts` fix above lands, this line becomes true; until then, correct it to name the fields that do vs. don't go through `edit.ts`, or land the fix first. |
| Minor | `app/src/routes/pages/Device/ChannelsTable.tsx:63-65` | Wrapping the pre-existing `<table>...</table>` block in a new `<>...</>` fragment (to add the sibling `<OpenForm>`) did not re-indent the wrapped block — `<table className="device-channels-table">` now sits at the same 6-space indent as its own children instead of nesting one level under the new fragment. Cosmetic only; not a CLAUDE.md §7 "reformatting untouched lines" violation since the lines were touched, just not re-indented for the new nesting. | Re-indent the wrapped block two spaces on the next touch. |

No Critical findings. No ownership-boundary violation (every path is under
`Device/**`, `CHANGELOG.md`, or `docs/IDL0_SPEC.md` §23.3.x). No IPC call
anywhere in this commit. No `scale`/`32768`/channel-id/data-type computed in
TypeScript (R53 Device Q1 untouched by this task). No push call added. No
unknown/read-only-field loss — every edit function spreads `...config`
first.

## Checks performed (all pass)

- `setImuRate`/`setImuSlot`/`setImuAxis`/`setGps`/`setWheelSlot`/`setHrm`/`clearHrm`
  in `edit.ts` each return a new object via spread, never assign into `config`
  or a nested object in place; the dedicated immutability test
  (`edit.test.ts:126-148`) deep-clones the four mutable sub-trees before
  calling every edit function once each and asserts equality after — this is
  a real test, not a tautology (it would fail if any function above used
  `config.imu.imuN.x = ...` instead of spreading).
- `setImuSlot`/`setWheelSlot`/`setGps` tests each assert the *other* sibling
  slot/field is untouched via `toEqual` against the pre-call object, matching
  the brief's named test list verbatim.
- `setHrm`/`clearHrm` test confirms `hasOwnProperty` is false after
  `clearHrm`, not just `=== undefined` — correctly distinguishes "key absent"
  from "key present with value `undefined`," matching SPEC §8's Forget
  semantics and `serializeConfig`'s omission rule (checked in `model.ts`).
- IMU form's ODR list switches between `IMU_ODR_HIGH_PERF_HZ` and
  `IMU_ODR_LOW_POWER_HZ` (`ImuForm.tsx:62`) based on `low_power_mode`,
  matching SPEC §8's table (`docs/IDL0_SPEC.md:760-764`) byte-for-byte
  against `validate.ts`'s constants, which match the SPEC numbers exactly.
  The mode-flag warning (`imu.low_power_mode` + `imu.high_performance_mode`
  both true) is shown via `issuesFor(issues, "imu.low_power_mode")`
  (`ImuForm.tsx:99`), matching R53's tracked-note ruling (warning only, not
  blocking).
- Accel/gyro range dropdowns constrained to `ACCEL_RANGES_G`/`GYRO_RANGES_DPS`
  (4/8/16/32 g; 125/250/500/1000/2000 dps) for both the top-level defaults
  and each of the three `imuN` sub-blocks — matches SPEC §8 and idl0's
  `imu_dialog.dart`'s equivalent lists.
- GPS form: rate is an enumerated 1–10 Hz integer picker (`GPS_RATE_HZ_MIN`/
  `MAX`), dynamic model restricted to the five SPEC values, NMEA checklist
  restricted to `NMEA_SENTENCES`; `setGps` patches one field at a time so
  toggling `dynamic_model` leaves `nmea_sentences`/`sbas_enabled` untouched
  (asserted in the test).
- Wheel form: `points_per_revolution` (count) and `wheel_circumference_mm`
  (mm) match SPEC §8's field names/units and idl0's `wheel_dialog.dart`
  defaults/labels; both slots edited via `setWheelSlot`, front/rear
  independent (asserted in the test); a disabled slot's geometry issues
  don't show, matching `validate.ts`'s `checkWheelSlot` early return.
- No control anywhere snaps or corrects an off-list/out-of-range value —
  `validateConfig`'s issues are shown inline via `IssueList`, never used to
  auto-correct state. Matches the deliberate no-snapping divergence from
  idl0's `imu_dialog.dart` (which snaps a stored 800 Hz to nearest ODR on
  open) documented in `validate.ts`'s `readImuSampleRate` comment.
- `upsertAnalogChannel`/`removeAnalogChannel`/`upsertDigitalChannel`/
  `removeDigitalChannel` are genuinely absent from `edit.ts` (grep returns
  nothing) — not stubbed with a guessed signature — and the CHANGELOG says so
  explicitly, matching the brief's "leave the bodies to Task 7... say which"
  instruction.
- `ChannelsTable`'s gear control opens `ImuForm`/`GpsForm`/`WheelForm` for the
  matching `sourceKey`s and stays `disabled` (via `formKindForSourceKey`
  returning `null`) for analog/digital/HRM rows, pending Task 7.
- `index.tsx`'s lift of `config` to `useState` + `onConfigChange={setConfig}`
  is the only change to that file in this commit (confirmed via `git show
  e9bdfb5:app/src/routes/pages/Device/index.tsx`); the Task 5 "no config
  loaded" honesty banner is not present in this commit and is not broken by
  it — it exists only in the working tree's separate, out-of-scope follow-up
  commit-in-progress. No `pull_config`/push call added; the config still
  starts from `defaultConfig("")`.
- Doc comments present on every exported symbol in `edit.ts` and the three
  forms' props interfaces; units stated on every numeric doc comment (Hz, g,
  dps, mm).
- Tests named `thing — condition — result` with em dash, Arrange/Act/Assert
  with blank lines between, in both new test files.
- `git diff --stat` for `e9bdfb5`: every path is under
  `app/src/routes/pages/Device/**`, `CHANGELOG.md`, or `docs/IDL0_SPEC.md`;
  nothing under `rust/`, `app/src-tauri/`, `App.tsx`, `main.tsx`,
  `routes/types.ts`, `state/AppState.tsx`, `package.json`, `vite.config.ts`.
- No new npm dependency (no `package.json`/lockfile change in this commit).
- Commit message is a single line, no AI attribution trailer.
- No `cargo` invocation anywhere in the implementer's reported steps or this
  review's own commands.

## Verdict rationale

The pure edit layer is correctly designed and genuinely tested for the six
functions the brief names, immutability is proven (not just asserted) by a
real deep-clone-before/after test, and the three forms match SPEC §8's valid
value sets and units exactly, with no snapping and no scope creep into R53
Q1's narrowed territory. The one real gap is that four of `ImuForm`'s
controls quietly step outside the edit-ops architecture the rest of the task
follows, and the SPEC section written in the same commit asserts a stronger
guarantee ("every field commits... through edit.ts") than the code delivers.
That is a genuine, fixable inconsistency rather than a guessed interface or
a silent scope change — worth a follow-up commit, not a rewrite — so this
lands as NEEDS_FIXES rather than NEEDS-REWORK.

VERDICT: NEEDS_FIXES
