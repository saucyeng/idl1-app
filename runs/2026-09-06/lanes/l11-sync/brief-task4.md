# L11 Task 4 — core: workbook merge, front matter and the cell state table

C2 §7.1 and §7.2, as a pure function over three parsed documents. The
ordering and rendering half is Task 5 — this task decides *content*. TDD,
ONE commit.

**Depends on Task 3.** **Full suite runs at the end of this task** (fourth
task of the lane, CLAUDE.md §8).

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l11-sync"
git merge-base --is-ancestor 52efba8 HEAD && echo GATE-OK
grep -c "pub fn plan_sync" core/src/store/sync/diff.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md` §2/§4; C2 §7 in full — §7.1's front-matter rules and §7.2's
decision table are this task's specification, verbatim; C2 §2.2 (cell id,
`hex8`, the collision-avoidance path) and §2.4 (prose); the landed workbook
parser under `core/src/workbook/v3/` — the `Doc`/cell types you merge over
already exist, read them before designing anything; `front_matter.rs`'s
`render_front_matter` (R75 — no hand-built YAML anywhere).

## Where

- **Files:** `core/src/workbook/merge/mod.rs` (new),
  `core/src/workbook/merge/cells.rs` (new),
  `core/src/workbook/merge/front_matter.rs` (new), `core/src/workbook/mod.rs`,
  `CHANGELOG.md`.

## Interfaces

```rust
/// A cell's state relative to `base` on one side (C2 §7.2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CellState { Unchanged, Changed, Added, Deleted }

/// What the merge decided for one cell id.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CellOutcome {
    /// Keep local's cell as-is.
    KeepLocal,
    /// Adopt the peer's content for this id.
    TakePeer,
    /// The cell is gone from the merged document.
    Drop,
    /// Local's cell survives; the peer's is appended below as a conflict
    /// copy with a fresh id (C2 §2.2 collision avoidance).
    Conflict,
    /// Local's (or the peer's) cell survives, marked — the other side
    /// deleted it (C2 §7.2's Changed × Deleted rows).
    MarkedDeletion { deleted_by_peer: bool },
}

/// A merge that produced something a human should look at.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MergeWarning {
    /// C2 §7.2's "impossible" Added × {U,C,D} cells reached — the base cache
    /// disagrees with one of the documents. Names the cell id.
    MergeStateInconsistency { cell_id: String },
    /// A front-matter scalar changed on both sides; the peer's was discarded.
    FrontMatterConflict { key: String, peer_value: String },
    /// A constant changed on both sides.
    ConstantConflict { name: String, peer_value: String },
}

/// Front-matter merge (C2 §7.1). `Err` when `local.id != peer.id` — not the
/// same workbook, and sync must refuse rather than overwrite.
pub fn merge_front_matter(local: &FrontMatter, peer: &FrontMatter, base: &FrontMatter,
                          peer_name: &str) -> Result<(FrontMatter, Vec<MergeWarning>), MergeError>;

/// Per-id decisions (C2 §7.2). Deterministic; no I/O, no clock.
pub fn decide_cells(local: &Doc, peer: &Doc, base: &Doc)
    -> (BTreeMap<String, CellOutcome>, Vec<MergeWarning>);
```

Exact names for `Doc`/`FrontMatter` come from the landed parser — use what
exists, do not define a parallel type.

## Key logic

- `base` absent (first-ever sync) is the **empty document**: every cell on
  both sides classifies `Added`. Task 5 owns reading the cache; this task
  takes `base` as a parameter and must behave correctly when it has no cells.
- The decision table is C2 §7.2's, all sixteen cells. The four rows the
  contract marks *impossible* get its stated defensive handling plus a
  `MergeStateInconsistency` warning — never a panic, never a silent drop.
- **Byte-identical content on both sides is never a conflict**, even when
  both classify `Changed` (C2 §7.2 says so explicitly).
- A prose-only edit makes the owning cell `Changed` — prose travels with its
  cell (C2 §7.2's closing paragraph).
- `id`/`version` mismatch is `MergeError`, not a warning.
- `name`/`units` and each `constants` entry follow §7.1's three-way scalar
  rule: unchanged on one side takes the other; changed on both keeps local
  and warns with the peer's discarded value.

## Tests

One test per row of C2 §7.2 that is reachable, named for the row, plus:
- `merge_front_matter — differing ids — MergeError, nothing merged`.
- `merge_front_matter — name changed on the peer only — the peer's name`.
- `merge_front_matter — name changed on both — local's name and one warning
   carrying the peer's value`.
- `merge_front_matter — a constant added on each side — both present`.
- `merge_front_matter — a constant changed on both — local wins, one warning`.
- `decide_cells — an empty base — every cell on both sides is Added`.
- `decide_cells — both sides made the identical edit — KeepLocal, no conflict`.
- `decide_cells — an Added × Unchanged pair — TakePeer and one
   MergeStateInconsistency warning naming the id`.
- `decide_cells — a prose-only edit on one side — that cell is Changed`.
- `decide_cells — run twice — identical outcomes`.

## COMPUTE RULES

While working: `cargo test -p idl-rs workbook::merge`, foreground, non-zero
`passed`. New `pub` symbols in core ⇒ `cargo check -p idl-rs-cli --tests`.
**At the end of this task**, once: `cargo test -p idl-rs -p idl-rs-cli --
--test-threads=4`.

## Steps

- [ ] 1. Gate. 2. Failing tests, one per §7.2 row. 3. Front-matter merge.
      4. `decide_cells`. 5. Filter green. 6. `cargo check -p idl-rs-cli
      --tests`. 7. Full suite. 8. NUL check. 9. `CHANGELOG.md`. 10. Commit
      `core: workbook merge — front matter and cell states (L11)`.

## Do not

- Do not render or reorder anything — that is Task 5.
- Do not read or write a file, including the base cache.
- Do not build YAML with `format!` (R75).
- Do not mint a conflict-cell id here; Task 5 does, on the §2.2 path.

## Spec discipline

**No spec change needed** — C2 §7 is signed and complete. A row you cannot
implement as written is a STOP with the row named.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the filter's `passed` count; the full-suite
result line; the `cargo check` result; which C2 §7.2 rows needed the
defensive path; any row whose contract text was ambiguous in practice.
