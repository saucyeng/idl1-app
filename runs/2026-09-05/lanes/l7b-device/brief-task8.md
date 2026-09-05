# L7b Task 8 — implementer brief (profiles, and pushing a config)

You are the implementer for L7b Task 8 — the in-memory profile library (over
the `list_profiles`/`save_profile`/`delete_profile` stubs, IPC need 11) and
the config push flow over the real, landed `push_config`. This task rewrites
part of `docs/IDL0_SPEC.md` §23 (spec-during). TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
  branch `wave2-l7b-device`. **HEAD must be Task 7's commit** ("app: Device
  tab Analog/Digital/HRM forms and the add-channel picker"). Verify with
  `git log -1` and `git status`; if not there, STOP and report.
- Work ONLY there. Editing `docs/IDL0_SPEC.md` §23 in this worktree is this
  lane's spec-during obligation. Never touch `rust/`, `app/src-tauri/`,
  `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`.
- **No cargo, ever. No real device available** — a push will reject without
  hardware; that's expected, the flow must handle it honestly.
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7b-device/BRIEF.md`
  (load-bearing invariants section — a config is never pushed unvalidated);
  `runs/2026-09-05/lanes/l7/IPC-NEEDS.md` need 11 (`ProfileLoadReport`,
  `BikeProfile` — copy field names verbatim: `profile_id`, `profile_name`,
  `created_at_ms`, `updated_at_ms`, `config`); `Device/ipcStubs.ts` (already
  has `listProfiles`/`saveProfile`/`deleteProfile` stubs from Task 1 — this
  task builds the reducer/UI over them, does not redefine the stubs unless
  their signature needs a fix, in which case make it additive and say so);
  `Device/config/validate.ts` (Task 3, `isPushable`); `Device/config/model.ts`
  (`serializeConfig`); `app/src/ipc/device.ts`'s `pushConfig(deviceId,
  configJson)` (real, landed).

## The task (plan Task 8, Steps 1–3, unchanged)

**Files:**
- Create: `Device/profiles.ts`, `Device/profiles.test.ts`, `Device/push.ts`,
  `Device/push.test.ts`, `Device/ProfileBar.tsx`, `Device/PushConfigBar.tsx`
- Modify: `Device/index.tsx`, `Device/ipcStubs.ts`, `docs/IDL0_SPEC.md` §23

**Interfaces:**
- `profiles.ts`: a pure reducer over `{ profiles: ProfileView[], activeId:
  string | null }` — `ProfileView` mirrors `runs/2026-09-05/lanes/l7/IPC-NEEDS.md`'s
  `BikeProfile` field for field. Actions: select, create (seeds
  `defaultConfig` from `Device/config/defaults.ts`), rename, duplicate
  (deep copy — editing the copy must not touch the original), delete.
  **Persistence is a stub** — until the Rust write lane lands
  `list_profiles`/`save_profile`/`delete_profile`, the library is in-memory
  for the session, and the UI says so plainly (not buried in a tooltip).
- `push.ts`: `preparePush(config: DeviceConfig): { ok: true; json: string }
  | { ok: false; issues: ValidationIssue[] }` — **validate, then serialise,
  in that order, never the reverse** (this is the load-bearing invariant:
  `isPushable(validateConfig(config))` gates `serializeConfig(config)`).
  `describePushResult(reconnected: boolean, verified: boolean | null)` —
  four idl0 messages: reconnected+verified → "config applied and verified";
  reconnected+mismatched (verified === false) → a try-again message;
  reconnect failed (reconnected === false) → a "reconnect when it's back"
  message; verify unavailable (verified === null) → the plain "applied,
  not verified" text, which is what wave 2 actually reports since
  `pull_config` (needed to verify) is a stub.

- [ ] **Step 1: Write the failing tests**

  `profiles.test.ts`:
  - `profilesReducer — CREATE — the new profile becomes active and carries defaultConfig`
  - `profilesReducer — DUPLICATE — a new id, a distinct name, and a deep copy of the config (editing the copy must not touch the original)`
  - `profilesReducer — RENAME to an existing name — allowed, names are not unique; ids are`
  - `profilesReducer — DELETE the active profile — activeId moves to another profile, or null when none remain`
  - `profilesReducer — DELETE a profile that is not active — activeId unchanged`

  `push.test.ts`:
  - `preparePush — a valid config — ok, and the JSON parses back to the same config`
  - `preparePush — a config with one error-severity issue — not ok, no JSON produced, the issues returned`
  - `preparePush — a config with only warnings — ok: warnings never block a push`
  - `preparePush — a config carrying unknown keys — they survive into the pushed JSON verbatim`
  - `describePushResult — reconnected and verified — "config applied and verified"; reconnected and mismatched — the try-again text; reconnect failed — the "reconnect when it's back" text; verify unavailable — the plain applied text`

- [ ] **Step 2: Implement**

  The push bar mirrors idl0: **Push config** (enabled only when a device
  connected in this session — `ConnectionState.connected !== null` from
  Task 1's `connection.ts`, per R53 Q4's "last attempt succeeded" reading —
  a profile is active, and `isPushable` holds) and **Pull from device** (a
  stub, calling `Device/ipcStubs.ts`'s `pullConfig`). A push shows the
  SPEC §7.2 consequence up front: the device reboots to apply. Since
  `pull_config` is a stub, `describePushResult` always reports the
  "applied, not verified" arm on a successful push — the honest one.

  **Idle-mode gating:** SPEC §10.4/§23 require idle mode for a push; the
  app cannot read the device's mode (`device_status`, IPC need 8, is a
  stub). The push bar **states** the requirement in copy rather than
  enforcing it; a device that refuses surfaces as `kind: "config"` or
  `kind: "ble"` through `Device/errors.ts`'s `describeIpcError`.

- [ ] **Step 3: `docs/IDL0_SPEC.md` §23** — the config card, profiles, push,
  and what verification currently does and does not prove.

- [ ] **Step 4: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
  ```
  Expected: 10 new tests passed, 0 failed.

- [ ] **Step 5: NUL-byte check**

  ```
  grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]' app/src/routes/pages/Device/profiles.ts app/src/routes/pages/Device/profiles.test.ts app/src/routes/pages/Device/push.ts app/src/routes/pages/Device/push.test.ts app/src/routes/pages/Device/ProfileBar.tsx app/src/routes/pages/Device/PushConfigBar.tsx app/src/routes/pages/Device/index.tsx docs/IDL0_SPEC.md
  ```
  Every count must print `0`.

- [ ] **Step 6: CHANGELOG + commit**

  ```bash
  git add app/src/routes/pages/Device/profiles.ts app/src/routes/pages/Device/profiles.test.ts app/src/routes/pages/Device/push.ts app/src/routes/pages/Device/push.test.ts app/src/routes/pages/Device/ProfileBar.tsx app/src/routes/pages/Device/PushConfigBar.tsx app/src/routes/pages/Device/index.tsx docs/IDL0_SPEC.md CHANGELOG.md
  git commit -m "app: Device tab profiles (in-memory) and config push over push_config"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not call `pushConfig` without first checking `isPushable`.
- Do not claim a push is "verified" — `pull_config` is a stub, so every
  successful push is "applied, not verified."
- Do not persist profiles anywhere durable (no `localStorage` workaround) —
  the plan is explicit that this is in-memory for the session; a hidden
  persistence layer would surprise whoever builds the real command later.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Spec discipline (say it out loud in your report)

**Spec-during** — `docs/IDL0_SPEC.md` §23 gains the config card/profiles/push
sections per Step 3.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line;
per-step done/deviated; confirmation `preparePush` validates before
serialising, never the reverse; confirmation every reported push result in
wave 2 is the "applied, not verified" arm; confirmation profiles are not
persisted anywhere durable; confirmation the NUL-byte check printed `0` for
every file; anything ambiguous you resolved (say how) or that needs a lead
ruling.
