# L2b Task 7 review — overlay_laps drives every overlay lap (R73 closed)

**Commits reviewed:**
- idl-rs `fb34839` (`core+tauri: overlay_laps drives every overlay lap (R73 closed)`) —
  `core/src/math/eval.rs`, `core/src/math/tests_parity.rs`,
  `tauri/src/commands/workbook.rs`, `tauri/src/session_source.rs`
- idl1-app `e4bf85f` (`docs: overlay_laps drives every overlay lap (R73 closed, C2 3.3 + C3 3.4)`) —
  `CHANGELOG.md`, C2 §3.3, C3 §3.4

**Test command / result:** read-only static verification per Rust-lane rule (no cargo run).
Counted `#[test]` functions matching the dispatch's filters directly from source:
- `math::` filter → `grep -rc '#\[test\]' core/src/math/*.rs` sums to **176**, matching the
  implementer's reported "176 passed".
- `session_source::` filter → `grep -c '#\[test\]' tauri/src/session_source.rs` → **14**,
  matching the implementer's reported "14 passed".
Both non-zero and consistent with the diff's added tests (3 new in `eval.rs`, 4 new in
`session_source.rs`).

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No findings. | — |

**Verdict rationale.** The shape change (`Option<MathOverlay>` → `Vec<MathOverlay>`) matches
the brief's Q6 recommendation and R73's note exactly. `variance_time`/`variance_dist` are the
only two `MathLapContext.overlay` consumers in the whole tree (confirmed by
`grep -rn '\.overlay\b'` across `core/src/math` and `tauri/src`); the other lap-aware functions
(`current_lap`, `sector_number`, `lap_start_time`, `lap_start_distance`) read `main_lap`/
`main_lap_bounds` only and are correctly called out as unaffected in both the code doc comments
and the C2/C3 amendment text. idl0 never defined a multi-overlay semantics for these two
functions — its `variance_time`/`variance_dist` only ever accepted one overlay lap (confirmed
by `grep -rn "variance_time\|variance_dist" idl0-app/rust`), and idl0's "overlay" module
(`core/src/overlay/`) is an unrelated canvas-overlay feature, not this variance path — so the
new elementwise-mean fold is a fresh, brief-mandated decision rather than a deviation from a
pre-existing contract. `mean_across_overlays` is elementwise over the per-overlay delta series,
each produced by calling `eval_variance_time`/`eval_variance_dist` with the *same* main-channel
inputs (`main_samples`/`main_rate`/`main_t_us`) for every overlay entry, so every entry's series
is guaranteed the same length as the main channel regardless of the overlay lap's own length —
there is no length-mismatch case to handle, and the doc comment says so ("every entry shares
`main_samples`' length"). NaN handling is per-index exclusion (a NaN from one overlay doesn't
poison the mean), NaN only when every entry is NaN at that index — matches the doc comment and
CHANGELOG text. The single-overlay regression test (`variance_time_identity_overlay_...`,
pre-existing, updated to `vec![...]` with one entry) proves byte-identical behaviour for one
overlay; the two-overlay fold tests use a +i/-i construction that only passes under a true mean,
not a first-entry read. The empty-vec case returns `NoLapContext` from the evaluator (unchanged
error path) and `load_lap_context` accepts `overlay_laps: []` with no error, both tested. The
`unknown_lap` validation order (`main_lap` first, then `overlay_laps` in order, first failure
wins) is preserved exactly, with a test proving `main_lap` validated before an overlay-list
failure is reached. The `Arc` fix builds one `Arc<dyn ChannelLookup + Send + Sync>` and
`Arc::clone`s it per overlay entry (one `SessionHandle` clone total, not N), with a real
`Arc::ptr_eq` test. Every "`laps[]` is always empty today" claim was found and rewritten across
both repos (`grep -rn "always empty"` in idl-rs turns up only unrelated GPX-parse comments in
`session/handle.rs`; the one remaining hit in `idl1-app`'s `docs/superpowers/plans/...` is a
dated historical plan snapshot, not live doc text, so it is correctly left alone). `Cargo.lock`
is untouched, only the five named files across both repos changed, no NUL bytes in any touched
Rust file, and the C2/C3 amendments stack correctly as dated post-sign notes without erasing the
R64.1 amendment. Test names follow the repo's existing `thing_condition_result` snake_case
convention (matching idl0's own style for this same module) with Arrange/Act/Assert comments and
blank-line separation. CHANGELOG bullet is accurate against the diff. This task is clean.

VERDICT: CLEAN
