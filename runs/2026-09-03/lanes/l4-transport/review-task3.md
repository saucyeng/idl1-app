# Review — L4 transport, Task 3 (BLE control commands and ACK protocol, SPEC §7.2)
# plus follow-up doc-comment fix commit for Tasks 1–2 review debt

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l4-transport`
Branch: `wave1-l4-transport`
Commits reviewed:
- `25f1bf8` — "transport: BLE control commands and ACK protocol (SPEC §7.2)" (Task 3 itself)
- `e440410` — "transport: doc-comment fixes flagged by Task 1/2 review (ConnectionInfo fields,
  SdState/GpsState/ImuState, DeviceStatus fields)" (deliberate follow-up, not part of Task 3's
  own plan text)

## Test commands and results

```
cd .../idl-rs-worktrees/wave1-l4-transport/transport
cargo test -p idl-transport ble_control::
```
Result: **4 passed; 0 failed** (`control_command_as_byte_matches_spec_table_for_every_variant`,
`ack_code_from_byte_documented_codes_map_correctly`,
`ack_code_from_byte_undocumented_code_is_unknown_not_success`,
`ack_code_is_success_true_only_for_0x00`). Matches the plan's expected count and the
implementer's claim exactly.

```
cargo test -p idl-transport
```
Result: **11 passed; 0 failed; 0 ignored** (4 `ble_control::` + 5 `ble_status::` + 2 pre-existing
`error::`). Matches the claimed running total (11 tests) with no regressions.

Shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`: `git status -b` →
clean, tracking `origin/main` with `+0 -0`; `HEAD` on `main`. Untouched by this lane.

Worktree `git status --porcelain`: empty (no stray artifacts).

## Findings

No Critical, Important, or Minor findings against Task 3 or the follow-up commit.

## Checklist detail

**1. Spec compliance (Task 3, `25f1bf8`)**
`git show 25f1bf8` is byte-for-byte identical to the plan's Task 3 Step 1 code block (module doc
comment correctly drops the "Filled in by Task 3" placeholder now that it's filled in — the only
textual difference). `ControlCommand`'s nine variants and byte values, `AckCode`'s five documented
codes plus `Unknown(u8)` catch-all, and `is_success` all match SPEC §7.2 as transcribed in the
plan. Single file changed (`ble_control.rs`), matching the plan's declared scope exactly — no
scope creep, no touching `ble_transport.rs` (correctly deferred to Task 5).

**2. Tests**
All 4 tests are Arrange/Act/Assert with blank lines between (Act/Assert combined into one block
for the two table-driven tests, matching the pattern already established in `ble_status.rs`'s
Task 2 tests and the plan's own text — not a deviation). Names follow
`thing_condition_result` (`control_command_as_byte_matches_spec_table_for_every_variant`, etc.).
Tests exercise only this lane's owned logic (byte mapping, ACK decoding) — no assertions against
`btleplug` or other third-party behaviour. Ran and reproduce exactly as claimed.

**3. CLAUDE.md standing orders**
Layer line respected: `ble_control.rs` has zero `btleplug`/`reqwest`/I/O types, zero dependency
on `idl-rs` core, pure byte-in/byte-out logic. No numeric field needing a unit suffix (single
bytes, not a measured quantity). No `TransportErrorKind` extension — command bytes and ACK codes
never fail to parse (`Unknown(u8)` absorbs anything undocumented), consistent with the plan's
explicit instruction not to add new `TransportErrorKind` variants in this lane. No bare `// TODO`.
Doc comment present on every public symbol in this file (`ControlCommand`, `AckCode`, `as_byte`,
`from_byte`, `is_success`, and each non-obvious `AckCode` variant) — Task 3 does not repeat the
Task 1/2 doc-comment gap pattern.

**4. Repo hygiene**
`git log -1 --format=%B` for both `25f1bf8` and `e440410` show a single-line subject only, no
`Co-Authored-By` or other AI-attribution trailer. Author is `isaacallen73` for both. No `cargo
fmt` reformatting: `ble_control.rs`'s match-arm and struct-body formatting is hand-styled,
consistent with `error.rs`/`ble_status.rs`'s existing convention (compact enum bodies where
undecorated, one variant per line once doc comments are added — see below). No push performed
(out of scope for review). The shared `rust` checkout is clean and on `main`.

**5. Follow-up doc-comment commit (`e440410`) — closes the Task 1/2 review debt**

Three gaps were flagged:
- Task 1 review (Minor): `ConnectionInfo.device_id` and `.connected` (in `device.rs`) had no
  field doc comments.
- Task 2 review (Important): `SdState`, `GpsState`, `ImuState` (in `ble_status.rs`) had no type
  doc comment at all.
- Task 2 review (Minor): `DeviceStatus` fields `wifi_on`, `logging`, `battery_pct`, `sd`, `gps`,
  `imu`, `hr_battery_pct` had no field doc comments.

`git show e440410` closes all three, and goes a step further than either review asked for:

- `device.rs`: `device_id` now reads "Same identifier as the `DiscoveredDevice` passed to
  `connect`." and `connected` reads "`true` once GATT setup (service/characteristic discovery,
  Status notifications enabled) completed successfully (SPEC §7.4 steps 2–4)." — both are real,
  specific, SPEC-anchored explanations, not placeholder restatement of the field name.
- `ble_status.rs`: each of `SdState`/`GpsState`/`ImuState` gets a type-level doc comment
  ("SD card state, decoded from the status block's `SD:` line (SPEC §7.3)." etc.) **and** the
  implementer expanded every variant to its own doc comment (e.g. `SdState::Full` → "Card present
  but has no free space left.") — this exceeds what either review asked for (only the type-level
  comment was flagged) but is genuinely useful, not padding.
- `ble_status.rs`: all seven previously-undocumented `DeviceStatus` fields now have one-line doc
  comments naming the source status line and, where numeric, the unit (`battery_pct` → "percent",
  `hr_battery_pct` → "percent") — satisfies CLAUDE.md §5's units-on-numbers rule as well as the
  doc-comment rule.

No placeholder text (e.g. no bare restatement like `/// The device id.`) anywhere in the commit.
Reformatting the three enums from single-line (`pub enum SdState { Ok, Full, Error, Absent }`) to
one-variant-per-line is a mechanical consequence of adding per-variant doc comments, not a
`cargo fmt` pass — confirmed by checking the diff contains no unrelated whitespace churn outside
the touched enum bodies and struct fields.

Scope: only `ble_status.rs` and `device.rs` touched, matching the stated intent (fix flagged
gaps, nothing else). No new logic, no new tests needed since only doc comments changed and the
existing 5 `ble_status::` tests plus 2 `error::` tests still pass unchanged.

## Verdict

CLEAN — Task 3 as landed (`25f1bf8`) matches its plan text byte-for-byte, all claimed test
counts (4/4 `ble_control::`, 11/11 crate-wide) reproduce exactly with no regressions, the shared
`rust` checkout remains clean on `main`, neither commit carries an AI-attribution trailer, and
there is no `cargo fmt` churn. The separate follow-up commit (`e440410`) fully closes all three
doc-comment gaps carried over from the Task 1 and Task 2 reviews with real, SPEC-anchored content
(not placeholder text) — no doc-comment debt remains open from Tasks 1–2.
