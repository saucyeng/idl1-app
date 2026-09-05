# L5 Task 14 re-review — R50 fix verification (scoped)

## Commits / files touched

- idl-rs worktree (`wave1-l5-tauri`, `e479a24..df034d6`; amends the prior `c4903cf`):
  same single commit "tauri: fetch_tile (C3 3.5 v2 layout) over core::tile; retire M0
  smoke_tile". Diff against the previously-reviewed `c4903cf`: `tauri/src/commands/tiles.rs`
  only (+2 lines, one new assertion in `fetch_tile_column_count_zero_invalid_argument`).
- idl1-app worktree (`wave1-l5-tauri`, `e87473d..47cd36d`; amends the prior `d6cc1bf`, and
  the lead re-amended the message after the implementer's `3aee3f6` — content identical):
  commit "app: tile decoder to C3 3.5 v2; end-to-end tile fetch proven headlessly". Diff
  against the previously-reviewed `d6cc1bf`: `CHANGELOG.md`, `TASKS.md`, `rust` (submodule
  pointer) only. `app/src/ipc/tiles.ts`, `app/src/ipc/tiles.test.ts`,
  `app/src/routes/pages/NotebookPage.tsx`, `app/src/ipc/_m0_smoke.ts` are byte-identical to
  the previously-reviewed commit (confirmed via `git diff d6cc1bf..47cd36d`, which touches
  only the three files above).

## Test command run (exactly once, per dispatch)

`cargo test -p idl-rs-tauri tile` (idl-rs worktree) — `test result: ok. 6 passed; 0 failed;
0 ignored; 0 measured; 80 filtered out`. Non-zero `passed`, `0 failed`. No other
cargo/npm invocation was run (merge gate not rerun, no `npm test`, per instruction).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | None. All five checked items pass; no new findings. | — |

## Verification

**(a) TASKS.md.** `idl1-app-worktrees/wave1-l5-tauri/TASKS.md:26` now reads:
`- [ ] L5 Tauri scaffold hardening — Tasks 1-8, 10-14 landed; Task 9 (import commands)
deferred with L2; Step 6's on-screen render unconfirmed (headless byte-level proof only,
2026-09-05).` This is an exact, word-for-word match to R50's prescribed wording
(`runs/2026-09-03/decisions.md`, R50 entry). The box is unticked and both outstanding
items — Task 9's deferral and Step 6's unconfirmed render — are stated inline, matching
the file's own convention elsewhere (M0 Task 10, L4).

**(b) column_count detail assertion.** `idl-rs-worktrees/wave1-l5-tauri/tauri/src/commands/tiles.rs`,
`fetch_tile_column_count_zero_invalid_argument` (around line 214-229) now has, immediately
after the existing `assert_eq!(err.kind, IpcErrorKind::InvalidArgument);`:
```
let detail = err.detail.unwrap();
assert_eq!(detail["column_count"], 0);
```
This pins the same field the command actually constructs (`serde_json::json!({ "column_count":
column_count })` in the command body), closing the Minor finding from the prior review. No
`.unwrap()` concern — this is `#[cfg(test)]` code operating on a value the test itself just
asserted came back as `Some` via the surrounding error-kind check, consistent with the rest
of the test module's style (the tier test does the same).

**(c) Whole-diff overstatement sweep.** Read both amendment diffs in full, not spot-checked:
- idl-rs: only the two-line test addition above. No commit-message, doc-comment, or code
  change elsewhere.
- idl1-app `CHANGELOG.md`: rewords the L5 entry from the previous ("proven headlessly...
  the NotebookPage render itself is unit-tested and type-checked but not confirmed on
  screen — no one was available to look at a window") to a version that keeps the same
  honest split but is more specific: "parse → store → fetch_tile → decoded bytes verified
  in a headless test (header v2, 20224 bytes, real sample values); the NotebookPage canvas
  render compiles and type-checks with unit tests passing but has not been visually
  confirmed." The new "20224 bytes" figure is not fabricated: it matches the brief's own
  worked example (`brief-task14.md:189`, `32 + 1024*8 + 600*20 = 20224`) for a
  1024-sample, 600-column (`CANVAS_WIDTH`) tile — i.e. the exact request `NotebookPage`
  issues. The new wording states plainly that the render "has not been visually
  confirmed" — if anything stronger/clearer than the prior wording, not weaker. No claim
  here or elsewhere in the diff asserts the render was seen on screen.
- idl1-app `TASKS.md`: covered under (a); no overstatement.
- idl1-app commit message: "Task 9 (import commands) deferred with L2; Step 6's on-screen
  render unconfirmed -- byte-level proof only (R50)." — states the same facts plainly,
  ties it to the ruling, does not claim the render was confirmed.
- No other file in either diff (doc comments, test names, other CHANGELOG entries) was
  touched by the amendment, per the `git diff <old>..<new>` stat output for both worktrees
  (3 files in idl1-app, 1 file in idl-rs — matching exactly the changes described in (a)
  and (b) plus the submodule pointer). The previously-reviewed and unchanged
  `NotebookPage.tsx` doc comment ("proves parse → store → tile encoder → binary IPC →
  pixels for a real session") was already in place at the prior review and is unchanged by
  this amendment — it is not a new claim introduced here, and is out of scope for this
  scoped re-review, which is confined to the R50 fix set.

**(d) Submodule pointer.** `idl1-app-worktrees/wave1-l5-tauri`'s `rust` submodule now
points at `df034d612f9965f65afc02c1afe4bc5a68fed7fc`, i.e. exactly the amended idl-rs sha
(`git diff d6cc1bf..47cd36d` shows `rust` moving `c4903cf..df034d6`, and the idl-rs worktree's
`HEAD` at `df034d6` matches). Correct.

**(e) No other changes.** Confirmed by direct diff of the reviewed-state to the amended
state on both sides (`c4903cf..df034d6` for idl-rs, `d6cc1bf..47cd36d` for idl1-app): the
only content changes are the TASKS.md line (a), the CHANGELOG line (c, a wording
refinement of the same honest claim — not a new claim, and not one of the two items R50
named, but it does not overstate or contradict R50, and was not forbidden by the ruling),
the test assertion (b), the submodule pointer (d), and the commit messages. Nothing in
source logic, test coverage elsewhere, or other documentation changed.

## Verdict rationale

Both items named in R50 are fixed exactly as ruled: `TASKS.md` is unticked and states both
outstanding items verbatim per the ruling's prescribed text, and the `column_count` detail
is now pinned by the test. The CHANGELOG wording changed beyond the ruling's two items, but
only to state the same honest "bytes verified, screen not confirmed" split more precisely
(with a formula-backed byte count) — it does not introduce or restore any overstatement,
and the render is still stated as unconfirmed in every place a reader could look (TASKS.md,
CHANGELOG, commit message). The one targeted gate (`cargo test -p idl-rs-tauri tile`) passes
6/6. No remaining claim anywhere in either diff asserts the on-screen render was verified.

VERDICT: CLEAN
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\runs\2026-09-03\lanes\l5-tauri-scaffold\review-task14-r50.md
COUNTS: critical=0 important=0 minor=0
NOTES: Both R50 items are fixed exactly as ruled (TASKS.md unticked with both outstanding items, column_count detail pinned); CHANGELOG wording was also refined beyond the ruling's scope but stays honest (adds a formula-backed byte count, still states the render is unconfirmed) — not a new overstatement.
