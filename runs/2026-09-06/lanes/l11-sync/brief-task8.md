# L11 Task 8 — transport: the axum sync server

The serving half of PLAN §3: routes, bearer auth, range requests. It reads
`<data>` through core and never merges anything. TDD, ONE commit.

**Depends on Task 7.** **Full suite runs at the end of this task** (eighth
task of the lane, CLAUDE.md §8).

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l11-sync"
git merge-base --is-ancestor 52efba8 HEAD && echo GATE-OK
grep -c "PROTOCOL_VERSION" transport/src/sync/wire.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md` §2/§5; this lane's `PLAN.md` §3 (the endpoint table is
normative) and Task 1's landed C4 §6; Task 7's `wire.rs`/`pairing.rs`;
`core/src/store/sync/manifest.rs` (`build_manifest`) and
`core/src/store/blob.rs` (`blob_path`);
`transport/src/wifi_transport.rs`'s tests — its hand-rolled
`tokio::net::TcpListener` mock server is the closest existing example of
HTTP in this crate.

## Where

- **Files:** `transport/src/sync/server.rs` (new),
  `transport/src/sync/range.rs` (new), `transport/src/sync/mod.rs`,
  `transport/Cargo.toml`, `CHANGELOG.md`.

## Interfaces

```rust
/// A running sync server. Dropping it stops serving.
pub struct SyncServer { /* … */ }

pub struct SyncServerConfig {
    /// Root of `<data>`; every served path is resolved under it.
    pub data_root: PathBuf,
    /// `0` asks the OS for an ephemeral port — how the tests bind.
    pub port: u16,
    pub peer_id: String,
    pub name: String,
}

impl SyncServer {
    /// Binds and starts serving on the caller's runtime.
    pub async fn start(config: SyncServerConfig, pairing: Arc<Mutex<PairingState>>,
                       peers: Arc<Mutex<Vec<Peer>>>) -> Result<Self, TransportError>;
    /// The bound address — the real port when `port` was 0.
    pub fn local_addr(&self) -> SocketAddr;
    pub async fn shutdown(self);
}

/// One parsed `Range: bytes=a-b` header. `None` for an absent header.
pub fn parse_range(header: Option<&str>, len: u64) -> Result<Option<(u64, u64)>, RangeError>;
```

## Key logic

- Routes are exactly PLAN §3's, under `/idl1/v1`. Anything else is `404`.
- **Auth**: every route but `POST /pair` requires
  `Authorization: Bearer <token>` matching a known peer; a missing or wrong
  token is `401` with no body detail. Token comparison is constant-time.
- **`GET /manifest`** calls core's `build_manifest` with a `now_ms` the
  caller injected — the server does not own a clock beyond that one call.
- **Byte routes** answer `Accept-Ranges: bytes`; a valid `Range` gets `206`
  with `Content-Range`, an unsatisfiable one gets `416`. Only a single range
  is supported; a multi-range header is `416`, never a partial answer.
  Parse it by hand in `range.rs` — no `tower-http` (PLAN Q2).
- **Path safety**: every `<id>`/`<hash>` path segment is rejected if it
  contains a separator, `..`, or is not the shape its class requires (64 hex
  for a hash). The server must be unable to serve a byte outside `<data>`'s
  syncable classes, and never serves `catalog.sqlite`, `tmp/`, or
  `workbooks/.sync-base/`.
- **`PUT`** hands the received bytes to core's `install` and answers `200`
  with the `InstallOutcome`; an identical file is `200` with no write. `PUT`
  is idempotent — the same body twice leaves the same state.
- Bind to `0.0.0.0` in production but accept a config that binds loopback,
  since that is how every test runs.
- The server never spawns a runtime of its own — it runs on whichever
  runtime drove `start`, matching this crate's existing rule.

## Tests

All against a server on `127.0.0.1:0` in the test's own runtime.
- `parse_range — absent — None; "bytes=0-9" — (0,9); "bytes=5-" — (5,len-1)`.
- `parse_range — a start past the end — RangeError`.
- `parse_range — a multi-range header — RangeError`.
- `GET /manifest — with a valid token — the C4 §6 document`.
- `GET /manifest — with no token — 401`; `— a wrong token — 401`.
- `GET /blob/<hash> — the whole body matches the file`.
- `GET /blob/<hash> — Range: bytes=4-7 — 206, Content-Range, four bytes`.
- `GET /blob/<hash> — an unsatisfiable range — 416`.
- `GET /blob/../../catalog.sqlite — 404, and the file is never opened`.
- `GET /workbook/<id> — an id with a path separator — 404`.
- `PUT /blob/<hash> — twice with the same body — the same state, both 200`.
- `POST /pair — the current code — a token; a wrong code — refused`.
- `an unknown route — 404`.

## COMPUTE RULES

While working: `cargo test -p idl-transport sync::server`, foreground,
non-zero `passed`. **At the end of this task**, once:
`cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. `range.rs`. 4. Routes + auth.
      5. Byte routes + `PUT`. 6. Filter green. 7. Full suite. 8. NUL check.
      9. `CHANGELOG.md`. 10. Commit `transport: axum sync server (L11)`.

## Do not

- Do not add `tower-http` or any crate outside the M0 pins.
- Do not put merge logic in a handler — a handler calls core.
- Do not serve a path outside `<data>`'s syncable classes, ever.
- Do not depend on `tauri`.

## Spec discipline

**No spec change needed** — PLAN §3 and Task 1's C4 §6 fix the routes. A
route you need that neither names is a STOP.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the filter's `passed` count; the full-suite
result line; the `axum` version line added to `Cargo.toml`; how path
traversal is blocked; which status codes the range path returns.
