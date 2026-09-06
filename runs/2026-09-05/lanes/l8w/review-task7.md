# L8w Task 7 review — `device_control` + `pull_config` (C3 §3.8), `IpcErrorKind::DeviceRejected`

**Scope:** rust worktree
`C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
branch `wave2-l8w-write-amendment`, commit
`a23553ae29e65e664732ba2eb282fb5281135481` (`tauri/src/commands/device.rs`,
`tauri/src/error.rs`, `tauri/src/lib.rs`), built on Task 6's `9241405`.
Out of scope: any commit after `a23553a` (a Task 8 implementer may be
working on the branch concurrently per the dispatch; `git status` showed a
clean working tree and no such commit was present at review time).

## Test command and result

Not re-run (CLAUDE.md §8 / L8w standing brief: reviewers do not build or
test). Verified statically instead: `grep -c "#\[test\]\|#\[tokio::test"
tauri/src/commands/device.rs` returns **33**, matching the implementer's
reported `cargo test -p idl-rs-tauri commands::device::` → 33 passed exactly
(Task 6 landed 24; this commit's diff adds 9 new tests — 3 for
`device_control`'s command-mapping table (parametrised over 4 cases in one
`#[tokio::test]` function, counted as 1), poll-until-flip, poll-exhausted,
send_command failure, plus 3 for `pull_config`, plus the explicit-disconnect
test — matching 24 + 9 = 33). Each new test was traced against the landed
`StubBle`/`ConnectionMap<T>` types and would fail if its named behaviour
broke (see Checks performed). `cargo check -p idl-rs-tauri` reported clean
by the implementer — the diff introduces no new external dependency, only
additive `pub` surface and one additive enum variant, consistent with a
clean check; not independently reproducible without building.

## Findings

No Critical or Important findings.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Note | `tauri/src/commands/device.rs:323` | The best-effort disconnect failure on a superseded connection is logged via `eprintln!`. The crate has no logging dependency (`log`/`tracing` absent from `tauri/Cargo.toml`), and Task 6's existing code has no logging precedent to diverge from either — this is a new (if small) footprint. Acceptable given the constraint; no in-scope alternative exists without adding a dependency, which is out of this task's scope. | None needed now; if a `tracing` dependency is ever added to this crate for another reason, fold this call in then. |

## Checks performed (all pass)

- **R63/R63.1 compliance.** `DeviceRejected` is additive only — `git show
  a23553a -- tauri/src/error.rs` shows a pure insertion at the end of the
  enum, no existing variant's name, discriminant, or `From` arm touched. Its
  doc comment (`error.rs:116-127`) cites C3 §2, ruling R59/R63, and states
  the platform limitation verbatim, matching the brief's required wording.
  The `// TODO(idl0):` comment (not bare `// TODO`) sits at the actual
  `send_command` call site inside `send_command_and_poll_via`
  (`device.rs:519-528`), the only place in this task's code that could ever
  construct `DeviceRejected`, and states the exact future mapping
  (`AckCode::{Busy, Precondition, WriteNotPermitted}` →
  `IpcErrorKind::DeviceRejected`) without implementing it — correct, since
  `send_command` returns `Result<(), TransportError>` today (verified against
  `idl_transport::ble_transport::BtleplugBle::send_command`'s signature) and
  never surfaces a raw `AckCode`.
- **No message-text parsing.** `grep -n "\.contains(\|\.starts_with("
  tauri/src/commands/device.rs` finds only two hits, both in an unrelated
  test fixture (`download_via`'s blob-shard test asserting a SHA-256 digest
  string starts with `"ab"`) — nothing matches on a `TransportError`/`IpcError`
  message anywhere. `AckCode` is referenced only inside the `TODO(idl0)`
  comment text, never imported or called.
- **`device_control` C3 §3.8 conformance.** Signature matches the C3-quoted
  interface exactly (`device_id: String, command: String) ->
  Result<DeviceStatus, IpcError>`). All four command strings map to the
  documented `ControlCommand` bytes
  (`start_recording`→`StartLogging`, `stop_recording`→`StopLogging`,
  `wifi_on`→`WifiOn`, `wifi_off`→`WifiOff`), checked in
  `control_command_and_expectation` before any transport call; an unknown
  string is `invalid_argument` and `send_command` is never invoked
  (`device_control_str_via_unrecognised_command_is_invalid_argument_before_any_transport_call`
  asserts this by construction — `new_ble` errors out if actually called).
  Poll semantics: writes the command, then polls `read_status` up to the
  shared `WIFI_ON_POLL_ATTEMPTS`(10)/`WIFI_ON_POLL_INTERVAL`(200 ms) budget
  — ruling R71 explicitly accepts this shared budget ("no distinct figure
  exists"). A budget exhaustion returns `Ok(DeviceStatus)` with the last
  status read, never an error, matching C3's explicit wording; test
  `device_control_via_exhausts_poll_budget_without_flip_returns_ok_with_last_status_read`
  asserts exactly this. `send_command` failure maps to `Ble` via the
  existing blanket `From<TransportError>` (test present).
- **`pull_config` C3 §3.8 conformance.** Signature matches
  (`device_id: String) -> Result<String, IpcError>`). Resolves the managed
  connection the same way `device_control_via`/`device_status_via` do
  (checked: `connections.lock().unwrap().get(device_id).cloned()` then a
  connect-read-disconnect fallback). `read_config()` bytes decoded via
  `String::from_utf8`; invalid UTF-8 maps to `Internal`
  (`pull_config_via_invalid_utf8_bytes_maps_to_internal`), matching the
  brief's ruling that this is a local decode failure, not a device-side
  rejection. Ruling **R71** (found by this task, confirmed in
  `runs/2026-09-03/decisions.md`) already adjudicates that `read_config`
  routes every failure including SPEC §7.2's `0x81` "no config file" ack
  through `ble_error()`'s `TransportErrorKind::Ble`, so `config` is
  unreachable from this command as landed and Task 7 correctly ships as
  pass-through (`ble`, not `config`) — the doc comment on `pull_config_via`
  (`device.rs:590-611`) states this accurately and the test
  `pull_config_via_transport_failure_maps_to_ble_not_config` asserts the
  landed behaviour, not the aspirational R64.3 one. The transport-side fix
  is correctly deferred to Task 7b, out of this task's file list (`rust/
  transport/` untouched, confirmed by `git show --stat`).
- **Explicit-disconnect-before-replacement ruling (review-task6 Note).**
  Confirmed via `git show a23553a -- tauri/src/commands/device.rs` that this
  commit itself (not Task 6's `9241405`) adds the explicit teardown to
  `connect_device_via` (`device.rs:311-327`), exactly as the Task 7 brief's
  "first step of this task" instructs and as R71 records ("The
  explicit-disconnect ruling from review-task6 landed in the same commit" —
  i.e. `a23553a`). The diff captures the superseded `Arc` from
  `HashMap::insert`, drops the outer `std::sync::Mutex` guard before any
  `.await`, then calls `.disconnect()` on the *old* connection only,
  logging (not propagating) a failure via `eprintln!`. Test
  `connect_device_via_replacing_an_existing_entry_disconnects_the_superseded_stub`
  asserts the superseded stub's `disconnect_calls == 1` and the new stub's
  `disconnect_calls == 0` — exactly the assertion the dispatch called for.
- **No lock held across an `.await`.** Traced `device_control_via` and
  `pull_config_via`: both take `connections.lock().unwrap().get(device_id)
  .cloned()` as a single synchronous statement whose `std::sync::Mutex`
  guard is a temporary dropped at the end of that statement, before the
  subsequent `ble.lock().await` / `.read_status().await` /
  `.read_config().await` calls. Matches Task 6's established pattern.
- **`Connections` state invariants from Task 6 still hold.** This commit
  adds no new mutation of `state::Connections`'s map beyond what
  `device_control_via`/`pull_config_via` read (never insert/remove); the
  "never disconnect a managed connection this command didn't open" rule is
  respected — both functions only call `.disconnect()` in their `else`
  (connect-act-disconnect) branch, never on the `managed` branch's `Arc`.
- **Managed vs. unmanaged resolution symmetry.** Both `device_control_via`
  and `pull_config_via` resolve the connection identically to
  `device_status_via` (Task 6): managed entry used without reconnect if
  present, otherwise `new_ble()` → connect → act → disconnect. No drift
  between the three functions' resolution logic.
- **CLAUDE.md §4.** Every new test has `// Arrange` / `// Act` / `// Assert`
  with blank lines between blocks (the parametrised
  `device_control_str_via_maps_every_command_string_to_the_correct_control_command`
  test collapses them to one `// Arrange / Act / Assert` comment for its
  loop body, documented as intentional in the comment itself — a reasonable,
  disclosed exception, not a silent gap). Names follow `thing — condition —
  result` throughout (e.g.
  `pull_config_via_transport_failure_maps_to_ble_not_config`). Tests run
  against `StubBle`, never real BLE.
- **CLAUDE.md §5.** Doc comments present on every new public symbol
  (`DeviceRejected`, `device_control`, `pull_config`, and the private
  `_via`/helper functions, which this module already documents as a matter
  of house style even though not `pub`). No `Err(String)` anywhere in the
  diff. No unexplained `.unwrap()` on production-path data — the
  `.lock().unwrap()` calls are the same non-poisoning-recoverable idiom
  Task 6 already established and this review already accepted.
- **No reformatting.** Diff is additive/surgical to the three files the
  brief's file list names; no unrelated whitespace/import churn.
- **Repo hygiene.** Single-line commit message, no AI attribution trailer
  (`git show -s --format="%B" a23553a`). `git show --name-only a23553a`
  lists exactly `tauri/src/commands/device.rs`, `tauri/src/error.rs`,
  `tauri/src/lib.rs` — matching the brief's file list. No `docs/` file
  touched. No `Cargo.lock` change. `rust/core/`, `rust/transport/`
  untouched (confirmed).
- **Registration in `lib.rs`.** `commands::device::device_control` and
  `commands::device::pull_config` added to `handler()`'s command list
  immediately after `device_status`, consistent with the group's ordering.
- **CHANGELOG/TASKS.md.** Correctly not touched here — the lane's BRIEF.md
  reserves both for Task 14's wrap-up, and Task 7's own report already flags
  the two scope limitations (`device_rejected` unreachable, `pull_config`'s
  `config`-vs-`ble` mapping) for that later bullet, per R71's confirmation.

## Verdict rationale

The implementation matches C3 §3.8 field-for-field and behaviourally: both
commands' signatures, error-kind sets, and poll-until-transition semantics
are correct, `DeviceRejected` is purely additive with a correctly-placed
`// TODO(idl0):` at the one real call site, no `AckCode`/message-text
parsing exists anywhere, the shared 10×200ms poll budget and the
pass-through `config`→`ble` mapping for `pull_config` are both already
adjudicated acceptable by ruling R71 (written after this same commit was
reviewed for that specific question), the explicit-disconnect-before-
replacement behaviour is present and correctly tested, no lock is held
across an `.await`, and hygiene/testing/doc-comment conventions all hold.
The only item worth recording is a Note (the `eprintln!` for a best-effort
log, acceptable given the crate has no logging dependency); it does not
affect correctness or require a fix.

VERDICT: CLEAN
