# L7b Task 5 — implementer brief (the channels table)

You are the implementer for L7b Task 5 — the tab's channels table, one row
per configurable source with an expandable per-channel breakdown. This task
rewrites `docs/IDL0_SPEC.md` §23's channels-table section (spec-during).
TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
  branch `wave2-l7b-device`. **HEAD must be this lane's Task 4 commit**
  ("app: Device tab channel-enable preview (R53 Q1 narrowed scope, no
  scale/channel_id)"). Verify with `git log -1` and `git status`; if not
  there, STOP and report. Task 4 is expected to export `previewSources`
  and `SourcePreviewRow` from `Device/config/sourcesPreview.ts` — read that
  file; this task builds on top of it rather than re-deriving enable/rate
  logic.
- Work ONLY there. Editing `docs/IDL0_SPEC.md` §23 in this worktree is this
  lane's spec-during obligation. Never touch `rust/`, `app/src-tauri/`,
  `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`.
- **No cargo, ever. No real device available.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7b-device/BRIEF.md`; the
  plan's Task 5 (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7b-device-tab.md`,
  lines 405–443) — note it says the table shows "the predicted `channel_id`
  and data type" once Task 4 lands; **that no longer applies** — Task 4 was
  narrowed by R53 Q1 and does not produce either, so the table shows only
  what `Device/config/model.ts` and `Device/config/sourcesPreview.ts`
  actually carry: enable, rate, units, and (for analog/digital) each
  entry's own `scale`/`offset`/`label` fields, which are config values the
  user typed, not registry-derived numbers, so displaying them is not a
  CLAUDE.md §2 violation; `Device/config/model.ts`'s `DeviceConfig`,
  `ImuSlot.channels` (the six boolean axis flags), `AnalogChannel`,
  `DigitalChannel`.

## The task (plan Task 5, adapted for the narrowed Task 4)

**Files:**
- Create: `Device/sources.ts`, `Device/sources.test.ts`, `Device/ChannelsTable.tsx`
- Modify: `Device/index.tsx`, `docs/IDL0_SPEC.md` §23

**Interfaces:**
- `sources.ts`: `listSources(config: DeviceConfig): SourceView[]` — the
  tab's source list, one entry per configurable source (`imu0`, `imu1`,
  `imu2`, `gps`, `wheel_front`, `wheel_rear`, one per `analog.channels[]`
  entry, one per `digital.channels[]` entry, `hrm`), each
  `{ sourceKey: string; label: string; enabled: boolean; sampleRateHz:
  number | null; channels: ChannelRowView[] }`. Build `enabled`/
  `sampleRateHz` by calling **Task 4's `previewSources(config)`** and
  matching rows by `sourceKey` — do not re-derive the enable/rate logic a
  second time. `ChannelRowView` is `{ name: string; units: string; enabled:
  boolean; scale?: number; offset?: number }` — for an IMU source, six rows
  (`accel_x`..`gyro_z`) each carrying its own `ImuSlot.channels[axis]`
  enable flag and no `scale`/`offset` (R53 Q1: not derived here); for an
  analog source, one row carrying the entry's own `scale`/`offset` from
  `AnalogChannel` (a config value, not a registry derivation — fine to
  show); for GPS/wheel/digital/HRM, one row each with no `scale`/`offset`.
  Labels are idl0's: "IMU0 (sprung)", "IMU1 (front fork)", "IMU2 (rear)",
  "GPS", "Wheel Front", "Wheel Rear", "Heart Rate Monitor — <device_name>"
  when a name is saved, else the bare label.

- [ ] **Step 1: Write the failing tests**

  - `listSources — SPEC §8's worked example — the six fixed sources in a stable order, hardware-pinned ones first`
  - `listSources — two analog entries — one source each, keyed analog/<key>, after the fixed sources`
  - `listSources — an HRM with a device_name — label carries the name; without one — the bare label`
  - `listSources — GPS — sampleRateHz from the config; wheel and marker sources — null (event-driven), matching previewSources`
  - `listSources — a disabled source — present in the list, marked disabled (idl0 shows IMU/GPS/HRM even when off)`
  - `listSources — an IMU — six axis rows regardless of which are enabled, each carrying its own enable state, none carrying scale/offset`
  - `listSources — an analog entry — its channel row carries the entry's own scale/offset from the config, unchanged from what was typed`

- [ ] **Step 2: Implement the table**

  One row per source with its enable state, rate and channel count;
  expanding a source lists its channels with name, units, enable state, and
  scale/offset **only where the config itself carries them** (analog/
  digital entries) — never a registry-derived value. A gear control per
  source opens that source's form (Tasks 6–7, next).

- [ ] **Step 3: Rewrite `docs/IDL0_SPEC.md` §23's channels-table section**

  Describe the table's columns exactly as built (no channel_id/data_type
  column in wave 2, and why — point at R53 Device Q1 and IPC need 12, one
  sentence, do not re-litigate the ruling in the spec text).

- [ ] **Step 4: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
  ```
  Expected: 7 new tests passed (6 from the plan's original list plus the
  analog-scale test added above), 0 failed.

- [ ] **Step 5: NUL-byte check**

  ```
  grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]' app/src/routes/pages/Device/sources.ts app/src/routes/pages/Device/sources.test.ts app/src/routes/pages/Device/ChannelsTable.tsx app/src/routes/pages/Device/index.tsx docs/IDL0_SPEC.md
  ```
  Every count must print `0`.

- [ ] **Step 6: CHANGELOG + commit**

  ```bash
  git add app/src/routes/pages/Device/sources.ts app/src/routes/pages/Device/sources.test.ts app/src/routes/pages/Device/ChannelsTable.tsx app/src/routes/pages/Device/index.tsx docs/IDL0_SPEC.md CHANGELOG.md
  git commit -m "app: Device tab channels table over the config model and Task 4's source preview"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not re-derive enable/rate logic that Task 4's `previewSources` already
  computes — call it.
- Do not show a `channel_id` or `data_type` column.
- Do not compute an IMU axis's scale from its range — only an
  analog/digital entry's own config-typed scale/offset may appear.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Spec discipline (say it out loud in your report)

**Spec-during** — `docs/IDL0_SPEC.md` §23's channels-table section rewritten
per Step 3.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line;
per-step done/deviated; confirmation `listSources` calls `previewSources`
rather than re-deriving enable/rate; confirmation no `channel_id`/
`data_type`/IMU-scale appears anywhere; confirmation the NUL-byte check
printed `0` for every file; anything ambiguous you resolved (say how) or
that needs a lead ruling.
