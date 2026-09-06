# L11 — LAN sync (plan)

Design authority: design doc §7 + D6/D7, C4 §6 (sync scope, manifest, conflict
table), C2 §7 (workbook merge, fully specified), C1 §6 (`session.json`), C3
§3.9, SPEC §17a.4/§27.9. Base idl-rs `52efba8`; worktree `l11-sync`.

## 1. The model

Two app instances on a pit-lane LAN. Each runs a small HTTP server advertised
over mDNS as `_idl1._tcp`. **Pair once** (6-digit code, both keep a token),
then **sync** is pull-then-push, per-peer, idempotent and resumable.

A sync transfers, per C4 §6: blobs by hash, `sessions/<id>/data.parquet`,
`derived/*.parquet`, `session.json`, `workbooks/*.idl1wb`, `tracks/*.idl0t`,
`profiles/<id>.idl0p`. **Never synced:** `catalog.sqlite` and its `-wal`/`-shm`
sidecars (an index, D10), `tmp/`, `app_config_dir()/settings.json` (outside
`<data>`), and `workbooks/.sync-base/` (C2 §7's base cache, Q8).

**Conflict policy**, per class, all from C4 §6's table:
- Blob, derived channel — content-addressed, no conflict possible; set
  difference by hash, pull what is missing.
- `data.parquet` — compare `(importer_version, seam_correction_version)`; an
  equal pair with differing `sha256` is a last-ulp difference, keep local. A
  newer pair wins and moves as bytes, never regenerated.
- `session.json` — per-field merge of user-owned fields, LWW tiebreak (Q6).
- Workbook — per-cell merge against the last-synced base (C2 §7), conflict
  cells appended in place; whole-file conflict copies never happen.
- Track, profile — last-write-wins by `updated_at_ms`.

**Verification and resumability.** A content-addressed file is written to the
path derived from the hash of the bytes actually received, so a bad transfer
cannot overwrite a good entry. Every `GET` accepts `Range`; a partial body
lands in `tmp/<uuid>.part` and resumes at its existing length. An interrupted
sync is recovered by re-running it: the diff never double-applies.

**Security posture.** A pit-lane LAN, not the internet. Plain HTTP plus a
per-peer bearer token minted at pairing; the code is short-lived, single-use,
rate-limited (Q3). Nothing outside `<data>`'s syncable classes is ever served.
No TLS in v1, stated plainly in the SPEC.

## 2. Layer split (CLAUDE.md §2)

- **core (`idl-rs`)** — the manifest model and its walk, the pure diff
  (`plan_sync`), the C2 §7 workbook merge, the `session.json` field merge, and
  verified install of received bytes through C4 §4's atomic write. No network,
  no async, `std::fs` only.
- **transport (`idl-transport`)** — the wire: `axum` server, `mdns-sd`
  discovery, `reqwest` client, pairing and token store, DTOs. No merge logic.
- **tauri (`idl-rs-tauri`)** — five thin commands, the server and discovery
  lifecycle in state, `Progress` on a channel, the auto-trigger.

## 3. Wire protocol sketch

Versioned base path `/idl1/v1`. mDNS TXT: `pid`, `name`, `v=1`, plus the port.
A peer advertising a `v` this build does not speak is listed incompatible.

```
POST /idl1/v1/pair            { code, peer_id, name } -> { peer_id, name, token }
GET  /idl1/v1/manifest        -> C4 §6's document
GET  /idl1/v1/blob/<sha256>
GET  /idl1/v1/session/<id>/{data.parquet,session.json,derived/<sha256>.parquet}
GET  /idl1/v1/{workbook/<workbook_id>,track/<track_id>,profile/<profile_id>}
PUT  <same paths>             push is the symmetric verb
```

Every request but `POST /pair` carries `Authorization: Bearer <token>`. Every
`GET` answers `Accept-Ranges: bytes` and honours a single byte range. `PUT` is
idempotent: identical content already held is a `200` with no write. The
workbook merge is computed by the **receiving** side from both full documents
plus its own base cache, never from the manifest alone.

## 4. Tasks (serial, ≤1 day each)

| # | Layer | Scope | Filter |
|---|---|---|---|
| 1 | docs | C3 §3.9 + C4 §6/§8 amendments, SPEC sync section (spec-first) | — |
| 2 | core | `store::sync::manifest` — types, `build_manifest`, exclusions | `store::sync::manifest` |
| 3 | core | `store::sync::diff` — `plan_sync`, per-class conflict rules | `store::sync::diff` |
| 4 | core | `workbook::merge` front matter + cell state table (C2 §7.1/§7.2) | `workbook::merge` |
| 5 | core | merge ordering, conflict cells, pure-prose path, base cache | `workbook::merge` |
| 6 | core | `store::sync::apply` — verified install per class, `session.json` merge | `store::sync::apply` |
| 7 | transport | `sync::wire` DTOs + `sync::pairing` (code, token, peer record) | `sync::pairing` |
| 8 | transport | `sync::server` — axum routes, auth, range support | `sync::server` |
| 9 | transport | `sync::discovery` — mDNS advertise and browse | `sync::discovery` |
| 10 | transport | `sync::client` — pull/push driver, resumable, progress | `sync::client` |
| 11 | transport | loopback integration test: two data dirs, one process | `sync::loopback` |
| 12 | tauri | `commands::sync` + lifecycle state + auto-trigger event | `commands::sync` |

Gate cadence per CLAUDE.md §8: the named filter every task with a non-zero
`passed` count; the full `cargo test -p idl-rs -p idl-rs-cli --
--test-threads=4` after tasks 4, 8 and 12 and at the lane gate; `cargo check
-p idl-rs-cli --tests` on any core `pub` change, `-p idl-rs-tauri` on task 12.

## 5. Contract amendments (spec-first, task 1)

- **C3 §3.9** — `pair_peer(code)` alone cannot pair: nothing mints or shows a
  code. Add `start_pairing() -> { code, expires_at_ms }`, `unpair_peer(peer_id)`,
  a `peer_appeared` event, and `protocol_version`/`paired_at_ms` on `PeerStatus`.
- **C4 §6** — `.sync-base/` named never-synced and exempt from `verify`'s
  orphan rules; `profiles` in the manifest; §8 items 3 (Q6) and 4 closed.
- **SPEC** — a new sync section replacing §28 (Drive), plus §17a.4's pointer.

## 6. Post-lane TS shell tasks (lead-owned files)

`SyncSection.tsx` drops the "not running on this build" fallback and gains the
pairing-code display half of `start_pairing`; it subscribes to `peer_appeared`
and shows an auto-sync line, not only the manual button. A sync action goes in
the Data tab (R53 Settings Q3); the conflict count links to the merged workbook.

## 7. Test strategy without a second machine

Everything above the wire is a pure function tested directly: manifest diff,
the C2 §7 merge table, the `session.json` field merge, range parsing. The wire
is tested in one process — two `<data>` roots under `tempdir`, a server on
`127.0.0.1:0`, a client against the ephemeral address, mDNS bypassed by a
direct-address constructor. Task 11 proves the round trip: a one-sided blob
lands and verifies; two-sided edits to different cells merge with no conflict;
a same-cell edit yields one conflict cell; a killed transfer resumes.

## 8. Open questions for the lead

1. **Crate placement** (design §16's open item). Recommend sync in
   `idl-transport` under `sync/`, with `idl-transport` gaining a dependency on
   `idl-rs` — one direction only. The alternative (traits in transport,
   implemented in tauri) pushes orchestration into the thin glue crate.
2. **Crates.** `axum` 0.8.9, `mdns-sd` 0.21.1, `tokio` and `reqwest` are all
   pinned in the M0 report already. Recommend adding **nothing**: parse the one
   `Range` header by hand instead of `tower-http`; mint the pairing code and
   token from the pinned `uuid` v4 instead of `rand`.
3. **Transport security.** Recommend plain HTTP plus per-peer bearer tokens,
   no TLS, documented as a LAN-only posture. The code lives 120 s, single-use,
   burnt after five failed attempts. Self-signed TLS pinned at pairing is the
   alternative and costs `rustls`, outside the M0 pins.
4. **Pairing UX.** Recommend symmetric: either side presses "Show code", the
   other types it. That needs `start_pairing` (§5). QR defers to L9.
5. **Workbook merge in this lane?** Recommend **in lane**, tasks 4–5. C2 §7 is
   fully specified and the merge is pure; deferring it ships a sync that cannot
   move the one file two people edit at once.
6. **`session.json` policy** (C4 §8 item 3, still open). Recommend **per-field
   merge**: user-owned fields (rider, bike, venue, comments, tag, lap gates,
   lap flags) merge per field with `updated_at_ms` as tiebreak; the L2b cache
   (`laps`, `track_visits`, both stamps) never merges. Whole-file LWW would
   silently lose a rider's note to a peer's lap re-index.
7. **Peer and token storage.** Tokens must not sync. Recommend
   `app_config_dir()/peers.json`, outside `<data>`, written atomically.
8. **`.sync-base/` placement.** C2 §7 puts it inside `<data>/workbooks/`, which
   C4 §6 sweeps wholesale. Recommend keeping C2's path and adding the exclusion
   in the C4 amendment rather than moving it.
9. **Auto-trigger rate.** Recommend at most one automatic sync per peer per
   60 s, skipped while a manual sync runs, never for an incompatible peer.
