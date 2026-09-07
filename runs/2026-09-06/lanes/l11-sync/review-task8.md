# Review — L11 Task 8: transport axum sync server

**Commit reviewed:** idl-rs `fa3d317` on `l11-sync`
(`transport: sync server -- /idl1/v1 routes, bearer auth, range support (L11
Task 8)`), on top of `02117eb`, in worktree
`C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\l11-sync`. Landed by
the lead after the task agent stalled (per `runs/2026-09-03/decisions.md`,
"2026-09-07 — L11 Task 8 landed by the lead"), code unchanged from the agent's.

**Files touched:** `Cargo.lock`, `transport/Cargo.toml`,
`transport/src/sync/mod.rs`, `transport/src/sync/range.rs` (new),
`transport/src/sync/server.rs` (new). All on the brief's named list; nothing
else changed.

**Test command:** none run by this review — Rust lane, cargo forbidden for
reviewers; verified statically by reading the code and counting `#[test]`/
`#[tokio::test]` functions. `transport/src/sync/server.rs`'s `#[cfg(test)]
mod tests` has exactly **14** test fns, matching the reported `cargo test -p
idl-transport sync::server -> 14 passed`. Combined with `range.rs`'s 8 and
`pairing.rs`'s 11 (counted in the Task 7 review), that totals 33, matching
the reported `cargo test -p idl-transport sync:: -> 33 passed`.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Critical | `transport/src/sync/server.rs:284-286` (`is_valid_id`) and every `data_root.join(...).join(&id)`/`format!("{id}.…")` call site (lines 392, 420, 443, 474/489-490, 499, 519, plus `core/src/store/sync/apply.rs:357,382,442,458`) | `is_valid_id` only rejects `/`, `\`, and `..`. On Windows, `PathBuf::join` on a component that carries a drive prefix without a root (e.g. `C:evil`, no backslash) **drops the entire base path** — confirmed by direct test: `PathBuf::from(r"C:\data").join("sessions").join("C:evil").join("data.parquet")` yields `C:evil\data.parquet`, and `PathBuf::from(r"C:\data").join("tracks").join(format!("{}.idl0t","C:evil"))` yields `C:evil.idl0t` — both entirely outside `data_root`. Every `<id>` route (session `data.parquet`/`session.json`/`derived`, `workbook`, `track`, `profile`) accepts a colon-prefixed segment like `C:evil` unmodified (colon is a legal, unencoded URL path-segment character, no percent-encoding needed) and passes it straight into `Path::join`. `GET` routes hit this directly in `server.rs` (arbitrary file read, drive-relative to the server process's CWD). `PUT /idl1/v1/workbook/<id>` for a brand-new workbook (`handle_workbook_put`'s fallback `resolve_workbook_file_name(...).unwrap_or_else(\|\| id.clone())`) threads the same untrusted `id` into `install_workbook`'s `target = data_root.join("workbooks").join(format!("{file_name}.idl1wb"))`, i.e. an authenticated but malicious/compromised paired peer can write an arbitrary file (drive-relative to CWD) via `PUT`. This is exactly the "path traversal" class the dispatch asked to check, and the guard covers Unix-style traversal but misses the Windows-specific drive-prefix escape — material because the dev/target platform is win32 (CLAUDE.md's own environment). | Reject any id/hash segment containing `:` in `is_valid_id` (and ideally validate against an allow-list shape per class — UUID/opaque id — rather than only excluding characters), and add a regression test asserting `GET`/`PUT .../track/C:evil` (and the workbook-brand-new-id case) is `404`/rejected and no file is read or written outside `data_root`. |
| Important | `transport/src/sync/server.rs:325-333` (`read_body`) | The doc comment claims size is bounded "beyond axum's own default," but the code calls `to_bytes(body, usize::MAX)` — an explicit, unlimited cap, not axum's default (which is finite). Every `PUT` route (blob, derived, `data.parquet`, `session.json`, workbook, track, profile) reads the whole body into memory with no limit. A paired peer (legitimate device or a compromised one) can send an arbitrarily large body and exhaust server memory — the reviewer dispatch names this scenario explicitly as reportable. | Either impose an explicit cap per class (e.g. largest plausible blob/parquet size from C4, `data.parquet`/`session.json`/track/profile bounded much lower) and answer `413` over it, or fix the doc comment to state plainly that no limit is imposed and get an explicit lead ruling accepting the LAN-only threat model for this. Silently mismatched code/comment should not stand either way. |
| Important | (process, not a line) | The brief's COMPUTE RULES and Steps (step 7) require the lane's full suite — `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` — to run **at the end of this task**, called out explicitly as "eighth task of the lane, CLAUDE.md §8." The lead's landing note (`runs/2026-09-03/decisions.md`, "2026-09-07 — L11 Task 8 landed by the lead") and the commit message both report only `sync::server` (14), `sync::` (33), and `cargo check -p idl-rs-tauri` (clean) — no full-suite result is recorded anywhere for this checkpoint. | Run (or confirm was run and cite the result line) `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` before the lane proceeds further, per CLAUDE.md §8's checkpoint cadence; if it was run and just not logged, add the result line to the decisions ledger. |
| Important | `CHANGELOG.md` (idl1-app repo) | The brief's "Where"/"Steps" (step 9) name `CHANGELOG.md` as a file this task touches, and CLAUDE.md §6 requires every task touching shipped behaviour to update it. No "L11 Task 8" entry exists in `CHANGELOG.md` (checked in `idl1-app-worktrees/l11-sync`); the newest L11 entry present is Task 7's. Landing the commit directly (bypassing the agent's normal doc step) appears to have dropped this. | Add the Task 8 CHANGELOG entry (new server, routes, auth, range support, path-safety rules, axum 0.8.9 pin) before the lane's next gate. |
| Minor | `transport/src/sync/range.rs:77-86` / `server.rs:315-321` | A `Range` value that overflows `u64::parse` (e.g. `bytes=0-99999999999999999999`, the dispatch's own example) is classified `RangeErrorKind::Malformed`, not `Unsatisfiable`, so `serve_file`'s `Err(_) => StatusCode::BAD_REQUEST` returns `400`, not `416`. Not a security issue (fails closed, no panic, not tested either way in the brief's own test list), but the dispatch expected `416` for this case and it is untested. | Either fold an overflowing numeric range into `Unsatisfiable` (so it answers `416` with `Content-Range: bytes */len` like the rest of the unsatisfiable family) or explicitly document that overflow is `400` and add a test pinning it either way. |

**Notes (not findings, verified clean):**
- Auth: `route_layer` (not `layer`) confirmed by reading `build_router` and
  its comment plus the dedicated regression test
  (`unknown_route_is_404_without_a_token_while_a_known_route_is_401`); an
  unknown path is `404` with no token, a known path is `401` — both tested,
  matches C4 §6/PLAN §3.
- `POST /pair` is the sole unauthenticated path (`auth_layer`'s early
  return checked against the literal `/idl1/v1/pair` URI). Token
  comparison (`constant_time_eq`) never short-circuits on length or first
  differing byte, matches the brief.
- `GET /blob/<hash>`/`derived/<sha256>.parquet`: hash routes are
  content-addressed and `is_valid_hash` (64 hex, ASCII) fully forecloses
  the colon-prefix issue above for these two classes only — blob/derived
  are safe from the Critical finding.
- Range parsing: `bytes=0-9`, `bytes=5-`, `bytes=-3` (suffix), start-past-end
  (`Unsatisfiable`→`416`), multi-range (`Multiple`→`416`), malformed prefix
  (`Malformed`→`400`), end clamped to length — all eight cases have a
  direct unit test in `range.rs`, matching the brief's list exactly (minus
  the overflow case above).
- `PUT` idempotency and wrong-hash rejection: `blob_put_twice_with_same_body_both_200_same_state`
  and `blob_put_wrong_hash_is_rejected_never_written` both assert on-disk
  state (`std::fs::read`/`!path.is_file()`), not just status codes, matching
  "test asserts no file."
- `axum` pinned exact at `0.8.9` in `transport/Cargo.toml`, with a comment
  citing the M0 ecosystem report and ruling R88; `idl-rs = { path = "../core"
  }` is the one new dependency, one-directional (`core/Cargo.toml` has no
  `idl-transport` reference, confirmed by grep). `Cargo.lock` diff (93 added
  lines) is entirely the `axum`/`axum-core`/`httpdate`/`matchit`/
  `serde_path_to_error`/`serde_urlencoded` tree — no unrelated crate rows.
- No `unwrap()`/`expect()` on peer-supplied input anywhere in
  `server.rs` (grep confirms the only non-test `unwrap()`s are on constant
  literal header-value parses, e.g. `"bytes".parse().unwrap()`, which cannot
  fail). All errors returned to a caller are typed (`TransportError`,
  `SyncError` via `install`'s `Result`) with a `.message` field surfaced as
  response body text, never `Err(String)` as the crate's return type.
  No lock is held across an `.await` (`auth_layer`/`handle_pair` both scope
  their `Mutex` guards inside a block that ends before any `.await`).
- `GET /manifest` calls `build_manifest(&state.data_root, now_ms())` — the
  server's clock is read once per call, matches "the server does not own a
  clock beyond that one call" (the one other read is in `handle_pair`'s
  `redeem`, which the brief's own doc comment on the pairing test
  acknowledges).
- Hand style (line length, brace placement, doc-comment density) matches
  the rest of the crate (`device.rs`, `wifi_transport.rs`); no
  reformatting of untouched lines detected in the diff.
- Commit is single-line summary + body, no AI-attribution trailer.

**Verdict rationale.** The routing, auth, idempotency, and Unix-style
path-safety logic are careful and well-tested, and the crate-boundary/wire
rules (no `tower-http`, no new crates beyond `idl-rs`, exact `axum` pin,
typed errors, no locks across await) are all honoured. But the Windows
drive-relative path-escape gap is a genuine, exploitable violation of the
brief's own explicit path-safety requirement ("must be unable to serve a
byte outside `<data>`'s syncable classes") reachable by any paired peer on
GET and, for brand-new workbooks, on PUT too — that alone is disqualifying.
The unbounded-body and missing full-suite/CHANGELOG items compound it as
process and hardening gaps that should be closed in the same pass.

VERDICT: NEEDS_FIXES
