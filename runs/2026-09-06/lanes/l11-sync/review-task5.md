# Review — L11 Task 5: core `workbook::merge` ordering, conflict cells, base cache

**Commits reviewed:**
- idl-rs `1ed5a29` on `l11-sync` (worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\l11-sync`, on top of `bdb24b4`)
  — `core: workbook merge ordering, conflict cells, base cache (L11)`
- idl1-app `eb2fb29` (worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\l11-sync`)
  — `docs: CHANGELOG bullet for L11 Task 5`

**Files touched:** `core/src/workbook/merge/mod.rs` (+376, cell-decision-to-document logic + tests),
`core/src/workbook/merge/order.rs` (new, +279, ordering/conflict-copy/pure-prose helpers),
`core/src/store/sync/base_cache.rs` (new, +180, `.sync-base` cache), `core/src/store/sync/mod.rs`
(+1, `pub mod base_cache;`), `CHANGELOG.md` (idl1-app). All on the brief's named list; no other
files changed. `git diff bdb24b4 1ed5a29 -- Cargo.lock` is empty. NUL-byte check
(`grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]'`) is `0` on all three new/changed Rust files.

**Test command:** none run — Rust lane, cargo forbidden for reviewers. Verified statically:
`core/src/workbook/merge/mod.rs` has 10 new `#[test]` fns, `core/src/store/sync/base_cache.rs`
has 6. Task 4 already landed 17 in `workbook::merge` (cells.rs 11 + front_matter.rs 6), so the
filter `cargo test -p idl-rs workbook::merge` should now report 27, matching the implementer's
claim exactly (17 + 10). `store::sync::base_cache` 6 matches directly. Amendment ancestry
(`e966c8c1a991ee5b93dbeb1ddfcc5202ad04ed84`, C3 §3.9 + C4 §6, ruling R88) is present on `main`
and the `.sync-base` exemption text is there (see below) — confirmed by reading the commit, not
by re-running the gate command.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `core/src/workbook/merge/mod.rs:178-210` (`recompute_derived_fields`) | Brief's dispatch explicitly asks to check "`const_lines`/`defs`/`constants` recomputed consistently," and this function is entirely new logic (mirrors `parse_workbook`'s per-cell pass, independently re-running `parse_math_cell_body` + `merge_constants` over the merged cell set). None of the 10 new tests in `mod.rs` assert anything about `merged.doc.defs`, `merged.doc.const_lines`, or `merged.doc.constants` — every test cell body is a bare `name = value` line and never inspects the derived-field outputs. Manual trace shows the logic is correct (same shape as `parse_workbook`'s loop, same helper calls, same discard-of-non-fatal-errors rationale documented in the doc comment), but a real bug here (e.g. wrong `cell.raw_fence_body` fed to `parse_math_cell_body`, or `constants_raw` from the wrong side) would pass every existing test. | Add one test that merges two docs where a `const` line's value changes via a `TakePeer`/`Conflict` outcome and asserts `merged.doc.constants["name"]` reflects the merged (not stale) value. |
| Minor | `core/src/workbook/merge/mod.rs:151-161` | When a front-matter conflict marker exists (`fm_marker_lines` non-empty) *and* the merged document's first cell already carries its own §7.2 conflict/deletion marker (e.g. the very first base cell is itself a `Conflict` or `MarkedDeletion` outcome), the fm marker is prepended ahead of that cell's own marker. This correctly makes the fm marker the document's true first line of body prose (§7.1's requirement), but it means that cell's own marker is no longer `prose_before`'s first line — a combination no test exercises (front-matter conflicts and first-cell conflicts are tested in disjoint tests). Not a spec violation on the letter of either rule taken alone, since §7.1 and §7.2 don't state precedence when both apply to the same line, but worth a one-line code comment or a test making the choice explicit rather than accidental. | Add a comment at `mod.rs:151` noting fm markers take precedence as the document's true first line when both apply, or add a combined test to lock the behaviour in. |
| Minor | `core/src/store/sync/base_cache.rs:52-63` (`write_base`) | Uses plain `write_atomic` rather than `write_atomic_with_retry` (which `write_track` uses for the same style of last-write-wins artifact). This matches the brief's interface comment ("through the §4 atomic primitive") literally and is fine for Task 5's stated scope (single caller, one sync at a time per the PLAN's model), but means a `RenameConflict` from a genuinely concurrent write (e.g. two syncs against the same workbook racing) surfaces as a hard `SyncError` rather than retrying — worth confirming with Task 6/12 (the actual sync driver) that this is the intended behaviour rather than an oversight carried forward. | No action needed in this task; flag for Task 6/12's reviewer to confirm the caller either serialises base-cache writes per workbook or is fine surfacing the conflict. |

**Notes (not findings):**
- **Ordering (§7.3), verified by hand against all four rules.** `build_merged_cells`'s
  `anchor_sequence` walks `base`'s own cell order for survivors (rule 1); `collect_added_by_anchor`
  buckets each side's added ids by the nearest preceding *surviving* base neighbour in that side's
  own document order, defaulting to the pre-everything anchor (rules 2/3); at each anchor,
  `local_buckets` is drained before `peer_buckets` (rule 4); a conflict copy is pushed immediately
  after the local cell it belongs to inside the same loop iteration, never touched by the anchor
  walk afterward (matches "never reordered"). Confirmed against the reorder test
  (`merge_base_cells_reordered_locally…`) and the same-anchor test
  (`merge_a_cell_added_on_each_side_at_the_same_anchor_locals_first`).
- **Conflict-copy id minting (§2.2).** `mint_conflict_id` takes 4 random bytes from a fresh
  `Uuid::new_v4()`, lowercase-hex-encodes them (8 hex chars), and loops on collision against a
  `HashSet` seeded with every id from `local`, `peer` *and* `base`, mutated as each new id is
  minted so two conflict copies in the same merge can't collide with each other either — exactly
  C2 §2.2's "4 random bytes, lowercase hex" assignment rule plus real collision avoidance, matching
  the dispatch's "deterministic? collision-free?" question (not deterministic by design — the spec
  never asks for determinism, only non-collision — and collision-free by construction against
  every id in play).
- **Marker text, byte-for-byte.** `<!-- conflict from {peer_name} -->`,
  `<!-- conflict from {peer_name}: deleted upstream -->`,
  `<!-- conflict from {peer_name}: deleted locally -->` all match C2 §7.2's quoted text exactly,
  confirmed against the contract's own quoted strings and the dedicated tests.
- **Pure-prose path (§7.3 closing paragraph).** `merge_pure_prose`'s `match` correctly returns
  peer's text when only peer changed, local's text (unconditionally, covering both "only local
  changed" and "no one changed") in the `_` arm, and `"{local}\n<!-- conflict from {peer} -->\n{peer}"`
  only when both changed to *different* content — matches "local text followed by marker and peer's
  full text appended," and the identical-edit collision correctly produces no conflict, confirmed
  by the `wb()`-based pure-prose test.
- **Base cache (§7, C4 §6, R88).** `base_cache_path` builds exactly
  `<data>/workbooks/.sync-base/<id>.idl1wb`; `read_base` treats a missing file, non-UTF-8 bytes, or
  a fatal parse failure identically as `Ok(None)` (never a hard error), matching "a corrupt cache
  must not block a sync"; `write_base` rejects `/`, `\`, and `..` in the id before touching the
  filesystem (same guard shape as `write_track`'s `validate_track_id`), verified by the refusal
  test (`write_base_an_id_containing_a_path_separator_refused_nothing_written`) which also asserts
  nothing was written (`workbooks/` doesn't even exist afterward).
- **The `verify::matches_layout` gap is real and confirmed.** Read `core/src/store/verify.rs:185-214`
  directly: `["workbooks", name] => name.ends_with(".idl1wb")` is the only arm for anything under
  `workbooks/`, so both `["workbooks", ".sync-base"]` and `["workbooks", ".sync-base", "<id>.idl1wb"]`
  fall through to `_ => false` and would surface a spurious unmatched-path finding the first time
  `write_base` runs against a real data dir — exactly what the implementer's CHANGELOG note and
  Task 5's report flag. The landed C4 §6 amendment text (idl1-app commit `e966c8c`, ruling R88)
  does state the exemption in prose ("also exempt from §7's unmatched-path finding"), so the
  contract is correctly amended; only the code hasn't caught up. One-line fix for whoever picks
  this up: add `["workbooks", ".sync-base"] => true` and
  `["workbooks", ".sync-base", name] => name.ends_with(".idl1wb")` arms to `matches_layout`
  (`core/src/store/verify.rs`), ahead of the existing `["workbooks", name] => …` arm order doesn't
  matter since match arms are checked in slice-pattern-specificity order here, but placing the more
  specific 3-element pattern before the 2-element `.sync-base` one is the natural spot. This is
  correctly out of scope for Task 5 (file not in its list) and is already flagged for separate
  dispatch — not re-flagged as a Task 5 defect here.
- Front-matter conflict markers (`front_matter_conflict_markers`) correctly filter to only the two
  warning variants that carry a marker, in the order `merge_front_matter` produced them, and render
  the exact `<!-- conflict from <peer>: <key> was "<peer value>" -->` text C2 §7.1 specifies.
- `MergedDoc`'s derives (`Debug, Clone` only, not the brief interface's `Debug, Clone, PartialEq,
  Eq`) are a forced, harmless deviation: `WorkbookDoc` itself (`core/src/workbook/v3/mod.rs:83`,
  landed pre-Task-4) has no `PartialEq`, so `MergedDoc` could not have derived it either way; not
  a scope change, just an interface sketch that didn't survive contact with an existing type.
- Only the four named files changed; no reformatting of untouched lines; hand style (line lengths,
  brace placement) matches the surrounding modules from Task 4.
- CHANGELOG bullet (`eb2fb29`) is accurate line-for-line against the landed code, including its own
  honest flag of the `verify::matches_layout` gap — no overstatement found (contrast with Task 4's
  CHANGELOG finding).

**Verdict rationale.** The ordering algorithm, conflict-copy rendering, id minting, marker text,
pure-prose path and base cache all check out exactly against C2 §7.2/§7.3 and the C4 §6 amendment
on manual trace, with no wrong outcome found in any of the four ordering rules or the sixteen-cell
table's real cells. The one Important finding is a real test-coverage gap on genuinely new,
non-trivial logic (`recompute_derived_fields`) that happens to be correct today but is unguarded
against regression; the two Minors are an untested edge-case interaction and a design note to carry
forward, neither a defect. The flagged `verify::matches_layout` gap is confirmed real but correctly
left to its own dispatch. This is a small, targeted fix (one test) away from clean, not a design
problem.

VERDICT: NEEDS_FIXES
