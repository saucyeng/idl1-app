# L5 Task 12 re-review — unwrap fix (`cursor_readout_via`)

**Worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l5-tauri`
**Commit reviewed:** `d3a6788..aed233c` (single commit `aed233c` "tauri: cursor_readout - remove unwraps on caller-derived channel lookup")
**Files touched:** `tauri/src/commands/cursor.rs` only (`git diff --stat`: 1 file changed, 15 insertions(+), 15 deletions(-))

Prior review: `runs/2026-09-03/lanes/l5-tauri-scaffold/review-task12.md` (verdict `NEEDS_FIXES`, one Important finding: two `.unwrap()` calls on caller-derived channel lookups at `cursor.rs:61,69`).

## Test command and result

`cargo test -p idl-rs-tauri cursor`, run once: **6 passed; 0 failed; 0 ignored** (61 filtered out).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | None. | — |

No Critical, Important, or Minor findings.

## Verification detail

**(a) No `unwrap`/`expect`/panicking index remains — verified, whole file grepped.** Non-test production code (`cursor.rs:1-92`) has zero `.unwrap()`, `.expect()`, or unchecked indexing. The only `.unwrap()`s left in the file are inside `#[cfg(test)]` (lines 105, 153, 163, 180, 196, 212) and operate on values the test itself just constructed (`create_dir_all`, `write_session_parquet`, and `cursor_readout_via` calls whose success is the thing under test) — not on caller-supplied data, and not the pattern the prior finding flagged.

**(b) Behaviour unchanged — atomicity preserved, traced through the new control flow.** The existence-check loop (`cursor.rs:52-62`) now builds `resolved: Vec<&Channel>` by iterating `channels` in order and doing `session.channels.iter().find(...).ok_or_else(...)?` for each id. The `?` returns `Err(...)` from inside this loop on the first miss, before the loop can proceed to the next id and before the function reaches the materialization step at line 66. Materialization (`materialized`, `triples`) is a separate pass that only runs after the full `resolved` vector has been built, i.e. after every id has been confirmed present. This is the same shape as before the fix: a late unknown channel (e.g. `["long", "nope"]`) still aborts the whole call with `InvalidArgument`/`detail.channel = "nope"` before any value is read for `long`, with no code path producing a partial `Ok(CursorReadout { .. })`. Verified against the existing test `cursor_readout_unknown_channel_in_the_list_invalid_argument_naming_it_no_partial_readout`, which was not touched by this commit and still passes unmodified — the restructure did not need to change any test's expectations, which is itself evidence the observable behaviour didn't move.

I also checked the index-alignment risk a restructure like this typically introduces: `triples` is built via `channels.iter().zip(resolved.iter()).zip(materialized.iter())`. `resolved` is pushed in the same loop, same order as `channels` is iterated (`cursor.rs:53-62`), and `materialized` is derived by mapping over `resolved.iter()` in order (`cursor.rs:66`), so all three sequences stay in lockstep by construction — no id/channel/sample mismatch is possible even though the id and the channel are no longer looked up together at the materialization site.

**(c) R31 null-outside-span untouched.** The call into `idl_rs::cursor::cursor_readout(&triples, t_us)` (`cursor.rs:74`) is byte-identical to the pre-fix version; only how `triples` is assembled changed, not what it contains or how the result is folded into `values`. The three R31 cases (channel stops early → `null`, channel starts late → `null`, exact-sample hit → `Some`) are exercised by the same three tests as before (`..._past_a_channels_last_sample...`, `..._before_a_channels_first_sample...`, `..._on_a_recorded_sample...`), all unmodified by this commit, all passing.

**(d) Doc comment above `cursor_readout_via` still accurate.** Lines 25-37 state: existence-checks every id **before** reading any value, rejects on first miss with `InvalidArgument`/`detail.channel`, then materializes in request order and hands off to `idl_rs::cursor::cursor_readout` without re-deriving R31. All of these claims hold for the new two-pass structure exactly as they held for the old one — the doc comment describes the *contract*, not the old double-lookup implementation detail, so no edit was needed and none was made.

**(e) Nothing else changed.** `git diff --stat` confirms a single file, and reading the full diff shows the change is confined to the existence-check/materialization loops (adds a new doc comment at lines 46-51 explaining the restructure, replaces the two `.unwrap()` sites with the `resolved` vector and its consuming `zip`). No signature changes, no new error kinds, no test additions/removals, no changes to `CursorReadout`, the `#[tauri::command]` wrapper, or `commands/mod.rs`/`lib.rs`.

## Verdict rationale

The single prior Important finding (two `.unwrap()` calls on caller-derived data) is fully resolved: the restructure collapses the existence-check and the materialization lookup into one pass over `&Channel` references, with a typed `InvalidArgument` error replacing both former `.unwrap()` sites. Tracing the new control flow shows the atomicity guarantee (fail before any value is read, on any unknown id anywhere in the list) is preserved exactly, the R31 null-handling is untouched (same call, same tests, unmodified and passing), the doc comment remains accurate as a contract description, and no other file or behaviour was touched. The test command was run once and reports a non-zero passing count with the same six tests as before, unmodified.

VERDICT: CLEAN
