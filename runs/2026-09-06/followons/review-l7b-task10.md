# Review: L7b Task 10 — Device tab goes live (statusPoll, control, profilesSync, connection)

**Commit:** `f1930ca` — `app/Device: 1 Hz device_status poll, device_control, persisted profiles (R77.4)`
**Branch/worktree:** `wave2-l7b-followon` at `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-followon`

**Files touched:** `CHANGELOG.md`, `TASKS.md`, `docs/IDL0_SPEC.md`,
`app/src/routes/pages/Device/{DeviceControls.tsx, HeroCard.tsx, ProfileBar.tsx,
connection.ts, connection.test.ts, control.ts, control.test.ts, errors.ts,
index.tsx, profilesSync.ts, profilesSync.test.ts, statusPoll.ts,
statusPoll.test.ts}`. All within the brief's declared file list; `profiles.ts`
and `profiles.test.ts` correctly left unmodified (verified via
`git log -1 -- profiles.ts` predating this commit).

## Test command and result

```
cd app
npx tsc --noEmit
npx vitest run src/routes/pages/Device
```
Result: `tsc --noEmit` clean (no errors). Vitest: **14 files / 166 tests, all passed.** Matches the implementer's reported numbers.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Note | `app/src/routes/pages/Device/index.tsx:41` | `STATUS_POLL_DEPS`'s `setTimeout: (fn, ms) => window.setTimeout(fn, ms)` is the only place a raw `window.setTimeout` appears in a `.tsx` file. It is not a violation — it is the module-scope, side-effect-free adapter object `StatusPollDeps` requires (Interface 1), built once outside any component/effect and passed unchanged into the pure `startStatusPoll` driver, which owns all decision logic. Flagging only so a future grep-based check does not mistake it for a raw component timer. | None needed. |
| Note | `app/src/routes/pages/Device/profilesSync.ts:144-146, 161-163` | `persistProfile`/`removeProfile` catch a thrown rejection and cast it directly with `error as DeviceIpcError` rather than routing through `describeIpcError` inside `profilesSync.ts` itself. This matches the brief's actual design: `describeIpcError` is applied at the UI boundary in `index.tsx` (`setProfileError(describeIpcError(outcome.error))`), and `profilesSync.ts` only needs to carry the typed error through, so the "route it through `describeIpcError`" requirement is satisfied at the point where text is actually shown. Not a defect. | None needed. |

No Critical, Major, or unresolved Minor findings.

## Verification detail

- **Poll driver (Interface 1):** confirmed one request in flight at a time (`fireTimer()`'s own invariant asserts exactly one armed timer, `armedTimerCount` checks pin the rest); next timer armed only in the settle handler (resolve and reject both call `deps.setTimeout` after dispatch); rejection continues polling with `statusError`; `stop()` uses a monotonic `generation` counter checked in every settle/visibility handler so an in-flight result after `stop()` is dropped and never dispatched (test: "stop() while a request is in flight"); `stop()` is idempotent (test: "stop() called twice"); `STATUS_POLL_INTERVAL_MS = 1000` is a named, unit-commented constant, and a dedicated test pins that the real value is passed to `setTimeout`. Visibility: hidden pauses with no request issued, subscribes once, and resumes with exactly one request on the next visible transition (test: "window hidden — no request is issued until visibility returns"); `stop()` while waiting on visibility drops the subscription (own test).
- **Link-lost (Interface 1 addendum, R78 Q2):** `LINK_LOST_AFTER_FAILURES = 3` is a named constant with a comment stating no source fixes the number, exactly as ruled. `deviceStatusReducer`'s `"status"` branch resets `consecutiveFailures` to 0, so `isLinkLost` clears on the very next success (own test: "a status action after failures — resets"). `ConnectionState.connected` is untouched by any of this — verified in `connection.ts`'s reducer (no `statusError`/link-lost action exists there) and in `index.tsx`, where `isLinkLost(statusState)` only feeds a `linkLost` prop into `HeroCard`, never a dispatch to `connectionReducer`.
- **Control (Interface 2):** `controlAvailability` withholds all four buttons when `status === null` or either deciding field is `null`; recording/WiFi are mutually exclusive by construction (`!logging && !wifi_on` gates the "on" actions). `transitionObserved` reads only the returned `DeviceStatus`, never the fact that the promise resolved — verified by reading `index.tsx`'s `onControl`, which calls `transitionObserved(command, status)` on the resolved value and never reports success from resolution alone; a `"not-observed"` outcome renders distinct, explicitly non-success text in `DeviceControls.tsx`'s `outcomeText`. Re-entry is blocked by `pendingControl !== null` in `onControl` and by `disabled={busy || !availability...}` on every button in `DeviceControls.tsx`. The provisional-controls banner text is present, two sentences, `role="status"`, no jargon or `device_rejected` mention.
- **Profiles (Interface 3):** last-write-wins confirmed — `persistProfile` installs `converted.view` built from the backend's returned `BikeProfile`, not the locally-sent one (own test: "a save whose returned document differs from what was sent — the returned one wins"). `loadProfiles` merges `list_profiles`' own `skipped` entries with locally-rejected (any-repair-needed) configs into one list, both surfaced together in `ProfileBar`'s skipped section. Save is explicit only: `onSaveActiveProfile` is the sole call site of `persistProfile`; `onConfigChange`/`onCreate`/`onRename`/`onDuplicate` only touch local `profilesState`/`draftName` — grepped for save calls in every change handler, none found. `Save profile` is disabled while `saving` or `!dirty`; a dirty marker (`Unsaved changes`) renders whenever the active profile differs (by full-value comparison) from the last-saved snapshot. `profiles.ts`/`profiles.test.ts` are untouched, as required.
- **Effects (`index.tsx`):** exactly two `useEffect`s. The profile-load effect has `[]` deps, no cancelling cleanup (only a `stale` flag, per the brief), and no function in its dependency array (there is none). The poll effect has `[state.connected?.device_id]` — data only, no callback — and its cleanup is `stop` itself, which is safe to call unconditionally because the driver already generation-guards internally; this is not a "cancel in-flight work from cleanup" violation since the driver's own `stop()` is designed to be called from an effect cleanup with no additional cancellation logic needed. `dispatchStatus` (a `useReducer` dispatch, guaranteed stable by React) is used inside the poll effect but correctly omitted from the deps array.
- **Null rendering:** every `HeroCard` row goes through `fieldText`, which renders `NOT_POLLED_YET` when `status === null` and `UNAVAILABLE` when the specific field is `null`, never a zero/false/healthy default — verified for all nine rows plus the derived `Mode` line.
- **SPEC/CHANGELOG/TASKS:** `docs/IDL0_SPEC.md` §23.2, §23.7, §23.10 diffs read accurately against the landed code — no overstatement found; §23.10's wave-2 paragraph lists the gap set (picker sheet, RX/TX activity, `mm:ss` timer, IMU calibration, HRM pairing, `preview_channel_registry` widening, recently-connected list) matching what the code does not build. `CHANGELOG.md`/`TASKS.md` bullets match the diff.
- **Tests:** every test name follows `thing — condition — result`; Arrange/Act/Assert with blank lines observed throughout `statusPoll.test.ts`, `control.test.ts`, `profilesSync.test.ts`, `connection.test.ts`'s new case. Each test asserts the specific rule it names (spot-checked the harder ones: the "never two in flight" invariant is enforced structurally by `fireTimer`'s own `expect(timers.size).toBe(1)`, not just by the test body).

## Verdict rationale

The implementation matches the brief's Interfaces 1–4 and the R78 rulings (Q1 visibility pause, Q2 three-failure "link lost?" note with unchanged connection state, Q3 explicit Save with dirty marker) exactly, with no silent deviations. The honesty constraint from R63/R71 (a resolved `deviceControl` promise is never evidence) is enforced in both code and test. File scope is exactly the brief's list; `profiles.ts` was correctly left untouched. The gate reproduces the implementer's reported numbers with `tsc` clean. Two Notes are recorded for completeness but neither changes a maintainer's decision.

VERDICT: CLEAN
