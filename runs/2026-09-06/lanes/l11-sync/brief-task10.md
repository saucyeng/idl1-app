# L11 Task 10 — transport: the sync client

The driver: fetch the peer's manifest, ask core what moves, move it,
resumably, reporting progress. TDD, ONE commit.

**Depends on Task 9.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l11-sync"
git merge-base --is-ancestor 52efba8 HEAD && echo GATE-OK
grep -c "SERVICE_TYPE" transport/src/sync/discovery.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md` §2/§5; this lane's `PLAN.md` §1 (resumability) and §3;
Task 1's landed C3 §3.9 (`SyncResult`, the widened `phase` union);
`core/src/store/sync/diff.rs` (`plan_sync`, `SyncAction`, `SyncItem`) and
`core/src/store/sync/apply.rs` (`install`); Task 8's `server.rs` for the
route shapes; `transport/src/wifi_transport.rs`'s `download` — its
`reqwest` streaming and generic-sink pattern is the one to follow.

## Where

- **Files:** `transport/src/sync/client.rs` (new),
  `transport/src/sync/mod.rs`, `CHANGELOG.md`.

## Interfaces

```rust
/// What one sync run did (C3 §3.9's `SyncResult`, plus what the command
/// layer needs to report honestly).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SyncRunResult {
    pub blobs_transferred: u32,
    pub workbooks_merged: u32,
    pub conflicts: u32,
    pub sessions_updated: u32,
    pub tracks_updated: u32,
    pub profiles_updated: u32,
}

/// One progress tick. `phase` is C3 §3.9's union as Task 1 widened it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncProgress { pub done: u64, pub total: Option<u64>, pub phase: &'static str }

/// Runs one full sync against `peer`. `on_progress` is called on the
/// caller's task; it must not block.
pub async fn sync_with_peer(
    data_root: &Path,
    peer: &Peer,
    addr: SocketAddr,
    now_ms: i64,
    on_progress: &(dyn Fn(SyncProgress) + Send + Sync),
) -> Result<SyncRunResult, TransportError>;
```

## Key logic

- Order of work: `manifest` → build the local manifest via core → `plan_sync`
  → pull actions → push actions. `phase` moves `"manifest"`, `"blobs"`,
  `"sessions"`, `"workbooks"`, `"tracks"`, `"profiles"`; `total` is the
  planned action count for the current phase and is `None` only before the
  plan exists.
- **Every pull** streams into `<data>/tmp/<uuid>.part`. If a `.part` for the
  same item already exists, resume: send `Range: bytes=<existing len>-` and
  append. On completion, hand the assembled bytes to core's `install`, which
  verifies and places them; then remove the `.part`.
- **`PullForMerge`** (workbooks, `session.json`) fetches the peer's whole
  file and calls `install` — core does the merging, the client never parses
  a workbook.
- **Push** is `PUT` of the local bytes; a `200` reporting no write still
  counts as success, not a transfer.
- A single item failing does **not** abort the run: it is counted, logged
  with its class and key, and the run continues. The error surfaces only if
  nothing succeeded, or through the returned counts being short.
- A peer whose `protocol_version` differs from `PROTOCOL_VERSION` is refused
  before any request, with a `Sync` error naming both.
- Re-running a completed sync must be a no-op — the plan comes out empty.
  That is a test.
- Progress ticks are cheap and monotonic within a phase; do not tick per byte.

## Tests

Against a real `SyncServer` on `127.0.0.1:0` in the test's runtime, with two
`tempdir` data roots.
- `sync_with_peer — a blob only on the peer — pulled, verified, counted`.
- `sync_with_peer — a blob only locally — pushed`.
- `sync_with_peer — run twice — the second run transfers nothing`.
- `sync_with_peer — a partial .part file present — resumed, and the final
   bytes match the whole file`.
- `sync_with_peer — a workbook differing — merged by core, workbooks_merged 1`.
- `sync_with_peer — a peer whose protocol_version differs — refused with no
   request sent`.
- `sync_with_peer — a wrong token — a Sync error, nothing installed`.
- `sync_with_peer — one item 404s — the run completes and the others land`.
- `sync_with_peer — progress phases arrive in order and never go backwards`.
- `sync_with_peer — after a successful run, tmp/ holds no .part files`.

## COMPUTE RULES

While working: `cargo test -p idl-transport sync::client`, foreground,
non-zero `passed`.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. Manifest fetch + plan. 4. Pull with
      resume. 5. Push. 6. Progress. 7. Filter green. 8. NUL check.
      9. `CHANGELOG.md`. 10. Commit `transport: LAN sync client (L11)`.

## Do not

- Do not parse a workbook, a `session.json` or a Parquet file in this crate.
- Do not decide a conflict here — core decided it in `plan_sync`/`install`.
- Do not abort a run on one failed item.
- Do not write anywhere in `<data>` except `tmp/` and via core's `install`.

## Spec discipline

**No spec change needed** — Task 1 widened `phase`. A count the UI needs and
`SyncResult` lacks is a STOP.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the filter's `passed` count; how resume
decides the offset; what a partially failed run returns; anything about
`reqwest`'s range handling that differed from the brief.
