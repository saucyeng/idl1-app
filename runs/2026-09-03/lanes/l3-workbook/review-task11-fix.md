# L3 Task 11 R38 fix — re-review

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
branch `wave1-l3-workbook`. Commit under review: `e5d9a4e` (R38 fix only, on
top of the already-reviewed `caf4d06`/`50accd3`). Diff: `git diff
50accd3..e5d9a4e`. Files touched: `core/src/colormap.rs`,
`core/src/raster.rs` — both in the lane's scope; nothing else uncommitted in
the worktree.

## Test command and result

Ran the four filters named in the dispatch, each once, one cargo process at
a time:

```
cargo test -p idl-rs raster::
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 824 filtered out

cargo test -p idl-rs colormap
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 828 filtered out

cargo test -p idl-rs histogram2d
test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 825 filtered out

cargo test -p idl-rs scatter
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 824 filtered out
```

All four non-zero `passed`, `0 failed`. (`raster::` grew from 7 to 8 passed —
the one new test.)

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `core/src/raster.rs:373-408` (`spectrogram_raster_meta_bounds_match_the_builder_even_when_rebin_drops_the_extreme_cell`) | The test claims to reproduce the R38 bug (dropped-extreme-cell divergence) but does not, for the parameters it actually uses. I replicated `spectrogram()`'s exact math (Hann window, `Detrend::Mean`, `Scaling::Density`, `nperseg=64`/`noverlap=32`/`fs=256`, the test's own signal) outside the repo and computed the full `15×33` power matrix. Two things the test's own comment gets wrong: (1) the builder's rebin does `freq_idx = n_freqs - 1 - bin`, so for `height=32, n_freqs=33` the row that is **structurally unreachable is `freq_idx = 0` (DC)**, not the Nyquist row (`freq_idx = 32`) the comment names — the comment inherited the wrong row from the *original* Task 11 finding, which was about a different test's parameters where the flip wasn't accounted for. (2) More importantly, for this signal the global min (`≈7.30e-11`, at time-frame 9, `freq_idx=32`) and global max (`≈0.0820`, at time-frame 0, `freq_idx=10`, the 40 Hz tone bin) both land in **selected** cells — the one row this rebin actually drops (`freq_idx=0`) holds neither extreme. So `finite_bounds` over the rebinned subset equals `finite_bounds` over the full matrix for this exact input, and the pre-fix code (bounds from the rebinned `values` array) would have produced byte-identical output to the post-fix code on this test. The test passes today, but it would also have passed against `caf4d06`'s buggy builder — it does not exercise the fix and will not catch a regression back to subset-scanned bounds. | Re-derive the dropped index from the actual formula (`freq_idx = n_freqs - 1 - (y*n_freqs/h).min(n_freqs-1)`, which drops `freq_idx=0` for `n_freqs=33,height=32`, not 32) and choose a signal/parameters where the true global min or max provably lands in that dropped index — e.g. a case with `Detrend::None` so DC power survives and dominates as a plantable min or max — then verify by hand or via a throwaway script (as done here) that subset bounds actually diverge from full-matrix bounds before trusting the test to fail pre-fix. Alternatively, test `colorize_with_bounds`/the bounds-selection logic directly with a small literal `power`-shaped fixture instead of round-tripping through the real FFT, which makes the dropped/held-extreme relationship exact and inspectable instead of incidental. |

No Critical findings. No other Important findings.

## Checks performed

- **(a) both raster builders derive `vmin`/`vmax` from the full raw matrix
  before rebinning, matching the meta functions' source:**
  `build_spectrogram_raster_bytes` now computes `let (vmin, vmax) =
  finite_bounds(&s.power);` (`raster.rs:109`) **before** the rebin loop that
  builds `values`, then calls `colorize_with_bounds(&values, vmin, vmax)`
  (`raster.rs:125`) — the exact same `finite_bounds(&s.power)` call
  `spectrogram_raster_meta` makes (`raster.rs:203`, unchanged by this
  commit). `build_histogram2d_raster_bytes` computes `finite_bounds(&values)`
  over the full `count`→`NaN`-substituted grid (`raster.rs:161-165`,
  identical substitution and source as `histogram2d_raster_meta`,
  `raster.rs:233-234`, also unchanged) — this pair had no bug (grid and
  render size were already identical pre-fix), but the change keeps the
  pattern uniform per R38's "applies on the same terms" instruction. The
  `count == 0 → NaN` substitution text is byte-identical to before in both
  places — confirmed unchanged.
- **(b) neither meta function gained `width`/`height`:** `spectrogram_raster_meta(samples, sample_rate_hz, window, nperseg, noverlap, detrend, scaling)` and `histogram2d_raster_meta(xs, ys, nx, ny, range_x, range_y)` signatures are byte-identical to the prior commit (`git diff` shows only doc-comment changes above these two functions, no signature lines touched).
- **(c) new test genuinely reproduces the bug — FAILS, see Findings table.**
- **(d) `colorize_with_bounds` refactor preserves `normalize_to_colormap`'s
  behaviour for existing callers:** `normalize_to_colormap(values)` now reads
  `let (mn, mx) = finite_bounds(values); colorize_with_bounds(values, mn,
  mx)` — algebraically identical to the prior inline body (`t = (v-mn)/(mx-mn)`
  when `range>0.0` else `0.0`, NaN→transparent first) with no reordering of
  the finiteness check. Grepped all call sites: `normalize_to_colormap` is
  now called only from its own test (`colormap.rs:148`) — both raster
  builders were switched to call `colorize_with_bounds` directly instead.
  No other module in `core/src` calls `normalize_to_colormap`, so there is
  no caller whose behaviour could have silently changed.
- **(e) doc comments:** `raster.rs`'s `build_spectrogram_raster_bytes` doc
  gained the true R38 statement ("Colour bounds are resolution-independent
  … at low resolution the rendered raster can fail to contain any pixel at
  exactly `vmin` or `vmax`"); `spectrogram_raster_meta`'s doc dropped the
  false "rebinning does not change the underlying value range" claim and
  now states the same true consequence, plus explicitly says the two
  functions' bounds always agree. No remaining false claims found in either
  doc block.
- Commit hygiene: single-line message, no AI attribution trailer; `git show
  --stat` confirms only `colormap.rs`/`raster.rs` touched; worktree clean
  after the run (`git status --porcelain` empty).
- CLAUDE.md §4/§5 spot-checked on the new test and doc changes: Arrange/Act/Assert present with blank lines, test name reads as `thing — condition — result`; no `Err(String)`, no unexplained `unwrap()` on production data (the test's own `.try_into().unwrap()` calls are on fixed-size byte slices already sliced to length, existing pattern, not new).

## Verdict rationale

The production fix itself is correct and matches R38 exactly: I traced both
`build_spectrogram_raster_bytes` and `spectrogram_raster_meta` to the
identical `finite_bounds(&s.power)` call on the full, un-rebinned matrix,
and confirmed `colorize_with_bounds` is an behaviour-preserving extraction
with no other caller affected. The `histogram2d` pair, doc comments, and
signatures are all clean. The one problem is the new regression test: its
own inline comment misidentifies which row the rebin structurally drops
(claims Nyquist, but the actual `freq_idx = n_freqs-1-bin` flip drops DC for
these parameters), and — verified by reproducing the exact spectrogram
computation independently — the chosen signal's true global min/max both
land in *selected* cells, so subset-only bounds equal full-matrix bounds for
this input. The test would have passed unmodified against the pre-fix
builder too; it is not the regression guard for R38 it claims to be, even
though it happens to currently pass. This is a test-quality finding, not a
production-logic finding, so it does not block the underlying fix from
being correct, but the brief's own check list calls for the guard test to
work, and it doesn't.

VERDICT: NEEDS_FIXES
