# L5 Task 13 — implementer brief (raster commands, C3 §3.6)

You are the implementer for L5 Task 13 — `fetch_raster` (binary) and its
sibling `fetch_raster_meta` (JSON), over L3's landed `core::raster`. Two
commands, one typed-params conversion, and the TS side's provisional
`Record<string, number>` finally retired. TDD, two commits, then report.

**Task 9 (import commands, L2) is deferred with L2 and does not exist.** This task needs a
session on disk only in its own tests; build one with
`idl_rs::store::parquet::write_session_parquet` or the CLI
(`idl-rs import --data-dir <data> <file>.idl0`, `cli/src/main.rs:268-276`).

## Where
- **Rust worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l5-tauri`,
  branch `wave1-l5-tauri`, HEAD = the commit of Task 12 (given in the dispatch message), status
  clean. Verify first; if not, stop and report. Already caught up to idl-rs `main` (`e0440bb`).
  Leave `.cargo/config.toml` alone.
- **App worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l5-tauri`.
  After the rust commit: `git -C rust fetch local-wave1 wave1-l5-tauri && git -C rust checkout
  <new sha>`, then `git add rust`.
- Work ONLY in those two worktrees. Do NOT touch the shared checkouts beyond READING, do NOT
  edit anything under `docs/`, do NOT push.
- **Read first:** `CLAUDE.md`; the L5 plan `### Task 13` (1655–1683) and Global Constraints
  (49–81); C3 §3.6 (spec 654–716, **as amended post-sign** — the typed params and
  `fetch_raster_meta` are the amendment; C3 open question 6.4 is closed) and §4; ledger
  `runs\2026-09-03\decisions.md` — **R25** (contract batch 3: the params types and the
  `raster_meta` side channel) and **R38** (colour bounds are resolution-independent); this lane's
  `questions.md` **Q4** and the lead's answer; `core/src/raster.rs`'s module doc (lines 1-12) and
  the doc comments on all four functions.

## COMPUTE RULES — non-negotiable
One cargo process at a time, foreground, never `-j` (CLAUDE.md §8, R13). Run **only**:
- `cargo test -p idl-rs-tauri raster` — must report a non-zero `passed` count
- app worktree: `npm test` and `npx tsc --noEmit`

No `cargo check -p idl-rs-cli --tests` (no `pub` change in `core` this task). No full suite, no
`--workspace`, no `cargo fmt`, no tarpaulin, no flakiness reruns.

## Verified facts about the landed code (read, not assumed)
Read at idl-rs `main` = `e0440bb`.

1. **Four functions, all `pub` in `idl_rs::raster`** (`core/src/raster.rs`):
   - `build_spectrogram_raster_bytes(samples: &[f64], sample_rate_hz: f64, width: u16, height:
     u16, window: FftWindow, nperseg: usize, noverlap: usize, detrend: Detrend, scaling: Scaling)
     -> Vec<u8>` (`:93-103`)
   - `build_histogram2d_raster_bytes(xs: &[f64], ys: &[f64], width: u16, height: u16, range_x:
     Option<(f64,f64)>, range_y: Option<(f64,f64)>) -> Vec<u8>` (`:144-152`)
   - `spectrogram_raster_meta(samples, sample_rate_hz, window, nperseg, noverlap, detrend,
     scaling) -> RasterMeta` (`:192-206`) — **no `width`/`height`**, deliberately (R38)
   - `histogram2d_raster_meta(xs, ys, nx, ny, range_x, range_y) -> RasterMeta` (`:217-…`)
2. **`RasterMeta` (`raster.rs:30-43`) is `{ x_domain: (f64,f64), y_domain: (f64,f64), vmin: f64,
   vmax: f64, transparent_zero: bool }`** — and the module doc (`:7-12`) states outright that
   `x_label`/`y_label`/`scale.kind` are **not** there and **L5 fills them**, because core has no
   session/catalog context. C3 §3.6's `RasterMeta` (spec 685-692) is
   `{ x_domain, y_domain, x_label, y_label, scale: { vmin, vmax, kind: "linear" },
   transparent_zero }` — note the nesting: core's flat `vmin`/`vmax` go **inside** `scale`.
3. **`hop_size` is not `noverlap`.** `raster.rs:64-66`: "`noverlap` keeps the engine's own name
   here; `hop = nperseg − noverlap` converts to C3's `hop_size` at L5's boundary, not this one."
   So `noverlap = window_size − hop_size`, and `hop_size > window_size` or `hop_size == 0` must
   be rejected before the call.
4. **The enums** (`core/src/fft.rs`): `FftWindow::{Rectangular, Hann, Hamming}` (`:16-23`),
   `Detrend::{None, Mean, Linear}` (`:77-84`), `Scaling::{Magnitude, Density}` (`:95-103`) —
   exactly C3 §3.6's three snake_case string sets.
5. **The histogram2d encoder has one grid: one bin per pixel.** `raster.rs:152-153` calls
   `histogram2d(xs, ys, width as usize, height as usize, …)` — there is no rebinning step (unlike
   the spectrogram path, which nearest-cell rebins, `raster.rs:104-…`). C3 §3.6 passes both
   `width`/`height` and `x_bins`/`y_bins` for the same grid; Q4 asks the lead, and this brief
   proceeds on "they must be equal".
6. **The raster binary header has not changed:** magic `IDLR`, `version = 1`, `width`, `height`,
   `format = 0` (RGBA8), 4 reserved bytes, pixels from offset 16 (`raster.rs:20-21`, `:46-54`).
   `app/src/ipc/rasters.ts`'s `decodeRaster` (lines 16-36) already matches it and **does not
   change** in this task.
7. **`app/src/ipc/rasters.ts` is stale in exactly two ways**: `fetchRaster`'s `params:
   Record<string, number>` (line 49, with the "provisional per C3 open question 6.4" comment at
   38-39) and the absence of `fetchRasterMeta`. Both are this task's TS work.
8. **Channel data**: Task 11's `tauri/src/session_source.rs::load_session` (verify the exact
   name against what Task 11 committed). `Channel.materialize() -> Vec<f64>`
   (`core/src/session/mod.rs:302`), `Channel.nominal_rate_hz` (`:155`), `Channel.unit` (`:179`),
   `Channel.t_us` (`:137`).

## The task

### Step 1: typed params (TDD)
New file `rust/tauri/src/commands/rasters.rs`. Mirror C3 §3.6's two param shapes as
`#[derive(serde::Deserialize)]` structs with `#[serde(rename_all = "snake_case")]` on the enum
fields, matching the JSON field names verbatim (C3 §1 — no rename layer):
```rust
pub struct SpectrogramParams { window_size: u32, hop_size: u32, window: WindowToken,
                               detrend: DetrendToken, scaling: ScalingToken }
pub struct Histogram2dParams { y_channel: String, x_bins: u32, y_bins: u32 }
```
plus a `#[serde(untagged)]`-free explicit dispatch on `kind` (do **not** rely on untagged
deserialization to disambiguate — an untagged enum turns a typo into a silent wrong-variant
match; deserialize `params` as `serde_json::Value` and convert per `kind`, returning
`invalid_argument` with the serde message in `detail` on failure).

Token→engine conversions, each with a unit test: `"rectangular"|"hann"|"hamming"` → `FftWindow`;
`"none"|"mean"|"linear"` → `Detrend`; `"magnitude"|"density"` → `Scaling`; and
**`noverlap = window_size − hop_size`** (fact 3), with `hop_size == 0`, `hop_size > window_size`
and `window_size == 0` all rejected as `invalid_argument` before any engine call.

### Step 2: `fetch_raster`
```rust
#[tauri::command]
pub fn fetch_raster(session_id: String, channel: String, kind: String, width: u16, height: u16,
                    params: serde_json::Value, data_dir: tauri::State<'_, DataDir>)
    -> Result<tauri::ipc::Response, IpcError>
```
with the logic in a `fetch_raster_via(data_dir: &Path, …) -> Result<Vec<u8>, IpcError>` the tests
call (lane idiom, `commands/device.rs:141-279`). **Every validation happens before the `Ok`
arm chooses `Response`** (C3 §1's binary-transport rule, spec 33-39): unknown session →
`not_found`; unknown channel (or unknown `y_channel`) → `not_found`; `width == 0 || height == 0`
→ `invalid_argument`; unknown `kind` → `invalid_argument`; bad params → `invalid_argument`.

- `kind == "spectrogram"`: `build_spectrogram_raster_bytes(&samples, channel.nominal_rate_hz,
  width, height, window, window_size as usize, noverlap as usize, detrend, scaling)`. A channel
  with `nominal_rate_hz == 0.0` (event-driven, C1 §4.2) has no meaningful spectrogram — reject
  with `invalid_argument` naming the channel, rather than passing `0.0` in as a sample rate.
- `kind == "histogram2d"`: resolve `y_channel` too, then
  `build_histogram2d_raster_bytes(&xs, &ys, width, height, None, None)`. `xs`/`ys` are the two
  channels' materialized values. **The two channels may have different lengths and different
  recorded time axes** (C1: every channel keeps its own); `histogram2d` pairs them by index.
  That is only correct when both channels share an axis. Do not silently zip mismatched
  channels: if `xs.len() != ys.len()`, reject with `invalid_argument` naming both channels and
  both lengths, and leave a `// TODO(idl0):` that resampling one onto the other's axis is a
  wave-2 decision (no contract fixes it).

**PROVISIONAL (Q4):** reject `x_bins != width || y_bins != height` with `invalid_argument` and
`detail { x_bins, y_bins, width, height }`. Document on the command why (fact 5: one bin per
pixel, no rebinning — rebinning counts would misrepresent them).

Return `tauri::ipc::Response::new(bytes)`.

### Step 3: `fetch_raster_meta`
Same arguments, JSON return. Build C3's `RasterMeta` from core's (fact 2):
```
x_domain / y_domain / transparent_zero — core's, verbatim
scale: { vmin: core.vmin, vmax: core.vmax, kind: "linear" }
x_label / y_label — filled here
```
Labels, decided here since no contract fixes the strings — put them in one `const`-documented
place and say so in a doc comment:
- spectrogram: `x_label = "time (s)"`, `y_label = "frequency (Hz)"` (the engine's own axes,
  `SpectrogramResult.times_secs`/`freqs_hz`, `core/src/spectrogram.rs:14-25`).
- histogram2d: `x_label` = `"<channel> (<unit>)"` from `Channel.unit`, `y_label` likewise from
  the `y_channel`; omit the parenthesised unit when `unit` is empty.

**`vmin`/`vmax` come from the meta function, never from the pixel bytes** — ruling R38: colour
bounds are resolution-independent, scanned over the full pre-rebin matrix, so the legend and the
image agree at every window size. Do not pass `width`/`height` into the meta functions; they do
not take them, deliberately (`raster.rs:192-206`).

### Step 4: tests
A/A/A, `thing — condition — result`. Build a session with one fixed-rate channel (a sine is
fine) and one second channel of equal length for the histogram case.
- `fetch_raster — spectrogram 64x32 — header fields and total length match C3 §3.6's formula`
  (`16 + width*height*4` = 8208 for 64×32; assert magic `IDLR`, version 1, width, height,
  format 0)
- `fetch_raster — histogram2d with x_bins/y_bins equal to width/height — well-formed bytes`
- `fetch_raster — x_bins != width — invalid_argument with both in detail`
- `fetch_raster — width 0 — invalid_argument, no bytes produced`
- `fetch_raster — unknown channel — not_found`
- `fetch_raster — event-driven channel (rate 0) requesting a spectrogram — invalid_argument`
- `fetch_raster — hop_size larger than window_size — invalid_argument`
- `fetch_raster_meta — spectrogram — scale.kind is linear and vmin/vmax match
  spectrogram_raster_meta called directly` (this is the R38 guarantee, tested rather than trusted)
- `fetch_raster_meta — histogram2d — labels carry the channel names and units`

Register both commands in `handler()` (`tauri/src/lib.rs`). No new `IpcErrorKind` variants — C3
§3.6 raises `not_found`/`invalid_argument`/`io`/`internal` only.

### Step 5: `app/src/ipc/rasters.ts`
Replace `params: Record<string, number>` with the two typed interfaces transcribed verbatim from
C3 §3.6 (spec 661-673), including the union-by-`kind` signature and the string-literal token
types; delete the "provisional per C3 open question 6.4" comment (that question is closed, R25).
Add `RasterMeta`/`fetchRasterMeta` per C3 (spec 683-695). `decodeRaster` and its tests are
unchanged (fact 6) — do not touch them. Extend `rasters.test.ts` with one test per new/changed
signature proving the `invoke()` argument object. Then `npm test && npx tsc --noEmit`.

### Step 6: CHANGELOG and commits
`CHANGELOG.md` (app worktree), `[Unreleased] / ### Added`:
`- **Raster commands (C3 §3.6) over L3's core::raster.** fetch_raster (binary) and fetch_raster_meta (axis domains + colour scale, resolution-independent per ruling R38); typed SpectrogramParams/Histogram2dParams replace the provisional Record<string, number> (C3 open question 6.4 closed).`

```bash
# rust worktree
git add tauri/src/commands/rasters.rs tauri/src/commands/mod.rs tauri/src/lib.rs
git commit -m "tauri: fetch_raster and fetch_raster_meta (C3 3.6) over core::raster"
# app worktree, after syncing the submodule pointer
git add rust app/src/ipc/rasters.ts app/src/ipc/rasters.test.ts CHANGELOG.md
git commit -m "app: typed raster params and fetchRasterMeta per signed C3 3.6"
```

## Do not
- Do not thread `width`/`height` into the `*_raster_meta` functions — ruling R38 rejected exactly
  that, and the reversal cost is one signature, not a habit.
- Do not derive `vmin`/`vmax` from the encoded pixels.
- Do not use an `#[serde(untagged)]` enum for `params`.
- Do not return `Response` before validating arguments (C3 §1, spec 33-39).
- Do not zip x/y channels of different lengths for a histogram.
- Do not change `decodeRaster` or the raster header — layout version stays 1.
- Do not add `IpcErrorKind` variants.
- Do not run the full suite, `--workspace`, or `cargo fmt`.

## Style / hygiene
Doc comment on every public symbol; units on every numeric (`window_size`/`hop_size` in
**samples**, `sample_rate_hz` in Hz, `width`/`height` in pixels); `// TODO(idl0):` never bare
`// TODO`; typed errors only; A/A/A tests named `thing — condition — result`; match idl-rs's
hand-formatted style.

## Spec discipline (say it out loud in your report)
"no spec change needed" — C3 §3.6 was already amended by ruling R25 (typed params,
`fetch_raster_meta`) and R38 (colour bounds); this task implements the amended text. Q4's
bins-vs-pixels rule is a lead ruling the lead records; do not edit anything under `docs/`.

## Report back (concise)
Both commit hashes + `git show --stat`; `cargo test -p idl-rs-tauri raster` result line with its
`passed` count; `npm test`/`tsc` results; per-step done/deviated; the exact byte length your
64×32 test asserts and the formula it came from; confirmation the meta functions were called
without `width`/`height` (R38); the label strings you chose; confirmation
`session_source.rs`'s names matched Task 11's; anything ambiguous you resolved (say how) or that
needs a lead ruling — stop and report rather than guess (CLAUDE.md §1).
