# L8w Task 6 — implementer brief (Device group: managed connection + `device_status`, C3 §3.8)

You are the implementer for L8w Task 6: a new `state::Connections` managed
value holding live BLE links keyed by `device_id`, plus `connect_device`,
`disconnect_device`, and `device_status`. TDD, ONE commit (rust worktree),
then report.

## GATE — verify before opening the worktree

Same gate as every L8w task:
```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. If either fails, STOP and report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
  branch `wave2-l8w-write-amendment`. Build on Tasks 1–5's commits if already
  present.
- `app/src-tauri` worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l8w-write-amendment`
  — this task adds exactly one `.manage(...)` call to `app/src-tauri/src/lib.rs`.
  This is **not** the dialog-plugin build (Task 13); do not run `npm`/`tauri
  dev`/`cargo check -p idl-rs-tauri` from this worktree for this task — the
  rust-side `cargo check -p idl-rs-tauri` below is run from the rust
  worktree.
- Do NOT touch `docs/`. Do NOT push.
- **Files:** modify `tauri/src/commands/device.rs`, `tauri/src/state.rs`,
  `tauri/src/lib.rs` (rust worktree); `app/src-tauri/src/lib.rs` (app
  worktree, one line).

- Read first: `CLAUDE.md`; plan Task 6
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`);
  `runs/2026-09-05/lanes/l8w/BRIEF.md`/`review-STANDING.md`; C3 §3.8's
  `connect_device`/`disconnect_device`/`device_status` entries (quoted
  below); the landed `tauri/src/commands/device.rs` in full (you are adding
  to this file — its module doc comment's "no managed, cross-command BLE
  session" note is what this task supersedes; reuse its `StubBle` test
  double, its `_via`-function idiom, and its `From<idl_transport::X>` DTO
  mapping pattern for `DeviceStatus` exactly); `tauri/src/state.rs` in full
  (you are adding one more managed-state struct alongside `DataDir`/
  `Hashes`/`Watchers` — match their doc-comment style); `idl_transport::
  ble_transport::{BleTransport, BtleplugBle}` (`rust/transport/src/
  ble_transport.rs`) — `connect`/`disconnect` take `&mut self`, every other
  method takes `&self`; `BtleplugBle`'s fields (`adapter: Adapter`,
  `peripheral: Mutex<Option<Peripheral>>` — a `tokio::sync::Mutex`); `idl_transport::ble_status::DeviceStatus`
  (`rust/transport/src/ble_status.rs`) field for field — this is what the
  new `DeviceStatus` DTO mirrors; `app/src-tauri/src/lib.rs` (read-only
  outside your one added line — see below).

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; never override
with `-j`). While working: `cargo test -p idl-rs-tauri commands::device::`,
foreground, non-zero `passed`. No `cargo fmt`, no `cargo tarpaulin`, no
`cargo doc`. One cargo process at a time.

**`pub`-change check:** `cargo check -p idl-rs-tauri` (new managed state,
new commands). No `core` changes in this task, so `cargo check -p idl-rs-cli
--tests` is not required alone.

## A real design question — resolve before writing the state shape

`BtleplugBle::connect`/`disconnect` take `&mut self`; every read
(`read_status`, `send_command`, `read_config`, `push_config`) takes `&self`.
Holding one connection across separate Tauri commands (which each get their
own `tauri::State` borrow, not a persistent `&mut`) means the map value must
own a `BtleplugBle` behind something `Send`-safe. The plan's own
recommendation, unless you find otherwise:

```rust
pub struct Connections(pub std::sync::Mutex<std::collections::HashMap<String, std::sync::Arc<tokio::sync::Mutex<BtleplugBle>>>>);
```

A command clones the `Arc` out of the outer `std::sync::Mutex` (a cheap,
short critical section), drops the outer lock, then `.lock().await`s the
inner `tokio::sync::Mutex` across its own awaits.

**Before committing to this shape, verify `BtleplugBle: Send`** with a
one-line scratch check (delete it before committing, or leave it as a
`#[cfg(test)]` compile-time assertion if you prefer a permanent guard):
```rust
fn assert_send<T: Send>() {}
let _ = assert_send::<idl_transport::ble_transport::BtleplugBle>;
```
`btleplug::platform::{Adapter, Peripheral}` are the two field types inside
`BtleplugBle` (`adapter: Adapter`, `peripheral: Mutex<Option<Peripheral>>` —
already a `tokio::sync::Mutex`, itself `Send` whenever its content is). If
this check fails to compile, **stop and report to the lead** rather than
picking a workaround (CLAUDE.md §1) — this would mean the shape above is
unusable and the state design needs a lead ruling, not an implementer
guess.

## Interfaces (C3 §3.8, quoted)

> **`connect_device(device_id: string)` / `disconnect_device(device_id: string)`**
> `connect_device` returns `ConnectionInfo` and leaves the BLE link **open**,
> held in a new `state::Connections` map, registered in `app/src-tauri`'s
> `.setup()` beside `DataDir`/`Hashes`/`Watchers`. `disconnect_device` tears
> it down and returns `void`; disconnecting an unconnected device is a
> no-op, not an error. `ble_connect` stays registered unchanged (an added
> command, not a changed signature). `device_status`/`device_control`/
> `pull_config` use the managed link when one exists for `device_id` and
> otherwise connect-act-disconnect.
> Errors: `ble`, `not_found` (device not discoverable), `internal`.
>
> **`device_status(device_id: string)`**
> One read of SPEC §7.3's status characteristic, mirroring
> `idl_transport::ble_status::DeviceStatus` field for field with
> `#[serde(rename_all = "snake_case")]` on its three enums:
> ```ts
> interface DeviceStatus {
>   wifi_on: boolean | null; logging: boolean | null; battery_pct: number | null;
>   sd: "ok" | "full" | "error" | "absent" | null;
>   gps: "fix" | "no_fix" | "absent" | null;
>   imu: "ok" | "partial" | "error" | "absent" | null;
>   firmware: string | null; ota_pending_verify: boolean;
>   hr: string | null; hr_battery_pct: number | null;
> }
> ```
> Every field except `ota_pending_verify` is nullable, `null` meaning "the
> device did not report this line" — never zero.
> Errors: `ble`, `not_found`, `internal`.

```rust
// state.rs — new
pub struct Connections(pub std::sync::Mutex<std::collections::HashMap<String, std::sync::Arc<tokio::sync::Mutex<BtleplugBle>>>>);

// commands/device.rs — new
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SdState { Ok, Full, Error, Absent }
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GpsState { Fix, NoFix, Absent }
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ImuState { Ok, Partial, Error, Absent }

#[derive(Debug, Clone, serde::Serialize)]
pub struct DeviceStatus {
    pub wifi_on: Option<bool>,
    pub logging: Option<bool>,
    pub battery_pct: Option<u8>,
    pub sd: Option<SdState>,
    pub gps: Option<GpsState>,
    pub imu: Option<ImuState>,
    pub firmware: Option<String>,
    pub ota_pending_verify: bool,
    pub hr: Option<String>,
    pub hr_battery_pct: Option<u8>,
}
impl From<idl_transport::ble_status::DeviceStatus> for DeviceStatus { /* field for field, three enum From impls */ }

#[tauri::command]
pub async fn connect_device(connections: tauri::State<'_, Connections>, device_id: String) -> Result<ConnectionInfo, IpcError>;
#[tauri::command]
pub async fn disconnect_device(connections: tauri::State<'_, Connections>, device_id: String) -> Result<(), IpcError>;
#[tauri::command]
pub async fn device_status(connections: tauri::State<'_, Connections>, device_id: String) -> Result<DeviceStatus, IpcError>;
```

`SdState`/`GpsState`/`ImuState` need their own `From<idl_transport::ble_status::X>`
impls, matching value-for-value (the transport enums are not `serde`-derived
— write these DTOs fresh in `commands/device.rs`, the same pattern
`ConnectionInfo`/`DeviceFile` in this file already use for a transport type
crossing into a serializable command DTO).

## Key logic

- **`connect_device`**: if `device_id` already has a map entry, this task's
  choice (document it, C3 does not fix this edge case): re-run `connect()`
  on a *new* `BtleplugBle` and replace the map entry (simpler than trying to
  read a still-fresh `ConnectionInfo` off the existing connection) —
  otherwise, build `BtleplugBle::new()`, `.connect(&device_id)`, insert
  `Arc::new(tokio::sync::Mutex::new(ble))` into the map under the outer
  lock, return `ConnectionInfo::from(...)`.
- **`disconnect_device`**: remove the entry from the map (drop the outer
  lock immediately after taking the `Arc` out); if present, `.lock().await`
  the inner mutex and call `.disconnect()` — **absent is a no-op, `Ok(())`,
  never `not_found`** (C3's own wording, quoted above).
- **`device_status`**: if a managed entry exists for `device_id`, lock it
  and `.read_status()`; otherwise `BtleplugBle::new()` + `.connect()` +
  `.read_status()` + `.disconnect()` (the "otherwise connect-act-disconnect"
  degrade path C3 names for every command in this cluster) — reuse
  `device.rs`'s existing connect-act-disconnect idiom (see `list_device_files`)
  rather than writing a new one.

## Tests (`_via`-suffixed functions against `StubBle`)

Extract transport-agnostic `_via` functions the same way this file already
does (`connect_via`, `scan_via`, …) — `connections: &Connections`/managed
lookups are exercised at the level the map operates, not through
`tauri::State`. Reuse this file's `StubBle` test double.

- `connect_device` inserts a new map entry and returns `ConnectionInfo`
  matching the stub's `connect_result`.
- `connect_device` called twice for the same `device_id` replaces the map
  entry (assert only one entry exists afterward, or assert the documented
  choice's specific behaviour).
- `disconnect_device` on a connected `device_id` removes the map entry and
  calls the stub's `disconnect` once.
- `disconnect_device` on an unconnected `device_id` is `Ok(())`, no error,
  map still has no entry for it.
- `device_status` with a managed connection reads status without
  connecting/disconnecting again (assert the stub's connect isn't called a
  second time, or track a call counter).
- `device_status` with no managed connection connects, reads, and
  disconnects (the stub's `disconnect_calls` counter increments).
- `DeviceStatus::from(idl_transport::ble_status::DeviceStatus { .. })` maps
  every field, including all three enums' every variant, and confirms every
  field but `ota_pending_verify` is nullable by construction (an `Option`
  wrapper, not a runtime check).

## The task, in order

- [ ] **Step 1: Confirm the gate**, open/reuse the worktree.
- [ ] **Step 2: `assert_send::<BtleplugBle>()`** scratch check — if it fails,
      STOP and report, do not proceed.
- [ ] **Step 3: Write failing tests.**
- [ ] **Step 4: Implement** `Connections` (`state.rs`), `DeviceStatus`/
      `SdState`/`GpsState`/`ImuState` + `From` impls, `connect_device`/
      `disconnect_device`/`device_status` + their `_via` cores
      (`commands/device.rs`).
- [ ] **Step 5: Register** the three commands in `lib.rs`'s `handler()`.
- [ ] **Step 6: `app/src-tauri/src/lib.rs`** — add
      `app.manage(idl_rs_tauri::state::Connections(std::sync::Mutex::new(std::collections::HashMap::new())));`
      alongside the three existing `.manage()` calls in `.setup()`. This is
      the one line this task adds to the app worktree; **no build is run for
      it in this task** (Task 13 is the lane's one real Tauri build) — just
      the edit, committed with the app worktree's own commit.
- [ ] **Step 7: Test** — `cargo test -p idl-rs-tauri commands::device::`,
      confirm non-zero `passed`.
- [ ] **Step 8: `cargo check -p idl-rs-tauri`** clean (rust worktree).
- [ ] **Step 9: Commit, rust worktree** — `git add tauri/src/commands/device.rs
      tauri/src/state.rs tauri/src/lib.rs` — message
      `tauri: managed BLE connection (state::Connections) + device_status (C3 3.8)`.
- [ ] **Step 10: Commit, app worktree** — `git add src/lib.rs` (relative to
      `app/src-tauri/`) — message
      `app: manage state::Connections alongside DataDir/Hashes/Watchers`.
      Two separate commits, rust worktree first, per the lane's two-repo
      convention.

## Do not

- Do not run `npm`/`tauri dev`/`tauri build` in this task — Task 13 owns
  the lane's one real Tauri build.
- Do not touch `app/src/` at all.
- Do not change `ble_connect`'s existing signature or behaviour — it stays
  registered, connect-act-disconnect, unchanged.
- Do not fabricate an `AckCode`/`device_rejected` mapping in this task —
  that is Task 7's `device_control`.
- Do not run `cargo test -p idl-rs -p idl-rs-cli`, `--workspace`, or a bare
  `cargo test`.

## Style / hygiene

Doc comment on every public symbol; units on numeric values (`battery_pct`:
percent, u8); A/A/A tests named `thing — condition — result`; match
`commands/device.rs`'s existing idiom and `StubBle` conventions exactly. No
`cargo fmt`.

## Spec discipline (say it out loud in your report)

"No spec change needed" — C3 §3.8 already specifies all three commands and
the managed-connection design; this task implements it as specified.

## Report back (concise)

Both commit hashes + `git show --stat` for each; the `assert_send::<BtleplugBle>()`
result (pass/fail, and what you did if it failed); the `cargo test -p
idl-rs-tauri commands::device::` result line with its `passed` count;
`cargo check -p idl-rs-tauri` result; which `connect_device`-called-twice
behaviour you implemented and why; confirmation `app/src-tauri/src/lib.rs`'s
diff is exactly the one `.manage()` line; confirmation no file under
`app/src/` was touched; anything ambiguous you resolved (say how) or that
needs a lead ruling (stop and report instead of guessing — CLAUDE.md §1).
