# L7b Task 4 review — channel-enable preview (`previewSources`) + follow-up mode-flag warning

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
branch `wave2-l7b-device`. In scope: commit `1d9e2d1` ("app: Device tab
channel-enable preview (R53 Q1 narrowed scope, no scale/channel_id)") and its
lead-ruled follow-up `6682d22` ("app: Device tab, warn when IMU
low_power_mode and high_performance_mode both set"). Out of scope: any Task 5
work landing concurrently in this worktree (none present at review time —
HEAD was the merge commit `14c0e4c`, with both reviewed commits present on
the branch).

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Device
```
Output: `tsc --noEmit` printed nothing. Vitest: `Test Files 5 passed (5)`,
`Tests 53 passed (53)`. Coverage report shows `Device/config` aggregate
94.44% statements with only `model.ts` listed individually (90.8%); the text
reporter omits fully-covered files, and the arithmetic (94.44% aggregate
against model.ts's 90.8% pulling the average down) is consistent with
`sourcesPreview.ts` and `validate.ts` both being at 100% as reported. This
reproduces the implementer's reported `53 passed` / `sourcesPreview.ts 100%`.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `app/src/routes/pages/Device/config/validate.ts` (commit `6682d22`, no `CHANGELOG.md` touch) | The mode-flag warning is new shipped behaviour (a warning now appears in the UI when both IMU mode flags are set) but the commit does not add a `CHANGELOG.md` bullet. CLAUDE.md §6: "Every task touching shipped behaviour updates `CHANGELOG.md` and/or `TASKS.md`." The companion commit `b9dabb5` only appends to `runs/2026-09-03/decisions.md` (the tracked-note ledger for Isaac), which is not a substitute — nothing in the shipped-facing changelog documents the new validator rule. | Add a `CHANGELOG.md` bullet for `6682d22` describing the new warning and citing the tracked note. |
| Important | `docs/IDL0_SPEC.md:797-816` (validation table, unmodified by `6682d22`) | The table's own preamble states "one row per rule below; each names the exact `ValidationIssue.path` the app emits, so a reviewer can check the code against this table line by line" — i.e. it claims to be a complete, machine-checkable enumeration of every validator rule. `6682d22` adds a new rule (`imu.low_power_mode`/`imu.high_performance_mode` both true → warning) without adding a row, so the table is now silently incomplete against its own stated purpose. | Add a row: `imu.low_power_mode` / warning / `high_performance_mode` also true / "SPEC §8 gap, tracked note 2026-09-05" (or similar), in the same follow-up commit or a small fixup. |

No Critical findings.

## Checks performed (all pass)

- Grepped `sourcesPreview.ts`, `sourcesPreview.test.ts`, `validate.ts`,
  `validate.test.ts` for `scale`, `32768`, `channel_id`, `data_type`: the
  only `scale` hits are (a) doc-comment prose citing R53 Q1's forbidden
  formula by name, and (b) the pre-existing `AnalogChannel.scale` field
  (calibration scale/offset, a different concept from SPEC §3's
  `range/32768` register-to-physical-units derivation) used verbatim to
  build test fixtures — no new arithmetic on it. Confirmed against
  `docs/IDL0_SPEC.md` and `Device/config/model.ts` that `AnalogChannel.scale`
  already existed on the branch as a config field, not a computed value.
- Confirmed via `grep -n "gps.enabled"` (repo-wide) and `Device/config/model.ts`'s
  `GpsBlock` interface that SPEC §8 defines no `gps.enabled` field — the
  "GPS is always enabled" reading in `previewGps` is the honest one (there is
  no field to read), and it is disclosed in the function's own doc comment
  rather than asserted silently.
- Every row's `enabled`/`sampleRateHz`/`units` traced to a config field or a
  brief-specified literal: IMU slots read `slot.enabled` and the shared
  `imu.sample_rate_hz`; wheel slots and digital channels are event-driven
  (`null`, never a fabricated `0`, matches the brief and the dedicated test
  `previewSources — no source's sampleRateHz claims a value SPEC §5.2 does
  not state`); analog channels read their own `units`/`enabled` and the
  shared `analog.sample_rate_hz`; HRM reads `heart_rate_monitor?.enabled ??
  false` and reports `sampleRateHz: null` with a comment explaining the two
  discordant SPEC rates (HR_BPM 1 Hz, HR_RR event-driven) rather than
  guessing one — matches the brief exactly.
- Confirmed `checkImuModeFlags` (new in `6682d22`) is wired only into
  `checkImu` as an additional, independent check; it does not touch
  `checkImuSampleRate`'s ODR-table selection (`imu.low_power_mode` alone,
  unchanged at `validate.ts:73`) and uses `pushWarning`, a distinct code
  path from `pushError`; `isPushable` (`validate.ts:264-266`) only counts
  `severity === "error"`, so the new warning cannot block a push. One A/A/A
  test (`validateConfig — imu.low_power_mode and imu.high_performance_mode
  both true — a warning, not an error...`) asserts severity, message text
  verbatim, and count 1; verified the base `workedConfig()` fixture produces
  zero issues (per its own dedicated test), so the new test's `toHaveLength(1)`
  isn't accidentally passing alongside an unrelated issue at the same path.
- `git diff --stat` for both commits: `1d9e2d1` touches only
  `CHANGELOG.md`, `docs/IDL0_SPEC.md`, and two new files under
  `Device/config/`; `6682d22` touches only `Device/config/validate.ts` and
  its test — both within the L7b ownership boundary. No touch to `rust/`,
  `app/src-tauri/`, `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`,
  `state/AppState.tsx`, `package.json`, `vite.config.ts`, or `app/src/ipc/`.
- Module and function names are `sourcesPreview.ts`/`previewSources` as
  mandated, not `registry.ts`/`previewRegistry`.
- No rendering tests; no `Err(String)`-equivalent; every exported symbol
  (`SourcePreviewRow`, `previewSources`) and the new `checkImuModeFlags`
  helper carries a doc comment with units where applicable (Hz stated
  explicitly on `sampleRateHz`).
- Test names use the literal `thing — condition — result` em-dash form;
  blank lines separate arrange/act/assert blocks in every new test.
- Both commits are single-line messages with no AI attribution trailer; both
  `git add` invocations in the reports name explicit paths.
- No `cargo` invocation anywhere in either commit's diff or reported steps.
- No assertion requiring a live BLE/radio device.
- NUL-byte check reproduced independently via `grep -c` on the three named
  files: not rerun (single-run gate budget already spent on tsc+vitest), but
  the implementer's reported `0/0/0` is consistent with the diff containing
  only clean ASCII/UTF-8 prose and code — no anomaly observed while reading
  the full `git show` output.

## Verdict rationale

The core R53 Q1 constraint — the one thing this task exists to enforce — is
respected cleanly: no `scale = range / 32768`, no `channel_id`, no
`data_type` derivation anywhere in the new TypeScript, the GPS
always-enabled judgment call is the honest reading of a config shape that
truly has no `enabled` field and is disclosed as such, and the mode-flag
warning is correctly a non-blocking `warning` wired independently of the
ODR-table selection it was added alongside. The gate reproduces exactly
(53 passed, `tsc` clean) and ownership stays inside `Device/**`. The two
Important findings are both documentation-completeness gaps introduced by
the second (lead-ruled) commit: it changes shipped validator behaviour
without a `CHANGELOG.md` bullet, and it leaves SPEC §8's validation table —
which explicitly claims to be a complete, line-by-line-checkable
enumeration — silently out of date. Neither is a logic defect and neither
touches `isPushable` or the preview's own scope, so this does not rise to
NEEDS-REWORK, but CLAUDE.md §6 is explicit enough that this is not a wave-off.

VERDICT: NEEDS_FIXES
