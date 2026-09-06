# L11 Task 3 — core: the sync diff

The pure heart of sync: two manifests in, a plan of transfers out. No I/O at
all — this function never touches the filesystem. TDD, ONE commit.

**Depends on Task 2.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l11-sync"
git merge-base --is-ancestor 52efba8 HEAD && echo GATE-OK
grep -c "pub fn build_manifest" core/src/store/sync/manifest.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md` §2/§4; this lane's `PLAN.md` §1 (the per-class conflict policy)
and §3; C4 §6's entry table in full — every conflict rule below is quoted
from it, not invented; Task 2's `manifest.rs`.

## Where

- **Files:** `core/src/store/sync/diff.rs` (new),
  `core/src/store/sync/mod.rs`, `CHANGELOG.md`.

## Interfaces

```rust
/// One unit of work a sync run performs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncAction {
    /// Fetch this file from the peer and install it locally.
    Pull(SyncItem),
    /// Offer this file to the peer.
    Push(SyncItem),
    /// Both sides hold it; fetch the peer's copy so the receiver can merge
    /// locally (workbooks only — the merge needs both full documents).
    PullForMerge(SyncItem),
}

/// Which file, in which class. `session_id` is set only for session-scoped
/// classes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncItem {
    pub class: SyncClass,
    pub key: String,                    // sha256 | session_id | workbook_id | track_id | profile_id
    pub session_id: Option<String>,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncClass { Blob, DataParquet, Derived, SessionJson, Workbook, Track, Profile }

/// Why nothing is transferred for an item that differs on both sides.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncNote { pub class: SyncClass, pub key: String, pub reason: SyncNoteReason }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncNoteReason {
    /// `data.parquet`: version pair matches, hashes differ — a last-ulp
    /// cross-CPU difference (design §5). Keep local, transfer nothing.
    EquivalentDataParquet,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SyncPlan { pub actions: Vec<SyncAction>, pub notes: Vec<SyncNote> }

/// Computes what a sync between these two sides must move. Pure and
/// deterministic; `local` is this machine.
pub fn plan_sync(local: &Manifest, remote: &Manifest) -> SyncPlan;
```

## Key logic — one rule per class, all from C4 §6

- **Blob, Derived** — set difference by `sha256` (derived is per session).
  Present only remotely ⇒ `Pull`; only locally ⇒ `Push`; both ⇒ nothing.
- **`data.parquet`** — keyed by `session_id`. Version pair
  `(importer_version, seam_correction_version)` equal and hashes differ ⇒
  no action, one `EquivalentDataParquet` note. Version pairs differ ⇒ the
  newer pair is authoritative and the other side transfers the **bytes**
  (`Pull` or `Push`), never regenerates. Present on one side only ⇒ transfer.
  **Newer** is decided by the ordering rule Task 1's amendment states; if the
  amendment does not state one, STOP and ask — do not invent a version
  comparison.
- **`session.json`** — keyed by `session_id`. Hashes equal ⇒ nothing.
  Different ⇒ `PullForMerge` (Task 6 does the field merge; the diff never
  decides a winner by `updated_at_ms` alone, because the merge is per field).
- **Workbook** — keyed by `workbook_id`, never `file_name`. Equal hashes ⇒
  nothing. Different ⇒ `PullForMerge`. Present on one side only ⇒ transfer.
  A `file_name` mismatch for a known id is a **local rename to reconcile**,
  not a transfer: emit no action for it (Task 6 reconciles the name).
- **Track, Profile** — LWW by `updated_at_ms`: strictly newer remote ⇒
  `Pull`; strictly newer local ⇒ `Push`; equal timestamps with differing
  hashes ⇒ keep local, no action.
- `actions` is sorted deterministically (class, then key) so a plan is
  reproducible. Determinism is a test.
- `plan_sync(a, b)` and `plan_sync(b, a)` must be mirror images for every
  symmetric class. That is a test, not a comment.

## Tests

- `plan_sync — a blob only on the remote — one Pull; only local — one Push`.
- `plan_sync — identical manifests — an empty plan`.
- `plan_sync — data.parquet, same version pair, different hash — no action and
   one EquivalentDataParquet note`.
- `plan_sync — data.parquet, newer remote importer version — Pull`.
- `plan_sync — session.json differing — PullForMerge, never a bare Pull`.
- `plan_sync — a workbook differing — PullForMerge`.
- `plan_sync — a workbook with the same id and a different file_name — no
   transfer action`.
- `plan_sync — a track newer on the remote — Pull; newer locally — Push;
   equal updated_at_ms with different hashes — no action`.
- `plan_sync — derived channels differing per session — the right session_id
   on every item`.
- `plan_sync — swapping the arguments — Pull and Push mirror exactly`.
- `plan_sync — run twice — identical plans`.

## COMPUTE RULES

While working: `cargo test -p idl-rs store::sync::diff`, foreground, non-zero
`passed`. New `pub` symbols in core ⇒ `cargo check -p idl-rs-cli --tests`.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. Types. 4. `plan_sync`, class by class.
      5. Filter green. 6. `cargo check -p idl-rs-cli --tests`. 7. NUL check.
      8. `CHANGELOG.md`. 9. Commit `core: sync diff — plan_sync (L11)`.

## Do not

- Do not open a file, take a path, or touch a clock in this module.
- Do not merge anything here — the diff decides *what moves*, Task 6 decides
  *what the result is*.
- Do not invent a conflict rule C4 §6 does not state.

## Spec discipline

**No spec change needed.** A class whose rule C4 §6 leaves open is a STOP.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the test line with its `passed` count; the
`cargo check` result; the exact `data.parquet` version-ordering rule used and
where it came from; any C4 §6 rule that could not be implemented as written.
