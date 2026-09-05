# L7b Task 2 review — the config model (types, defaults, parse, serialise)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
branch `wave2-l7b-device`. Commit under review as dispatched: `4f388b6` (parent
`4950882`, "merge: main into wave2-l7b-device before Task 2"). **Note:** the
implementer amended this commit after reporting it — current branch HEAD is
`0acc1ef`, same commit message, same five files, plus one extra line changed
in `app/src/routes/pages/Device/index.tsx` (a doc-comment wording fix on
`SCAN_TIMEOUT_MS`, adding "in milliseconds"; see Findings). This review
evaluates the diff of `4f388b6` against its parent as dispatched, and
separately notes the amend.

In scope: `Device/config/{model.ts,defaults.ts,model.test.ts}`,
`docs/IDL0_SPEC.md` §8's app-side config-model note, `CHANGELOG.md`. Out of
scope (not touched by 4f388b6, correctly): `validateConfig` (Task 3),
anything under `rust/` or `app/src-tauri/`.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Device
```

`tsc --noEmit` printed nothing. Vitest:

```
 Test Files  3 passed (3)
      Tests  22 passed (22)
```

Coverage table for `.../Device/config`: 91.53% stmts / 87.37% branch / 100%
funcs / 94.51% lines aggregate; `model.ts` individually 90.8/87.37/100/93.95.
`defaults.ts` does not appear as its own row in this reporter's table (only
directories and sub-100%-ish files print under the default `text` reporter
config in `app/vitest.config.ts`); its statements are folded into the
directory aggregate, consistent with the implementer's reported 100%. This
reproduces the implementer's reported 22 passed / 0 failed and matches the
reported model.ts ≈94% lines figure.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | (process) commit history | The reviewed commit `4f388b6` was amended to `0acc1ef` after the implementer's report, adding an unrelated one-line doc-comment tweak to `Device/index.tsx` (Task 1's file, not part of Task 2's file list) without a new report. The change itself is harmless and in-lane, but an undisclosed amend after report breaks the assumption that the dispatched hash is what's on `HEAD` when reviewed. | Report amends as a follow-up note, or fold incidental fixes into the next task's commit instead of amending a reported one. |
| Minor | `Device/config/model.ts:76-84, 87-96, 67-73, 99-104` | `AnalogChannel`, `DigitalChannel`'s `gpio_pin`/`active_low`/`enabled`, `GpsBlock`'s `dynamic_model`/`nmea_sentences`/`sbas_enabled`, `WheelSlot`'s `enabled`/`points_per_revolution`, and `ImuSlot`'s `enabled`/`channels` have no per-field doc comment, contrary to the task brief's own style rule ("doc comment on every exported symbol, including every interface field") and CLAUDE.md §5's "units on every numeric value" (`adc_pin`, `scale`, `offset`, `points_per_revolution` are numeric and undocumented). The brief's own interface listing in `brief-task2.md` was itself a single-line, undocumented block for these two, so this is a carried-forward gap rather than an invention. | Add a one-line doc comment per field, with units where numeric (e.g. `scale`/`offset` in the channel's own `units` field's terms, `adc_pin` dimensionless). |
| Note | `Device/config/defaults.ts:4-9,51-66` | Judgment call (per dispatch): IMU numeric defaults 833 Hz / 32 g / 2000 dps are taken from SPEC §8's worked-example JSON, not from a sentence stating them as defaults — SPEC §8 has no prose default for these three fields (confirmed: the "Configurable chip options" and "Valid sample_rate_hz values" sections give ranges, never a default value). The task's own Step-1 test-name list for `defaultConfig` names only wheel/gps/analog/channel-array defaults, not IMU numbers, suggesting the planner didn't consider these "stated." The values chosen are internally consistent (833 Hz is a valid high-perf ODR, 32 g/2000 dps are valid ranges) and the doc comments accurately attribute them to "SPEC §8 worked example's..." rather than overclaiming a stated default — this is disclosed, not invented-and-hidden. Per CLAUDE.md §1 this was arguably a stop-and-ask case rather than a unilateral resolution, since `ImuBlock.sample_rate_hz`/`accel_range_g`/`gyro_range_dps` are non-optional numbers with no fallback candidate anywhere else in §8. Flagging for a lead ruling rather than treating as a defect — the implementer's choice is the only reasonable one available and is transparently documented. | Lead ruling: confirm worked-example values as the sanctioned defaults (recommended — no better source exists), or say otherwise. No code change needed either way unless the ruling picks different numbers. |

No Critical or Important findings.

## Checks performed (all pass)

- **No wire-format arithmetic in TS.** Grepped `model.ts`, `defaults.ts`,
  `model.test.ts` for `32768`, `/ 32768`, `scale =`, `channel_id` derivation,
  data-type derivation — zero hits. R53 Device Q1 is Task 4's concern and
  this task doesn't touch it.
- **Field-for-field fidelity to SPEC §8.** Every field in `DeviceConfig` and
  its nested blocks traces to a specific §8 sentence or the worked-example
  JSON; cross-checked the interface against §8 lines 656-772 field by field.
  `push_config` (`rust/tauri/src/commands/device.rs`) accepts `config_json:
  String` and only does a JSON-syntax check before forwarding over BLE — it
  imposes no schema of its own, so there is no additional Rust-side contract
  to reconcile beyond §8 itself.
- **No silent snapping.** `readImuSampleRate` keeps an off-ODR value exactly
  as read and records a `Repair`; the dedicated test
  (`model.test.ts:166-176`) proves 800 Hz survives unchanged with the
  expected `Repair` reason, never rounded to 833/416/etc.
- **Unknown-key and read-only-field round trip.** `parseConfig` collects
  every unrecognised top-level key into `unknown`; `serializeConfig`
  re-emits it plus `device_id`/`config_version` verbatim. The dedicated
  round-trip and unknown-key tests (`model.test.ts:111-135`) pass and were
  reproduced by the gate run.
- **Worked example round-trips with zero repairs.** `model.test.ts:88-109`
  and the idempotent round-trip test both assert `repairs` is empty against
  §8's exact JSON block (compared the fixture in the test byte-for-byte
  against `docs/IDL0_SPEC.md` lines 656-724 — identical).
- **`analog.sample_rate_hz` accepts any positive integer / any finite
  number.** `readAnalog` uses the generic `readNumber` (type + finiteness
  only, no range check) — consistent with §8's "Not yet defined" row and the
  SPEC note this task adds, which correctly restates the gap (R53 Device
  Q2) rather than inventing a range. Range validation is explicitly deferred
  to Task 3 per the brief's own "Do not build the validator" instruction.
- **`bike_profile.name`/`default_rider` default `""`.** The plan's own
  interface types both fields as required (non-optional) strings, so there
  is no way to represent "absent" distinct from an empty string without
  changing the interface (which is the plan's, not this task's, decision to
  revisit) — `""` is the only value compatible with the given shape and SPEC
  §8 states no other default. Accepted.
- **Missing read-only field ⇒ Repair, missing nested block ⇒ valid.**
  `readRequiredString`/`readRequiredNumber` report a `Repair` on absence for
  `device_id`/`config_version`; `objectOrDefault` treats `undefined` as
  valid (no `Repair`) for every nested block (`bike_profile`, `imu` sub-
  blocks, `gps`, `analog`, `digital`, `wheel_speed`, `heart_rate_monitor`),
  consistent with §8's "omitting the [per-IMU] block is valid" /
  "[HRM] omission equivalent to enabled: false" language, generalised
  sensibly to the other blocks (§8 doesn't forbid this).
- **Two extra tests** (`malformed field types throughout the document` and
  `imu.orientation and imu.bias present but malformed`) are genuine
  additional coverage of paths the 11 named tests don't reach (multi-field
  simultaneous repair, and the two optional blocks' malformed-value paths);
  in scope, no rendering tests, correctly A/A/A.
- **Reader constants wired correctly.** `readGps` uses
  `DEFAULT_GPS_SAMPLE_RATE_HZ` (5 Hz); `readAnalog` uses
  `DEFAULT_ANALOG_SAMPLE_RATE_HZ` (100 Hz) — not swapped, confirmed by
  reading both call sites and by the passing
  `defaultConfig — every field` and worked-example tests.
- **Ownership boundary.** `git diff --stat 4950882 4f388b6` touches exactly
  `CHANGELOG.md`, `Device/config/{defaults.ts,model.test.ts,model.ts}`,
  `docs/IDL0_SPEC.md` — nothing under `rust/`, `app/src-tauri/`,
  `App.tsx`/`App.css`/`main.tsx`/`routes/types.ts`/`state/AppState.tsx`,
  `package.json`, `vite.config.ts`. The `docs/IDL0_SPEC.md` diff is confined
  to the end of §8 (before the "## 9. Coordinate System" heading).
- **Merge commit `4950882` hygiene.** `git show --stat` shows only an
  auto-merge diff (`CHANGELOG.md` conflict resolved by keeping both bullets
  per the R19 pattern, plus files that came in from `main` — `package.json`,
  `package-lock.json`, `vitest.config.ts`, an L6 review record); no manual
  edit beyond the stated CHANGELOG resolution.
- **No new npm dependency** in the reviewed commit's diff.
- **CLAUDE.md §4 testing.** All 13 tests in `model.test.ts` (11 named + 2
  extra) use Arrange/Act/Assert with blank lines between and are named
  literally `thing — condition — result` (em dash); no rendering tests; the
  config model, defaults, parse and serialise are all pure functions.
- **No `Err(String)`-equivalent / no fabricated `IpcError`.** `parseConfig`
  never throws and returns a typed `ParseResult`; `Repair` is a plain
  domain type, not routed through the C3 IPC error shape (correctly out of
  scope for this task).
- **Repo hygiene.** Single-line commit message on both `4f388b6` and the
  later amend `0acc1ef`, no AI attribution trailer; `git show --stat` file
  list matches the brief's Step 5 `git add` list exactly.
- **No cargo** in the reported steps or reachable from this diff.

## Verdict rationale

The model is a faithful, field-for-field mirror of SPEC §8 with no invented
defaults beyond one disclosed, defensible judgment call (IMU numeric
defaults from the worked example), no wire-format arithmetic, no silent
snapping, and verified round-trip preservation of unknown keys and both
read-only fields — all confirmed by reading the code against §8's text and
by reproducing the gate exactly (22 passed, `tsc` clean). The two findings
are a documentation-completeness gap on a handful of untouched-since-brief
interface fields and a process note about a post-report amend, neither of
which changes behaviour or violates a hard rule; the IMU-default judgment
call is flagged for the lead to bless rather than treated as a defect, since
the implementer's choice is well-reasoned, disclosed, and the only value
available given the interface shape SPEC §8 and the plan already fixed.

VERDICT: CLEAN
