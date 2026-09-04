# L3 Task 11 test fix — scoped re-review

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`.
Commit under review: `812f761` (test-fix only, on top of `e5d9a4e`, the commit
reviewed in `review-task11-fix.md`). Diff: `git diff e5d9a4e..812f761`. Files
touched: `core/src/raster.rs`, and only inside `#[cfg(test)] mod tests` — the
entire diff is within the body of
`spectrogram_raster_meta_bounds_match_the_builder_even_when_rebin_drops_the_extreme_cell`.
No production code changed.

## Test command and result

```
cargo test -p idl-rs raster::
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 824 filtered out

cargo test -p idl-rs histogram2d
test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 825 filtered out
```

Both non-zero `passed`, `0 failed`.

## Checks performed

**(a) Corrected comment vs. actual rebin formula.** Read
`build_spectrogram_raster_bytes` (`raster.rs:107-125`) directly:
`let bin = (y * n_freqs / h).min(n_freqs - 1);` then
`s.power[frame * n_freqs + (n_freqs - 1 - bin)]`, i.e.
`freq_idx = n_freqs - 1 - bin`. For this test's parameters
(`nperseg=64` ⇒ `n_freqs=33`, `height=32`), integer division gives
`bin = (y*33/32).min(32)` for `y` in `0..31`: at `y=31`, `31*33/32 = 1023/32 =
31` (floor), so `bin` ranges over `0..=31` and never reaches `32`. Therefore
`freq_idx = 32 - bin` ranges over `1..=32` and **never reaches `0`** — DC is
the structurally-dropped row, matching the new comment and contradicting the
old comment (which named the Nyquist row, `freq_idx=32`, as dropped). Derived
independently from the production formula, not from the implementer's
arithmetic; confirmed.

**(b) The new signal genuinely discriminates.** With `Detrend::None` and
`data[i] = 1000.0 + sin(2π·40·i/fs)`, the huge constant offset survives
per-segment mean removal (there is none) and dominates the DC bin
(`freq_idx=0`) of every time frame's windowed FFT, since the Hann-windowed
sum of ~1000-valued samples is far larger in magnitude than the sum
contributed by a unit-amplitude 40 Hz tone. The key point does not even
require exact power arithmetic: the test's own `subset_max` loop
(`raster.rs`, new lines) walks every `(x, y)` pixel with the *same*
`frame`/`bin`/`freq_idx` formula as the builder and — as shown in (a) —
`freq_idx=0` is never produced by that loop for these `(n_freqs, height)`.
So `subset_max` structurally excludes the DC bin from every frame,
regardless of the precise numeric values, while `meta.vmax = finite_bounds(&s.power)`
is taken over the full matrix including DC. Since DC power (driven by the
constant 1000.0 offset) is overwhelmingly larger than any AC-only power in
this matrix, `meta.vmax` is realized at `freq_idx=0` and `subset_max <
meta.vmax` is true not by coincidence but by construction. The test asserts
this explicitly (`assert!(subset_max < meta.vmax, ...)`) before asserting the
byte-match, and the run above shows the test passed, i.e. this assertion did
not panic — confirming empirically that it holds for the compiled build.
Reasoned through independently rather than accepting the implementer's report
of pre-fix pixel bytes.

**(c) No production code changed.** `git diff e5d9a4e..812f761` shows a
single file, `core/src/raster.rs`, with all `+`/`-` lines inside the `tests`
module (function bodies before line 89 — `build_spectrogram_raster_bytes`,
`build_histogram2d_raster_bytes`, `spectrogram_raster_meta`,
`histogram2d_raster_meta` — are byte-identical to `e5d9a4e`, verified by
reading `raster.rs:90-230`, which matches the prior review's transcription
with no additional changes). `git status --porcelain` in the worktree is
clean after the test runs (no leftover local edits), consistent with the
implementer's claim that any temporary verification edit was reverted before
committing.

**(d) `histogram2d` has no equivalent gap.** Read
`build_histogram2d_raster_bytes` (`raster.rs:144-169`) and
`histogram2d_raster_meta` (`raster.rs:210-229`): both call
`histogram2d(xs, ys, width as usize, height as usize, ...)` /
`histogram2d(xs, ys, nx, ny, ...)` directly — the grid is sized to
`(width, height)`/`(nx, ny)`, the same values used as the pixel dimensions,
with no separate rebin/resampling step between grid and raster. `vmin`/`vmax`
in both functions are computed via `finite_bounds` over that same
directly-sized grid (with the identical `count == 0 → NaN` substitution),
so there is no cell that is scanned for bounds but excluded from rendering —
no R38-shaped gap exists here, as the doc comment on
`build_histogram2d_raster_bytes` (`raster.rs:143-146`) itself states.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | None. | — |

No Critical, Important, or Minor findings. The R38 fix (`e5d9a4e`) was already
found correct in the prior review; this commit only repairs the regression
test so it now genuinely discriminates pre-fix from post-fix behaviour, and
it does so correctly.

## Verdict rationale

The prior review's one Important finding — that the guard test's comment
misidentified the dropped row and chose a signal whose true extremes
happened to land in selected cells, making the test pass vacuously even
against the pre-fix builder — is fully resolved. The corrected comment
matches the production rebin formula exactly (independently re-derived from
`raster.rs`, not taken on trust), the new fixture (`1000.0 + sin(...)` with
`Detrend::None`) puts the global maximum power structurally in the dropped
DC row for these parameters, and the test's own new `subset_max < meta.vmax`
assertion make that discrimination explicit and checked at run time rather
than asserted only in the commit message. No production code changed in this
commit, and the histogram2d pair genuinely has no equivalent rebin gap. Both
named test filters ran once each, one at a time, both non-zero passed with
zero failures.

VERDICT: CLEAN
