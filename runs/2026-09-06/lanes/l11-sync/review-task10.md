# L11 Task 10 review — the LAN sync client (folded: review-task9 discovery fixes)

Commits reviewed: idl-rs `301bba6` ("transport: fix browse teardown race +
IPv6 scope id (review-task9)", parent `2399312`) and `5353014` ("transport:
LAN sync client (L11)", parent `301bba6`), both on branch `l11-sync` in
worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\l11-sync`
(HEAD `5353014`). idl1-app CHANGELOG `e12721e` in
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\l11-sync`.
Files touched: `transport/src/sync/discovery.rs`, `transport/Cargo.toml`,
`Cargo.lock` (301bba6); `transport/src/sync/client.rs` (new),
`transport/src/sync/mod.rs`, `CHANGELOG.md` (5353014, e12721e).

Test command: none run — Rust lane, cargo forbidden for reviewers per
CLAUDE.md §8. Verified statically:
- `transport/src/sync/discovery.rs`'s `#[cfg(test)] mod tests` now has 6
  `#[test]` fns (unchanged from review-task9) plus 1 new
  `#[tokio::test]` (`drain_events_receiver_dropped_no_event_arrives_task_ends`)
  plus the pre-existing 1 `#[tokio::test] #[ignore]` — 7 run, 1 ignored,
  matching the implementer's "7 passed, 1 ignored" and the CHANGELOG line.
- `transport/src/sync/client.rs`'s `#[cfg(test)] mod tests` has exactly 10
  `#[tokio::test]` fns, one per brief-named scenario, matching the reported
  "10 passed."
- `mdns-sd 0.21.2`'s `ScopedIpV6::scope_id()` returns `&InterfaceId { index:
  u32, .. }` and `SocketAddrV6::new` takes a `u32` scope id — the fix's
  `scoped_addr_to_socket_addr` compiles against the real API (checked
  against `mdns-sd-0.21.2/src/dns_parser.rs`).
- `flume = "0.12.0"` is added only under `transport/Cargo.toml`'s
  `[dev-dependencies]`; the non-test code path (`browse_with_handle`/
  `drain_events`) only ever names the type `mdns_sd::Receiver<ServiceEvent>`
  (mdns-sd's own re-export), never constructs a `flume` channel outside
  `#[cfg(test)]` — confirmed a runtime dep was not added.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `transport/src/sync/client.rs:283-336` (`download_item`) | No cap on how many bytes the client will accept from a peer for a single `GET`. The `bytes_stream()` loop appends every chunk to the `.part` file with no running-size check, and the final `tokio::fs::read(&tmp_path)` reads the whole assembled file into memory unconditionally. `fetch_manifest`'s `response.json::<Manifest>()` is equally unbounded. This is the asymmetric half of R100: `server.rs` enforces `MAX_DOCUMENT_BODY_BYTES`/`MAX_RAW_FILE_BODY_BYTES` on every `PUT` it accepts (confirmed at `transport/src/sync/server.rs:320-333`), but nothing bounds what this client accepts on a `GET`/manifest response from a peer it just authenticated with a bearer token — a compromised or malicious paired peer can exhaust the local disk (`tmp/`) and then memory (the final `Vec<u8>`) with one oversized response. | Apply the same per-class caps client-side: check `Content-Length` up front where present and abort over-cap, and enforce a running byte-count ceiling inside the `while let Some(chunk) = stream.next().await` loop (and cap `fetch_manifest`'s body) so a peer cannot force unbounded disk/memory consumption. |
| Important | `transport/src/sync/client.rs:381-397` (`pull_and_install`) | `.part` removal is reached only via `install(...).map_err(...)?` — i.e. **only on success**. When `install` rejects the assembled bytes (hash mismatch on `Blob`/`Derived`, or a version/parse mismatch on `data.parquet`/`session.json`/workbook), the `.part` file is left exactly as-is. Because resume always requests `Range: bytes=<existing .part length>-` and appends, the *next* run resumes from the same poisoned prefix and — if the peer's content and the local partial are still mutually inconsistent (a stale resume, or a peer that shrank/changed the file, or truly corrupt bytes) — reproduces the identical failure forever. This directly contradicts PLAN §1's "an interrupted sync is recovered by re-running it" for exactly the failure mode the dispatch asked about, and the CHANGELOG for `5353014` states the behaviour plainly ("the `.part` is removed only after `install` succeeds") without flagging it as a gap. Neither of the two adversarial resume scenarios the dispatch named — a peer returning different bytes at the same offset on a second attempt, or a shorter file than the partial (which the server correctly turns into a `416`, itself terminal via the generic `!status.is_success()` branch in `download_item`) — has a test, and both hit this same stuck-`.part` path today. No data is corrupted (the hash check does its job) and no filesystem escape occurs, but sync of that one item is permanently blocked without manual intervention. | On any `install` failure, at minimum discard (remove) the `.part` file so the next run restarts the item from byte 0 rather than resuming the same bad prefix; add the two named adversarial-resume tests (mismatched second-attempt bytes; peer content shorter than the partial → `416`) asserting the `.part` is gone afterward and the next run succeeds. |
| Important | `transport/src/sync/client.rs:34-57` (`SyncRunResult`) vs `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` §3.9 (`SyncResult`, as amended at `e966c8c`, current in the `l11-sync` app worktree) | `SyncRunResult` has three fields (`sessions_updated`, `tracks_updated`, `profiles_updated`) that C3 §3.9's public `SyncResult` does not have; the contract's `SyncResult` still only carries `blobs_transferred`, `workbooks_merged`, `conflicts`. The struct's own doc comment justifies the extra fields as "what the command layer needs to report honestly" — i.e. the implementer's own reasoning is that without them, a sync run whose only effect was a `session.json` merge, or a track/profile last-write-wins transfer, would show *zero* change under every field of the current public `SyncResult` shape. That is precisely the condition this task's own "Spec discipline" section pre-declared as a STOP ("A count the UI needs and `SyncResult` lacks is a STOP"), not something to route around by widening the internal transport type unilaterally. This may turn out fine if Task 12 is going to keep these three counts transport-internal and never surface them over IPC — but that call was not made here, and as written the contract and the implementation now disagree about what a caller can observe from a sync run. | Lead ruling needed before Task 12: either amend C3 §3.9's `SyncResult` to add the three fields (if the UI is meant to show them), or have Task 12 explicitly discard them and confirm the UI doesn't need to distinguish "nothing happened" from "a session/track/profile merged with no blob motion" — either way this is a decision for the lead, not something Task 10 should have settled by inventing extra return fields. |
| Minor | `transport/src/sync/client.rs:262-266` (`tmp_part_path`) | The deterministic `.part` name is `sha256_hex(format!("{class:?}:{session_id}:{key}"))`, and neither `session_id` nor `key` (both sourced from the untrusted peer manifest for a `Pull`, e.g. `Derived`'s `key` = the peer's claimed `sha256` string, `SessionEntry.session_id` = the peer's claimed session id) is shape-validated before this point — `plan_sync` does not call `core::store::sync::ids::is_valid_id`. Since the two fields are colon-joined, a peer whose manifest supplies a `session_id` containing a colon (e.g. `"s1:h"`) can make a `Derived` item's identity string collide with a different, legitimately-planned `Derived` item's identity (e.g. `session_id="s1"`, `key="h:x"` vs. `session_id="s1:h"`, `key="x"`). This cannot escape `tmp/` (the digest is always pure hex) and cannot corrupt an *installed* file (`install`'s per-class hash/version check, confirmed in `apply.rs`, rejects mismatched bytes before any write), so the worst outcome is a spurious per-item failure already covered by the "one item fails, run continues" contract — not a security hole, just defense-in-depth the R100 discipline would otherwise catch. | Either validate `item.session_id`/`item.key` shape (via `core::store::sync::ids::is_valid_id`) before hashing them into the tmp name, or use a delimiter/length-prefixed encoding immune to field-boundary collision (e.g. hash each field separately and concatenate the digests) — low priority given the contained blast radius. |

No other findings. The two review-task9 fixes are both correct and match
the lead's ruling (`decisions.md`, 2026-09-07 "review-task9 (L11), ruled"):
`drain_events`'s `tokio::select!` with `biased; tx.closed()` checked first
genuinely ends the task on receiver-drop with zero mDNS events, proven by a
synthetic `flume` channel test that needs no multicast; `scoped_addr_to_socket_addr`
correctly preserves an IPv6 zone/scope id via `mdns-sd`'s real `ScopedIpV6`
API rather than the scope-losing `to_ip_addr()`. `sync_with_peer`'s
`protocol_version` refusal genuinely fires before any HTTP request (proven
against `127.0.0.1:1`, a port nothing listens on — a real connection
attempt would fail differently). `plan_sync`'s decisions (R89 version
ordering, R90 locally-skipped do-not-touch) are consumed, never
re-derived, by `build_install_context`/the phase loop. Every write path —
push (`read_local_item_bytes`) and pull-resume (`download_item`'s tmp
naming) — goes through `safe_join`/content-addressed `blob_path`, never a
raw peer string as a path segment. `install`'s hash/id verification is the
sole gate for every pulled class; the client never parses a workbook,
`session.json`, or Parquet file. A single item's 404 does not abort the
run (tested). No `unwrap()`/`.expect()` on peer-sourced data in production
code; no lock held across `.await`. Tests are Arrange/Act/Assert with
blank lines, named `thing — condition — result`; hand style matches the
crate (no rustfmt reflow); doc comments present on every public symbol;
the CHANGELOG's claims (test counts, behaviour description, `flume`
dev-dependency scope) check out against the diff, including its candid
statement of the `.part`-kept-on-failure behaviour that the second finding
above flags as a bug rather than a documented trade-off.

**Verdict rationale:** the two review-task9 fixes are clean and correctly
close their prior findings. Task 10's core wiring — plan consumption,
hash-verified install, resumable happy path, per-item failure containment,
`safe_join`/`blob_path` discipline — is solid and well-tested. But three
Important-level gaps survive: an unbounded peer response (the direct
mirror of R100's server-side cap, missing here), a `.part` file that is
never discarded on an `install` failure so a poisoned resume can loop
forever (the exact adversarial-resume scenario the dispatch asked about,
untested and currently mishandled), and an internal `SyncRunResult` shape
that has quietly grown past C3 §3.9's `SyncResult` in a way the task's own
spec-discipline rule says should have been a STOP. None of these compromise
data integrity or allow a filesystem escape — `install`'s verification and
`safe_join` hold — so this is FINDINGS, not a security rewrite, but three
Importants is above the CLEAN bar.

VERDICT: NEEDS_FIXES (0 Critical, 3 Important, 1 Minor)
