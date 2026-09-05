# L8w Task 7 — implementer brief (Device group: `device_control`, `pull_config`, C3 §3.8, R63)

You are the implementer for L8w Task 7: `device_control` (start/stop
logging, WiFi on/off, poll-until-transition, `device_rejected` kind added
but platform-limited per R63) and `pull_config` (BLE config read-back via
the landed FF06 reassembly loop). TDD, ONE commit, then report.

**Depends on Task 6** (this task's `_via` functions use the managed
`Connections` state, connect-act-disconnect otherwise). Build on Task 6's
commit if present on the worktree; if Task 6 has not landed yet, implement
against `Connections` as Task 6's brief defines it and flag the ordering in
your report.

## GATE — same as every L8w task; verify before opening the worktree

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. If either fails, STOP and report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
  branch `wave2-l8w-write-amendment`.
- Do NOT touch `docs/`. Do NOT push.
- **Files:** modify `tauri/src/commands/device.rs`, `tauri/src/error.rs`,
  `tauri/src/lib.rs`.

- Read first: `CLAUDE.md`; plan Task 7 and its "Lead rulings 2026-09-05
  (R63)" section at the bottom
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`);
  `runs/2026-09-05/lanes/l8w/BRIEF.md`/`review-STANDING.md`; ruling R63 in
  `runs/2026-09-03/decisions.md` ("(1) `device_rejected` ships as specified,
  mapped only where the transport surfaces an `AckCode`, never faked from
  error text, `TODO(idl0)` at the transport boundary"); C3 §2's
  `device_rejected` entry and §3.8's `device_control`/`pull_config` entries
  (quoted below); `idl_transport::ble_control::{ControlCommand, AckCode}`
  (`rust/transport/src/ble_control.rs`) in full — `AckCode::from_byte` is
  pure and tested, but **nothing in the landed transport calls it**, see
  next paragraph; `idl_transport::ble_transport::BtleplugBle::send_command`'s
  doc comment (`rust/transport/src/ble_transport.rs`, the block just above
  its `send_command` impl) — read it verbatim: it states `btleplug`
  0.13.0's `Peripheral::write` returns `Result<()>` only, so on Windows
  (`winrtble`) the real SPEC §7.2 ACK byte is **never read off the wire** —
  `Ok(())` is the only success signal, every failure (including a device's
  deliberate mutex/precondition refusal) surfaces as a generic
  `TransportErrorKind::Ble` with `btleplug`'s own coarse text; `read_config`'s
  doc comment (same file) and `idl_transport::ble_config::reassemble_config_reads`
  (`rust/transport/src/ble_config.rs`) — the FF06 chunk-concatenation logic
  `pull_config` drives; the landed `tauri/src/commands/device.rs`'s
  `switch_to_wifi_mode`/`WIFI_ON_POLL_ATTEMPTS`/`WIFI_ON_POLL_INTERVAL` — the
  exact poll-until-flag pattern `device_control` reuses; `tauri/src/error.rs`
  in full — you add one variant (`DeviceRejected`) to `IpcErrorKind`, no
  existing variant touched.

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; never override
with `-j`). While working: `cargo test -p idl-rs-tauri commands::device::`,
foreground, non-zero `passed`. No `cargo fmt`, no `cargo tarpaulin`, no
`cargo doc`. One cargo process at a time.

**`pub`-change check:** `cargo check -p idl-rs-tauri` only. The new
`IpcErrorKind::DeviceRejected` variant is additive per C3 §5, lives entirely
in `idl-rs-tauri` — no `cargo check -p idl-rs-cli --tests` needed.

## R63's ruling, confirmed against the landed code — read before writing anything

R63 rules: "`device_rejected` ships as specified, mapped only where the
transport surfaces an `AckCode`, never faked from error text, `TODO(idl0)`
at the transport boundary." Having read `send_command`'s doc comment above,
this is confirmed **unreachable in practice on this platform today** —
`send_command` returns `Result<(), TransportError>`, never an `AckCode`, so
there is no call site in this task's own code that can construct
`IpcErrorKind::DeviceRejected` from a real byte. Implement exactly this:

- Add `IpcErrorKind::DeviceRejected` to `error.rs` with a doc comment citing
  C3 §2's `device_rejected` wording and this platform limitation.
- In `commands/device.rs`, at `device_control`'s `send_command` call site,
  add a `// TODO(idl0):` comment (not a bare `// TODO`) stating: once
  `idl-transport` exposes a real `AckCode` from `send_command` (a future
  transport-lane task, out of this lane's scope per CLAUDE.md §7 — this
  lane does not change `idl_transport`'s public trait), map
  `AckCode::{Busy, Precondition, WriteNotPermitted}` to
  `IpcError::with_detail(IpcErrorKind::DeviceRejected, ..., json!({"ack": ...}))`
  here; until then, every `send_command` failure maps to `IpcErrorKind::Ble`
  via `IpcError::from`.
- **Do not** parse `TransportError.message` substrings to reconstruct an
  `AckCode` — CLAUDE.md §1/the plan are explicit this is a Critical finding
  if found in review.

## C3 §3.8 (quoted — the two entries this task implements)

> **`device_control(device_id: string, command: "start_recording" |
> "stop_recording" | "wifi_on" | "wifi_off")`**
> Return: `DeviceStatus` — the post-transition status. `command` maps onto
> `ControlCommand`: `start_recording` → `StartLogging` (0x03), `stop_recording`
> → `StopLogging` (0x04), `wifi_on` → `WifiOn` (0x01), `wifi_off` → `WifiOff`
> (0x02). SPEC §7.2's ACK `0x00` means "accepted and dispatched", not
> "completed" — the command writes, then polls status until the transition
> is observed or a bounded timeout expires, the same pattern
> `switch_to_wifi_mode` already uses. A timeout returns the **last status
> read** rather than failing.
> Errors: `ble`, `not_found`, `invalid_argument` (unknown `command` string),
> `device_rejected`, `internal`.
>
> **`pull_config(device_id: string)`**
> Return: `string` — the device's live `idl0_config.json`, symmetric with
> `push_config`'s argument. Drives `ControlCommand::ConfigReadBegin` (0x09)
> and reassembles chunks through `ble_config::reassemble_config_reads`.
> Errors: `ble`, `not_found`, `config` (device returned something
> unparseable), `internal`.

## Interfaces

```rust
#[tauri::command]
pub async fn device_control(
    connections: tauri::State<'_, Connections>,
    device_id: String,
    command: String,
) -> Result<DeviceStatus, IpcError>;

#[tauri::command]
pub async fn pull_config(
    connections: tauri::State<'_, Connections>,
    device_id: String,
) -> Result<String, IpcError>;
```

## Key logic — `device_control`

- Map `command` to `ControlCommand`: `"start_recording" => StartLogging`,
  `"stop_recording" => StopLogging`, `"wifi_on" => WifiOn`,
  `"wifi_off" => WifiOff`; any other string is `invalid_argument` before any
  transport call.
- Resolve the connection: reuse the managed entry if `Connections` has one
  for `device_id` (as Task 6 shapes it — clone the `Arc`, lock the inner
  `tokio::sync::Mutex`), else `BtleplugBle::new()` + `.connect()`, remembering
  to `.disconnect()` at the end only in the connect-act-disconnect case
  (never disconnect a managed connection this command didn't open).
- `send_command(cmd)`, mapped via `IpcError::from` (`Ble` today, per the
  R63 note above).
- Poll `read_status` up to a bounded attempt count/interval, watching the
  field the transition should flip: `logging` for start/stop (`Some(true)`
  for start, `Some(false)` for stop), `wifi_on` for wifi_on/wifi_off. Reuse
  `WIFI_ON_POLL_ATTEMPTS`/`WIFI_ON_POLL_INTERVAL` if they fit every
  transition, or add sibling constants — implementer's call, document which.
- Return the **last status read** (mapped to the `DeviceStatus` DTO Task 6
  added) whether or not the expected flip was observed within the timeout —
  this command never times out to an error (unlike `switch_to_wifi_mode`,
  which does; note the divergence in a doc comment since it is deliberate
  per C3's own wording, not a bug).

## Key logic — `pull_config`

- Resolve the connection the same way as `device_control` (managed or
  connect-read-disconnect).
- `.read_config()` — already implemented, drives `ConfigReadBegin` + the
  FF06 loop internally.
- `String::from_utf8(bytes)` — invalid UTF-8 maps to `internal` (a local
  decode failure, not a device-side rejection — `config` is reserved for
  "the device returned something unparseable" per C3's own wording, which
  this task reads as the SPEC §7.2 `0x81` "no config file" case
  `read_config`'s own doc comment already maps to `Ble` today — **do not**
  invent a text-matching heuristic to split that out into `config`; leave
  it mapped as `read_config` already maps it, `ble`, and note in your report
  that `config`'s row is, like `device_rejected`, not reachable from this
  command with the transport as landed).

## Tests (`_via`-suffixed functions against `StubBle`, reusing `commands/device.rs`'s test module)

- `device_control` maps every one of the four `command` strings to the
  correct `ControlCommand` (assert on the stub's recorded last command, or
  add a call-recording field to `StubBle` if it doesn't already track
  which `ControlCommand` was sent).
- `device_control` with an unrecognised `command` string → `invalid_argument`,
  `send_command` never called.
- `device_control` polls until the expected status field flips, then
  returns that status (generalise the existing `wifi_on_reads`-style queue
  to whichever field the test's chosen command should flip — e.g. a
  `logging_reads: VecDeque<Option<bool>>` for start/stop).
- `device_control` exhausts its poll budget without the field flipping →
  returns `Ok(DeviceStatus)` (the **last** status read), not an error.
- `device_control`'s `send_command` failure maps to `IpcErrorKind::Ble`.
- `pull_config` against a `StubBle` whose `read_config` returns known bytes
  → the exact string back.
- `pull_config` with invalid-UTF-8 bytes from `read_config` → `internal`.
- `pull_config`'s `read_config` transport failure → `ble` (per the note
  above, not `config`).

## The task, in order

- [ ] **Step 1: Confirm the gate**, open/reuse the worktree.
- [ ] **Step 2: Add `IpcErrorKind::DeviceRejected`** to `error.rs` with its
      doc comment (see above) — additive only, do not touch any existing
      variant.
- [ ] **Step 3: Write failing tests.**
- [ ] **Step 4: Implement** `device_control`/`pull_config` + their `_via`
      cores in `commands/device.rs`, including the `// TODO(idl0):` comment
      at the `send_command` call site.
- [ ] **Step 5: Register** both commands in `lib.rs`'s `handler()`.
- [ ] **Step 6: Test** — `cargo test -p idl-rs-tauri commands::device::`,
      confirm non-zero `passed`.
- [ ] **Step 7: `cargo check -p idl-rs-tauri`** clean.
- [ ] **Step 8: Commit** — `git add tauri/src/commands/device.rs
      tauri/src/error.rs tauri/src/lib.rs` — message
      `tauri: device_control (poll-until-transition, R63) + pull_config (C3 3.8)`.

## Do not

- Do not parse `TransportError.message` text to synthesize an `AckCode` —
  Critical finding if found.
- Do not touch any existing `IpcErrorKind` variant, discriminant, or
  existing `From` impl arm.
- Do not add a timeout-errors-out behaviour to `device_control` — it always
  returns the last status read, per C3's explicit wording.
- Do not call `.disconnect()` on a connection this command did not itself
  open (i.e. a managed one from Task 6's `Connections` map).
- Do not touch `rust/core/src` or `rust/transport/src` — everything needed
  is already landed; changing `idl_transport`'s trait is a cross-lane change
  CLAUDE.md §7 forbids from this lane.
- Do not run `cargo test -p idl-rs -p idl-rs-cli`, `--workspace`, or a bare
  `cargo test`.

## Style / hygiene

Doc comment on every public symbol; `// TODO(idl0):` never bare `// TODO`;
A/A/A tests named `thing — condition — result`; match `commands/device.rs`'s
existing idiom. No `cargo fmt`.

## Spec discipline (say it out loud in your report)

"No spec change needed" — C3 §3.8 and §2's `device_rejected` row already
specify both commands and the kind; ruling R63 confirms the platform-limited
implementation as specified, no amendment needed.

## Report back (concise)

Commit hash + `git show --stat`; the `cargo test -p idl-rs-tauri
commands::device::` result line with its `passed` count; `cargo check -p
idl-rs-tauri` result; confirmation `device_rejected` is genuinely
unreachable from this task's own code today (quote the `send_command`
signature you verified against) and that the `TODO(idl0)` is in place;
which poll constants you used for `logging`'s transition (reused or new,
and why); the `config` vs `ble` mapping choice for `pull_config`'s "no
config file" case, flagged for lead confirmation; anything ambiguous you
resolved (say how) or that needs a lead ruling (stop and report instead of
guessing — CLAUDE.md §1).

## Lead ruling 2026-09-05 (R64.3)

`pull_config`: a device-reported config error on read (0x81) maps to the `config` kind with the device's reason in `message`; transport failures stay `ble`. `device_rejected` is mapped only where an `AckCode` is actually surfaced (R63.1).

## Lead ruling 2026-09-05 (review-task6 Note) -- explicit disconnect before replacement

First step of this task, in `commands/device.rs`: when `connect_device` replaces an existing entry for the same `device_id`, call `.disconnect()` on the superseded transport before dropping it (best effort: a disconnect error is logged and does not fail the new connect), because whether btleplug's `Drop` tears down the GATT link is unverified. One `StubBle` test: the superseded stub records a disconnect call. Then Task 7 proper.
