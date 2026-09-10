# Review: sentinel lane (eb5ac6b)

Commit reviewed: `eb5ac6b` "math: carry the main lap window as an Option, not a
(0.0, 0.0) sentinel (R128 item 3)" — diff = `git diff HEAD~1` in
`idl-rs-worktrees/sentinel` (branch `sentinel`).

Files touched: `core/src/math/eval.rs`, `core/src/math/variance_geom.rs`,
`tauri/src/session_source.rs` (comment-only, confirmed).

Test command: none run — per task instructions, no cargo command was run
(the lane owner holds the machine's single cargo slot). Compliance was
verified statically by reading the diff, the full text of
`core/src/variance.rs`, and grepping the maths path.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No findings. | — |

## Checks performed

1. **Sentinel removal.** `main_lap_window` (core/src/math/eval.rs:725) now
   returns `Option<(f64,f64)>`: `Some(*only)` / `bounds.get(...).copied()`
   (which naturally yields `None` on a miss, same outcome as the old
   `.unwrap_or((0.0,0.0))` fallback — gate-off either way) / `None`.
   Grepped `(0.0, 0.0)` and `== 0.0 &&` across `core/src/math`,
   `core/src/table`, `cli/src`: only hits are an unrelated
   `sample_rate_hz == 0.0` check (eval.rs:306) and a comment mentioning the
   old sentinel historically (eval.rs:709). No live special-case remains.

2. **`window_index_range` semantics (R128).** Unchanged arithmetic, only the
   dispatch on `main_lap_window`'s result changed: `None -> (0, len)`,
   `Some(w) if !(start<end) -> (0, 0)`, otherwise the same
   `ceil(bound * rate)`-based clamp as before (eval.rs:760-778, diff
   untouched below the `match`). No off-by-one; the half-open `[start,end)`
   formula and `.clamp(start, len)` are byte-identical to pre-commit.

3. **Numeric equivalence — the critical check.** `variance_geom.rs` adds a
   private `NO_WINDOW_GATE: (f64,f64) = (f64::INFINITY, f64::NEG_INFINITY)`
   and maps `main_window.unwrap_or(NO_WINDOW_GATE)` before calling
   `variance_time_against`/`variance_dist_against`, which forward straight
   into `crate::variance::variance_time`/`variance_dist` (unchanged by this
   commit — confirmed `variance.rs` is absent from the diff stat). Read
   both functions in full: each computes
   `let gate = main_lap_start_sec < main_lap_end_sec;` once, and the bound
   values are read *only* inside that boolean and, when `gate` is true,
   inside the per-sample `t < start || t >= end` comparison — never in any
   arithmetic. `INFINITY < NEG_INFINITY` is `false`, exactly as
   `0.0 < 0.0` was `false`, so `gate` evaluates identically to before in
   the "no window" case and the bound values are provably never read again
   once `gate` is `false`. No NaN can be produced from the new bounds since
   they never reach an arithmetic expression. Traced `main_lap_window`'s
   three arms against the old code: `Some(_), [only]` unchanged value;
   `Some(n), bounds` miss arm changes `(0.0,0.0)` fallback to `None`, but
   both are gate-off, so `eval_variance_time`/`_dist`'s
   `unwrap_or(NO_WINDOW_GATE)` restores gate-off — same runtime behaviour;
   `None, _` unchanged (gate-off both before and after). All reachable
   inputs agree.

4. **Doc comments.** The R128 comment block on `main_lap_window` and
   `window_index_range` was rewritten to describe `Option` semantics
   accurately; new doc comments added on `eval_variance_time`/
   `eval_variance_dist` describing `main_window`'s `None`/`Some` meaning,
   and a new doc comment on `NO_WINDOW_GATE` explaining why `variance.rs`'s
   independent "any start>=end disables gating" convention is respected
   rather than re-using a zero pair. Style (comment format, `// ` alignment,
   no reflow of untouched lines) matches the surrounding hand-formatted
   code; no stray rustfmt-style changes detected in the diff.

5. **Scope.** Only two `pub` signatures changed:
   `eval_variance_time`/`eval_variance_dist` (`core/src/math/variance_geom.rs`),
   both called exclusively from `core/src/math/eval.rs` within the same
   crate — no `cli/src` or `tauri/src` caller exists, so the brief's
   conditional `cargo check -p idl-rs-cli --tests` requirement, while not
   verifiable here (no cargo run per instructions), is not expected to
   surface any break; grepped `cli/src` and `tauri/src` for both names and
   found no call sites. `main_lap_window` and `window_index_range` stay
   private `fn`s in `eval.rs`. The one edit outside `core/` is
   `tauri/src/session_source.rs:892-899`, a doc-comment update inside a
   `#[cfg(test)]` module only — confirmed comment-only, no code change, no
   behaviour change, no contract/spec touch. No C1-C4 contract change, no
   SPEC section touched, nothing else escalation-worthy found.

6. **Tests.** Both renamed tests
   (`window_index_range_no_window_selected_none_is_the_whole_channel`,
   `window_index_range_degenerate_resolved_bound_is_empty_not_the_whole_channel`)
   follow the `thing — condition — result` convention, keep
   Arrange/Act/Assert with blank lines, and assert the same numeric
   outcomes as their pre-rename versions (`(0,7)` and `(0,0)` respectively)
   — meaning preserved, only the sentinel-language stripped from names and
   comments as instructed. The R119/R128 regression test at line ~3112
   (variance-time defect regression) was updated in comment only, still
   asserting the same NaN-after-5s behaviour.

## Verdict rationale

The commit is exactly the type-change the brief and R128 item 3 asked for:
`main_lap_window` returns `Option`, `window_index_range` preserves R128's
exact three-way semantics with no off-by-one, and the `NO_WINDOW_GATE`
translation constant is provably inert (its values are read only inside a
single boolean gate check and never enter arithmetic, so INFINITY/NEG_INFINITY
cannot produce a different number or a NaN than the old zero-pair did).
Scope is minimal and correctly confined to `core/`; the one out-of-crate
edit is comment-only inside a test module, as the reviewer brief predicted.
Doc comments are accurate, hand-styled, and the only remaining `(0.0, 0.0)`
occurrences in the maths path are unrelated or historical-comment text. No
findings.

VERDICT: CLEAN
