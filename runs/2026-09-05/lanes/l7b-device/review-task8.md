# L7b Task 8 review — profiles (in-memory) and config push over `push_config`

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`
- Branch: `wave2-l7b-device`
- Commit under review: `3f3c66b4cc91fb0095f6f9fffd1799e5d209b288` — "app: Device tab profiles (in-memory) and config push over push_config"
- In scope: `Device/profiles.ts`, `Device/profiles.test.ts`, `Device/push.ts`, `Device/push.test.ts`, `Device/ProfileBar.tsx`, `Device/PushConfigBar.tsx`, `Device/index.tsx` diff, `docs/IDL0_SPEC.md` §23.2/§23.6, `CHANGELOG.md`. Out of scope per dispatch: a possible follow-up commit (negative-pin validation, indentation nit, `config` error text) not yet landed at review time — not reviewed here.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Device
```

Output: `tsc --noEmit` printed nothing. Vitest: **10 test files passed (10), 114 tests passed (114)**. Coverage for the two new modules: `profiles.ts` 95.00% stmts / 94.11% lines, `push.ts` 94.73% stmts / 94.44% lines.

This reproduces what the implementer reported (110 new/lane tests — the 114 total includes prior-task Device tests in the same directory filter — and ~94% lines on both new modules). Non-zero `passed` count; gate satisfied.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical or Important findings. | — |
| Minor | `PushConfigBar.tsx:63-70` (`onPush`'s `.then`/`.catch`) | If `PushConfigBar` unmounts while a push promise is in flight (e.g. the rider navigates away from the Device tab mid-push), the resolved/rejected callback still calls `dispatch` on the reducer from the unmounted instance. Not the IPC-effects rule (this is a click handler, not a `useEffect`, so it isn't the two-Criticals pattern the standing brief targets), and React 18+ raises no warning/crash for a stale `dispatch` — but the rider gets no visible outcome for a push they started, and re-entering the tab shows a fresh `initialPushState` as if nothing happened. | Track in-flight-push state one level up (or an `AbortController`/mounted-ref guard) so a completed push while unmounted is at least logged or resurfaced next time the bar mounts. Not gate-blocking; low likelihood given this app's routing, but worth a follow-up task note. |
| Minor | `push.ts` validated twice per render | `PushConfigBar` calls `validateConfig(config)` directly (for `IssueList`) and `preparePush(config)` (which calls `validateConfig` again internally) on every render. Functionally correct and cheap at this config size, not a maintainer-blocking issue, but a `useMemo` or a single `preparePush` call feeding both the issue list and `canPush` would avoid the duplicate work. | Optional refactor, not required. |

## Checks performed (all pass)

- **Push-validation invariant.** `preparePush` (`push.ts:38-44`) calls `validateConfig` then gates on `isPushable(issues)` before calling `serializeConfig` — validate before serialise, never the reverse, matches the lane's load-bearing invariant and the brief's exact wording. Traced every call site: `PushConfigBar.onPush` calls `preparePush(config)` and only proceeds to `pushConfig` inside the `result.ok` branch; the button is additionally gated by `canPush` (`connected && config !== null && prepared.ok && phase !== "pushing"`), so a click cannot reach `pushConfig` on an unpushable config even before the defensive re-check inside `onPush`. No other call site invokes `pushConfig` in this diff.
- **`serializeConfig` fidelity.** `preparePush`'s `json` is exactly `serializeConfig(config)` (`push.ts:44`) — no hand-built string anywhere in the diff.
- **Unknown-key survival.** `serializeConfig` (`config/model.ts:653-655`) spreads `config.unknown` onto the output object after all known fields; `push.test.ts`'s "carrying unknown keys" test proves `future_field` round-trips into the pushed JSON. `profilesReducer`'s `CREATE`/`DUPLICATE`/`RENAME` never reconstruct a `DeviceConfig` object literal — `CREATE` seeds from `defaultConfig`, `DUPLICATE` deep-copies via `structuredClone`, `RENAME`/`DELETE`/`SELECT` never touch `config` at all. `index.tsx`'s `onConfigChange` replaces the whole `config` object with the caller's `next` (produced upstream by Task 6/7's edit ops, out of this diff's scope) rather than rebuilding fields — no loss path here.
- **`pushReducer` correctness.** Pure, total switch over four action types, default returns state unchanged. `PUSH_START` while already `"pushing"` returns the same state reference (`state === return`), proven by `pushReducer.test.ts`'s "no-op, one push at a time" test asserting `toBe`. `PUSH_SUCCEEDED`/`PUSH_FAILED` set phase and message correctly, tested.
- **No `useEffect` driving IPC.** `onPush`/`onPull` are plain click handlers, not effects; no dependency array to mis-scope, so the IPC-effects rule's failure mode (a self-cancelling effect) does not apply here. (See Minor finding above for the separate unmount concern, which is a different failure mode than the rule targets.)
- **Connection gating vs. R53 Device Q4.** `connected={state.connected !== null}` (`index.tsx`) reads `ConnectionState.connected` as "the last connect attempt succeeded," matching `connection.ts`'s own doc comment and R53 Q4 exactly — no live-link assumption. `pushConfig`'s Rust side (`device.rs`) connects/acts/disconnects per-call regardless, so gating the button on "attempted-and-succeeded" rather than "live" is consistent, not contradictory: it's a cheap sanity gate (a `deviceId` exists) layered on top of the real connect-inside-the-command behavior, and SPEC §23.6 states this plainly.
- **"Applied, not verified" honesty.** `describePushResult`'s four branches match the brief's spec exactly, byte-for-byte against the four idl0 messages quoted in the brief. `PushConfigBar.onPush`'s success branch always calls `describePushResult(true, null)` since `pull_config` is a stub — every real wave-2 push lands on "Config applied, not verified." (verified via `push.test.ts` and by reading `PushConfigBar.tsx:66-68`'s comment and code together).
- **`device_rejected` absence.** Grepped the whole worktree (excluding `node_modules`) — no reference to a `device_rejected` kind anywhere in this diff or `errors.ts`, consistent with R59 Q4 (it is a future kind, not yet in C3's shipped table).
- **Profiles in-memory only.** No `localStorage`/`sessionStorage`/file write anywhere in `profiles.ts` or `ProfileBar.tsx`. `ProfileBar.tsx:31-34` renders an unconditional `role="status"` notice, not a tooltip. `listProfiles`/`saveProfile`/`deleteProfile` in `ipcStubs.ts` are untouched (diff confirms no changes to that file) and unused by this task's code.
- **`DUPLICATE` deep copy.** `profiles.test.ts`'s "a deep copy of the config" test mutates the duplicate's `bike_profile.name` post-hoc and asserts the original's is unchanged — proves `structuredClone` isolation, not just a shallow-copy illusion.
- **Judgment calls reviewed as reasonable.** (1) Config sourced from the active profile, with `onConfigChange` a no-op when no profile is active (`index.tsx`) — consistent with the brief's Task 8 scope (profiles gate config editing) and stated in the UI via the placeholder notice. (2) An empty library allowed, contrary to idl0's "cannot be empty" rule — SPEC §23.2 states the reasoning (an empty library is the honest state of a fresh session) and it does not violate any brief ruling; this is exactly the kind of documented, in-scope divergence the SPEC-during discipline calls for.
- **SPEC §23.2/§23.6 accuracy.** Re-read both against the diff: field names (`profile_id`, `profile_name`, `created_at_ms`, `updated_at_ms`, `config`) match `IPC-NEEDS.md` need 11's `BikeProfile` verbatim; the wave-2 vs. idl0-file-backed distinction is stated plainly; the idle-mode-not-enforced and verification-not-proven paragraphs match the code's actual behavior (no overclaiming).
- **Ownership boundary.** `git show --stat` confirms every touched path is `app/src/routes/pages/Device/**`, `CHANGELOG.md`, or `docs/IDL0_SPEC.md`. Nothing under `rust/`, `app/src-tauri/`, `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`, `package.json`, or `vite.config.ts`. `Device/ipcStubs.ts` not touched at all — no new command added to `app/src/ipc/device.ts` (that file isn't in the diff).
- **No cargo.** No `cargo`/`npm run tauri` in the diff or the gate command; gate command itself contains none.
- **No live-radio test.** Every test in `profiles.test.ts`/`push.test.ts` is a pure-function unit test against in-memory data; no `invoke`/BLE call is exercised.
- **CLAUDE.md §4.** All ten-plus new tests are Arrange/Act/Assert with blank lines between phases and named `thing — condition — result` (em dash), matching the brief's literal test list. No rendering tests added.
- **CLAUDE.md §5.** Doc comment present on every exported symbol in `profiles.ts`/`push.ts`/`ProfileBar.tsx`/`PushConfigBar.tsx`; units noted on `created_at_ms`/`updated_at_ms` ("ms since epoch"); errors routed on `err.kind` (`describeIpcError`), never `.message`, in `PushConfigBar`'s `.catch`.
- **Repo hygiene.** Single-line commit message, no AI attribution trailer, `git add` with explicit paths per the brief's Step 6 command (confirmed by the commit's file list matching exactly).
- **No new npm dependency.** `package.json` not in the diff.
- **CHANGELOG accuracy.** The new bullet's claims (in-memory library, deep-copy duplicate, validate-then-serialise invariant, "applied, not verified" honesty, idle-mode stated not enforced) all match the code read above.

## Verdict rationale

The push invariant is enforced at both the button-gating level and inside `preparePush` itself, with no reachable path to call `pushConfig` on an unvalidated or hand-built config; unknown-key and read-only-field preservation survive through `serializeConfig` and every reducer action; the in-memory-only profile library is honest in its UI copy and untouched at the stub layer; the R53/R59 rulings (connection-gating semantics, `device_rejected` absence) are followed precisely; and the SPEC rewrite accurately describes what wave 2 does and does not prove. The two Minor findings (a theoretical stale-dispatch-on-unmount path, and a harmless double validation call) are not gate-blocking, ownership-violating, or spec-deviating — they are the kind of finding that would go in a follow-up note, not a fix-before-merge.

VERDICT: CLEAN
