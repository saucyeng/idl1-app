# L5 Task 13 review — raster commands (C3 §3.6)

## Commits / files touched

- idl-rs worktree (`wave1-l5-tauri`, `aed233c..e479a24`), one commit `e479a24`
  "tauri: fetch_raster and fetch_raster_meta (C3 3.6) over core::raster":
  `tauri/src/commands/mod.rs` (+1), `tauri/src/commands/rasters.rs` (new,
  705 lines), `tauri/src/lib.rs` (+2). No `core/` files touched.
- idl1-app worktree (`wave1-l5-tauri`, `af7f599..e87473d`), one commit
  `e87473d` "app: typed raster params and fetchRasterMeta per signed C3 3.6":
  `CHANGELOG.md` (+1), `app/src/ipc/rasters.test.ts` (+80/-...),
  `app/src/ipc/rasters.ts` (+54/-...), `rust` submodule pointer
  `d3a6788 -> e479a24` (matches the rust commit exactly).

## Test command and result

- `cargo test -p idl-rs-tauri raster` (run in
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l5-tauri`,
  worktree clean before running): **14 passed; 0 failed; 0 ignored; 67
  filtered out.**
- `npm test -- --run` (run in
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l5-tauri\app`,
  worktree clean before running): **10 files, 30 passed, 0 failed.**

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | none found | — |

## Verification detail (the six checks from dispatch)

**(a) R38 survives the command boundary.** Neither `fetch_raster_via` nor
`fetch_raster_meta_via` (`rasters.rs:252-376`) passes `width`/`height` into
`spectrogram_raster_meta`/`histogram2d_raster_meta`; the call sites
(`rasters.rs:343`, `:369`) match the core signatures exactly (no
`width`/`height` parameter exists on either core function —
`core/src/raster.rs:192-206`/`:217-236`, unchanged by this diff). Read
`core/src/raster.rs` directly (not touched by this task, already landed
under L3-R38): `build_spectrogram_raster_bytes` computes `vmin`/`vmax` via
`finite_bounds(&s.power)` on the full un-rebinned matrix *before* the
per-pixel rebin loop (`:98-113`), and `spectrogram_raster_meta` computes
bounds from the same full matrix independently (`:189`). Since the L5
command layer does no rebinning of its own — all rebinning is internal to
the core byte builder — the only way L5 could regress R38 is by deriving
`vmin`/`vmax` from the encoded pixel bytes instead of calling the meta
function, or by leaking `width`/`height` into the meta call. The test
`fetch_raster_meta_spectrogram_scale_kind_linear_and_bounds_match_direct_call`
(`:666-687`) asserts the command's output at `width=64,height=32` equals
`spectrogram_raster_meta` called directly with no width/height — this
would fail under either regression: a pixel-decode-based implementation
would disagree due to 8-bit colour quantization, and a `width`/`height`
argument doesn't even exist on the meta functions to smuggle in, so the
signature itself forecloses that regression at compile time. Confirmed
neither meta function gained `width`/`height` — the core file has zero
diff in this range. This is the correct test for what the L5 layer can
actually get wrong (no core-level rebin logic lives here to independently
test against).

**(b) R42 rejection is load-bearing.** `check_bins_match_pixels` (`:172-181`)
is called before `find_channel`/`materialize`/`histogram2d` in both
`fetch_raster_via` (`:281-282`) and `fetch_raster_meta_via` (`:347-348`) —
verified by reading the call order in both match arms, not the test names.
Detail carries all four values under the exact keys the contract's
worked example implies (`x_bins`, `y_bins`, `width`, `height`) — confirmed
against `err.detail["x_bins"]` etc. in the test
(`fetch_raster_histogram2d_x_bins_mismatch_invalid_argument_with_both_in_detail`,
`:585-602`) and against the source (`:177`). No path reaches
`build_histogram2d_raster_bytes`/`histogram2d_raster_meta` with mismatched
values — the `?` short-circuits before either call.

**(c) Binary layout vs C3 §3.6.** `core/src/raster.rs::write_header`
(unchanged, `:44-52`) writes magic/version/width/height/format/reserved in
the field order and byte offsets C3's table specifies; total length
`16 + width*height*4` is exercised by the L5 test
(`fetch_raster_spectrogram_64x32_header_fields_and_total_length_match_c3_formula`,
`:550-567`) with `bytes.len() == 8208` for 64×32 (`16 + 64*32*4 = 8208`,
matches the contract's own worked example) and byte-sliced field asserts
at offsets 0, 4, 6, 8, 10 — matches the table exactly. Row 0 first is
core's own concern (unchanged, out of this diff's scope) and was reviewed
under L3.

**(d) `params` dispatch.** Explicit `match kind { "spectrogram" => ...,
"histogram2d" => ..., other => Err(invalid_argument) }` over
`serde_json::Value`, not an untagged enum, per the brief's explicit
instruction (`:266-309`, `:331-374`). `parse_spectrogram_params`/
`parse_histogram2d_params` (`:138-159`) map any `serde_json::from_value`
failure to `invalid_argument` with the serde message in `detail`. A
`SpectrogramParams` object sent under `kind: "histogram2d"` is missing
`Histogram2dParams`'s required `y_channel`/`x_bins`/`y_bins` fields (none
of `SpectrogramParams`'s fields overlap), so deserialization fails and the
call is refused with `invalid_argument` — no silent cross-shape match is
possible since dispatch happens on `kind` first, and the two structs are
independently, strictly deserialized (no `#[serde(default)]`). No panics
on malformed `params` — errors are values, not `unwrap`s.

**(e) No panicking path on caller-derived data.** Grepped the whole file
for `unwrap`/`expect`/indexing; every hit outside `#[cfg(test)]` is a
derive attribute (`#[derive(..., serde::Deserialize)]` etc.) or a doc
comment — zero production `unwrap`/`expect`/`[` on request-derived data.
All test-module `unwrap()`s are on fixture setup (`create_dir_all`,
`write_session_parquet`) or unwrapping the function-under-test's own
`Result` in the success-path tests, which is normal test idiom, not
data indexing.

**(f) No renderer-only parameter.** Spectrogram labels are fixed
module-level consts (`SPECTROGRAM_X_LABEL`/`_Y_LABEL`, `:187-188`),
documented as deliberately not channel-derived (a spectrogram's axes are
always time/frequency). Histogram2d labels are built only from
`channel_id` and `Channel.unit` (`histogram_axis_label`, `:190-198`) — no
chart/UI-only setting (colour scheme name, DPI, theme, etc.) crosses into
`fetch_raster_via`/`fetch_raster_meta_via`'s calls into `idl_rs::raster`;
the only values forwarded to core are `width`/`height` (pixel dimensions,
already part of the contract) and the typed FFT/histogram params.

## Additional checks

- Command registration: both `fetch_raster` and `fetch_raster_meta` added
  to `handler()` in `tauri/src/lib.rs` (`:43-44`), module declared in
  `commands/mod.rs`.
- No new `IpcErrorKind` variants: `tauri/src/error.rs` has zero diff in
  this range.
- `RasterMetaOut` (`:216-223`) matches C3 §3.6's `RasterMeta` shape exactly:
  `x_domain`/`y_domain`/`x_label`/`y_label`/`scale { vmin, vmax, kind }`/
  `transparent_zero`, with core's flat `vmin`/`vmax` correctly nested under
  `scale` and `kind` fixed at `"linear"`.
- TS side (`app/src/ipc/rasters.ts`): `SpectrogramParams`/`Histogram2dParams`
  transcribed verbatim from C3 §3.6 field-for-field; `fetchRasterMeta`
  added with the matching `RasterMeta` interface; `decodeRaster` and its
  existing tests untouched (confirmed no diff to the decode logic itself,
  only new tests appended). The stale "provisional per C3 open question
  6.4" comment and `Record<string, number>` params type are both gone.
- `CHANGELOG.md` entry added under `[Unreleased] / ### Added`, matching the
  brief's specified wording.
- `rust` submodule pointer updated to `e479a24`, exactly the rust worktree's
  new commit — no drift.
- Commit messages: single-line, no AI attribution trailers, in both repos.
- Scope: no files touched outside what the brief authorized; no edits under
  `docs/`; no touch to `decodeRaster`, the raster header, or
  `IpcErrorKind`.

## Verdict rationale

Both commands implement C3 §3.6 as amended by R25/R38/R42 exactly: the
colour-bounds independence ruling is enforced by construction (the meta
functions structurally cannot receive `width`/`height`) and is exercised
by a test that would catch a pixel-decode regression; the bins/pixels
mismatch is rejected before any core call in both commands with the full
four-value detail; the binary layout matches the contract's worked
example byte-for-byte; params dispatch is explicit (no untagged enum) and
refuses cross-shape and malformed payloads with typed errors; there is no
panicking path on caller-derived data; and no renderer-only value crosses
into the core engine calls. Both test suites were run exactly as
dispatched and both report non-zero `passed` counts. No deviations, no
scope creep, no reformatting, hand-formatted style matches the
surrounding lane code.

VERDICT: CLEAN
