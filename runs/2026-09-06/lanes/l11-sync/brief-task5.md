# L11 Task 5 — core: merge ordering, conflict cells and the base cache

Turns Task 4's decisions into a document: C2 §7.3's ordering, the conflict
copies, the pure-prose path, and the `.sync-base` cache. TDD, ONE commit.

**Depends on Task 4.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l11-sync"
git merge-base --is-ancestor 52efba8 HEAD && echo GATE-OK
grep -c "pub fn decide_cells" core/src/workbook/merge/cells.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md` §2/§4; C2 §7 in full, especially §7.3's four ordering rules and
§7.2's conflict-copy text (the marker line, the fresh id, where the marker
goes); C2 §2.2's collision-avoidance path for minting an id; C2 §2.4's
pure-prose document; Task 4's `merge/` modules; `core/src/store/atomic.rs`
(`write_atomic`) for the cache writes.

## Where

- **Files:** `core/src/workbook/merge/mod.rs`,
  `core/src/workbook/merge/order.rs` (new),
  `core/src/store/sync/base_cache.rs` (new), `CHANGELOG.md`.

## Interfaces

```rust
/// The result of merging one workbook.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergedDoc {
    pub doc: Doc,
    /// Conflict cells created (C3 §3.9's `SyncResult.conflicts` counts these).
    pub conflicts: u32,
    pub warnings: Vec<MergeWarning>,
}

/// C2 §7's whole contract, in one pure function. `base` is the empty
/// document when no cache exists.
pub fn merge(local: &Doc, peer: &Doc, base: &Doc, peer_name: &str)
    -> Result<MergedDoc, MergeError>;

/// `<data>/workbooks/.sync-base/<workbook_id>.idl1wb`.
pub fn base_cache_path(data_root: &Path, workbook_id: &str) -> PathBuf;

/// Reads the cached base. `Ok(None)` when absent — the caller then merges
/// against the empty document (C2 §7).
pub fn read_base(data_root: &Path, workbook_id: &str) -> Result<Option<Doc>, SyncError>;

/// Overwrites the cache after a successful sync, through the §4 atomic
/// primitive. Creates `.sync-base/` if absent.
pub fn write_base(data_root: &Path, workbook_id: &str, bytes: &[u8]) -> Result<(), SyncError>;
```

## Key logic

- **Ordering** is C2 §7.3's four rules exactly: base cells keep base order;
  a local-only addition sits after its nearest preceding surviving base
  neighbour as in `local`; a peer-only addition likewise against `peer`; two
  additions at the same anchor put local's first. Conflict copies always sit
  immediately below the local cell they belong to and are never reordered.
- **A conflict copy** carries a fresh `hex8` id minted on C2 §2.2's
  collision-avoidance path, colliding with neither document's ids, and the
  marker `<!-- conflict from <peer> -->` as the first line inside its
  `prose_before`. The marker text is written from the perspective of the
  document being produced (C2 §7.2's Deleted × Changed row).
- **`MarkedDeletion`** inserts the marker into the surviving cell's
  `prose_before`; it never invents a second cell.
- **A document with zero fenced cells** takes §7.2's plain three-way text
  path, not the table.
- `conflicts` counts conflict *cells created*, not warnings.
- The base cache is bytes in, `Doc` out: `read_base` parses; a cache file
  that will not parse is treated as absent and reported as a warning, never
  a hard failure — a corrupt cache must not block a sync.
- `write_base` must reject a `workbook_id` containing a path separator or
  `..` before joining, the same guard `write_track` uses.

## Tests

- `merge — two sides editing different cells — both edits present, zero conflicts`.
- `merge — two sides editing the same cell differently — one conflict cell
   below local's, a fresh id, the marker as prose_before's first line`.
- `merge — the same cell edited identically on both sides — zero conflicts`.
- `merge — a cell added on each side at the same anchor — local's first`.
- `merge — a cell deleted on one side, untouched on the other — it is gone`.
- `merge — a cell deleted by the peer, edited locally — local's survives with
   the "deleted upstream" marker`.
- `merge — base cells reordered locally — C2 §7.3's order, deterministically`.
- `merge — a pure-prose document changed on both sides — the three-way text
   result, not a cell table`.
- `merge — differing workbook ids — MergeError`.
- `merge — merging twice — identical output (idempotent)`.
- `read_base — no cache — Ok(None)`; `read_base — a corrupt cache — Ok(None)
   with a warning, not an error`.
- `write_base — then read_base — the same document`.
- `write_base — an id containing a path separator — refused, nothing written`.

## COMPUTE RULES

While working: `cargo test -p idl-rs workbook::merge`, foreground, non-zero
`passed`; also run `cargo test -p idl-rs store::sync::base_cache`. New `pub`
symbols in core ⇒ `cargo check -p idl-rs-cli --tests`.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. Ordering. 4. Conflict rendering.
      5. Pure-prose path. 6. Base cache. 7. Filters green.
      8. `cargo check -p idl-rs-cli --tests`. 9. NUL check. 10. `CHANGELOG.md`.
      11. Commit `core: workbook merge ordering, conflict cells, base cache (L11)`.

## Do not

- Do not change Task 4's decision table; if a row is wrong, report it.
- Do not write the merged workbook to `workbooks/` here — Task 6 installs it.
- Do not let a corrupt base cache fail a sync.
- Do not build front matter with `format!` (R75).

## Spec discipline

**No spec change needed** — C2 §7.3 is signed. Note that Task 1's C4
amendment is what makes `.sync-base/` exempt from sync and from `verify`;
if that exemption is missing from the landed amendment, STOP and report.

## Report back (≤15 lines)

Commit hash + `git show --stat`; both filters' `passed` counts; the
`cargo check` result; how a fresh conflict-cell id is minted; whether the
`.sync-base` exemption was present in the landed C4 text.
