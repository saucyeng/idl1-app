# L7b Task 1 — implementer brief (`DevicePage.tsx` → `Device/`, connection state, scan/connect)

You are the implementer for L7b Task 1 of the idl1 rewrite — the first task
of the Device-tab lane. TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
  branch `wave2-l7b-device`. **You create it** — it does not exist yet:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
  git worktree add -b wave2-l7b-device "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7b-device" main
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7b-device"
  git submodule update --init -- rust
  cd app && npm ci
  ```
  HEAD on `main`, status clean. Verify first; if not, stop and report.
- Work ONLY there. Do NOT touch the shared checkout beyond READING files
  named below, and do NOT touch any other worktree. Do NOT edit `rust/`,
  `app/src-tauri/`, `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`,
  `state/AppState.tsx`, `package.json`, `vite.config.ts`. Do NOT push.
- **No cargo, ever** — a hook denies any cargo invocation whose cwd is under
  `idl1-app-worktrees/wave2-*`. You never need it.
- Read first: `CLAUDE.md`; `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §2, §3,
  §4; `runs/2026-09-05/lanes/l7b-device/BRIEF.md` (this lane's brief — R53
  rulings, ownership, IPC needs); the plan's Global Constraints and Task 1
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7b-device-tab.md`, lines
  53–133) — your starting point, unchanged for this task; C3 §2 (the
  `IpcError` shape) and §3.8 (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`);
  `rust/tauri/src/commands/device.rs`'s module doc comment — read it before
  writing `connection.ts`; it is why this task treats "connected" as a
  point-in-time result, not a live link; the current `app/src/ipc/device.ts`
  (`DeviceDiscovered`, `ConnectionInfo`, `bleScan`, `bleConnect`) and
  `app/src/routes/pages/DevicePage.tsx` (today a one-line placeholder, not
  yet a re-export) — read both before writing anything.

## The task (plan Task 1, Steps 1–4, unchanged)

**Files:**
- Create: `app/src/routes/pages/Device/index.tsx`, `Device/connection.ts`,
  `Device/connection.test.ts`, `Device/errors.ts`, `Device/errors.test.ts`,
  `Device/ipcStubs.ts`
- Modify: `app/src/routes/pages/DevicePage.tsx` (becomes
  `export { default } from "./Device";`)

**Interfaces:**
- `connection.ts`: a pure reducer over `ConnectionState = { phase: "idle" |
  "scanning" | "connecting" | "connected" | "failed", discovered:
  DeviceDiscovered[], connected: ConnectionInfo | null, error: string | null
  }` (import `DeviceDiscovered`/`ConnectionInfo` from `../../../ipc/device`)
  with actions `SCAN_START`, `DEVICE_DISCOVERED` (a C3 §3.8 payload),
  `SCAN_END`, `CONNECT_START`, `CONNECTED`, `DISCONNECTED`, `FAILED`.
- `errors.ts`: `describeIpcError` for the kinds this tab sees — `ble`,
  `wifi`, `config`, `config_parse`, `config_unsupported_version`,
  `not_found`, `io`, `internal` — each with text that says what the user can
  do (a `ble` failure asks them to check the adapter and that the device is
  awake; `config` says the device rejected it).
- `ipcStubs.ts`: `export class NotImplementedError extends Error { command:
  string; constructor(command: string) { ...; this.command = command; } }`
  plus one stub function per need this lane's later tasks will call
  (`deviceStatus`, `deviceControl`, `pullConfig`, `listProfiles`,
  `saveProfile`, `deleteProfile`, `connectDevice`, `disconnectDevice` — all
  returning a `Promise` that rejects `new NotImplementedError("device_status")`
  etc., naming the real C3 §3.8/§3.10 command name each would eventually be).
  This task creates the file and every stub signature; later tasks (4, 8, 9)
  wire callers to them, not redefine them. **A stub is never an `IpcError`
  kind** — C3 §2's vocabulary is additive-only.

- [ ] **Step 1: Write the failing tests**

`connection.test.ts`:
- `connectionReducer — DEVICE_DISCOVERED twice for the same device_id — one entry, the newer rssi kept`
- `connectionReducer — DEVICE_DISCOVERED — list stays sorted by rssi_dbm descending (strongest first)`
- `connectionReducer — SCAN_END with nothing found — phase idle, discovered empty, no error`
- `connectionReducer — CONNECTED — phase connected, the ConnectionInfo's firmware_version retained`
- `connectionReducer — FAILED during connect — phase failed, previously discovered devices retained so the user can retry another`
- `connectionReducer — DEVICE_DISCOVERED after SCAN_END — ignored, no state change`

`errors.test.ts`:
- `describeIpcError — kind ble — text names Bluetooth, not a stack trace`
- `describeIpcError — kind config — text says the device rejected the config, distinct from config_parse's local-validation text`
- `describeIpcError — an unknown kind — generic text, never throws (C3 §5: kinds are additive)`

Arrange/Act/Assert with blank lines between; every test name literally
`thing — condition — result` (an em dash).

- [ ] **Step 2: Implement and move the page.**

  `index.tsx` renders the tab's three regions as stubs for now — a hero
  region (scan/connect), a status line, and an empty config region — with
  `bleScan` and `bleConnect` wired through `app/src/ipc/device.ts`. `bleScan`
  takes a timeout and an `onDiscovered` callback; the reducer receives each
  discovery.

  **Note on connection lifetime** (already in `rust/tauri/src/commands/device.rs`'s
  own module doc): the command connects, acts, and disconnects **inside each
  call** — there is no managed cross-command BLE session. So
  `ConnectionInfo.connected` describes the moment GATT setup finished in
  *that* one call, not a link the tab can assume still exists. Treat
  "connected" as **"last connect attempt succeeded"**, show it as such, and
  never gate a later action on it as if the link were live (R53 Device Q4).

  `app/src/routes/pages/DevicePage.tsx` becomes exactly:
  ```tsx
  /** Kept so the app shell's import path is unchanged while L7b owns
   *  `routes/pages/Device/`. Retiring this shim is a lead shell task. */
  export { default } from "./Device";
  ```
  Do not touch `App.tsx`.

- [ ] **Step 3: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
  ```
  Expected: 9 new tests passed, 0 failed; `tsc` silent.

- [ ] **Step 4: CHANGELOG + commit**

  CHANGELOG bullet naming the Device tab directory move, the connection
  reducer, and the "connected = last attempt succeeded" semantics.

  Spec discipline: **no spec change needed.** Say this out loud in your report.

  ```bash
  git add app/src/routes/pages/Device/index.tsx app/src/routes/pages/Device/connection.ts app/src/routes/pages/Device/connection.test.ts app/src/routes/pages/Device/errors.ts app/src/routes/pages/Device/errors.test.ts app/src/routes/pages/Device/ipcStubs.ts app/src/routes/pages/DevicePage.tsx CHANGELOG.md
  git commit -m "app: Device tab directory + connection state over ble_scan/ble_connect"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not touch `App.tsx` — the shim keeps its import path valid.
- Do not gate any UI affordance on `connected` as if it were a live link
  (R53 Q4) — it is a point-in-time result only.
- Do not give a stub an `IpcError`-shaped rejection — always
  `NotImplementedError`.
- Do not build the config model, validator, or any source form — Tasks 2–7.
- Do not add rendering tests.
- Do not run `cargo` anything.
- Do not assert against a live radio — no real device is available.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line
(`passed` count); confirmation `tsc --noEmit` printed nothing; confirmation
`DevicePage.tsx` is exactly the one-line re-export; confirmation
`ipcStubs.ts` has all eight stub functions named above, each a
`NotImplementedError`, none an `IpcError`; per-step done/deviated; anything
ambiguous you resolved (say how) or that needs a lead ruling (stop and
report instead of guessing — CLAUDE.md §1).
