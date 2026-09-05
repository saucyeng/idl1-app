# L7b — Device tab — lane brief

**Plan:** `docs/superpowers/plans/2026-09-05-idl1-wave2-l7b-device-tab.md` (9 tasks).
**Adjudicated:** `runs/2026-09-03/decisions.md` R53, "Device (L7b)" section (5 questions).
**Operating brief:** `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` — §2 ownership, §3 contract
freeze, §4 gates bind this lane exactly as written there.

## Scope

Port idl0's Device tab — connection, live status, the config card with its
channels table, all six source-configuration views (IMU ×3 as one form kind,
GPS, Wheel, Analog, Digital, HRM) plus the "+ Add channel…" picker, bike
profiles, config push, and device file download — onto C3 §3.8's five landed
commands. The centre of the lane is one typed `DeviceConfig` model: a
TypeScript mirror of `docs/IDL0_SPEC.md` §8's `idl0_config.json`, with its
validators, that serialises to exactly the JSON string `push_config` accepts.
One lane, one directory: `app/src/routes/pages/Device/`.

## Branch and worktree

Created by **Task 1's implementer**, before Task 1's first step:

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
git worktree add -b wave2-l7b-device "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7b-device" main
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7b-device"
git submodule update --init -- rust
cd app && npm ci
```

`npm ci` runs once, here, before Task 1 — never inside a task. Working
directory for every task in this lane: the worktree above.

## Ownership (operating brief §2, binding)

This lane touches only:
- `app/src/routes/pages/Device/**` (new directory; `DevicePage.tsx` becomes a
  one-line re-export shim, per Task 1).
- Additive type fixes only, where the file disagrees with C3 as written, in
  `app/src/ipc/device.ts`. **Never a new command.**
- Its own `*.test.ts` files beside its modules.

**Never:** `rust/`, `app/src-tauri/`, `App.tsx`, `App.css`, `main.tsx`,
`routes/types.ts`, `state/AppState.tsx`, `package.json`/lockfile,
`vite.config.ts`. This lane needs no shared-state slice at all — it does not
touch `AppState.tsx` in any task 1–3 (the profile/config work is entirely
lane-local).

**No real device is available to any task.** Every command this lane calls
will reject without hardware — expected. The pure config/validator/registry
modules carry the testable behaviour; a task never asserts against a live
radio.

## IPC needs this lane stubs

Per `runs/2026-09-05/lanes/l7/IPC-NEEDS.md` needs 8–13 (all filed as "L7b"):
`device_status` (need 8), `device_control` (need 9), `pull_config` (need 10),
`list_profiles`/`save_profile`/`delete_profile` (need 11),
`preview_channel_registry` (need 12, **conditional — see Task 4 below**),
`connect_device`/`disconnect_device` (need 13). All stubbed in
`Device/ipcStubs.ts` (created by Task 1), throwing a local
`NotImplementedError extends Error { command: string }`. **Never** an
`IpcError` — C3 §2's kind vocabulary is additive-only.

`ble_scan`, `ble_connect`, `list_device_files`, `download_file`,
`push_config` (C3 §3.8) are real, landed commands — this lane calls the
typed wrappers in `app/src/ipc/device.ts` directly, never a stub.

## Gates (operating brief §4, never skipped)

Per task, from the worktree:
```
cd app && npx tsc --noEmit && npx vitest run <the filter the task names>
```
`vitest` must report a non-zero `passed` count. `tsc` must print nothing.

Lane merge gate (after Task 9): `npx tsc --noEmit && npx vitest run` over the
whole TS suite, then the lead merges to `main` and eyeballs the tab.

## R53 rulings that apply to this lane

- **Q1 → (c) now, (b) later — not (a).** This is the one ruling that changes
  what the plan's own Task 4 builds. The channel-registry preview's `scale =
  range / 32768` is the wire contract's own formula (SPEC §3), which
  `core::parse` already owns in Rust; a second copy in TypeScript is exactly
  the drift the standing reviewer brief calls a finding. **Wave 2 shows
  enable state, rate, and unit only — no `scale`, no predicted `channel_id`,
  no data-type column.** `preview_channel_registry(config_json) ->
  RegistryRow[]` (IPC need 12) joins the Rust write-amendment lane; Task 4 is
  **narrowed** to that smaller scope when it is dispatched (not part of this
  Task 1–3 brief set — flagged here so a later Task 4 dispatch doesn't build
  the plan's original wider preview).
- **Q2 → (a).** `analog.sample_rate_hz` accepts any positive integer; the
  SPEC §8 gap ("Not yet defined") is restated in the app-side note Task 2
  writes, never filled with a guessed valid range.
- **Q3 → (a) for wave 2.** No handoff between a completed device-file
  download and the Data tab's import; "downloaded, import it from the Data
  tab" is the wave-2 UI. A shared "blobs awaiting import" slice is a wave-3
  shell task, not this lane's problem now.
- **Q4 → (a) now.** `ConnectionInfo.connected` is treated as "the last
  connect attempt succeeded," never as a live link the tab gates a later
  action on — `rust/tauri/src/commands/device.rs` connects and disconnects
  inside every command, so nothing is actually connected between calls. A
  managed connection (needs 8/9/13) is one piece of Rust-track work, filed,
  not built here.
- **Q5 → not a gap.** Six source-config forms (IMU, GPS, Wheel, Analog,
  Digital, HRM) plus the "+ Add channel…" picker is the correct count. The
  operating brief's "seven" miscounted idl0's `factories.dart`, which is not
  a view. Nothing to build differently because of this — it only means
  nobody should read "six forms" in a later report as a shortfall.

## Load-bearing invariants (plan's own text, restated because they govern every task)

- **A config is never pushed unvalidated.** `pushConfig` is called only
  after `validateConfig` returns zero **error**-severity issues (warnings
  never block a push). `push_config`'s Rust side checks JSON syntax only —
  the app's validator is the only thing standing between a typo and
  undefined hardware behaviour (SPEC §8: an off-list `imu.sample_rate_hz`
  "produces undefined chip behavior").
- **Unknown config keys are preserved verbatim** through parse → edit →
  serialise. Dropping a key the app doesn't understand would silently
  reconfigure a device. `device_id` and `config_version` are read-only —
  the app preserves them on push, never lets the user edit them.

## Parity gaps carried from the plan

The plan's own "Parity gaps" table
(`docs/superpowers/plans/2026-09-05-idl1-wave2-l7b-device-tab.md`, the
section after Task 9) is unchanged by this brief set. Each per-task brief
restates the gaps relevant to that task.

## Done when

All 9 tasks landed on `wave2-l7b-device`, each gated and reviewed (Task 4
dispatched at its narrowed R53 Q1 scope); the lane merge gate passes;
`TASKS.md`'s L7b line is ticked by Task 9 and names what's outstanding (the
IPC needs, the parity gaps). The lead then merges to `main`, eyeballs the
tab, and runs the shell task that retires the three `<Tab>Page.tsx` shims.
