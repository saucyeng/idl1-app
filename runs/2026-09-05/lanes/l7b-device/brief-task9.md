# L7b Task 9 — implementer brief (device files, the status hero, and this lane's wrap-up)

You are the implementer for L7b Task 9 — the device-file list and download
queue over the real `list_device_files`/`download_file`, the status hero
card (mostly stubbed and honest about it), and this lane's final task: the
whole-suite gate, coverage, and `TASKS.md`. Spec-during on
`docs/IDL0_SPEC.md` §23. TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
  branch `wave2-l7b-device`. **HEAD must be Task 8's commit** ("app: Device
  tab profiles (in-memory) and config push over push_config"). Verify with
  `git log -1` and `git status`; if not there, STOP and report.
- Work ONLY there. Editing `docs/IDL0_SPEC.md` §23 in this worktree is this
  lane's spec-during obligation. Never touch `rust/`, `app/src-tauri/`,
  `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`.
- **No cargo, ever. No real device available.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7b-device/BRIEF.md` in
  full — this is the lane's last task, and its "R53 rulings," "Load-bearing
  invariants" and "Parity gaps" sections are what `TASKS.md`'s tick must
  reflect; the plan's Task 9 and Parity gaps table
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7b-device-tab.md`, lines
  592–665); `app/src/ipc/device.ts`'s `DeviceFile`, `DownloadResult` (real,
  landed); **there is no cross-tab import handoff (R53 Device Q3)** — a
  downloaded file is not auto-imported; the view tells the user to import
  it from the Data tab.

## The task (plan Task 9, Steps 1–2, plus the lane wrap-up Steps 4+ below)

**Files:**
- Create: `Device/files.ts`, `Device/files.test.ts`, `Device/DeviceFiles.tsx`,
  `Device/HeroCard.tsx`
- Modify: `Device/index.tsx`, `Device/ipcStubs.ts`, `docs/IDL0_SPEC.md` §23,
  `CHANGELOG.md`, `TASKS.md`

**Interfaces:**
- `files.ts`: a reducer over `{ files: DeviceFileView[], queue:
  DownloadItem[] }`. `DeviceFileView` is `DeviceFile` (from
  `app/src/ipc/device.ts`) plus `isNew: boolean` — a device file whose
  `session_id` is **not** among the session ids the catalog knows is "new".
  **This task does not call `listSessions()` itself for that check** —
  accept a `knownSessionIds: Set<string>` argument to `toFileViews(files,
  knownSessionIds)` rather than reaching into the Data tab's IPC module;
  wire `index.tsx` to call `app/src/ipc/catalog.ts`'s `listSessions()`
  directly (a real, landed C3 §3.2 command any tab may call — this is not
  an ownership violation, `catalog.ts` is shared IPC surface, not
  `Data/`-owned code) and pass the resulting id set in. `DownloadItem`
  tracks a `Channel<Progress>` byte count per file. Plus `newCount(files)`
  and `formatTransferRate(doneBytes, elapsedMs)`.

- [ ] **Step 1: Write the failing tests**

  - `toFileViews — a device file whose session_id is already in the catalog — isNew false`
  - `toFileViews — a device file with session_id null — isNew true (the device has not assigned one; it cannot already be imported)`
  - `newCount — a mixed list — counts only the new ones`
  - `downloadReducer — PROGRESS then SUCCEEDED — the DownloadResult's sha256 and path recorded, status done`
  - `downloadReducer — FAILED with kind not_found — status failed, the other queued files untouched`
  - `downloadReducer — PROGRESS with total null — a byte count shown, no percentage invented`
  - `formatTransferRate — a byte count over an elapsed span — reads in KB/s; a zero elapsed span — reads "—", never Infinity`

- [ ] **Step 2: Implement**

  The files view calls `listDeviceFiles(deviceId)` and downloads one file at
  a time through `downloadFile(deviceId, name, onProgress)`, showing bytes
  and rate. A completed download lands a blob under `<data>/blobs/sha256/`
  (C3 §3.8's `DownloadResult`); **importing it is the Data tab's job** — the
  view says "downloaded — import it from the Data tab," no automatic
  handoff (R53 Q3).

  The hero card renders what the tab can actually know: last connect
  result (from `connection.ts`'s `ConnectionState`), firmware version, and
  the actions that exist. **Live status, mode, recording start/stop, sensor
  health, battery and link activity are all stubbed** (`device_status`/
  `device_control`, IPC needs 8/9 — already stubbed in `Device/ipcStubs.ts`
  from Task 1). Show them as **"unavailable"**, never as a plausible-
  looking zero.

- [ ] **Step 3: `docs/IDL0_SPEC.md` §23** — the hero, the files view, and an
  explicit list of what the idl1 Device tab does not yet know about the
  device.

- [ ] **Step 4: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
  ```
  Expected: 7 new tests passed, 0 failed.

- [ ] **Step 5: Lane merge gate — whole TS suite, then coverage**

  ```
  cd app && npx tsc --noEmit && npx vitest run
  ```
  A failure outside `Device/**` may be a merge-order artifact from a
  concurrent lane (L7a/L7c/L6 landing on `main`) — STOP and report rather
  than fixing another lane's file.

  Then, once:
  ```
  cd app && npx vitest run --coverage src/routes/pages/Device
  ```
  Report per-file percentages for every pure module in `Device/` (`.tsx` is
  excluded from coverage by config, CLAUDE.md §4). Every pure module should
  clear 80%; name any gap and whether it's a real untested branch or
  cosmetic.

- [ ] **Step 6: NUL-byte check**

  ```
  grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]' app/src/routes/pages/Device/files.ts app/src/routes/pages/Device/files.test.ts app/src/routes/pages/Device/DeviceFiles.tsx app/src/routes/pages/Device/HeroCard.tsx app/src/routes/pages/Device/index.tsx app/src/routes/pages/Device/ipcStubs.ts docs/IDL0_SPEC.md CHANGELOG.md TASKS.md
  ```
  Every count must print `0`.

- [ ] **Step 7: CHANGELOG + TASKS**

  `TASKS.md`'s L7b line is ticked here, and **only** if it names what is
  outstanding: every IPC need this lane stubbed (8–13, with need 12 noted
  as narrowed-then-deferred per R53 Q1), and the full Parity gaps table's
  dispositions — not a bare checkmark.

- [ ] **Step 8: Commit**

  ```bash
  git add app/src/routes/pages/Device/files.ts app/src/routes/pages/Device/files.test.ts app/src/routes/pages/Device/DeviceFiles.tsx app/src/routes/pages/Device/HeroCard.tsx app/src/routes/pages/Device/index.tsx app/src/routes/pages/Device/ipcStubs.ts docs/IDL0_SPEC.md CHANGELOG.md TASKS.md
  git commit -m "app: Device tab file download and status hero; L7b lane complete pending write commands"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not show a fabricated battery/GPS/SD-card value — "unavailable" only.
- Do not auto-import a downloaded file.
- Do not download more than one file concurrently.
- Do not tick `TASKS.md` without naming what's outstanding.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Spec discipline (say it out loud in your report)

**Spec-during** — `docs/IDL0_SPEC.md` §23 gains the hero/files sections per
Step 3.

## Report back (concise)

Commit hash + `git show --stat`; the exact test commands and result lines
(targeted and whole-suite, with `passed` counts); the coverage report's
per-module numbers for `Device/`; the `TASKS.md` line's exact final text;
confirmation no fabricated device-status value appears anywhere;
confirmation the NUL-byte check printed `0` for every file; anything
ambiguous you resolved (say how) or that needs a lead ruling — including
whether the whole-suite gate showed anything outside `Device/**` failing.
