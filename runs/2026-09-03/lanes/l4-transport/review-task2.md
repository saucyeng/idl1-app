# Review — L4 transport, Task 2 (BLE status characteristic parser, SPEC §7.3)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l4-transport`
Branch: `wave1-l4-transport`, commit `beb2841` (on top of Task 1's `0246079`)
File touched: `transport/src/ble_status.rs` (only file in the commit; matches "Create (fill in)" scope)

## Test commands and results

```
cd .../idl-rs-worktrees/wave1-l4-transport/transport
cargo test -p idl-transport ble_status::
```
Result: **5 passed; 0 failed** (`parse_status_full_block_recording_mode_reads_every_field`,
`parse_status_ota_pending_verify_line_present_sets_flag`,
`parse_status_unknown_line_ignored_known_fields_still_parse`,
`parse_status_lowercase_keys_and_values_parse_case_insensitively`,
`parse_status_empty_block_returns_default`). Matches the implementer's claim exactly.

```
cargo test -p idl-transport
```
Result: **7 passed; 0 failed** (5 `ble_status::` + 2 pre-existing `error::` tests). No regressions.

Shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`: `git status -b` → clean,
`main...origin/main`, `git rev-parse --abbrev-ref HEAD` → `main`. Untouched by this lane, as required.

Worktree `git status --porcelain` after test run: empty (no stray build artifacts committed or left dirty).

## Findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| Important | `transport/src/ble_status.rs:28-35` | `SdState`, `GpsState`, `ImuState` are public enums with **no doc comment at all** (not even one line) — violates CLAUDE.md §5 "Doc comment on every public symbol." Contrast with Task 3's `ControlCommand`/`AckCode`, which do carry type-level doc comments. This gap is baked into Task 2's own plan text (the implementer copied it verbatim), so it is a plan defect executed faithfully, not an implementer deviation — still worth fixing before merge. | Add a one-line doc comment to each enum, e.g. `/// SD card state (SPEC §7.3 \`SD:\` line).` |
| Minor | `transport/src/ble_status.rs:11-25` | `DeviceStatus` fields `wifi_on`, `logging`, `battery_pct`, `sd`, `gps`, `imu`, `hr_battery_pct` lack individual field doc comments (only `firmware`, `ota_pending_verify`, `hr` have one) — same class of gap Task 1 already flagged on `ConnectionInfo.device_id`/`.connected`, now recurring in this file. Noted, not blocking, per the same precedent. | Add a one-line doc per field, or accept the existing project convention of struct-level doc only. |

No Critical findings.

## Checklist results

- **Spec compliance**: `ble_status.rs` implements exactly SPEC §7.3's status-block parser — UTF-8,
  newline-delimited, case-insensitive keys, unknown lines ignored, malformed values degrade to
  `None` rather than failing, empty block → `DeviceStatus::default()`. Diff (`git show beb2841`)
  is byte-for-byte identical to Task 2's plan text (Step 1's failing tests + implementation) —
  no additions, no omissions, no scope creep. Matches the plan's own "Produces: `parse_status`"
  interface line; `DeviceStatus` is consumed by later tasks (`ble_transport.rs`, `wifi_transport.rs`)
  per the plan, not wired up yet (correct — those are separate tasks).
- **Tests**: Arrange/Act/Assert with blank lines between, present in all 5 tests. Names follow
  `thing_condition_result` (`parse_status_<condition>_<result>`), matching the crate's established
  convention (`error.rs`'s `transport_error_display_carries_kind_and_message` etc.). Tests exercise
  logic this lane owns (the parser), not any external crate. Ran and pass as reported.
- **CLAUDE.md standing orders**: layer line correct (pure module, no `btleplug`/`reqwest`/I/O
  types, no `idl-rs` core dependency). Units on numeric fields (`battery_pct`, `hr_battery_pct`
  both `_pct`-suffixed `u8`). No `// TODO` of any form present. No typed-error usage needed —
  `parse_status` is documented as "never fails" (SPEC-driven design choice, consistent with
  CLAUDE.md §5 "never a crash on bad data") so `TransportError` is correctly not invoked here.
  Doc-comment gaps noted above are the only standing-order deviation found.
- **Repo hygiene**: no AI attribution trailer in the commit message (`git log -1 --format=%B` shows
  only `transport: BLE status characteristic parser (SPEC §7.3)`). No `cargo fmt` reformatting —
  compact single-line enum bodies (`pub enum SdState { Ok, Full, Error, Absent }`) and match-arm
  style match `error.rs`'s existing hand-formatted style, not rustfmt's default multi-line output.
- Author is `isaacallen73`, matching the repo's git user; no push performed (out of scope for this
  review).

## Verdict

CLEAN — Task 2 as executed matches its plan text exactly (byte-for-byte diff), all claimed test
results reproduce, no typed-error/layer/hygiene violations, and the only findings are pre-existing-pattern
doc-comment gaps (one clearly a plan defect, not an implementer deviation) that don't block merge.
