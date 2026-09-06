# L11 Task 12 — tauri: the sync commands and lifecycle

The thin glue: five commands, the server and discovery in managed state, and
the auto-trigger. Last task of the lane. TDD, ONE commit.

**Depends on Task 11.** **Full suite runs at the end of this task** (twelfth
task, and the lane gate follows).

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l11-sync"
git merge-base --is-ancestor 52efba8 HEAD && echo GATE-OK
grep -c "sync::loopback\|loopback_tests" transport/src/sync/mod.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md` §2 (tauri is thin) and §7 (a command signature change updates
`app/src/ipc/` and C3 together — here C3 was updated first, in Task 1);
Task 1's landed C3 §3.9 text; `tauri/src/commands/device.rs` (the
`tauri::ipc::Channel<Progress>` pattern and the `IpcError` mapping),
`tauri/src/commands/mod.rs` (registration), `tauri/src/state.rs` and
`tauri/src/paths.rs` (`DataDir`, `resolve_data_dir`), `tauri/src/error.rs`
(the C3 §2 error shape and how `TransportError` maps into it);
`app/src/ipc/sync.ts` — the TS side already exists and must not need editing
beyond the post-lane shell task.

## Where

- **Files:** `tauri/src/commands/sync.rs` (new), `tauri/src/commands/mod.rs`,
  `tauri/src/state.rs`, `tauri/src/lib.rs`, `CHANGELOG.md`.

## Interfaces

```rust
#[tauri::command] pub async fn sync_status(...) -> Result<SyncStatusDto, IpcError>;
#[tauri::command] pub async fn sync_now(peer_id: String,
                     progress: tauri::ipc::Channel<Progress>) -> Result<SyncResultDto, IpcError>;
#[tauri::command] pub async fn pair_peer(code: String) -> Result<PeerStatusDto, IpcError>;
#[tauri::command] pub async fn start_pairing(...) -> Result<PairingOfferDto, IpcError>;
#[tauri::command] pub async fn unpair_peer(peer_id: String) -> Result<(), IpcError>;

/// Managed state: the running server, the browse task's latest peer set,
/// the pairing state, and the loaded peer list.
pub struct SyncState { /* … */ }
```

DTO field names come from C3 §3.9 as Task 1 amended it, matched against
`app/src/ipc/sync.ts` field for field. A mismatch is a bug in this task, not
in the TS.

## Key logic

- **Lifecycle**: on setup, load the peer file, start `SyncServer` and
  `browse()` on Tauri's runtime, and keep both in `SyncState`. A discovery
  failure is surfaced through `sync_status` (peers simply show offline),
  never a startup crash.
- **`sync_status`** reports every paired peer with `online` set from the
  latest browse results, plus `last_sync_utc_ms`. Errors map to kind `sync`
  or `io` per C3 §2.
- **`sync_now`** resolves the peer's address from the browse set — an unknown
  or unseen `peer_id` is `not_found` — then calls `sync_with_peer`, forwarding
  each `SyncProgress` as C3's `Progress` on the channel, and returns the
  `SyncResult` fields. It also triggers a **catalog re-index of the sessions
  the run touched** after the transfer completes, since sync writes files the
  catalog does not know about. Do not rebuild the whole catalog.
- **`pair_peer`** is the *initiating* side: it takes the code the user typed
  and calls `POST /pair` on the peer that offered it. `start_pairing` is the
  *offering* side: mint an offer and return the code and expiry.
- **Auto-trigger**: when `browse()` yields a peer that is paired, online and
  protocol-compatible, emit the `peer_appeared` event and start a sync — at
  most one per peer per 60 s, never while a manual sync for that peer is
  running, and never for an incompatible peer (PLAN Q9). That decision is a
  **pure function** taking the peer, the last-sync time and the running set,
  and it is unit-tested; the async task only calls it.
- The peer file path comes from `app_config_dir()`, never from `<data>`
  (PLAN Q7). `<data>` comes from `DataDir` as every other command does.
- No sync logic in this file beyond routing — merging, diffing and installing
  are core's, the wire is transport's.

## Tests

- `should_auto_sync — an unpaired peer — no`.
- `should_auto_sync — a paired peer last synced 10 s ago — no`.
- `should_auto_sync — a paired peer last synced 90 s ago — yes`.
- `should_auto_sync — a peer with a running manual sync — no`.
- `should_auto_sync — an incompatible protocol_version — no`.
- `sync_status — no peers — an empty list and a null last_sync_utc_ms`.
- `sync_now — an unknown peer_id — the not_found kind`.
- `pair_peer — a malformed code — invalid_argument, no request sent`.
- `start_pairing — returns a six-digit code and a future expiry`.
- `DTOs — serialise with exactly C3 §3.9's field names` (one test asserting
  the JSON keys, so `app/src/ipc/sync.ts` cannot drift silently).

## COMPUTE RULES

While working: `cargo test -p idl-rs-tauri commands::sync`, foreground,
non-zero `passed` (R-note: `idl-rs-tauri` tests nest under
`commands::<module>::tests::`). Then `cargo check -p idl-rs-tauri`.
**At the end**, once: `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. DTOs against C3 §3.9. 4. The five
      commands. 5. `SyncState` + setup wiring + registration. 6. The pure
      auto-trigger decision + its task. 7. Filter green.
      8. `cargo check -p idl-rs-tauri`. 9. Full suite. 10. NUL check.
      11. `CHANGELOG.md` + `TASKS.md`. 12. Commit
      `tauri: sync commands, lifecycle and auto-trigger (L11)`.

## Do not

- Do not edit `app/src/` — the TS shell tasks are the lead's (PLAN §6).
- Do not put merge, diff or HTTP logic in this crate.
- Do not rebuild the whole catalog after a sync.
- Do not depend on `rusqlite` here (R68).
- Do not start an auto-sync from inside a command handler.

## Spec discipline

**No spec change needed** — Task 1 wrote all five commands into C3 §3.9. A
DTO field that does not match `app/src/ipc/sync.ts` is reported, not
silently renamed on either side.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the filter's `passed` count; the
`cargo check -p idl-rs-tauri` result; the full-suite result line; any field
where C3 §3.9, the Rust DTO and `app/src/ipc/sync.ts` disagreed; what the
post-lane TS shell tasks now need.
