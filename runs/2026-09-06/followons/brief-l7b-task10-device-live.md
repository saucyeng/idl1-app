# L7b Task 10 — implementer brief (the Device tab goes live: status, control, persisted profiles)

You are the implementer for L7b Task 10, a wave-2 follow-on ruled in **R77
item 4** (`runs/2026-09-03/decisions.md`, at the end of that file). Read R77
first, then in the same file: **R53 Device Q1–Q5** (what wave 2 shows and why),
**R63 item 1** and its **R71 correction (2026-09-06)** — the `device_rejected`
kind is unreachable on this desktop BLE stack, which is the honesty constraint
on every control this task adds.

The job, in three parts:
1. `device_status` polled at **1 Hz, only while the Device tab is visible and
   a device is connected**, through a pure, tested poll driver.
2. `device_control` start/stop logging and WiFi on/off, behind a **provisional
   controls** banner.
3. Bike profiles persisted over `list_profiles`/`save_profile`/`delete_profile`
   (last-write-wins), replacing `profiles.ts`'s in-memory-only library.

Then: retire the "unavailable" text in `HeroCard`/`ProfileBar` **only where a
command now actually supplies the value**, and list what is still a gap.
ONE commit, then report.

**Spec discipline: spec-during.** `docs/IDL0_SPEC.md` §23.10 (the "Wave 2
(`Device/HeroCard.tsx`)" paragraph), §23.7 (recording controls) and §23.2's
wave-2 note if one exists all become false. They are updated in this commit.
Do not touch C2 or C3.

---

## GATE — verify before writing a line

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
git status --short
git log --oneline -3
```

Required: branch `main`, tree clean apart from untracked `runs/`. Any modified
tracked file ⇒ **STOP and report** — this is a single checkout shared by other
follow-on tasks.

Then confirm by reading `app/src/ipc/device.ts` and `app/src/ipc/app.ts` —
**name every one of these exactly as it is spelled there, do not invent a
wrapper**:
- `deviceStatus(deviceId): Promise<DeviceStatus>` and the `DeviceStatus`
  interface (`wifi_on`, `logging`, `battery_pct`, `sd`, `gps`, `imu`,
  `firmware`, `ota_pending_verify`, `hr`, `hr_battery_pct`) plus
  `SdState`/`GpsState`/`ImuState`.
- `deviceControl(deviceId, command): Promise<DeviceStatus>` and
  `DeviceControlCommand = "start_recording" | "stop_recording" | "wifi_on" | "wifi_off"`.
- `connectDevice(deviceId)` / `disconnectDevice(deviceId)`.
- `listProfiles(): Promise<ProfileLoadReport>`, `saveProfile(profile)`,
  `deleteProfile(profileId)`, and `BikeProfile { profile_id, profile_name,
  created_at_ms, updated_at_ms, config: Record<string, unknown> }`.

**If any is missing — STOP and report.** This task writes no IPC wrapper:
they all landed in the post-L8w shell task (`d83a14d`).

---

## Where

- Repo `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`, branch `main`,
  single primary checkout.
- Work only under `app/src/routes/pages/Device/**`, plus `docs/IDL0_SPEC.md`
  §23 subsections named above and `CHANGELOG.md` (repo root).
- **Never run any cargo command.** TypeScript only. No new npm dependency.
- Do not push. Do not amend a reported commit.
- **Ownership STOPs** (wave-2 operating brief §2): `app/src/App.tsx`,
  `app/src/state/**`, `app/src/routes/types.ts`, `app/vite.config.ts`,
  `app/package.json`, `app/src-tauri/**`, `rust/**`, either contract spec, and
  any other lane's page directory (`Data/`, `Settings/`, `Notebook/`) —
  **STOP and report**, do not edit.

---

## What is true today — read all of these first

1. **`Device/index.tsx`** (131 lines). It calls `bleScan` and **`bleConnect`**
   (the connect-act-disconnect command), holds `connectionReducer` state, and
   holds `profilesState` in `useState` with `profilesReducer`. `hasPulledConfig`
   is a hard-coded `false`. Read it in full.
2. **`Device/connection.ts`** — `ConnectionState`/`connectionReducer`. Its doc
   comment says `connected` means "the last connect attempt succeeded", never
   a live link (R53 Device Q4). That is about to stop being true for the
   managed-connection path; update the doc comment where it does.
3. **`Device/HeroCard.tsx`** — the `UNAVAILABLE` constant and its nine
   `StatusRow`s, plus the `device-hero__note` paragraph naming
   `device_status`/`device_control` as not landed.
4. **`Device/ProfileBar.tsx`** — the `device-tab__profile-bar-notice`
   paragraph saying profiles are in-memory only.
5. **`Device/profiles.ts`** — `ProfileView`, `ProfilesState`,
   `profilesReducer` and its five actions (`CREATE`/`DUPLICATE`/`RENAME`/
   `DELETE`/`SELECT`), all pure and tested in `profiles.test.ts`. Note
   `ProfileView` is field-for-field `BikeProfile` except that `config` is
   typed `DeviceConfig` rather than `Record<string, unknown>`.
6. **`Device/errors.ts`** — `describeIpcError` and its `KIND_TEXT` table.
   Every new command's rejection goes through it; add kinds only if a real
   one is missing.
7. **`Device/PushConfigBar.tsx`** — already calls the real `pushConfig` **and
   `pullConfig`**. Do not re-do that work; it is out of scope.
8. **`app/src/App.tsx`** (read only, never edit): the shell renders **only the
   active tab's page** — `{ notebook: …, device: <DevicePage/>, … }[state.route]`.
   So the Device page is **unmounted** whenever another tab is selected. That
   is the tab-visibility condition R77.4 names, and it means "only while the
   tab is visible" is satisfied by mounting the poll in the page's own effect.
   See Open Question 1 for the window-level case.
9. **`docs/IDL0_SPEC.md` §23.1, §23.2, §23.5–§23.10** — what idl0 had. Port
   semantics, not widgets (operating brief §2).
10. **The idl0 reference UI, read-only**:
    `C:\Users\isaac\Documents\Saucy\saucyeng\idl0-app\app\lib\ui\tabs\device\`
    — `device_hero_card.dart`, `mode_status_line.dart`,
    `mode_result_listener.dart`, `profile_bar.dart`, `profile_dialogs.dart`,
    `calibration_panel.dart`, `hrm_pair_dialog.dart`, `device_picker.dart`.
    Read them for behaviour and edge cases; copy no widget code.

### The honesty constraint you must not paper over

R63 item 1, as corrected by **R71 (2026-09-06)**: on this desktop BLE stack
the SPEC §7.2 acknowledgement byte never reaches the app, so a device that
*refuses* a control command cannot be distinguished from one that accepted it.
`device_control` polls status until the transition is observed or a bounded
timeout expires and **returns the post-transition status either way — it never
times out to an error**. Therefore: a control that "succeeds" proves only that
the command was sent. The only real evidence a transition happened is the
returned `DeviceStatus` itself showing the new state. Build the UI on that
evidence and say so in the banner — do not report success on a resolved
promise alone.

---

## Interfaces

### 1. `Device/statusPoll.ts` (new, pure with injected IO) — the effects rule

Wave-2 operating brief §4, as tightened 2026-09-05: **every effect that starts
IPC work delegates its decision logic to a pure module.** A 1 Hz poll is
exactly the shape that rule exists for. Write it as a driver, not as a
`setInterval` in a component.

```ts
export interface StatusPollDeps {
  deviceStatus: (deviceId: string) => Promise<DeviceStatus>;
  /** Injected clock/scheduler so tests drive time, never a real timer. */
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (handle: number) => void;
}

export type StatusPollAction =
  | { type: "status"; status: DeviceStatus }
  | { type: "statusError"; error: DeviceIpcError };

/** 1 Hz — SPEC §23.9's live status line and §23.10's hero read at this rate. */
export const STATUS_POLL_INTERVAL_MS = 1000;

/** Starts polling `deviceId` every `STATUS_POLL_INTERVAL_MS`. Returns a stop
 *  function. One request in flight at a time: the next timer is armed only
 *  after the previous request settles, so a slow link degrades the rate
 *  instead of stacking requests. */
export function startStatusPoll(
  deps: StatusPollDeps, deviceId: string,
  dispatch: (a: StatusPollAction) => void,
): () => void;
```

Rules, all of which the tests must pin:
- **Never two requests in flight.** Arm the next timer in the settle handler
  of the previous request (resolve *and* reject), not on a fixed interval.
- **A rejection does not stop the poll.** It dispatches `statusError` and the
  poll continues — a device walking out of range must recover on its own when
  it comes back, not need a manual re-scan.
- **After `stop()`, nothing is dispatched**, including from a request that was
  already in flight. Use a monotonic generation counter inside the driver, the
  way `CellRunSequencer` does for the Notebook — **do not** cancel the promise
  and do not rely on the effect's cleanup for correctness.
- `stop()` is idempotent and clears any armed timer.

The React effect in `index.tsx` then does only: `if (!connected) return;`
`const stop = startStatusPoll(deps, deviceId, dispatchStatus); return stop;`
with a dependency array of **data only** (`[connected?.device_id]`) — no
function props, no callbacks. Hold `dispatchStatus` in a ref if you need to.

### 2. `Device/control.ts` (new, pure) — what a control button may claim

```ts
/** Which controls are offered, and what each one would do, given the last
 *  status. `null` fields mean the device did not report that line — never a
 *  false/zero default (C3 §3.8). */
export function controlAvailability(status: DeviceStatus | null): {
  canStartRecording: boolean; canStopRecording: boolean;
  canWifiOn: boolean; canWifiOff: boolean;
};

/** Did the status the command returned actually show the transition? This is
 *  the only evidence available on this platform (R63.1 / R71) — a resolved
 *  promise is not. */
export function transitionObserved(
  command: DeviceControlCommand, after: DeviceStatus,
): "observed" | "not-observed" | "unreported";
```
`"unreported"` is the case where the relevant field came back `null`. Each of
the three outcomes gets distinct user-facing text; `"not-observed"` must not
read as success.

Rules for `controlAvailability`, from SPEC §23.9: WiFi and recording are
**mutually exclusive**; recording starts immediately and is never gated on
sensor health; with `status === null` (not polled yet) nothing is offered.

### 3. `Device/profiles.ts` — persistence, last-write-wins

Keep `profilesReducer` and its five pure actions **and their existing tests
passing unchanged**. Add persistence *around* it, not inside it (the reducer
stays pure — its own doc comment says so):

- A new `Device/profilesSync.ts` (pure, injected IO) with
  `loadProfiles(deps)` → a `ProfilesState` plus the `skipped` list from
  `ProfileLoadReport`, and `persistProfile(deps, profile)` /
  `removeProfile(deps, profileId)`.
- **Last-write-wins, as R77.4 says**: `save_profile` is a whole-document
  replace; the tab never merges. A save sends the profile as it stands
  locally, and the command's returned `BikeProfile` (the profile as written)
  replaces the local copy — do not keep the optimistic one.
- `ProfileView.config` is `DeviceConfig` while `BikeProfile.config` is
  `Record<string, unknown>`. Convert at the boundary in one place, in
  `profilesSync.ts`, and validate on the way in: a stored profile whose
  `config` does not satisfy `Device/config/model.ts` goes to a **skipped**
  list shown to the user, never a silently defaulted config. `list_profiles`
  already reports files that failed to parse in `skipped` — surface both,
  together, in one place.
- The load runs once, from a mount effect, dependency array `[]`, no cancelling
  cleanup, staleness guarded by a generation counter (the same rule as above).
- Every `updated_at_ms` uses `Date.now()` supplied by the caller, never inside
  a pure function.
- `saveProfile` rejects with `invalid_argument` when `config` is not a JSON
  object; route it through `describeIpcError`.

Tests for `profilesSync.ts` with an injected fake: an empty library; a library
with `skipped` entries; a profile whose config fails validation; a save whose
returned document differs from what was sent (the returned one wins); a save
rejection leaving local state untouched **and reported**; a delete of an id
the backend says is `not_found`.

### 4. The managed connection

`bleConnect` connects, acts and disconnects inside the command. Polling that
once a second would re-establish a BLE link every second. So this task must
switch the connect path to **`connectDevice`** (which holds the link open
server-side) and add an explicit **Disconnect** that calls `disconnectDevice`.
`connection.ts`'s `ConnectionState` doc comment — "never a live link" (R53
Device Q4) — becomes true only for the *pre-`connect_device`* world; rewrite
it to say what is now true, and add a `DISCONNECTED` dispatch on the
disconnect path (the action already exists in the reducer, unused).

This is in scope by necessity, not scope creep: the 1 Hz poll R77.4 mandates
is not implementable on `ble_connect`. Say so in the commit message.

### 5. `HeroCard.tsx` — retire "unavailable" only where a value now exists

Take a `status: DeviceStatus | null` prop. Then, row by row:
- **Recording**, **SD card**, **GPS fix**, **IMU**, **HRM**, **Battery**,
  **Firmware**, and a **WiFi** row: render the real value when the field is
  non-`null`; render `UNAVAILABLE` when the field is `null` (the device did
  not report that line — C3 §3.8 is explicit that `null` is not a default)
  and `"…"`/`"not polled yet"` when `status` is `null` because no poll has
  returned yet. Three distinct states, three distinct strings.
- **Mode**: derive from `logging` and `wifi_on` per SPEC §23.9's
  `Idle` / `Recording` / WiFi vocabulary; `UNAVAILABLE` when either input is
  `null`.
- Delete the `device-hero__note` paragraph's claim that `device_status`/
  `device_control` "have not landed" — it is now false. Replace it with the
  provisional-controls banner text (below), or move that banner beside the
  controls; do not leave a stale sentence.

Keep `UNAVAILABLE` as the literal string for a genuinely unreported field. A
fabricated battery reading on a race day is worse than a blank one (SPEC
§23.10, and the L7b lane brief's own "Do not").

### 6. The provisional-controls banner (R53, R63.1/R71)

One `role="status"` banner beside the Start/Stop and WiFi controls, saying in
plain words: these controls send the command and then read the device's status
back; on this desktop Bluetooth stack a refusal from the device cannot be told
apart from a command that was never acted on, so the status line — not the
button — is the evidence the change happened. No jargon, no error codes, no
`device_rejected`. Keep it to two sentences.

---

## Steps

- [ ] **Step 1.** Read everything in "What is true today", including the idl0
      Dart files. Write down (for the report) which idl0 device-tab features
      this task will and will not deliver.
- [ ] **Step 2.** `Device/statusPoll.ts` + `statusPoll.test.ts`, TDD, with an
      injected fake clock. Arrange/Act/Assert with blank lines; names
      `thing — condition — result`. Cases at minimum: one request per tick and
      never two in flight; a slow response delays rather than stacks; a
      rejection dispatches `statusError` and the poll continues; `stop()` drops
      an in-flight result; `stop()` twice is safe; `stop()` clears the timer.
- [ ] **Step 3.** `Device/control.ts` + `control.test.ts`. Cases: every
      `DeviceControlCommand` against `logging`/`wifi_on` of `true`/`false`/
      `null`; the recording⇄WiFi exclusion; `status === null` offers nothing;
      all three `transitionObserved` outcomes.
- [ ] **Step 4.** `Device/profilesSync.ts` + `profilesSync.test.ts` (cases
      listed in Interface 3). `profiles.ts`'s reducer and `profiles.test.ts`
      stay green **unmodified** — if you find you must change the reducer, say
      why in the report.
- [ ] **Step 5.** `Device/connection.ts` doc-comment correction and the
      `connectDevice`/`disconnectDevice` swap; `Device/index.tsx` wiring (poll
      effect, control handlers, profile load/save/delete). No unit tests for
      `index.tsx` (rendering, CLAUDE.md §4). Every effect: dependency array on
      data only, no cancelling cleanup, staleness by generation counter.
- [ ] **Step 6.** `HeroCard.tsx`, `ProfileBar.tsx` (delete the in-memory-only
      notice; add the skipped-profiles surface), the provisional-controls
      banner. Rendering — no unit tests for these.
- [ ] **Step 7. SPEC (spec-during).** In `docs/IDL0_SPEC.md`, edit only:
      §23.10's **"Wave 2 (`Device/HeroCard.tsx`)"** paragraph, §23.7
      (recording controls — say what wave 2 now does and what the ack-byte gap
      means), and §23.2 / §23.9 where they assert something this commit makes
      false. Add, in §23.10's wave-2 paragraph, the list of idl0 features still
      not delivered from Step 1. Do not restructure the section.
- [ ] **Step 8. NUL-byte check.** From the repo root:
      ```bash
      grep -rlP '\x00' app/src docs/IDL0_SPEC.md CHANGELOG.md; echo "exit=$?"
      ```
      Expected: nothing printed, `exit=1`.
- [ ] **Step 9. Gate.**
      ```bash
      cd app
      npx tsc --noEmit
      npx vitest run src/routes/pages/Device
      npx vitest run
      ```
      The lane filter must report a **non-zero** `passed` and 0 failed (a
      filter matching nothing is a failed gate). Then the whole TS suite,
      once, before reporting. Report both real numbers — do not quote a
      baseline from the ledger.
- [ ] **Step 10. CHANGELOG** — one bullet at the top of `### Added`:
      ```
      - **Device tab goes live: status, controls, persisted profiles (L7b Task 10, R77.4).** `device_status` is polled at 1 Hz through a new pure `Device/statusPoll.ts` driver (one request in flight at a time, the next timer armed only when the previous settles, a rejection logged and the poll continued) while the Device tab is mounted and a device is connected; `HeroCard` now shows real recording state, SD, GPS, IMU, HRM, battery, WiFi and mode, keeping the literal "unavailable" only for a field the device did not report and a distinct "not polled yet" before the first result. Start/stop recording and WiFi on/off go through `device_control`, gated by a pure `Device/control.ts` (WiFi and recording are mutually exclusive, SPEC §23.9) and reported from the status the command returns, not from the promise resolving — on this desktop BLE stack the SPEC §7.2 ack byte never reaches the app (R63.1, R71 correction), so a refusal is indistinguishable from a silent no-op and a provisional-controls banner says so. Bike profiles now persist over `list_profiles`/`save_profile`/`delete_profile`, last-write-wins, through a new `Device/profilesSync.ts`; a stored profile whose config fails validation, and any file `list_profiles` itself skipped, are shown rather than silently defaulted. The connect path moves from `ble_connect` to the managed `connect_device`/`disconnect_device` pair — a 1 Hz poll is not implementable on a command that reconnects each call.
      ```
- [ ] **Step 11. Commit.** Explicit paths (never `git add -A`; an untracked
      `runs/` tree is present and is not yours):
      ```bash
      git add app/src/routes/pages/Device CHANGELOG.md docs/IDL0_SPEC.md
      ```
      Single-line message, no AI attribution trailer:
      ```
      app/Device: 1 Hz device_status poll, device_control, persisted profiles (R77.4)
      ```

---

## Do not

- Do not put a `setInterval` or a `setTimeout` in a component. The poll lives
  in `statusPoll.ts` with an injected scheduler.
- Do not list a function or callback prop in an effect's dependency array, and
  do not cancel in-flight work from an effect cleanup. Both are graded
  Critical on sight.
- Do not report a control as successful because its promise resolved.
- Do not render a plausible-looking zero, `false`, or "healthy" for a `null`
  field.
- Do not poll while no device is connected, and do not poll from a component
  that is not the Device page.
- Do not make `profilesReducer` impure or give it a sixth action that does IO.
- Do not touch `PushConfigBar.tsx`'s already-wired `pushConfig`/`pullConfig`,
  and do not wire `preview_channel_registry` — that is R53 Device Q1's
  separate widening of Task 4, not this task.
- Do not add an auto-connect/rescan loop (SPEC §23.10's "headphones" model) —
  it is a listed gap, not this task.
- Do not run cargo, edit a contract, push, or amend.

## Style / hygiene

Doc comment on every exported symbol; **units on every numeric value** (ms,
Hz, percent); `// TODO(idl0):` never bare. All failures typed — route every
rejection through `Device/errors.ts`'s `describeIpcError`, never
`Err(String)`-equivalent ad-hoc text.

---

## Open questions for the lead (proceed on the recommendation unless told otherwise; none blocks Steps 2–4)

1. **"Visible" — mounted, or actually on screen?** `App.tsx` renders only the
   active tab, so the Device page unmounts when the user leaves it, which
   satisfies R77.4's "only while the Device tab is visible" for free. It does
   **not** cover a minimised or background window, where the page stays mounted
   and the poll keeps a BLE link busy at 1 Hz. Options: (a) mount-scoped only;
   (b) mount-scoped plus a `document.visibilityState` / `visibilitychange`
   guard that pauses the poll while the window is hidden.
   **Recommendation: (b)** — it is about ten lines inside `statusPoll.ts`'s
   own driver (an injected `isVisible()` and a subscription), it is testable
   with the same fakes, and a background app quietly draining a device's
   battery is the kind of thing nobody notices until a race day.
   **Cost if wrong:** one injected predicate and two tests.

2. **Does a `device_status` rejection change the connection state?** R53
   Device Q4 says `connected` means "the last connect attempt succeeded"; with
   a managed `connect_device` link, a run of failing polls is real evidence the
   link is gone, but nothing states a threshold. Options: (a) never — the poll
   reports the error and the state stays "connected" until the user acts;
   (b) after N consecutive failures dispatch `DISCONNECTED` and stop polling;
   (c) show a "link lost?" note after N failures but keep polling and keep the
   state. **Recommendation: (c) with N = 3** — it recovers by itself when the
   device comes back (which (b) does not), and it does not silently claim a
   link that is not there (which (a) does). The number needs to be a named
   constant with a comment saying no source specifies it.
   **Cost if wrong:** one constant and one string.

3. **Where do the profile library and the pushable config actually live?**
   `index.tsx` currently edits the active profile's `config` in place on every
   channel-table change. With persistence, every keystroke in the config editor
   is a candidate `save_profile` call. Nothing states a save policy. Options:
   (a) explicit **Save profile** button, no autosave; (b) debounced autosave;
   (c) save on profile switch and on unmount. **Recommendation: (a)** — it
   matches Push Config's existing "never automatic, the user reviews and
   presses" rule (SPEC §23.6), it makes last-write-wins comprehensible, and it
   avoids a 1 Hz-adjacent write storm on a file store. A dirty-state marker on
   the profile bar goes with it. **Cost if wrong:** one button and a dirty flag.

---

## Report back (concise)

Commit hash and `git show --stat`. The exact gate commands and their real
result lines (lane filter and whole suite, both non-zero `passed`, 0 failed).
The GATE findings on `ipc/device.ts`/`ipc/app.ts` — each named export
confirmed or not. **The list from Step 1: which idl0 device-tab features this
task delivers and which remain gaps, each with a one-line reason** (expect at
least: auto-connect/"headphones" rescan, the device-picker sheet, RX/TX link
activity, the `mm:ss` recording timer, IMU calibration, HRM pairing,
`preview_channel_registry`'s enable/rate/unit widening, and the recently-
connected-devices list §23.8 already defers). The exact test case names added
to each new `*.test.ts`. Which resolution you used for each of Q1–Q3.
Confirmation in one line each that: no `setInterval`/`setTimeout` appears in a
`.tsx` file; no effect dependency array contains a function; no effect cleanup
cancels in-flight work; every `null` status field renders as "unavailable" and
never as a zero or a healthy state. Per-step done/deviated. Anything ambiguous
you resolved and how, or that needs a ruling — stop and report rather than
guessing (CLAUDE.md §1).

## Questions template (use verbatim if you must stop)

```
QUESTION <n>
Context: <the file/line and what you were doing>
The gap: <what no source states — cite the sources you checked by path/section>
Options: (a) … (b) … (c) …
My recommendation: <one option, one sentence why>
Cost if wrong: <what has to be undone>
Blocking: yes/no — <what you can finish without the answer>
```
