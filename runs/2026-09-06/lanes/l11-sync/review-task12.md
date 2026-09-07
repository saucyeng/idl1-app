# Review — L11 Task 12: sync commands, lifecycle, auto-trigger

**Commits reviewed:**
- idl-rs `ad452c0` on `l11-sync` (worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\l11-sync`)
  — `tauri: sync commands, lifecycle and auto-trigger (L11)`.
- idl1-app `fe7877d` on `l11-sync` (worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\l11-sync`)
  — `docs: L11 Task 12 doc sweep`.

**Files touched (idl-rs):** `core/src/store/sync/apply.rs` (+67, folded-in fix), `core/src/store/sync/ids.rs`
(+16, doc-only), `tauri/src/commands/mod.rs`, `tauri/src/commands/sync.rs` (new, 610 lines), `tauri/src/lib.rs`,
`tauri/src/state.rs`, `transport/src/sync/client.rs`, `transport/src/sync/mod.rs`.
**Files touched (idl1-app):** `CHANGELOG.md`, `TASKS.md`, C3 §3.9, C4 §6.

**Test command / result:** reviewer ran no cargo (Rust lane, forbidden). Statically verified: `grep -c
"#\[test\]\|#\[tokio::test\]"` gives exactly 15 in `tauri/src/commands/sync.rs` and exactly 20 in
`transport/src/sync/client.rs`, matching the lead's reported filter counts (`commands::sync` 15,
`sync::client` 20) and the ledger's lane-gate entry (idl-rs 1139 passed / 1 ignored, cli 53, tauri 260
passed with the named flaky watcher test unrelated to this commit). `git diff <base> ad452c0 --
Cargo.lock` is empty. NUL-byte check (`grep -cP '[\x00-\x08\x0B\x0C\x0E-\x1F]'`) is `0` on all eight
touched Rust files.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `tauri/src/error.rs:22` | `IpcErrorKind::Sync`'s doc comment still reads "no command uses this kind yet" — stale as of this commit, since `sync_status`/`sync_now`/`pair_peer` now map `TransportError::Sync` into it via `IpcError::from`. Task 12 never touched `error.rs` (not in its file list), so the sweep missed this one line. | Update the doc comment to name the commands that now use it (or drop the "yet" clause) in a follow-up touch. |

**Verdict rationale.** Every checked item holds. `pair_peer(peer_id, code)` resolves the peer's address
strictly from `state.discovered` by the named `peer_id` (`resolve_discovered_addr`, `sync.rs:177-182`) —
no broadcast, no "if exactly one peer is online" fallback in the command itself, matching R104's ruling
exactly; `validate_pairing_code` runs before any lock or request, so a malformed code never reaches
`state.discovered` or sends a request (test `pair_peer_a_malformed_code_invalid_argument_no_request_sent`).
`grep reqwest tauri/src/` finds no client, confirming HTTP stays in `idl-transport`; `pair_with_peer` in
`transport/src/sync/client.rs` mirrors `fetch_manifest`'s shape (own short-lived `reqwest::Client`,
no token argument — the unauthenticated route per R102/PLAN §3) and bounds its response through the same
`bounded_bytes(response, MAX_DOCUMENT_BODY_BYTES, ...)` helper `fetch_manifest` uses. `sessions_touched`
is a sorted `Vec<String>` (`BTreeSet::into_iter().collect()`, `client.rs:236`) and `sessions_updated` is
assigned from `.len()` of that same set one line above it (`client.rs:235-236`), so the two cannot
diverge; `sync_now`/`run_one_sync` calls `idl_rs::store::catalog::index_session` once per touched session
id and never `rebuild_catalog` (grep confirms `rebuild_catalog` does not appear in `sync.rs` or
`state.rs`). The auto-trigger `should_auto_sync` is pure (peer struct, `Option<i64>`, injected `now_ms`,
a `&HashSet<String>`) with five tests covering exactly the five brief-named cases (unpaired, 10s-ago,
90s-ago, peer-running, incompatible-version) plus its only caller is the background browse loop in
`state.rs`, never a command handler — confirmed by grep. `SyncState::start`/its implicit teardown cannot
leave a server running: `SyncServer`'s `Drop` unconditionally sends the shutdown signal and aborts the
still-running join handle even without an explicit `.shutdown()` call, and `SyncState` holds `server`
directly (not `Option`), so dropping `SyncState` always stops it. No lock is held across an `.await` in
either `sync.rs` or `state.rs`'s discovery loop — every `Mutex::lock()` result is either used inline in a
non-async expression or explicitly cloned/dropped before the next `.await` point (`run_discovery_loop`,
`state.rs:160-188`); nothing in this task's changed files runs on an interaction path (no chart, gesture,
or hover code touched). The two folded-in fixes are correct: `install_session_json` now threads a
`Cell<InstallOutcome>` through `rederive_session_json_write` and reports `KeptLocal` on the malformed-
current fallback (diff verified line by line against `apply.rs`), with a new regression test
(`install_session_json_a_concurrent_write_corrupts_the_file_the_race_window_keptlocal_not_installed`)
that asserts both the outcome and the untouched bytes; `safe_join`'s new doc comment states the R101
lexical boundary precisely and files the symlink-detection gap to `verify_data_dir` as declared. The C3
§3.9 amendment for `pair_peer` is dated, cites R104, and matches the Rust signature
`pair_peer(peer_id: String, code: String, ...)` field for field; C4 §6 carries R89's version-pair
ordering paragraph and R91's per-field tie rule in the ledger's own wording, not paraphrased loosely.
`CHANGELOG.md`/`TASKS.md` name both remaining gaps honestly and specifically (`.setup()` wiring not yet
calling `SyncState::start`/`app.manage`; `app/src/ipc/sync.ts` stale on `protocol_version`/
`paired_at_ms`/three `SyncResult` fields/`startPairing`/`unpairPeer`/`peer_appeared`) — verified against
the actual `app/src-tauri/src/lib.rs` (`SyncState` is indeed absent from its `.setup()`), so this is not
an optimistic claim. `lib.rs`'s `generate_handler!` registers all five commands. Tests read as genuine
Arrange/Act/Assert with descriptive `thing — condition — result` names; hand style matches the
surrounding modules; `Cargo.lock` is untouched. The only gap found is one stale doc-comment line in a
file this task never opened, too small to withhold a clean verdict.

VERDICT: CLEAN
