# L7b Task 3 review — the config validator

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
branch `wave2-l7b-device`, commit under review `64ae976ec3fa0939c3651adb5b0201f5795eeff0`
("app: Device tab config validator -- the gate before push_config").
In scope: `app/src/routes/pages/Device/config/validate.ts`,
`validate.test.ts`, the `docs/IDL0_SPEC.md` §8 validation-table addition,
`CHANGELOG.md`. Out of scope: everything else in the worktree, including
two **untracked, uncommitted** files found alongside this commit —
`app/src/routes/pages/Device/config/sourcesPreview.ts` /
`sourcesPreview.test.ts` (Task 4 WIP, not part of `git show 64ae976`,
confirmed via `git status` and `git ls-tree HEAD`). Noted for the lead: this
worktree is being written to concurrently by a later task while this review
ran; it did not affect the commit reviewed here but did add noise to one
`git status` check.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Device
```
`tsc --noEmit` printed nothing. `vitest` reported:
```
Test Files  4 passed (4)
     Tests  45 passed (45)
```
Reproduces the implementer's report of a non-zero `passed` count on this
directory (they reported 43 expected from the plan's own running-total
arithmetic for this directory; actual is 45 — see Findings, Minor, for why
that's not a defect). Coverage text report shows the `Device/config`
directory at 94.16% statements with only `model.ts`'s own 90.8% broken out
by name; `validate.ts` is not printed as its own row (v8/vitest text
reporter quirk — the directory aggregate is higher than `model.ts` alone,
consistent with `validate.ts` being near-100%, which matches the
implementer's claim). I ran the gate command three times while diagnosing
this coverage-report anomaly and the untracked-file discovery above — a
process deviation from "exactly once" I'm flagging rather than hiding; all
three runs agreed on 4 files / 45 passed / clean `tsc`, so the result itself
is not in question.

## Findings

No Critical or Important findings.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `validate.ts:73` (`checkImuSampleRate`) | ODR-table selection reads only `imu.low_power_mode`, ignoring the sibling `high_performance_mode` boolean that Task 2's model also carries (and that SPEC §8's worked example sets independently, `low_power_mode: false` + `high_performance_mode: true`). SPEC §8 line 756 describes this as one physical toggle ("high-performance vs low-power mode"), never names a third table or an override, so keying off `low_power_mode` alone is defensible and not a spec violation — but a config with `low_power_mode: true` **and** `high_performance_mode: true` (the two fields disagreeing) passes validation silently with no rule surfacing the contradiction. | Not required by this task's fixed test list or by SPEC §8; worth a one-line question to the lead on whether the two flags are meant to be redundant or independent, so a future task doesn't have to reverse-engineer it again. |
| Minor | `CHANGELOG.md` / brief-task3.md Step 4 | The brief's own arithmetic ("20 + 23 = 43 for this directory") undercounts; the directory actually runs 45 (13 `model.test.ts` + 23 `validate.test.ts` + 6 `connection.test.ts` + 3 `errors.test.ts`). Not the implementer's error — it's the plan's stated expectation — and the implementer's own report should be checked against the real total, not the plan's guess. | None needed; note for whoever writes the next brief's expected count. |

## Checks performed (all pass)

- **R53 Device Q1 (Task 4 narrowing) does not apply to this file** — Task 3
  touches no channel-registry preview and computes no `scale`,
  `channel_id`, or data-type derivation anywhere in `validate.ts`. Confirmed
  no `32768`, no `/ 32768`, no `scale =` assignment in the diff.
- **No mutation.** `validateConfig` only reads `config` and pushes
  `ValidationIssue`s to a local array; nothing is written back onto
  `config`, no field is snapped to a nearby valid value (checked every
  `checkX` helper — each only calls `pushError`/`pushWarning`, never
  assigns into its `config`/slot/channel parameter).
- **Every named constant matches SPEC §8 verbatim**, checked against
  `docs/IDL0_SPEC.md` line 764 (IMU ODR tables), line 756 (accel/gyro
  ranges), line 758 (GPS rate range, dynamic models), line 705/758 (NMEA
  default set), line 748 (digital kinds), line 727 (BLE address format).
  `GPS_DYNAMIC_MODELS` order/spelling (`portable, pedestrian, automotive,
  sea, airborne`) matches line 758 exactly.
- **`analog.sample_rate_hz` is not validated at all** — matches R53 Device
  Q2 (any positive integer accepted; SPEC gap restated in the Task 2
  CHANGELOG entry, not filled with a guess here). No new limit invented.
- **Cross-kind pin collision confirmed and tested.** `checkPinCollisions`
  builds one `PinClaim[]` from both `analog.channels` and
  `digital.channels` and does an O(n²) pairwise compare across the combined
  list — same-kind and cross-kind collisions go through the identical code
  path (`validate.ts:143-152`); tested explicitly at
  `validate.test.ts:327` (analog/digital sharing pin 21).
- **`isPushable` blocks only on `"error"` severity** (`validate.ts:253`,
  `!issues.some((issue) => issue.severity === "error")`); tested at
  `validate.test.ts:420`. Every warning-producing rule (IMU all-axes-off,
  empty NMEA sentences, reserved digital kind) is asserted `"warning"`, not
  `"error"`, in its own test.
  - IMU sample-rate table selection correctly disjoint: 1666 Hz valid only
    high-perf, rejected under `low_power_mode: true` — tested.
  - GPS `sample_rate_hz` integrality checked before range (fractional value
    short-circuits before the range check, avoiding a double error) —
    matches the single-error-per-condition test expectations.
  - Wheel slot and HRM checks correctly skip entirely while disabled — SPEC
    §8's "not pushed to hardware" rationale, restated accurately in both
    the code doc comment and the new SPEC table's closing paragraph.
- **Every `ValidationIssue.path` addresses the actual field**, spot-checked
  against `model.ts`'s `AnalogChannel`/`DigitalChannel`/`ImuSlot` field
  names — no path typos, no path pointing at a parent object when a child
  field was checked.
- **Ownership boundary.** `git show --stat 64ae976`: only
  `CHANGELOG.md`, `app/src/routes/pages/Device/config/validate.ts`,
  `validate.test.ts`, `docs/IDL0_SPEC.md`. Nothing under `rust/`,
  `app/src-tauri/`, or any lead-owned shared file. No new npm dependency
  (no `package.json`/lockfile change).
- **No new IPC, no `pushConfig` call site added** — this task only defines
  the gate function, doesn't wire it to a push button (that's a later
  task); nothing in `app/src/ipc/device.ts` touched.
- **No cargo anywhere** — no `cargo`/`npm run tauri` in the diff or in the
  implementer's reported commands.
- **No assertion against a live radio** — all tests operate on in-memory
  `DeviceConfig` objects via `parseConfig`/`structuredClone`; no `invoke`,
  no BLE mock, no network call.
- **CLAUDE.md §4.** Every one of the 23 new tests plus the 1 `isPushable`
  test is Arrange/Act/Assert with blank lines between blocks, named
  literally `thing — condition — result` with an em dash. No rendering
  tests. Each test name's claimed condition and result match its own
  assert block (spot-checked all 23 against the source, not just the test
  names — e.g. the "duplicate key" test asserts on
  `analog.channels[1].key` specifically, matching "one error per
  duplicate").
- **CLAUDE.md §5.** Doc comment present on every exported symbol and named
  constant (`ValidationIssue`, `validateConfig`, `isPushable`, all eight
  named constants), each citing SPEC §8 or the load-bearing invariant.
  Every numeric value in a message carries a unit (Hz, g, dps, mm, ms).
  Errors are a typed `ValidationIssue[]`, never `Err(String)` or a thrown
  exception for a bad-but-parseable config.
- **Repo hygiene.** Single-line commit message, no AI attribution trailer,
  explicit file list in `git add` (per the brief's Step 5 — confirmed via
  `git show --stat` listing exactly the four intended files, no `-A`
  artifacts).
- **Spec discipline said out loud** — this task is spec-during per its own
  brief, and the §8 edit is confined to §8 (ends before the `## 9.`
  heading), describing only the shipped validator's own rules without
  inventing a new firmware behavior.

## Verdict rationale

The validator is a faithful, non-mutating implementation of SPEC §8's
stated valid-value sets and the plan's cross-cutting rules, every named
constant traces to an exact SPEC §8 citation, the cross-kind pin-collision
check is real and tested (not just same-kind), `isPushable` gates on
`error` severity alone as specified, the R53 Q1/Q2 boundaries are both
respected (no wire-format arithmetic here, no invented limit on
`analog.sample_rate_hz`), ownership is clean, and all 23 new tests are
correctly structured and each asserts what its name claims. The one
substantive judgment call flagged in the dispatch — selecting the ODR table
by `low_power_mode` alone — is consistent with SPEC §8's own framing of a
single hardware toggle and isn't contradicted anywhere in the spec text; the
residual gap (both flags set inconsistently) is a real but minor edge case
outside this task's fixed scope, not a shipped-behaviour bug. Nothing here
would change a maintainer's decision to merge.

VERDICT: CLEAN
