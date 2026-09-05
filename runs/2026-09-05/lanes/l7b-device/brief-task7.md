# L7b Task 7 — implementer brief (source forms B: Analog, Digital, HRM, "+ Add channel…")

You are the implementer for L7b Task 7 — the Analog, Digital and HRM forms,
the "+ Add channel…" picker, and the analog/digital edit operations Task 6
may have only declared. This task rewrites part of `docs/IDL0_SPEC.md` §23
(spec-during). TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
  branch `wave2-l7b-device`. **HEAD must be Task 6's commit** ("app: Device
  tab IMU/GPS/Wheel forms over pure config edit ops"). Verify with `git log
  -1` and `git status`; if not there, STOP and report. **Read Task 6's
  report (or `Device/config/edit.ts` directly) first** to see whether
  `upsertAnalogChannel`/`removeAnalogChannel`/`upsertDigitalChannel`/
  `removeDigitalChannel` already have bodies or only signatures — implement
  whichever is missing, do not duplicate what Task 6 already built.
- Work ONLY there. Editing `docs/IDL0_SPEC.md` §23 in this worktree is this
  lane's spec-during obligation. Never touch `rust/`, `app/src-tauri/`,
  `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`.
- **No cargo, ever. No real device available** — the HRM form's "Search
  nearby" calls the real, landed `bleScan` (C3 §3.8), which will find
  nothing without hardware; that is expected, not a bug to work around.
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7b-device/BRIEF.md`; the
  plan's Task 7 (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7b-device-tab.md`,
  lines 488–530); `runs/2026-09-05/lanes/l7/IPC-NEEDS.md`'s "What is
  deliberately not here" note on `ble_scan`'s `DeviceDiscovered` shape
  having no service-UUID filter (Parity gap: HRM scan lists everything, the
  user picks); `Device/config/model.ts`'s `AnalogChannel`, `DigitalChannel`,
  `HrmBlock`; `Device/config/edit.ts` (Task 6).

## The task (plan Task 7, Steps 1–4, unchanged)

**Files:**
- Create: `Device/forms/AnalogForm.tsx`, `Device/forms/DigitalForm.tsx`,
  `Device/forms/HrmForm.tsx`, `Device/forms/AddChannelPicker.tsx`,
  `Device/config/newChannel.ts`, `Device/config/newChannel.test.ts`
- Modify: `Device/ChannelsTable.tsx`, `Device/config/edit.ts` (only if Task 6
  left the analog/digital functions as signatures), `docs/IDL0_SPEC.md` §23

**Interfaces:**
- `newChannel.ts`: `newAnalogChannel(config: DeviceConfig): AnalogChannel`
  and `newDigitalMarker(config: DeviceConfig): DigitalChannel` — generate a
  **unique** `key` against the config's existing entries (never idl0's
  literal `"__new__"`, which collides on a second add), seed SPEC §8's
  example-shape defaults (`enabled: true, scale: 1, offset: 0` for analog;
  `kind: "marker", active_low: true, debounce_ms: 20` for digital), and pick
  a free pin where one is derivable (say in your report what "derivable"
  meant in practice — SPEC §8 does not fix a pin-numbering scheme, so if you
  had to invent one, flag it as a question rather than asserting it's
  correct). Plus `addChannelOptions(config): { key: string; label: string;
  disabledReason: string | null }[]` — Wheel front, Wheel rear (toggle a
  flag rather than adding an entry — call `setWheelSlot(config, side, {
  enabled: true })` from Task 6's `edit.ts` when chosen), Analog channel,
  Marker button — each carrying a `disabledReason` when unavailable (both
  wheel slots already enabled, say).

- [ ] **Step 1: Write the failing tests**

  - `newAnalogChannel — an empty config — key "analog_1"`
  - `newAnalogChannel — a config already holding analog_1 — key "analog_2", never a duplicate`
  - `newAnalogChannel — defaults — enabled true, scale 1, offset 0, matching SPEC §8's example entry shape`
  - `newDigitalMarker — defaults — kind "marker", active_low true, debounce_ms 20 (SPEC §8's example)`
  - `addChannelOptions — both wheel slots already enabled — both wheel entries carry a disabledReason`
  - `addChannelOptions — always — level and pwm digital kinds absent from the options (SPEC §8: reserved, not exposed)`

- [ ] **Step 2: Implement the three forms and the picker**

  Analog and Digital forms edit one entry (through `edit.ts`'s
  `upsertAnalogChannel`/`upsertDigitalChannel`) and offer Delete
  (`removeAnalogChannel`/`removeDigitalChannel`). The HRM form carries
  idl0's whole flow: enable toggle, a **Search nearby** action that runs
  `bleScan` (C3 §3.8, real command, from `app/src/ipc/device.ts`) and lets
  the user pick a strap from whatever it finds (prefilling `device_address`
  and `device_name` and auto-enabling — filtering to heart-rate straps by
  service UUID is **not possible** through C3's `DeviceDiscovered` shape,
  see Parity gaps; list everything, the user picks), manual uppercase
  address entry validated against `Device/config/validate.ts`'s
  `BLE_ADDRESS_RE`, an informational device-name field, the "logs HR_BPM
  (22) and HR_RR (23) when enabled" note, and **Forget**, which calls
  `clearHrm` (Task 6).

- [ ] **Step 3: `docs/IDL0_SPEC.md` §23** — the Analog/Digital/HRM views and the picker.

- [ ] **Step 4: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
  ```
  Expected: 6 new tests passed, 0 failed.

- [ ] **Step 5: NUL-byte check**

  ```
  grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]' app/src/routes/pages/Device/forms/AnalogForm.tsx app/src/routes/pages/Device/forms/DigitalForm.tsx app/src/routes/pages/Device/forms/HrmForm.tsx app/src/routes/pages/Device/forms/AddChannelPicker.tsx app/src/routes/pages/Device/config/newChannel.ts app/src/routes/pages/Device/config/newChannel.test.ts app/src/routes/pages/Device/ChannelsTable.tsx docs/IDL0_SPEC.md
  ```
  Every count must print `0`.

- [ ] **Step 6: CHANGELOG + commit**

  ```bash
  git add app/src/routes/pages/Device/forms/AnalogForm.tsx app/src/routes/pages/Device/forms/DigitalForm.tsx app/src/routes/pages/Device/forms/HrmForm.tsx app/src/routes/pages/Device/forms/AddChannelPicker.tsx app/src/routes/pages/Device/config/newChannel.ts app/src/routes/pages/Device/config/newChannel.test.ts app/src/routes/pages/Device/ChannelsTable.tsx app/src/routes/pages/Device/config/edit.ts docs/IDL0_SPEC.md CHANGELOG.md
  git commit -m "app: Device tab Analog/Digital/HRM forms and the add-channel picker"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not offer `level` or `pwm` in the digital-kind picker.
- Do not attempt to filter `bleScan` results to heart-rate straps — C3's
  shape does not support it; list everything.
- Do not use idl0's `"__new__"` literal key.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Spec discipline (say it out loud in your report)

**Spec-during** — `docs/IDL0_SPEC.md` §23 gains the Analog/Digital/HRM view
sections per Step 3.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line;
per-step done/deviated; what pin-selection scheme `newAnalogChannel` used
and whether it's a genuine SPEC §8 rule or an invented one needing a lead
ruling; confirmation the digital-kind picker excludes level/pwm;
confirmation the NUL-byte check printed `0` for every file; anything else
ambiguous you resolved (say how) or that needs a lead ruling.


## Lead ruling 2026-09-05 (R55) — no "free pin" algorithm

SPEC §8 fixes no pin numbering scheme, so the UI must not invent one.
`newAnalogChannel`/`newDigitalChannel` create the channel with **no pin
assigned** (`pin: null` or the model's equivalent, which the Task 3
validator already reports as an error until set); the form offers the pins
the config's declared pin range allows, unassigned pins listed first, and the
user chooses. Never auto-select. Flag any place the model cannot represent
"unassigned" as a question rather than picking a default pin.
