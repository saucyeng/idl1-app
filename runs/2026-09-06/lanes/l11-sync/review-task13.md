# Review: L11 Task 13 — this device's sync identity (`identity.json`) + `SyncState::start` wiring

Commits reviewed:
- idl-rs `55136f1` (branch `l11-identity`, worktree `idl-rs-worktrees/l11-identity`)
  — `tauri/src/commands/sync.rs`, `tauri/src/lib.rs`, `tauri/src/state.rs`,
  `transport/src/sync/identity.rs` (new), `transport/src/sync/mod.rs`,
  `transport/src/sync/pairing.rs`
- idl1-app `c047e11` (branch `l11-identity`, worktree `idl1-app-worktrees/l11-identity`)
  — `CHANGELOG.md`, `app/src-tauri/Cargo.lock`, `app/src-tauri/src/lib.rs`,
  `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`

Rust lane: no cargo run (per instructions). Verified statically by reading
source and counting `#[test]` fns.

## Test-count verification (static)

| Module | Reported | Counted `#[test]` |
|---|---|---|
| `transport/src/sync/identity.rs` | 6 | 6 |
| `transport/src/sync/pairing.rs` | 11 | 11 |
| `tauri/src/commands/sync.rs` | 17 | 17 |

All six `identity.rs` tests read correctly A/A/A and assert the right thing:
absent→mint+persist, present→unchanged (hostname hint ignored), corrupt→typed
`Sync` error with file bytes left untouched, absent/blank hostname→`"idl1"`,
`set_name` keeps `peer_id`. `commands::sync.rs` adds two new tests for
`set_sync_device_name_via` (blank→`InvalidArgument`, nothing written;
trimmed name persists and updates the live lock) — correctly named, A/A/A.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `rust/tauri/src/state.rs` (`os_hostname`) | `std::process::Command::new("hostname").output()` has no timeout; a hung `hostname` binary would block `.setup()` indefinitely. Windows almost never reaches this branch (`COMPUTERNAME` is always set), and the implementer flagged the shell-out as a deliberate CLAUDE.md §1 judgment call in the doc comment rather than silently deciding it. | Not required to fix; if hardened later, wrap in a short timeout or move to a pinned `hostname` crate. |
| Note | `identity.rs` location | R105's ruling text said "core or tauri, implementer's call" but the module landed in `idl-transport` (`transport/src/sync/identity.rs`), a third location not named. This matches the existing sibling file (`peers.json`'s logic already lives in `transport/src/sync/pairing.rs`) and CLAUDE.md §2's layer rule (LAN-sync I/O belongs in transport), so it is a consistent, defensible reading, not a spec violation — flagging only because the ruling's wording didn't literally name it. | None required. |

No Critical or Major findings.

## Verification detail (against the dispatch's checklist)

- **Corruption path (R105's "Critical behaviour"):** `load_or_create` matches on
  `std::fs::read`. `NotFound` → mint + `write_json_atomic` (same helper
  `pairing::save_peers` now delegates to — refactored out as
  `pub(crate) write_json_atomic` in the same commit). Any other read error or a
  JSON-parse failure on an existing file → `TransportError` (`Sync` kind),
  **no write path is reached** in either branch — confirmed by reading the
  match arms; the corrupt-file test additionally asserts the on-disk bytes
  are byte-for-byte untouched. No code path anywhere mints a fresh uuid
  except the `NotFound` arm. Confirmed correct.
- **Missing file mints once, persists atomically, same helper as peers.json:**
  Yes — `write_json_atomic` is the pairing.rs primitive (tmp-sibling +
  fsync + rename + parent fsync), now shared by both files via a
  `pub(crate)` export imported in `identity.rs`.
- **Present file round-trips unchanged:** yes, test + code confirm the
  hostname hint is ignored once a file exists.
- **Hostname unavailable ⇒ `"idl1"`:** yes, `DEFAULT_NAME = "idl1"`, and both
  `None` and whitespace-only hostname fall back to it (two dedicated tests).
- **File location / R88:** `identity.json` is joined from `app_config_dir()`
  in `app/src-tauri/src/lib.rs`, beside `peers.json` and `settings.json`,
  never under `<data>`. `grep identity core/src/store/sync/manifest.rs`
  returns only unrelated hits ("workbook's identity", CAS "identity key") —
  the sync manifest never references this file, confirming it is excluded
  from what gets synced.
- **`set_sync_device_name` atomicity / live-state consistency:** writes via
  `identity::set_name` → `write_json_atomic` (same fsync+rename path), and
  only updates the in-memory `Mutex<String>` *after* the write succeeds
  (`let updated = ...set_name(...)?; *name_lock.lock()... = updated.name`).
  A failed write returns `Err` before the lock is touched, so process state
  and disk cannot diverge. The lock itself is only ever held across
  synchronous critical sections (`set_sync_device_name_via` is a plain sync
  fn called from an async command, and `pair_peer`'s read of `state.name`
  clones and drops the guard before its own `.await`) — no lock held across
  an `.await` anywhere in this diff.
- **Hostname lookup can't hang/inject/panic:** no shell interpretation
  (`Command::new("hostname")`, no args, no shell), all failure paths go
  through `.ok()`/`Option` chains, no `unwrap()`. No timeout — see Minor
  finding above. Spawning a process at startup instead of pinning a crate
  is a stated, reasoned CLAUDE.md §1 judgment call, not a silent inference.
- **`.setup()` wiring:** follows the existing `app.manage(...)` pattern
  exactly; `SyncState::start` is awaited via `tauri::async_runtime::block_on`
  and a failure `panic!`s before any window exists — this is the *same*
  documented behaviour class as the pre-existing `resolve_data_dir` failure
  two lines above it (already an open item, "showing a native error dialog
  instead" — not a new regression introduced by this task), and is in fact
  the explicitly ruled requirement (R105: corrupt file must be a hard,
  typed failure, never a silently-minted replacement id). Not treated as a
  Major — it is the intended, ruled behaviour, consistent with prior art.
- **C3 §3.9 amendment:** dated 2026-09-07, cites R105 item 1 and L11 Task
  13, matches the Rust signature (`name: String -> Result<String, IpcError>`
  ⇒ documented as `Return: string`, `Errors: invalid_argument, sync`), and
  the cross-cutting error tables (`sync`, `invalid_argument` rows) are both
  updated to list the new command.
- **Hand style / no reformatting:** `pairing.rs` diff is a targeted
  extraction of `write_json_atomic` (24 insertions / 16 deletions on a
  40-line hunk) — no unrelated line churn. No `cargo fmt` artifacts visible
  (line-wrap style matches surrounding hand-formatted code).
- **`Cargo.lock`:** `app/src-tauri/Cargo.lock` gained ~150 lines (`axum`,
  `mdns-sd`, `if-addrs`, etc.) — this is expected, not a smell: those crates
  were already pinned in `idl-transport/Cargo.toml` by earlier L11 tasks,
  but `app/src-tauri` had never linked `idl-transport::sync` until this
  commit's `.setup()` wiring, so its lockfile is only now resolving the
  transitive graph. `uuid`'s `v4` feature was likewise already added to
  `transport/Cargo.toml` in an earlier commit (`301bba6`/`5132d68`/
  `fa3d317`), not new here. No new top-level dependency was introduced by
  either commit in this diff.
- **Typed errors, doc comments, units:** all public symbols
  (`Identity`, `load_or_create`, `set_name`, `DEFAULT_NAME`,
  `set_sync_device_name`) carry doc comments; no `Err(String)`; no
  `unwrap()` on data paths (only `unwrap_or_else(|e| e.into_inner())` on
  poisoned-mutex recovery, an established pattern elsewhere in this file).

## Verdict rationale

The corruption path — the task's stated critical behaviour — is implemented
and tested exactly as ruled: a bad `identity.json` never silently mints a
replacement id, and the write path is provably unreachable on any error arm.
File placement, atomic-write reuse, live-state consistency, lock discipline,
the C3 amendment, and the Cargo.lock churn all check out under static
reading. The only items worth recording are a Minor (no timeout on the
`hostname` shell-out, already a documented deliberate call) and a Note
(the transport-crate placement reads as a defensible interpretation of an
ambiguously worded ruling, not a deviation). Neither changes behaviour a
maintainer would need to fix before merge.

VERDICT: CLEAN
