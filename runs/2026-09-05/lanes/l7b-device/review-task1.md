# L7b Task 1 review — Device tab directory, connection reducer, scan/connect

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
branch `wave2-l7b-device`, commit `6e0c8efe4e6a2e43deeb74ef266ac83d462c6209`
(parent `b6426c1`). In scope: `app/src/routes/pages/Device/{index.tsx,
connection.ts, connection.test.ts, errors.ts, errors.test.ts, ipcStubs.ts}`,
`app/src/routes/pages/DevicePage.tsx`, `CHANGELOG.md`. Nothing else touched.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
```
Output:
```
 Test Files  2 passed (2)
      Tests  9 passed (9)
```
`tsc --noEmit` printed nothing. Reproduces the implementer's reported 9
passed / 0 failed exactly.

## Findings

No Critical or Important findings.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `Device/index.tsx:8` | `SCAN_TIMEOUT_MS = 10_000` has no explicit unit annotation in its doc comment (CLAUDE.md §5 "units on every numeric value"); the `_MS` suffix carries the unit but the comment doesn't restate it, unlike `device.ts`'s pattern of `/** u64 */`-style unit tags on bare numeric fields. | Add "(ms)" to the doc comment for consistency with the rest of the IPC layer's style. |

## Checks performed (all pass)

- **Ownership boundary** (`git show --stat`): every path is under
  `app/src/routes/pages/Device/**`, the `DevicePage.tsx` shim, or
  `CHANGELOG.md`. No touch to `rust/`, `app/src-tauri/`, `App.tsx`,
  `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`, or `app/src/ipc/device.ts`.
- **`DevicePage.tsx`** is exactly the one-line re-export the brief
  specifies (`export { default } from "./Device";`), with the doc comment
  the brief gives verbatim; `App.tsx` untouched.
- **`connection.ts`** is a pure reducer (no I/O, no `invoke`, no side
  effects) over the exact `ConnectionState` shape the brief names, importing
  `DeviceDiscovered`/`ConnectionInfo` from `../../../ipc/device` as
  required. All seven actions present and behave correctly: `DEVICE_DISCOVERED`
  upserts by `device_id` and keeps `discovered` sorted by `rssi_dbm`
  descending; ignored outside `phase === "scanning"` (covers the "after
  SCAN_END" test); `FAILED` retains `discovered`; `CONNECTED` retains
  `firmware_version` via the full `ConnectionInfo`.
- **R53 Device Q4 semantics**: `connection.ts`'s doc comments explicitly
  state `connected`/`phase === "connected"` mean "last connect attempt
  succeeded," never a live link, matching the ruling and
  `rust/tauri/src/commands/device.rs`'s module doc (per-call connect/act/
  disconnect, no managed session, read directly from the main checkout).
  `index.tsx` never gates an affordance on `connected` as if it were live.
- **No `scale = range / 32768` or any wire-format arithmetic** anywhere in
  the diff — confirmed no matches for `scale` in `Device/`. Task 1 doesn't
  touch the channel-registry preview (Task 4's concern per R53 Q1); N/A here
  but checked per the standing brief's blanket rule.
- **`ipcStubs.ts`**: `NotImplementedError extends Error` with a `command:
  string` field, exactly as specified; all eight stub functions present
  (`deviceStatus`, `deviceControl`, `pullConfig`, `listProfiles`,
  `saveProfile`, `deleteProfile`, `connectDevice`, `disconnectDevice`), each
  rejecting with `NotImplementedError` naming the real C3 §3.8/§3.10 command
  string (`device_status`, `device_control`, `pull_config`, `list_profiles`,
  `save_profile`, `delete_profile`, `connect_device`, `disconnect_device`) —
  matches IPC-NEEDS 8–11, 13. None throws or resolves an `IpcError`-shaped
  value. CHANGELOG's "five not-yet-landed Device/App commands" correctly
  counts by IPC-need groups (8, 9, 10, 11, 13), not by function count — not
  an inaccuracy.
- **`errors.ts`**: `describeIpcError` covers exactly the eight kinds the
  brief lists (`ble`, `wifi`, `config`, `config_parse`,
  `config_unsupported_version`, `not_found`, `io`, `internal`), each with
  actionable user text; unknown kinds fall back to generic text without
  throwing (C3 §5 additive-kinds rule). `DeviceIpcError` matches C3 §2's
  `IpcError` shape (`kind`, `message`); routes only on `kind`, never
  `.message`.
- **Testing discipline (CLAUDE.md §4)**: all 9 tests use Arrange/Act/Assert
  with blank lines between sections and are named literally
  `thing — condition — result` with an em dash. No rendering tests. No test
  requires a real BLE adapter — all inputs are plain objects/mocks-free pure
  calls into the reducer and `describeIpcError`.
- **Doc comments**: every exported symbol in `connection.ts`, `errors.ts`,
  `ipcStubs.ts`, and `index.tsx`'s default export has a doc comment.
- **No new npm dependency**: `package.json`/lockfile not in the diff.
- **No cargo anywhere** in the diff or the implementer's reported commands.
- **Commit hygiene**: single-line message
  (`app: Device tab directory + connection state over ble_scan/ble_connect`),
  no AI attribution trailer, `git add` paths match the brief's explicit list
  exactly (no `-A`), file set in `git show --stat` matches file-for-file.
- **CHANGELOG bullet** accurately names the directory move, the connection
  reducer, and the "connected = last attempt succeeded" semantics; matches
  what the diff does with no overstatement (no claim of Task 2+ work).
- Confirmed against `rust/tauri/src/commands/device.rs`'s module doc comment
  in the main checkout (the worktree's `rust/` submodule isn't checked out,
  which is expected — this task never needs it) that the connection-lifetime
  judgment call the implementer cites is accurately represented.

## Verdict rationale

Every file in the diff matches its brief-specified shape and interface
exactly: the reducer's behavior was verified test-by-test against the
brief's six named test cases and CLAUDE.md's A/A/A + naming rules, the stub
file's eight functions and error class match IPC-NEEDS 8–11/13 one-to-one,
`errors.ts`'s kind table matches C3 §2/§3.8 without inventing anything, the
ownership boundary is exactly the lane's own directory plus the shim and
CHANGELOG, and the gate reproduces the reported 9 passed / 0 failed with a
silent `tsc`. The one Minor item (a numeric constant's doc comment omitting
an explicit unit tag despite the unit being encoded in the name) does not
rise to a defect that would change a maintainer's decision.

VERDICT: CLEAN
