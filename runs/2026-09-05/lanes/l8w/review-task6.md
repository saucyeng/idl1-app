# L8w Task 6 review — managed BLE connection (`state::Connections`) + `device_status`

**Scope:** rust worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
branch `wave2-l8w-write-amendment`, commit `9241405c1a1b98f7250b4fdaaf159651adff50c6`
(`tauri/src/commands/device.rs`, `tauri/src/state.rs`, `tauri/src/lib.rs`), and
app worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l8w-write-amendment`,
commit `0d00214b991ba3bb53ae679aeae66f52f3e8d3b3` (`app/src-tauri/src/lib.rs`, one line).
Out of scope: any other uncommitted change in either worktree (none observed
touching these files); L2's Task 4c work landing concurrently elsewhere in
the tree.

## Test command and result

Not re-run (CLAUDE.md §8 / L8w standing brief: reviewers do not build or
test). Verified statically instead: `grep -c "#\[test\]\|#\[tokio::test" tauri/src/commands/device.rs`
returns **24**, matching the implementer-reported
`cargo test -p idl-rs-tauri commands::device::` → 24 passed exactly. All 9
new tests are traced below against `StubBle`/`ConnectionMap<T>` and would
fail if their named behaviour broke (see Checks performed). `cargo check -p
idl-rs-tauri` reported clean by the implementer; not independently
reproducible without building, but the diff introduces no new external
dependency and only additive `pub` surface, consistent with a clean check.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Note | `tauri/src/commands/device.rs:200-208` (`connect_device_via`) | On a second `connect_device` for an already-connected `device_id`, the old `Arc<tokio::sync::Mutex<BtleplugBle>>` is simply overwritten by `HashMap::insert` and dropped — `disconnect()` is never called on the superseded connection. If `btleplug`'s `Peripheral`/`Adapter` `Drop` impls don't tear down the GATT link themselves, this could leave a stale hardware-level BLE connection on the device (a real device-side resource, not just memory) until it times out on its own. This is not an implementer deviation — the plan's own brief text prescribes exactly this ("re-run connect() on a *new* BtleplugBle and replace the map entry ... simpler than trying to read a still-fresh ConnectionInfo off the existing connection"), and the diff documents the choice verbatim in both the doc comment and the test name. Flagging because it is the one place the dispatch asked to "trace the drop," and the answer is that nothing explicit disconnects the old link — this reads as a real gap worth a lead decision (call `.disconnect()` on the superseded `Arc` before dropping it, since a `Mutex<Option<T>>`-managed BLE handle across two live commands sharing a device slot is not implausible on real firmware with a small connection limit) rather than a code defect in this task. |

No Critical or Important findings.

## Checks performed (all pass)

- **C3 §3.8 field-for-field, `DeviceStatus`.** New `DeviceStatus` DTO
  (`wifi_on: Option<bool>`, `logging: Option<bool>`, `battery_pct: Option<u8>`,
  `sd: Option<SdState>`, `gps: Option<GpsState>`, `imu: Option<ImuState>`,
  `firmware: Option<String>`, `ota_pending_verify: bool`, `hr: Option<String>`,
  `hr_battery_pct: Option<u8>`) matches C3's quoted TS interface field for
  field, same names, same optionality (only `ota_pending_verify` non-null),
  and matches `idl_transport::ble_status::DeviceStatus`
  (`rust/transport/src/ble_status.rs`) field for field, same order. No field
  invented or dropped.
- **Enum value-for-value mirroring.** `SdState` (Ok/Full/Error/Absent),
  `GpsState` (Fix/NoFix/Absent), `ImuState` (Ok/Partial/Error/Absent) each
  match the transport crate's corresponding enum's variant set exactly, with
  `#[serde(rename_all = "snake_case")]` producing C3's exact string set
  (`"ok"|"full"|"error"|"absent"`, `"fix"|"no_fix"|"absent"`,
  `"ok"|"partial"|"error"|"absent"`). All three `From` impls are exhaustive
  matches, no `_ =>` catch-all masking a missed variant.
- **`state::Connections` shape.** `pub struct Connections(pub
  std::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<BtleplugBle>>>>)`
  in `tauri/src/state.rs` matches the plan's suggested shape exactly (no
  undocumented deviation to check for). Doc comment style matches
  `DataDir`/`Hashes`/`Watchers`'s existing pattern in the same file.
- **`Send` guard.** `btleplug_ble_is_send_required_for_arc_mutex_managed_connection_state`
  is a genuine compile-time assertion (`fn assert_send<T: Send>() {}
  assert_send::<BtleplugBle>();` inside an executable `#[test]`, kept
  permanently per the brief's own instruction) — if `BtleplugBle` ever loses
  `Send`, this file fails to compile, not just fails at runtime.
- **Outer lock never held across an `.await`.** Traced all three `_via`
  functions: `connect_device_via`'s `.insert(...)` is a single synchronous
  statement; `disconnect_device_via`'s `.remove(...)` likewise; `device_status_via`'s
  `.get(device_id).cloned()` likewise — in every case the `std::sync::Mutex`
  guard is a temporary that drops at the end of the statement, before any
  subsequent `.await`. Matches the doc comment's stated design and avoids a
  blocking-mutex-across-await footgun.
- **`connect_device` called twice ⇒ last caller wins.** `connect_device_via_called_twice_for_same_device_id_replaces_the_map_entry`
  asserts exactly one map entry survives; this is the task-brief-mandated
  behaviour (not a silent implementer deviation — the brief's Key Logic
  section prescribes this exact approach), and the code and doc comment both
  state the choice and reasoning explicitly, satisfying the standing brief's
  "document a plan-suggested-but-open choice" rule. See the Note above re:
  the dropped (not explicitly disconnected) old connection.
- **A failed `connect_device` leaves no entry.** `connect_device_via` only
  inserts after `ble.connect(device_id).await?` succeeds (the `?`-style
  `map_err(...)?` returns before the `.insert(...)` line on error) — no test
  explicitly exercises the error path, but the control flow makes a leaked
  entry-on-failure impossible by construction (early return before the only
  `insert` call).
- **`disconnect_device` on an unknown id.** Confirmed `Ok(())`, never
  `not_found`, exactly matching C3 §3.8's quoted wording ("disconnecting an
  unconnected device is a no-op, not an error"). Test
  `disconnect_device_via_unconnected_device_id_is_ok_noop` asserts this and
  that the map stays empty.
- **`list_device_files`/`download_file`/`push_config` unchanged.** `git show
  --stat` and the diff both show these three commands' bodies untouched in
  this commit — they remain per-call connect-act-disconnect, which is
  correct: C3 §3.8's quoted text names only `device_status`/`device_control`/
  `pull_config` (the latter two out of scope, Tasks 7/8) as using the
  managed link, not this trio. No silent double-connect introduced.
- **`ble_connect` unchanged.** Still registered, still per-call
  connect-act-disconnect, matching C3's "stays registered unchanged" clause.
  No signature or behaviour change.
- **No `device_rejected`/`AckCode` text-parsing.** Neither appears anywhere
  in this diff — correctly out of scope for Task 6 per R63 Q1 and the task's
  own "Do not" list.
- **`IpcErrorKind` additive-only.** No new variant added by this task; the
  three new commands map errors through the existing `From<idl_transport::TransportError>
  for IpcError` impl (untouched by this diff) and the existing
  `IpcErrorKind::NotFound` variant (used elsewhere already, e.g.
  `download_via`'s unknown-file-name path) — no existing variant's name,
  discriminant, or other match arm touched.
- **Generic `_via` over `BleTransport` with `StubBle`.** `connect_device_via`/
  `disconnect_device_via`/`device_status_via` are all generic over `T:
  BleTransport`, exercised against `StubBle` in every new test, never the
  concrete `BtleplugBle` — matches this module's established idiom
  (`connect_via`, `scan_via`, etc.). `StubBle`'s extensions (`status_override`,
  `Arc`-wrapped `connect_calls`/`disconnect_calls` counters) are additive to
  the existing struct and don't change any other test's behaviour (defaults
  preserve prior semantics: `status_override: None` falls through to the
  pre-existing `wifi_on_reads` queue logic).
- **Test coverage vs. the brief's enumerated list.** All seven behaviours the
  brief calls for are present: insert+return on success, replace-on-second-call,
  disconnect removes+calls stub once, disconnect-when-absent is a no-op,
  managed-read skips connect/disconnect, unmanaged-read does
  connect+read+disconnect, and the `From` mapping test (plus a second `From`
  test for the all-`None`/default case, going beyond the brief's list, a
  reasonable addition).
- **CLAUDE.md §4.** Every new test has `// Arrange` / `// Act` / `// Assert`
  with blank lines between blocks; names follow `thing — condition — result`
  (e.g. `disconnect_device_via_unconnected_device_id_is_ok_noop`).
- **CLAUDE.md §5.** Doc comment present on every new public symbol
  (`SdState`, `GpsState`, `ImuState`, `DeviceStatus` and all fields,
  `connect_device`, `disconnect_device`, `device_status`, `Connections`);
  `battery_pct`/`hr_battery_pct` documented as percent; no `Err(String)`; no
  unexplained `.unwrap()` on production-path data (the two `.lock().unwrap()`
  calls on `std::sync::Mutex` are the standard non-poisoning-recoverable
  idiom already used elsewhere in this file, e.g. existing `Hashes`/`Watchers`
  state, not new risk introduced here).
- **No reformatting.** Diff is additive/surgical; only the module doc
  comment's connection-lifetime paragraph was rewritten (expected, since this
  task supersedes its claim), no unrelated whitespace/import churn.
- **Repo hygiene.** Both commits are single-line messages, no AI attribution
  trailer. `git show --stat` for both commits lists exactly the files the
  brief's file list names (rust: `commands/device.rs`, `state.rs`, `lib.rs`;
  app: `src-tauri/src/lib.rs`, one line, `+1` insertion only, matching the
  brief's specified `.manage(...)` call verbatim). No `docs/` file touched.
  `Cargo.lock` not present in either diff.
- **`app/src-tauri/src/lib.rs` diff.** Exactly one added line —
  `app.manage(idl_rs_tauri::state::Connections(std::sync::Mutex::new(std::collections::HashMap::new())));`
  — placed alongside the existing three `.manage()` calls in `.setup()`,
  matching the brief's exact required line and placement. No file under
  `app/src/` touched (confirmed via `git show --stat`).
- **Registration in `lib.rs`.** `connect_device`, `disconnect_device`,
  `device_status` added to `handler()`'s command list beside `ble_scan`/
  `ble_connect`, consistent with how prior task groups registered commands.

## Verdict rationale

The implementation is correct against C3 §3.8: the `DeviceStatus` DTO and its
three enums mirror the transport types field-for-field and value-for-value
with matching nullability, the `Connections` map shape matches the plan
exactly, the `Send` guard is a real compile-time assertion, the "replace on
second connect" and "disconnect-of-absent-is-a-no-op" behaviours match C3's
text and the brief's own prescribed approach, the outer lock is never held
across an `await`, the three existing per-call commands are correctly left
untouched (matching C3's precise scope for which commands use the managed
link), no `IpcErrorKind` variant was added or altered, tests are named and
structured per CLAUDE.md §4, and the app-worktree commit is exactly the one
line specified. The one thing worth surfacing is not a defect in this task's
work but a gap the brief's prescribed design leaves open: a superseded
connection is dropped, not explicitly `.disconnect()`'d, and whether
`btleplug`'s `Drop` actually tears down the GATT link at the hardware level
is unverified from this diff alone — worth a lead decision on whether to
require an explicit disconnect before replacement, not a fix owed by this
task's implementer, who followed the brief's prescribed approach and
documented it exactly as required.

VERDICT: CLEAN
