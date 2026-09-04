# L3 Task 11 review — raster endpoint: 2-D histogram, colormap, spectrogram (C3 §3.6)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
branch `wave1-l3-workbook`. Commits under review: `caf4d06` (Task 11 proper) and
`50accd3` (a one-line `// TODO(idl0):` addition to `colormap.rs`, dispatched
separately by the lead). HEAD at review time: `50accd3`, worktree clean.
In scope: `core/src/histogram2d.rs`, `core/src/colormap.rs`, `core/src/raster.rs`,
`core/src/lib.rs`. No other uncommitted changes present in the worktree.

## Test command and result

Ran the four filters named in the brief's COMPUTE RULES section, each once,
in place of the plan's zero-matching filter, one cargo process at a time:

```
cargo test -p idl-rs histogram2d
test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 824 filtered out

cargo test -p idl-rs colormap
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 827 filtered out

cargo test -p idl-rs raster::
test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 824 filtered out

cargo test -p idl-rs scatter
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 823 filtered out
```

All four non-zero `passed`, `0 failed` — reproduces the implementer's reported
result.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `core/src/raster.rs:157-176` (`spectrogram_raster_meta`) | `vmin`/`vmax` are scanned over the **raw, un-rebinned** `s.power` matrix (`finite_bounds(&s.power)`), while `build_spectrogram_raster_bytes` normalises over the **nearest-cell-rebinned** `values` array it builds for the requested `(width, height)`. Nearest-cell rebin is a *subset* selection, not an average — when the raster is coarser than the underlying grid on an axis (`width < n_times` or `height < n_freqs`), some rows/columns of `power` are never selected by any pixel and can be dropped entirely. Concretely, in the lane's own `spectrogram_raster_steady_tone_row_moves_up_with_frequency` test parameters (`nperseg=64, noverlap=32` → `n_freqs=33`, requested `height=32`), `bin_of(y) = (y*33/32).min(32)` never yields `32` for any `y` in `0..32` — the Nyquist frequency row of `power` is structurally unreachable by the pixel raster, yet `finite_bounds(&s.power)` still scans it. Whenever that unreachable row/column happens to hold the global min or max, `spectrogram_raster_meta`'s reported `vmin`/`vmax` diverge from the bounds `normalize_to_colormap` actually used to colour the pixels the user sees — the legend and the raster disagree. The doc comment's claim "rebinning does not change the underlying value range" is not generally true; it only holds when the raster equals or exceeds the spectrogram's own grid on both axes (upsampling). | Needs a lead ruling, not a mechanical implementer fix: the brief's own `spectrogram_raster_meta` signature (L3-R33) deliberately omits `width`/`height`, so there is no way for this function, as specified, to rebin before scanning bounds. Either (1) give `spectrogram_raster_meta` `width`/`height` and have it perform the same nearest-cell rebin as the byte builder before calling `finite_bounds`, sharing that rebin logic between the two functions, or (2) keep the current resolution-independent semantics deliberately and correct the doc comment to say so explicitly (drop the false "rebinning does not change the range" claim) and accept that the legend may show a wider range than any pixel exhibits at low output resolution. `histogram2d_raster_meta` has no such problem — `histogram2d` is sized directly to `(width, height)`, so its meta and byte-builder scans are over the identical grid. |

No Critical findings. No other Important findings — the implementer matched
every other landed ruling exactly (see below). No Minor findings.

## Checks performed (all pass)

- **(a) legend/pixel bounds consistency, `histogram2d`:** `histogram2d_raster_meta` and `build_histogram2d_raster_bytes` both call `histogram2d(xs, ys, width as usize, height as usize, ...)` — identical grid, no separate rebin step — so `vmin`/`vmax` (both apply the `count==0→NaN` substitution identically before `finite_bounds`) exactly match what `normalize_to_colormap` uses inside the byte builder. Confirmed consistent. (Spectrogram side is not consistent — see Findings table.)
- **(b) `count==0 → NaN` transparency:** identical `.map(|&c| if c == 0 { f64::NAN } else { c as f64 })` substitution present verbatim in both `build_histogram2d_raster_bytes` (`raster.rs:139`) and `histogram2d_raster_meta` (`raster.rs:205`). A histogram bin's count is a non-negative tally with no other source — "empty" and "legitimately zero" are the same value for this data; there is no ambiguity to distinguish.
- **(c) degenerate-input rule vs `scatter.rs`:** compared `histogram2d`'s `bin_index` (returns `0` when `hi <= lo`) and its `nx==0||ny==0 → empty()` gate directly against `scatter.rs`'s `scatter_density::bin_index` (same `hi <= lo => 0` collapse, `scatter.rs:175-181`) and its row/col convention (`counts[r * bins + c]`, row = y). `histogram2d`'s `counts[row * nx + col]` uses the identical row = y convention. `scatter_density` itself never actually returns empty (`bins.max(1)`, always ≥1), but the *pattern* `histogram2d` mirrors — zero-width axis collapses to bin 0, not empty — matches exactly. Confirmed against the code, not the implementer's report.
- **(d) `build_spectrogram_raster_bytes` nine-argument signature:** matches L3-R32's mandated signature field-for-field and in order (`samples, sample_rate_hz, width, height, window, nperseg, noverlap, detrend, scaling`). Orientation test genuinely discriminates: worked the pixel math by hand for the test's own parameters (`fs=256`, `nperseg=64`→`n_freqs=33`, low tone 8 Hz → bin 2, high tone 64 Hz → bin 16); under the implemented orientation the low tone's brightest row lands near `y≈29` and the high tone's near `y≈15`, giving `high_row < low_row` — under a flipped (naive) orientation this assertion would fail, so the test is not "passes either way."
- **(e) `RasterMeta` field set:** exactly `x_domain`, `y_domain`, `vmin`, `vmax`, `transparent_zero` — no `x_label`/`y_label`/`scale.kind` added, matching L3-R33's explicit prohibition. No file under `docs/` touched (`git show --stat` on both commits confirms).
- 16-byte header layout and worked-example test (`64×32` → pixel region `[16, 8208)`, total `8208` bytes) checked byte-offset-by-byte-offset against C3 §3.6's field table (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md:702-716`) — exact match.
- Commit hygiene: both commits are single-line messages, no AI attribution trailer; `caf4d06`'s file list (`core/src/{histogram2d,colormap,raster,lib}.rs`) matches the brief's explicit `git add` list exactly (no `git add -A`); `50accd3` touches only `colormap.rs` as the lead's separate dispatch intended.
- CLAUDE.md §4: every test uses `// Arrange` / `// Act` / `// Assert` with blank lines between blocks; names read as `thing — condition — result` (underscore-joined, no literal em dash, as expected).
- CLAUDE.md §5: doc comment on every public symbol (`Histogram2dResult` + fields, `histogram2d`, `turbo_rgba8`, `normalize_to_colormap`, `RasterMeta` + fields, both byte-builders, both meta functions); no `Err(String)`; no unexplained `.unwrap()`/`.expect()` on production-path data (the only non-test `unwrap_or` calls are safe defaults on `Option`, not panics).
- No reformatting — all four changed files are new modules plus a purely additive `lib.rs` diff (two `pub mod` lines each in two spots); no churn on untouched lines.
- `// TODO(idl0):` (not bare `// TODO`) present in `colormap.rs` for the deferred log/percentile scaling (G11.8), correctly scoped as an L6 display decision, not implemented.
- Shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` and other worktrees untouched.

## Verdict rationale

The implementation is correct and faithful everywhere it was checked except
one place: `spectrogram_raster_meta`'s `vmin`/`vmax` are computed over the
full, un-rebinned power matrix while the byte encoder colours pixels using
bounds computed over a nearest-cell-*subset* of that same matrix — under
downsampling (routine, whenever the requested raster resolution is coarser
than the spectrogram's own time/frequency grid on either axis) those two
scans can and provably do disagree, so the legend the meta command reports
does not always match the pixels the byte command draws. This traces to the
brief's own L3-R33 signature for `spectrogram_raster_meta`, which omits
`width`/`height` and therefore cannot rebin before scanning; the implementer
followed the landed ruling exactly and even wrote an accurate description of
what the code does, just with an inaccurate justifying claim ("rebinning does
not change the underlying value range"). Everything else — the histogram2d
degenerate-input rule against `scatter.rs`, the `count==0→NaN` transparency
rule in both call sites, the nine-argument spectrogram builder signature and
its genuinely discriminating orientation test, the `RasterMeta` field set,
the C3 §3.6 byte-for-byte header/worked-example match, and all hygiene/testing
requirements — is clean. This is not a bug the implementer can silently patch
away, since it follows directly from a signature the brief marked "LANDED …
do not re-derive or re-propose"; it needs the lead's ruling on which of the
two remedies above to take before a fix-up task is dispatched.

VERDICT: NEEDS_FIXES
