# Lane brief — this device's sync identity on the wire (R170/R172)

**Worktree:** `../idl-rs-worktrees/device-identity`, branch
`device-identity`, off idl-rs `main`. **Rust only** — the `idl-rs`
submodule. Paths written below as `rust/tauri/src/...` are `tauri/src/...`
in your worktree. Do not edit the superproject (`app/`, `docs/`, `runs/`):
the C3 amendment and the Settings UI are the lead's. There is **no
`CHANGELOG.md` in this submodule** — do not create one; the changelog line
is the lead's, in the superproject.

**Spec discipline:** spec-during, lead's half. Report the exact wording C3
§3.9 must gain.

## The gap

`set_sync_device_name` (C3 §3.9, ruling R105) has been live in Rust since
2026-09-07 and has **no TypeScript caller at all** — found by this week's
mirror audit (R170). Wiring it is blocked on something that audit could not
see: **nothing on the wire reports this device's own name.**
`SyncStatusDto` carries `paired_peers` and `last_sync_utc_ms` and no
identity. A rename field with no current value to display is not a feature.

Ruling R172 (read it in full at the end of `runs/2026-09-03/decisions.md`)
settles the shape: the identity rides on `sync_status`, not a new command.

## Tasks

### Task 1 — `SyncStatusDto` gains `this_device`

In `rust/tauri/src/commands/sync.rs`:

```rust
pub struct ThisDeviceDto {
    pub peer_id: String,
    pub name: String,
}
```

added to `SyncStatusDto` as `pub this_device: ThisDeviceDto`. Populate it in
`sync_status_via` from `SyncState`'s `peer_id` and its `name` lock — which
means `sync_status_via` needs those passed in; extend its parameter list in
the style the other `_via` functions already use (plain args, no
`tauri::State`), and update `sync_status` accordingly.

`peer_id` is on it deliberately, not incidentally: R104 forbids the app from
guessing a peer id, so a user pairing two of their own machines must read
this one's id off this one's screen, and it is displayed nowhere today. Say
that in the field's doc comment.

Both fields are non-optional. The identity always exists —
`identity::load_or_create` mints it on first launch — so an `Option` here
would model a state that cannot occur and force every caller to handle it.

### Task 2 — tests

Inline `#[cfg(test)]`, Arrange/Act/Assert with blank lines, names
`thing — condition — result`. At minimum:

- `sync_status` — a freshly minted identity — `this_device` carries that
  `peer_id` and `name`
- `sync_status` — after `set_sync_device_name` — reports the **new** name
  (the two commands agree; this is the whole point of the field)
- `set_sync_device_name` — a blank/whitespace-only name — still
  `invalid_argument`, and `sync_status` still reports the **old** name (a
  rejected rename changes nothing)

Follow whatever the existing sync tests already do to construct a
`SyncState`-shaped fixture; do not invent a second approach.

### Task 3 — do NOT change rename semantics

`set_sync_device_name`'s doc comment states that renaming does not
retroactively change what an already-paired peer displays for us — that name
was copied into their peer file at pairing time. **That stays true**; this
lane adds no wire message and no re-announce. If you find yourself tempted
to propagate the rename to peers, stop and report it — that is a contract
change, not a task.

## Gate

One cargo process at a time; never pass `-j`; run cargo in the foreground.
Targeted while working: `cargo test -p idl-rs-tauri sync -- --test-threads=4`
(a filter matching nothing is a failed gate — report a non-zero `passed`).

At the end, the lane gate (R159), all three:
- `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`
- `cargo test -p idl-rs-tauri -- --test-threads=4`
- `cargo test -p idl-transport -- --test-threads=4`

Never `--workspace`, `cargo fmt`, `cargo tarpaulin`, or `cargo doc`. idl-rs
is deliberately not rustfmt-formatted — match surrounding style by hand.

## Rules

`CLAUDE.md` standing orders bind, including §1: if a field, signature or
behaviour is not stated here or in the contracts — **stop and ask**. Doc
comment on every public symbol; typed errors only. No AI attribution
trailers. Commit per task. Never push.

## Report back (≤ 15 lines)

Tasks done; the three gate commands' pass counts; the exact wording C3 §3.9
must gain for `SyncStatusDto.this_device`; and anything you found that
contradicts this brief.
