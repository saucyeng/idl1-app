# L3 Task 11 — implementer brief (raster endpoint: 2-D histogram, colormap, spectrogram; C3 §3.6)

You are the implementer for L3 Task 11 of the idl1 rewrite — the eleventh
task of the core workbook-v3 lane. TDD, one commit, then report.

## Where
- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
  branch `wave1-l3-workbook`, HEAD must be the commit of Task 10 (given in the
  dispatch message), status clean. Verify first; if not, stop and report. The
  worktree inherits `.cargo/config.toml` (shared target-dir) — leave it alone.
- Work ONLY there. Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  (shared checkout), `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` beyond READING the
  files named below, or any other worktree. Do NOT edit anything under `docs/`. Do NOT push.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the L3 plan
  Global Constraints (41–135), `### Task 11` (746–838, **superseded where it conflicts with the
  landed C3 §3.6 below**); contract C3
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\specs\2026-09-03-idl1-c3-ipc-surface.md`
  §3.6 (654–716 — this is the **amended, landed** text: `SpectrogramParams`/`Histogram2dParams`
  replacing `Record<string, number>`, and the new `fetch_raster_meta` sibling command/`RasterMeta`
  shape, closing open item 6.4); the pre-read `runs\2026-09-03\lanes\l3-workbook\pre-read-tasks10-16.md`,
  Task 11 section (G11.1–G11.8, L3-R31–R34); ledger `R25` in `runs\2026-09-03\decisions.md`
  ("contract batch 3… C3 §3.6" — confirms this section is signed, not proposed); landed
  `scatter.rs` (`pair_finite` line 33, `pub(crate)` already; `scatter_density` line 130 — its
  degenerate-input rule, full-size zero grid with finite bounds, `bin_index`'s `hi <= lo => 0`
  zero-width collapse, lines 175–181 — the pattern `histogram2d` mirrors); `spectrogram.rs`
  (`SpectrogramResult{freqs_hz, times_secs, power: row-major n_times×n_freqs, n_times, n_freqs}`
  line 14; `spectrogram(data: Vec<f64>, sample_rate_hz, window, nperseg, noverlap, detrend,
  scaling) -> SpectrogramResult`, the real **seven**-argument landed signature, line 41); `fft.rs`
  (`FftWindow{Rectangular,Hann,Hamming}` line 16, `Detrend{None,Mean,Linear}` line 77,
  `Scaling{Magnitude,Density}` line 95); verified: no colour crate (`colorous` or similar) in
  `core/Cargo.toml` — hand-roll Turbo.

## COMPUTE RULES — non-negotiable
Machine is memory-bound (cargo capped at 2 jobs machine-wide; do not override). The plan's own
gate (`cargo test -p idl-rs "histogram2d|colormap|raster"`) matches **zero** tests (libtest
filters are substrings — L3-R8). Run four instead, each non-zero `passed`: `cargo test -p idl-rs
histogram2d`, `cargo test -p idl-rs colormap`, `cargo test -p idl-rs raster::`, and once, `cargo
test -p idl-rs scatter` (L3-R31 changes no `scatter` behaviour but leans on `pair_finite` — this
confirms nothing there broke). No tarpaulin, no `-j`, no `.cargo/` edits, never `cargo fmt`. One
cargo process at a time, foreground.

## The task (plan Task 11, Steps 1–4) with these rulings

**Ruling — L3-R31.** `histogram2d` reuses `scatter::pair_finite` (already `pub(crate)`); its
module doc names `scatter::scatter_density` as the session-coupled sibling — one algorithm, two
entry points, `histogram2d` staying the pure `xs`/`ys`-in, grid-out function the plan's interface
already states (do not make it session-coupled). Degenerate rule aligned to `scatter_density`,
**not** to a `HistogramResult::empty()`-style empty vector: whenever `nx > 0 && ny > 0`, return a
**full-size** `counts` grid (zeros) with resolved `bin_edges_x`/`_y`; a zero-width axis collapses
every value onto bin 0 (mirrors `scatter.rs:175-181`'s `bin_index`); `Histogram2dResult::empty()`
(truly empty vectors) is reserved for `nx == 0 || ny == 0` only. This is what makes Step 3's
"degenerate input still produces a well-formed raster" reachable without a special case in the
raster builder.

**Ruling — L3-R32.** `build_spectrogram_raster_bytes` gains the two arguments the plan's
five-argument builder omitted (G11.2 — `spectrogram()` takes seven):
```
pub fn build_spectrogram_raster_bytes(samples: &[f64], sample_rate_hz: f64, width: u16,
    height: u16, window: FftWindow, nperseg: usize, noverlap: usize, detrend: Detrend,
    scaling: Scaling) -> Vec<u8>;
```
No L3-invented defaults — the landed CLI's own defaults (`Hann`, `nperseg = 0`, `noverlap = 0`,
`Mean`, `Density`, `cli/src/main.rs:172-185`) are what L5's wrapper passes; cite them in the doc
comment, do not hardcode them here. **Orientation, stated once and tested (G11.3):** pixel `(x,
y)` reads `power[frame_of(x) * n_freqs + (n_freqs - 1 - bin_of(y))]` — **x = time, row 0 =
highest frequency** (`SpectrogramResult.power` is row-major `n_times × n_freqs`, row = time,
column = frequency — rebinning it onto `(width, height)` naively would put time on Y and DC on
row 0/top; this expression corrects both). Nearest-cell rebin, documented as the resampling
method (no smoother alternative silently chosen). `noverlap` keeps the engine's own name in this
Rust signature; the doc comment states `hop = nperseg − noverlap` so C3's `hop_size` converts at
exactly one site (L5's, not this task's). Test (G11.3): `a steady tone — its energy row sits at
the same y for every x, and moving the tone up in frequency moves the row up (toward row 0)`.

**Ruling — L3-R33, now LANDED (do not re-derive or re-propose).** C3 §3.6 already carries the
typed `SpectrogramParams`/`Histogram2dParams` and the `fetch_raster_meta` sibling command; your
job is to make the Rust **match** that signed text, not to draft it again. Add:
```
pub struct RasterMeta { pub x_domain: (f64, f64), pub y_domain: (f64, f64),
                         pub vmin: f64, pub vmax: f64, pub transparent_zero: bool }
pub fn spectrogram_raster_meta(samples: &[f64], sample_rate_hz: f64, window: FftWindow,
    nperseg: usize, noverlap: usize, detrend: Detrend, scaling: Scaling) -> RasterMeta;
pub fn histogram2d_raster_meta(xs: &[f64], ys: &[f64], nx: usize, ny: usize,
    range_x: Option<(f64,f64)>, range_y: Option<(f64,f64)>) -> RasterMeta;
```
in `raster.rs`, mirroring each byte-builder's own argument list exactly (so L5 can call the meta
function with the same params it already has for the byte fetch — recomputing the
histogram/spectrogram twice is what the contract's "separate command, not stuffed into the
header" text accepts). `x_domain`/`y_domain` come from `bin_edges_x/y` (histogram2d) or
`times_secs`/`freqs_hz`'s min/max (spectrogram); `vmin`/`vmax` are the same normalisation bounds
`normalize_to_colormap` computes internally — expose them here rather than duplicating the
min-max scan. `transparent_zero` is `true` for histogram2d (L3-R34's zero-count rule, below),
`false` for spectrogram (no such rule there). **`x_label`/`y_label`/`scale.kind` are NOT this
function's job** — L3 has no channel names or session context; L5 fills those (channel
names/units it already has, and the constant `"linear"`) when it assembles C3's JSON
`RasterMeta` from this struct. Say this explicitly in the doc comment so L5 doesn't go looking
for labels here. The `fetch_raster_meta` **command** itself (the `#[tauri::command]` wrapper) is
L5's — this task builds only the two core functions above. Tests: one per function, asserting
the domain/vmin/vmax values against a small hand-computed fixture (not just "doesn't panic").

**Ruling — L3-R34.** Colour rules, stated once. `turbo_rgba8(t)` returns `[0,0,0,0]` for
non-finite `t`, the pinned Turbo endpoints for `0.0`/`1.0`. `normalize_to_colormap` guards `0/0 →
0.0` (all-equal or empty input maps every value to the LUT's zero point — a visible colour, not
transparency; this is a *different* rule from the next one). `build_histogram2d_raster_bytes`
maps **`count == 0` to `f64::NAN` before normalising** (cast counts to `f64` first, then this
substitution, then `normalize_to_colormap`) — an empty bin is transparent so the chart's
gridlines show through (design §4's "raster under the chart's axes"); normalisation spans the
non-zero counts only. This — and only this — is what makes Step 3's degenerate-input
transparent-region test pass (G11.7: the plan's Step 2 colour rule and Step 3's degenerate test
contradicted each other because nothing mapped a zero count to NaN before normalising). Linear
min-max scaling is kept as-is; its skew on heavily-skewed density counts (G11.8) is recorded as a
`// TODO(idl0):` naming a log/percentile option as an **L6 display decision**, not a Rust one
(CLAUDE.md §3, "no renderer-only parameters") — do not implement log/percentile scaling this
task.

- [ ] **Step 1: `histogram2d`, mirroring `histogram.rs`'s conventions, degenerate rule per L3-R31.**
  Equal-width binning both dimensions, explicit `Option<(f64,f64)>` range or auto-range from
  finite data; non-finite `(x,y)` pairs skipped (via `pair_finite`); `counts` row-major `ny × nx`
  (row = y bin — this matches `scatter_density`'s own convention, not the plan's stated
  justification citing `SpectrogramResult`'s row-major layout, which is a *different* axis
  convention, G11.4 — cite `scatter_density` in the doc comment instead). Tests, mirroring
  `histogram.rs`'s shapes: `histogram2d — all-finite uniform grid — counts sum to total pairs`;
  `— nx or ny zero — Histogram2dResult::empty()`; `— non-finite pairs skipped`; `— explicit range
  narrower than data — out-of-range pairs skipped`; `— degenerate zero-width x range,
  nx>0&&ny>0 — full-size zero grid, not empty, per L3-R31`.

- [ ] **Step 2: Colormap.** Hand-roll the Turbo polynomial fit (~10 lines; confirmed no
  `colorous`-style crate in `core/Cargo.toml`). Tests: `turbo_rgba8(0.0)` and `turbo_rgba8(1.0)`
  pin the LUT's literal endpoint colours (a future LUT change is then a visible test diff);
  `turbo_rgba8(NaN) — [0,0,0,0]`; `normalize_to_colormap — all-equal input — every pixel the same
  colour, no division-by-zero panic`.

- [ ] **Step 3: Raster header + pixel encoding, both kinds, plus the two meta functions.**
  16-byte header exactly per C3 §3.6 (unchanged by this batch — pixel layout stays `version =
  1`): `magic = b"IDLR"`, `version: u16 = 1`, `width: u16`, `height: u16`, `format: u16 = 0`,
  `reserved: [u8;4]`. Pixel data row 0 first (top), left-to-right, `width*height*4` bytes RGBA8,
  no row padding. `build_spectrogram_raster_bytes` per L3-R32's orientation rule.
  `build_histogram2d_raster_bytes` sizes `histogram2d` directly to `(width, height)` (bin count is
  pixel count, no separate rebin step), applies L3-R34's `count==0 → NaN` substitution, then
  `normalize_to_colormap`. `spectrogram_raster_meta`/`histogram2d_raster_meta` per L3-R33. Tests:
  **the worked example from C3 §3.6 verbatim** — 64×32, format 0 → pixel region `[16, 8208)`,
  total length 8208 bytes, both builders; `header bytes match the C3 §3.6 field table exactly`
  (byte-sliced); `an empty/degenerate input — still produces a well-formed header + a transparent
  (all-zero-alpha) pixel region of the requested size, never truncated or panicking` — this now
  passes because of L3-R34's `count==0 → NaN` rule (G11.7), not despite it; the two meta-function
  tests from L3-R33 above.

- [ ] **Step 4: Test and commit.** Run the four filters (COMPUTE RULES), each non-zero `passed`,
  `0 failed`. Commit with explicit paths (NOT `git add -A`): `git add core/src/histogram2d.rs
  core/src/colormap.rs core/src/raster.rs core/src/lib.rs` — message `raster: 2-D histogram,
  colormap, C3 §3.6 binary encoder + raster_meta (spectrogram + histogram2d)`. Single line, no AI
  attribution trailer.

## Do not
- Do not run the plan's `cargo test -p idl-rs "histogram2d|colormap|raster"` — matches zero tests
  (L3-R8). Use the four named filters.
- Do not call `spectrogram()` with five arguments — it takes seven; missing `detrend`/`scaling`
  silently changes every pixel (G11.2).
- Do not cite `SpectrogramResult`'s row-major convention as the reason `histogram2d`'s `counts`
  is `ny × nx` — that convention's row index is the **x** axis; cite `scatter_density` instead
  (G11.4).
- Do not return an all-zero-alpha "transparent" tile for a merely all-equal (non-empty,
  non-zero) `normalize_to_colormap` input — that maps to the LUT's zero-point *colour*, not
  transparency. Only `NaN` (via `turbo_rgba8`, or L3-R34's `count==0` substitution) is
  transparent.
- Do not re-propose or re-draft `SpectrogramParams`/`Histogram2dParams`/`fetch_raster_meta` —
  C3 §3.6 already carries them (L3-R33 landed); code the two Rust core functions to match, and do
  not touch the contract file.
- Do not put `x_label`/`y_label`/`scale.kind` into `RasterMeta` here — no channel names or units
  reach this crate at this layer; that assembly is L5's.
- Do not implement log/percentile colour scaling (G11.8) — record the `// TODO(idl0):` and stop;
  it is an L6 display decision.

## Style / hygiene
Doc comment on every public symbol, including a loud one on `build_spectrogram_raster_bytes`
stating the orientation rule (x=time, row 0=highest frequency) and one on `RasterMeta` stating
what L5 must fill in; units where numeric (`sample_rate_hz` in Hz, domains in the channel's
native units — state it); typed errors only (none new here); A/A/A tests named `thing —
condition — result`; match surrounding hand-formatted style.

## Spec discipline (say it out loud in your report)
"spec-first" — C3 §3.6's typed params and `fetch_raster_meta` are already landed (contract batch
3, ledger R25) before this task starts. The 2-D histogram *algorithm* itself has no separate SPEC
entry (mirrors how `histogram.rs`'s 1-D version self-documents) — this task's doc comments are
that spec, spec-during for the algorithm, spec-first for the byte/JSON contract.

## Report back (concise)
Commit hash + `git show --stat`; all four test commands and result lines (`passed`/`failed`
counts); per-step done/deviated; confirmation `build_spectrogram_raster_bytes` takes all nine
arguments and the orientation test passes; confirmation `histogram2d`'s degenerate rule matches
`scatter_density`'s (full grid, not empty, for `nx>0&&ny>0`); confirmation the `count==0 → NaN`
transparency rule is implemented exactly where L3-R34 states and the degenerate-raster test
passes because of it; confirmation `RasterMeta`/the two meta functions compile and are tested,
and that no label/kind fields were added; confirmation no contract file was touched; anything
ambiguous you resolved (say how) or that needs a lead ruling (stop and report instead of
guessing — CLAUDE.md §1).
