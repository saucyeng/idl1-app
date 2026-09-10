# Lane brief — unpaired peers on the wire (L11 Task 14)

**Worktree:** `../idl-rs-worktrees/discovered`, branch `discovered`, off
idl-rs `main`. **Rust only** — the `idl-rs` submodule; paths written here as
`rust/tauri/src/...` are `tauri/src/...` for you. Do not edit the
superproject (`app/`, `docs/`, `runs/`) — the C3 amendment and the Settings
UI are the lead's. **There is no `CHANGELOG.md` in this submodule**; report
the wording instead.

**Spec discipline:** spec-during, lead's half. Report the exact wording C3
§3.9 must gain.

## The gap

`TASKS.md` (L11 shell task, filed by the lead as **Task 14**):

> No C3 command or event enumerates *unpaired* peers currently visible on
> the LAN (`sync_status` lists only paired peers; `peer_appeared` fires only
> for an already-paired sighting, per `state.rs`'s discovery loop) — so
> R104's "the UI may prefill `peer_id` when exactly one unpaired peer is
> online" has no data source today.

The consequence Isaac actually hits: pairing two of his own machines means
reading a 32-character id off one screen and **typing it into the other**.
The mDNS browse set already knows what is out there; nothing exposes it.

This is the companion to R172, which just landed — that made a device's own
id visible so it *can* be read off. This makes the other side of the
handshake unnecessary in the common case.

## Tasks

### Task 1 — `sync_status` reports discovered peers

`SyncStatusDto` gains `discovered_peers: Vec<DiscoveredPeerDto>` alongside
`paired_peers` and the `this_device` that landed this evening. A
`DiscoveredPeerDto` carries what the browse set actually knows — at minimum
`peer_id`, `name`, `protocol_version`, and the address/port if the existing
`DiscoveredPeer` holds one. Read `state.rs`'s `discovered` map and the
existing `peer_status_dto` for the established shape; **follow it rather
than inventing a parallel one.**

**A peer that is already paired appears in `paired_peers` and NOT in
`discovered_peers`** — the two lists are disjoint. A peer in both would
make every consumer decide which one wins, and they would not all decide
the same way. Say this in the field's doc comment.

Populate it in `sync_status_via` (already takes plain args — extend in the
same style, no `tauri::State`).

### Task 2 — `peer_appeared` widens to any sighting

Today `state.rs`'s discovery loop emits `peer_appeared` only for a peer
already in the paired set. Widen it to fire for **any** sighting, paired or
not, so a Settings pane can show a newly-appearing device without waiting
for the next poll.

The event payload must let a consumer tell the two cases apart without a
second lookup. **Stop and ask before choosing how** — a `paired: bool` on
the existing payload, a tagged enum, or a second event are all defensible
and the choice leaks into C3 and the TS mirror. Do not pick one silently.

Whatever the shape: an unpaired sighting must never carry a pairing token or
anything else a paired peer's row holds and an unpaired one has no business
knowing.

### Task 3 — tests

Inline `#[cfg(test)]`, Arrange/Act/Assert with blank lines, names
`thing — condition — result`. At minimum:

- `sync_status` — a discovered peer that is not paired — appears in
  `discovered_peers`, not in `paired_peers`
- `sync_status` — a discovered peer that IS paired — appears only in
  `paired_peers` (the disjointness rule, asserted directly)
- `sync_status` — nothing discovered — `discovered_peers` is empty, not
  absent
- the widened `peer_appeared` — an unpaired sighting — fires, and the
  payload marks it unpaired

## Gate

One cargo process at a time, foreground, never pass `-j` (capped
machine-wide at 2). Targeted while working:
`cargo test -p idl-rs-tauri sync -- --test-threads=4` — a filter matching
nothing is a failed gate, so report a non-zero `passed` count.

At the end, the lane gate (R159), all three:
- `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`
- `cargo test -p idl-rs-tauri -- --test-threads=4`
- `cargo test -p idl-transport -- --test-threads=4`

Never `--workspace`, `cargo fmt`, `cargo tarpaulin`, or `cargo doc`. idl-rs
is deliberately not rustfmt-formatted — match surrounding style by hand.

## Rules

`CLAUDE.md` binds, including §1: if a field, signature or behaviour is not
stated here or in the contracts — **stop and ask**. Task 2 has an explicit
ask-first in it. Doc comment on every public symbol; typed errors only.
Commit per task. Never push.

## Report back (≤ 15 lines)

Tasks done; the three gate commands' pass counts; the exact wording C3 §3.9
must gain for `discovered_peers` and the widened `peer_appeared`; and your
recommendation on task 2's payload shape if you stopped to ask.
