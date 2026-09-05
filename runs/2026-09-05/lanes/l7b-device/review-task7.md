# L7b Task 7 review — Analog/Digital/HRM forms, add-channel picker, R58 pin model

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
branch `wave2-l7b-device`. Commits under review: `4ec4b32` ("app: Device tab,
IMU mode/range controls now commit through edit.ts" — Task 6 review-fix,
R58 model/validator groundwork by the time Task 7 built on it) and `636da29`
("app: Device tab Analog/Digital/HRM forms and the add-channel picker" —
Task 7 proper). In scope: `app/src/routes/pages/Device/**` touched by these
two commits, `docs/IDL0_SPEC.md` §23.3.4–§23.3.6/§23.4, `CHANGELOG.md`. Out
of scope: uncommitted working-tree files `app/src/routes/pages/Device/push.ts`,
`push.test.ts`, `profiles.ts`, `profiles.test.ts` (a Task 8 implementer's
in-progress work, confirmed via `git status --short` as untracked, not part
of either reviewed commit).

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Device
```
`tsc --noEmit` printed nothing (clean). Vitest: `Test Files 1 failed | 9 passed
(10)`, `Tests 1 failed | 104 passed (105)` — the one failure is
`push.test.ts`'s `preparePush — a config with only warnings — ok: warnings
never block a push`, in the out-of-scope Task 8 file above, not in either
commit under review.

Since the standing brief's directory filter unavoidably picks up Task 8's
untracked files sitting in the same worktree, I additionally ran (once, as a
scope-disambiguation check, not a rerun of the same command) `npx vitest run
--coverage src/routes/pages/Device --exclude "**/push.test.ts" --exclude
"**/profiles.test.ts"`, which gives `Test Files 8 passed (8)`, `Tests 92
passed (92)` — matching the implementer's reported 92 passed exactly. The
gate's own requirement (non-zero `passed`, `tsc` clean) is satisfied either
way; the one failure does not belong to this task's diff.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `app/src/routes/pages/Device/forms/AnalogForm.tsx:47-50` (`parsePinInput`), same in `DigitalForm.tsx:39-42` | Both SPEC §23.3.4/§23.3.5 and the CHANGELOG state the pin control is "a plain non-negative-integer input"; `parsePinInput` only checks `Number.isInteger`, not non-negativity, so typing e.g. `-5` writes `adc_pin: -5`/`gpio_pin: -5` into the config. `validateConfig` has no negativity check either (only `=== null` and collision checks), so a negative pin is treated as "assigned" and does not block `isPushable`. The `<input min={0}>` HTML attribute is a soft hint only — it does not stop the value in state from going negative when the change handler fires on every keystroke. This contradicts the explicit contract text (R58's own ruling: "The picker is a non-negative-integer input") and is untested in either direction. | Reject/clamp a negative parse result to `null` in `parsePinInput` (same treatment as `NaN`), or add a `pin < 0` check to `checkAnalogChannels`/`checkDigitalChannels`, with a test for each. |
| Minor (carried, not new) | `app/src/routes/pages/Device/ChannelsTable.tsx:86-88` | Task 6's review flagged the wrapped `<table>` block as not re-indented one level under the new `<>...</>` fragment (accepted at the time as "fix on next touch"). This commit touches the same file again (adding `AddChannelPicker`, `openFormForSourceKey`) but still leaves `<table className="device-channels-table">` at the same indent as its own children. Still cosmetic, still not a CLAUDE.md §7 reformatting violation (the block's lines were genuinely touched by this diff too), but it has now survived two commits that touched the file. | Re-indent on the next touch, as already agreed. |

No Critical findings.

**On R58 compliance (the section I checked hardest):** `adc_pin`/`gpio_pin`
are `number | null` exactly as ruled; a missing key parses to `null` with no
`Repair` (tested: `model.test.ts` "an analog channel with no adc_pin key");
a non-integer present value is a `Repair` and treated as unassigned, never a
guessed number (tested: "adc_pin is a non-integer"); serialise omits the key
entirely when `null` (tested both directions: omitted when `null`, written
through when set); the validator's "pin unassigned" error string matches the
ruling's own wording byte-for-byte and makes `isPushable` false (tested);
the collision check filters `null` claims out before pairing, so two
unassigned channels never collide with each other or with a real pin
(tested explicitly). All of this is exactly what R58 specifies — the one
gap found is the separate "non-negative" half of the same ruling's second
paragraph, above.

## Checks performed (all pass)

- No `32768`, `scale = range / 32768`, predicted `channel_id`, or data-type
  derivation anywhere in this lane's diff — `ChannelsTable.tsx`'s expanded
  row still shows only the config-typed `scale`/`offset` for analog entries
  and `—` elsewhere (R53 Device Q1 untouched).
- Pin inputs (`AnalogForm.tsx`, `DigitalForm.tsx`) are plain `<input
  type="number">` fields, never a `<select>`, starting empty
  (`value={channel.adc_pin ?? ""}`) with no auto-selected value and no
  invented pin range — matches R55/R58 exactly, and both SPEC sections
  carry the "unconstrained until SPEC §8 states the sets" sentence the
  dispatch asked me to check for.
- The four edit operations (`upsertAnalogChannel`, `removeAnalogChannel`,
  `upsertDigitalChannel`, `removeDigitalChannel`) are pure — each returns a
  new object via spread, verified by reading every line, and each is
  covered both by its own dedicated test and by the shared
  "every edit function — immutability" test (`edit.test.ts`), which now
  calls all four once each against a deep-cloned config and asserts the
  clone is untouched.
- `upsert*` is keyed on the channel's own `key`
  (`findIndex((c) => c.key === channel.key)`); `newAnalogChannel`/
  `newDigitalMarker`'s `uniqueKey` helper loops `analog_1`, `analog_2`, …
  against the *current* `config`'s existing keys (not a stored counter), so
  it correctly skips a key already present regardless of where the gap is
  (tested: "a config already holding analog_1 — key analog_2"). Because
  `AddChannelPicker.onChoose` calls `onConfigChange(upsertAnalogChannel(config,
  newAnalogChannel(config)))` synchronously and closes immediately (no
  held-open draft state), a second "Analog channel" click always sees the
  first one already in `config.analog.channels`, so two channels cannot be
  generated with the same key — traced through `AddChannelPicker.tsx`,
  `ChannelsTable.tsx`'s `OpenForm`, and confirmed no intermediate
  uncommitted-draft state exists anywhere in this flow. `analog_N` and
  `marker_N` are separate prefix namespaces (analog vs. digital arrays), so
  no cross-kind collision is possible either.
- `DigitalForm.tsx` shows `kind` as read-only `<strong>{channel.kind}</strong>`
  text, never a picker, so a `"level"`/`"pwm"` entry already in a loaded
  config is preserved and displayed but never editable to that kind; `+ Add
  channel…`'s `addChannelOptions` offers only `"analog"` and `"marker"`
  (tested: "level and pwm digital kinds absent from the options").
- `HrmForm.tsx`'s `onSearchNearby` is a plain button `onClick` handler, not
  inside a `useEffect` — traced the whole component and confirmed `bleScan`
  is called nowhere else (no scan on mount, no effect with an IPC call at
  all in this file), so the "IPC-driving effects" rule doesn't apply here
  since there is no effect in the first place.
- Manual and discovered BLE addresses are both validated against
  `BLE_ADDRESS_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/` (6 uppercase hex bytes,
  colon-separated) before the form treats them as valid, shown inline as a
  plain-text warning below the address field plus the same check feeding
  `validateConfig`'s own issue list.
- The "logs HR_BPM (22) and HR_RR (23) while enabled" note matches SPEC §3's
  registry table (`docs/IDL0_SPEC.md:288-289`) and §5.2's channel-add rule
  (`docs/IDL0_SPEC.md:727`) exactly — channel numbers, names and the
  enabled-only condition all agree.
- `AddChannelPicker.tsx` commits only through `setWheelSlot`,
  `upsertAnalogChannel`, `upsertDigitalChannel` (all `edit.ts`/`newChannel.ts`
  functions) — no direct object-literal config mutation anywhere in the
  component.
- `ImuForm.tsx`'s four previously-inline controls (`low_power_mode`,
  `high_performance_mode`, top-level `accel_range_g`/`gyro_range_dps`) now
  route through `setImuModeFlags`/`setImuRanges` (added in `4ec4b32`), each
  with its own immutability-relevant test asserting sibling fields/slots are
  untouched; `docs/IDL0_SPEC.md:2138-2140`'s "every field commits… through
  edit.ts" sentence now lists all five setters and is true — confirmed by
  reading every `onChange` handler in the file, none left inline.
- SPEC §23.3.4–§23.3.6/§23.4 accurately describe the shipped forms: field
  lists, which `edit.ts` functions each control commits through, the
  HRM Parity-gap note, and (in both §23.3.4 and §23.3.5) the "pin input is
  unconstrained until SPEC §8 states the device's valid value set" sentence
  the dispatch specifically asked me to check for — present in both
  sections, worded consistently.
- `unknown`, `device_id`, `config_version` are untouched by every new code
  path here — `upsertAnalogChannel`/`upsertDigitalChannel`/remove* all
  spread `...config` first and only replace the `analog`/`digital`
  sub-object; `serializeAnalogChannel`/`serializeDigitalChannel` only change
  how one channel's own fields serialise, not the top-level object, and
  `serializeConfig`'s existing `unknown`-forwarding code (unchanged in this
  diff) still runs.
- Two judgment calls, both reasonable and disclosed: the `marker_N` prefix
  for digital markers (distinct from `analog_N`, avoids ambiguity, matches
  the brief's own wording) and Delete-closes/Forget-stays-open (Delete
  removes the entry the form is currently editing, so keeping it open would
  show a form for a channel key that no longer exists; Forget only clears
  `heart_rate_monitor`'s fields, the HRM row itself never disappears, so
  staying open to immediately re-enable or re-search is sensible).
- Doc comments present on every exported symbol in `newChannel.ts`, the four
  new `edit.ts` functions, and all four new form components' props
  interfaces; units stated where numeric (ms, Hz, g, dps in the
  pre-existing forms this task didn't change; the new pin fields are
  explicitly documented as plain pin numbers with no unit, correctly, since
  a pin number isn't a physical quantity).
- All new tests are named `thing — condition — result` with an em dash and
  follow Arrange/Act/Assert with blank lines between (`newChannel.test.ts`,
  the `model.test.ts`/`validate.test.ts`/`edit.test.ts` additions).
- No new npm dependency (no `package.json`/lockfile change in either
  commit).
- Ownership boundary: `git show --stat` for both commits shows every path
  under `app/src/routes/pages/Device/**`, `CHANGELOG.md`, or
  `docs/IDL0_SPEC.md`; nothing under `rust/`, `app/src-tauri/`, `App.tsx`,
  `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`. No new/changed export in
  `app/src/ipc/device.ts` (not touched at all by either commit; `HrmForm`
  imports the already-landed `bleScan`).
- NUL-byte check: `grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]'` printed `0` for
  every file the brief named.
- Both commit messages are single-line, no AI attribution trailer; no
  `cargo` invocation anywhere in the implementer's reported steps or in
  this review.
- No test requires a real BLE radio — `HrmForm` itself is untested (no
  rendering tests, as required), and no other new test calls `bleScan`.

## Verdict rationale

R58's core representability requirement — the part CLAUDE.md §1 actually
stopped the previous task for — is implemented exactly as ruled and
genuinely tested at every layer (parse, serialise, validate, collision
check), and the forms, picker, key-generation and SPEC prose all match the
brief and the two governing rulings (R55, R58) with no scope creep into
R53 Q1's narrowed territory and no lost `unknown`/read-only fields. The one
real gap is that the ruling's own second sentence — "a non-negative-integer
input" — is asserted in both the SPEC text and the CHANGELOG but not
actually enforced anywhere in the code: a user can type a negative pin and
have it treated as validly assigned. That's a genuine, narrow defect with a
concrete (if low-stakes, since push still requires zero other errors and a
real device would reject it anyway) consequence, not a guessed interface or
a silent scope change, so this lands as NEEDS_FIXES rather than
NEEDS-REWORK.

VERDICT: NEEDS_FIXES
