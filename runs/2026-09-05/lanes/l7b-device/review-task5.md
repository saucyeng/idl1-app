# L7b Task 5 review — the channels table

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
branch `wave2-l7b-device`, commit `ec7625447d9cf25ed5c8a53f2435c45285482db3`
("app: Device tab channels table over the config model and Task 4's source
preview"). In scope: `app/src/routes/pages/Device/sources.ts`,
`sources.test.ts`, `ChannelsTable.tsx`, `index.tsx`, `docs/IDL0_SPEC.md`
§23.3, `CHANGELOG.md`. Out of scope: a docs-only follow-up (CHANGELOG bullet
+ SPEC §8 table row for the mode-flag warning) the lead said may land during
review; not present in this commit's diff, so no interaction to check.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Device
```
`tsc --noEmit` printed nothing. Vitest: **6 test files, 60 tests, all
passed**; `Device/sources.ts` line coverage 96.87 %. This reproduces the
implementer's reported 60 passed / sources.ts 96.8 % (rounding only).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `app/src/routes/pages/Device/sources.ts:150` (GPS row `{ name: "fix", ... }`), `:163`/`:169` (wheel rows `{ name: "pulse", ... }`), `:196` (HRM row `{ name: "heart_rate", ... }`) | The expanded breakdown's channel `name`s are ad hoc UI strings, not the SPEC §3/§5.2 registry names the parser actually emits for these channels (`WheelFront`/`WheelRear`, `HR_BPM`) or that idl0's own `channels_table.dart` shows (idl0's `WheelSource`/`HrmSource`/`GpsSource` all name their `ChannelRow`s with the exact registry string — `WheelFront`, `HR_BPM`, `HR_RR`, `GPS_Latitude`, etc — see `idl0-app/app/lib/data/channel_sources/{wheel,hrm,gps}_source.dart`). A user will see "pulse"/"heart_rate"/"fix" in this table and a different name for the same channel in the Data tab and the notebook once those exist, which is exactly the kind of naming drift the channel-registry contract exists to prevent. Neither the plan (lines 405-443) nor `brief-task5.md` mandates these specific strings — the brief only says "one row each" for GPS/wheel/digital/HRM; the row *names* were the implementer's own choice. Wheel and HRM are 1:1 with a registry name today and should use it (`WheelFront`, `WheelRear`, `HR_BPM`) rather than an invented word. GPS is collapsed to one row per the brief's own narrowed scope (idl0 shows 8 separate GPS channels — `GPS_EpochMs`/`Latitude`/`Longitude`/`Altitude`/`SpeedKmh`/`Heading`/`FixQuality`/`Satellites`); that collapse itself is in-scope per the brief, but the single row's name should still not be a novel term absent from SPEC §3 — this is a design question for the lead (single synthetic name vs. deferring the row entirely) rather than a same-severity implementer defect as the wheel/HRM cases. | Rename the wheel and HRM breakdown rows to `WheelFront`/`WheelRear`/`HR_BPM` (a one-line change, no interface change). Raise the GPS single-row naming with the lead as a follow-up question rather than resolving it silently. |
| Important | `app/src/routes/pages/Device/index.tsx:26,70` | The channels table renders against `defaultConfig("")` — a fabricated, never-pulled config — with **no user-visible indicator** that this is a placeholder rather than the connected device's actual configuration. `pull_config` (IPC need 10) is correctly still a stub, and the code comment at line 23-25 discloses the reason to a future reader of the source, but nothing in the rendered UI does: the "Rate"/"Enabled" columns will show default-config numbers (e.g. 833 Hz, IMU0 off) indistinguishably from a real pulled config once a user has connected. Per the dispatch's own framing, a placeholder shown as if real needs a visible marker. | Add a one-line banner/notice in `device-tab__config` (e.g. "No device configuration loaded — showing defaults") gated on the same stub condition, removed when Task 6/7 wires a real `pull_config`. |

**No Critical findings.**

## Checks performed (all pass)

- **R53 Device Q1 (Task 4 narrowing) respected in Task 5's own diff.** No
  `32768`, no `scale = range`/`scale = range / 32768` arithmetic anywhere in
  `sources.ts`/`ChannelsTable.tsx` — the only two `32768` occurrences in the
  diff are doc-comment prose (`sources.ts:66`, and the SPEC §23.3 rewrite)
  explaining *why* the value is not computed here. No predicted `channel_id`
  or `data_type` column anywhere.
- **`listSources` joins Task 4's `previewSources` and never re-derives
  enable/rate.** `lookupPreview` (`sources.ts:100-111`) only reads
  `enabled`/`sampleRateHz` off `previewSources(config)`'s rows by
  `sourceKey`; it throws (a programmer-invariant error, not a user-facing
  one) rather than silently guessing on a missing key, which is correct
  defensive behaviour for two lists that must stay in lockstep.
- **Judgment call (a) — analog `sourceKey`.** `sources.ts` uses
  `channel.key` verbatim (no `analog/` prefix), matching Task 4's
  `sourcesPreview.ts` (`rows.push({ sourceKey: channel.key, ... })` for both
  `analog.channels` and `digital.channels`). The plan's `analog/<key>` text
  (line 419) is confirmed stale against the landed Task 4 shape; the
  implementer's resolution is correct and consistent with the module it
  joins onto.
- **Judgment call (b) is addressed above as an Important finding**, not
  waved through as acceptable.
- **IMU axis rows carry no `scale`/`offset`.** `imuChannelRows` (lines
  61-70) builds six rows from `ImuSlot.channels`, none carrying
  `scale`/`offset`; the `sources.test.ts` test
  `"an IMU — six axis rows..."` explicitly asserts `scale`/`offset` are
  `undefined` on every axis row.
- **Analog channel rows carry the config's own `scale`/`offset` verbatim.**
  `analogChannelRow` reads `channel.scale`/`channel.offset` straight from
  the `AnalogChannel` the user typed; the test
  `"an analog entry — its channel row carries..."` asserts the exact
  fixture values (`0.0123`, `-1.5`) round-trip unchanged.
- **No scale-snapping** anywhere in this diff (none of this task's code
  path touches `imu.sample_rate_hz` or any valid-value set).
- **Gear control is a disabled placeholder** pointing at Tasks 6-7
  (`ChannelsTable.tsx`, `aria-label`/`disabled` + comment), not a live
  control with nowhere to go.
- **No IPC calls in `sources.ts`/`ChannelsTable.tsx`.** `index.tsx`'s only
  IPC calls (`bleScan`/`bleConnect`) predate this task and are unchanged
  except for adding the config/table wiring.
- **`docs/IDL0_SPEC.md` §23.3 rewrite describes exactly the shipped
  columns** — Source/Rate Hz/Channels/Enabled/gear on the parent row,
  Name/Units/Enabled/Scale/Offset on the expanded child row — matching
  `ChannelsTable.tsx`'s actual `<th>` headers field-for-field. The "no
  channel_id/data-type column" sentence cites R53 Device Q1 and IPC need 12
  without re-litigating the ruling, as instructed.
- **Ownership boundary.** `git show --stat` touches only
  `app/src/routes/pages/Device/**`, `CHANGELOG.md`, and `docs/IDL0_SPEC.md`
  (§23.3 only) — nothing under `rust/`, `app/src-tauri/`, `App.tsx`,
  `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, or `vite.config.ts`.
- **No new command in `app/src/ipc/device.ts`** — that file is untouched by
  this commit.
- **No new npm dependency** — `package.json`/lockfile untouched.
- **CLAUDE.md §4 testing.** All seven tests in `sources.test.ts` are
  Arrange/Act/Assert with a blank line between each step and named
  literally `thing — condition — result` (em dash, verified byte-for-byte).
  No rendering test was added for `ChannelsTable.tsx`, consistent with the
  brief's "do not add rendering tests."
- **CLAUDE.md §5.** Every exported symbol (`ChannelRowView`, `SourceView`,
  `listSources`, `ChannelsTableProps`, `ChannelsTable`) has a doc comment;
  every numeric field states its unit (Hz, g, dps) or "no unit" where
  applicable (`count`, `event`); no `Err(String)`-equivalent pattern is
  introduced (the one thrown `Error` in `lookupPreview` is an internal
  drift-detection invariant, not a user-facing/IPC error path).
- **Repo hygiene.** Single-line commit message, no AI attribution trailer,
  the reported `git add` in the brief lists explicit paths (no `-A`); NUL-byte
  check re-run and printed `0` for all five files under review.
- **No assertion against a live radio** — `sources.test.ts` only exercises
  `listSources`/`defaultConfig`, no BLE/IPC mocking or real-device
  dependency.

## Verdict rationale

The core CLAUDE.md §2 / R53 Q1 boundary — the one thing this lane's standing
brief treats as an automatic Critical — is clean: no registry arithmetic, no
re-derivation of `previewSources`'s enable/rate logic, no fabricated
`channel_id`/`data_type`, and the two prior-task invariants (push gating,
unknown-field preservation) don't apply to this diff's code paths. The two
Important findings are real but narrow: the breakdown row names for
wheel/HRM are a one-line fix to align with the registry names SPEC §3
already defines, and the missing "no device config loaded" indicator is a
UI-completeness gap the implementer's own code comment already half-diagnosed
but didn't surface to the user. Neither corrupts data, breaks the ownership
boundary, or reaches a push/IPC path without validation, so this doesn't rise
to NEEDS-REWORK, but it's not clean enough to pass without a follow-up commit.

VERDICT: NEEDS_FIXES
