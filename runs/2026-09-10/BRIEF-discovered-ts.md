# Brief: discovered peers, app side (L11 Task 14 closing half)

Model: sonnet. Worktree: `../idl1-app-worktrees/discovered-ts` (branch `discovered-ts`).
Spec: `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` §3.9 (already amended,
R175/R176). Rust side is merged; the wire now sends `SyncStatus.discovered_peers` and a
tagged `peer_appeared` payload. The TS mirror is behind. CLAUDE.md §7 applies.

## Do
1. `app/src/ipc/sync.ts`: add `DiscoveredPeer { peer_id; name; protocol_version; address; port }`
   (types byte-exact to `rust/tauri/src/commands/sync.rs` `DiscoveredPeerDto`),
   `SyncStatus.discovered_peers: DiscoveredPeer[]`, and
   `type PeerSighting = ({status:"paired"} & PeerStatus) | ({status:"discovered"} & DiscoveredPeer)`.
   Retype `onPeerAppeared` to `PeerSighting`. Doc comments carry the R176 emission rule
   (emits on appearance or field change, never on identical re-resolve; offline emits nothing).
2. `app/src/routes/pages/Settings/syncState.ts` (rulings, do not ask):
   - `SyncStatus.discovered_peers` is the source of truth for the nearby list; each poll
     replaces state's `discovered` list wholesale (that is how entries age out, since
     offline emits nothing).
   - `peerAppeared` with `status:"paired"` upserts into `peers` as today.
     `status:"discovered"` upserts into a new `discovered` field keyed by `peer_id`.
     A peer present in `paired_peers` is never also shown in `discovered`.
   - No protocol-version gating in TS: Rust is the authority on compatibility and
     `pair_peer` fails typed. Show the version as text only.
3. `SyncSection.tsx`: a "Nearby devices" list under the pair form. Clicking an entry
   prefills the peer-id field. Never auto-pairs (R104). Empty list renders a one-line
   "No unpaired devices visible" note.
4. Fix fixtures: `syncPoll.test.ts` EMPTY_STATUS, `syncState.test.ts` statuses gain
   `discovered_peers: []`. Add reducer tests for both sighting kinds and for the
   poll-replaces-discovered rule.
5. CHANGELOG.md one line under the current unreleased heading.

## Gate
From `app/`: `npx tsc --noEmit` and `npx vitest run`. Baseline 179 files / 1808 tests; report
your counts. Commit on the branch, do not merge, do not push. Report in 15 lines or fewer:
commit hash, counts, anything you had to decide that is not ruled above.
