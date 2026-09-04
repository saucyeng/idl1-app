# L3 pre-read — Tasks 10–16 vs. C3 §3.5–3.7, C2 §6, the SPEC, and landed code

Read-only pass. Line refs: plan = `docs/superpowers/plans/2026-09-03-idl1-wave1-l3-workbook.md`;
v3 code = L3 worktree at `668a483` (**Task 4 in progress — `constants.rs` untracked,
`math/parse.rs` + `v3/mod.rs` modified**); everything else = shared checkout on `main`.

**Rulings that bind 10–16.** R13(b–c) + L3-R27 (per-module filters; one end-of-batch
`-p idl-rs -p idl-rs-cli`; **never `--workspace`**) → Tasks 15–16, violated. L3-R8 (a filter
matching nothing is a failed gate) → Tasks 10 and 11, both dead as written. L3-R12 (empty
`t_us` = "no axis") + L3-R21 (`length = v.len()`, `t` empty for a scalar) → Tasks 12 and 15.
L3-R25 (one `CellEvalResult` per cell, values under `defs[].value`) → Task 15, written against
the pre-R25 shape. R22 (`CellOutput.errors`, `HostChannelRef`, host bytes = L5) → **no effect
on 10–12**: tiles/rasters/cursor are their own byte paths, and R22's Amendment D binary command
is the same `tauri::ipc::Response` mechanism C3 §3.5/§3.6 already fix. R20's `RESERVED_NAMES`
(15, incl. `Time`/`Distance`) → Task 13, unhandled.

---

## Task 10 — Tile endpoint (plan 649–743)

**Gaps**

- **G10.1 — the gate matches zero tests.** Plan 738: `cargo test -p idl-rs "tile|column_stats"`.
  libtest filters are substrings, not regexes (same defect as Task 8's, L3-R8).
- **G10.2 — `tier` overflows and panics before any validation can run.**
  `TIER_BASE.pow(tier)` (`chart_decimation.rs:67`, and again `handle.rs:594`) is `u32::pow`:
  8¹⁰ = 1 073 741 824 fits, **8¹¹ overflows** → panic in debug, wrap in release. C3 §3.5 promises
  `invalid_argument` for "`tier` outside the engine's configured range" (spec 573) but **no
  such range is defined anywhere in core**, so L5 has nothing to validate against and
  CLAUDE.md §5's "never a crash on bad data" is unmet. Separately, C3 types the request `tier`
  as `u32` (spec 568) and the header field as `u16` (spec 588) — a silent narrowing the plan
  transcribes without comment.
- **G10.3 — Open Question 5 is not a contract inconsistency.** C3 §3.5's own `sample_count` note
  (spec 590) already says "Today `decimate_channel` always fills `TILE_SIZE_BUCKETS = 1024` …
  `sample_count` makes the tile self-describing so a shorter final tile or a future tile-size
  change never requires a layout bump". The worked example's 512 is an illustrative number for
  the **offset arithmetic** — which is exactly how C3 presents it ("Check: `4128 = 32 + 4096` ✓",
  spec 618). Plan 698–723 spends 25 lines and an open question insisting this is "a real
  inconsistency … do not silently paper over it". Consequence: a lead decision manufactured out
  of nothing, plus a mandated test of a hypothetical.
- **G10.4 — degenerate `column_stats` arguments are unspecified.** `column_count == 0` (empty
  column region — legal, or a `0/0`?), and the fact that a tile's span is
  `TILE_SIZE_BUCKETS * bucket_size` **regardless of `samples.len()`**, so a 3-sample channel at
  tier 0 yields 1024 columns of `(NaN, NaN, NaN)`. Neither is in the plan's test table.
- **G10.5 — the tile carries no time axis, and the tier is indexed by sample position.**
  Every field in C3 §3.5's header is index-space; nothing maps column `j` to a time. The only way
  a frontend can place a tile on a time axis is `t = index / nominal_rate_hz` — literally "time
  is assumed", the invariant this lane exists to defend (C1; CLAUDE.md §3), and wrong for every
  channel with real irregular `t_us` (C1 §2 gives every channel one). **Structural.**
- **G10.6 — two tile paths, one unnamed.** `build_tile_bytes(samples: &[f64], …)` needs a fully
  materialised f64 column; `SessionHandle::decimate_tile` (`handle.rs:592`) exists precisely so
  that never happens ("no f64 window is ever materialized", `handle.rs:587-588`; SPEC §15.3).
  Design §4 (line 84, "Parquet column (mmap) → `decimate_channel`") sanctions the `&[f64]` form,
  so the plan is not wrong — but it never says which source L5 feeds, and the two differ in cost
  by ~11 MB per 30-min 800 Hz channel while producing identical bytes.
- **G10.7 — no tier cache.** Design §4's L3 row (line 187) lists "tile endpoints with column
  stats **+ tier cache**". No task in this plan builds one. Not in the done-when row; record the
  deferral rather than let it read as delivered.

**Proposed rulings**

- **L3-R28.** `chart_decimation.rs` gains `pub const MAX_TIER: u32 = 10;` (largest `k` with
  `TIER_BASE.pow(k) <= u32::MAX`), doc-commented as **C3 §3.5's "engine's configured range"** so
  L5 has a symbol to validate against and reject with `invalid_argument` *before* returning a
  `Response` (C3 §1, spec 33–35). `decimate_channel` and `SessionHandle::decimate_tile` compute
  `bucket_size` as `TIER_BASE.checked_pow(tier).unwrap_or(u32::MAX)`, making a too-large tier an
  all-NaN tile instead of a panic. `build_tile_bytes` stays infallible and writes
  `tier.min(u16::MAX as u32) as u16`, doc-commenting the narrowing. Tests: `tier above MAX_TIER —
  all-NaN tile, no panic`; `MAX_TIER is the largest tier TIER_BASE.pow does not overflow`.
  `handle.rs` is landed L1 code — **this edit needs the lead's cross-lane authorisation**, same
  form as R23 gave L2 for `parquet.rs`/`synthesis.rs`. *Cost if wrong: one const and two
  `checked_pow` calls.*
- **L3-R29 (PROVISIONAL — see Q3).** Tile layout v1 ships unchanged, index-space, and
  `build_tile_bytes`' doc comment states the precondition in one sentence: *"columns and buckets
  are sample positions, not times; a caller maps them to the time axis itself, and that mapping
  is exact only for a channel with a uniform `t_us`."* No synthesised axis is written into the
  tile (C1). The C3 §3.5 revision that adds one is lead-owned and batched with L3-R33.
  *Cost if wrong: one doc paragraph; the layout is already self-describing and versioned.*
- **L3-R30.** Open Question 4 (column span) is **closed as the plan states it** — the tile's own
  sample range in `column_count` equal slices; it is the only reading consistent with design §6's
  "the per-pixel-column stats shipped with each tile". Open Question 5 is **closed as
  not-an-inconsistency** (G10.3): keep the cheap pure-arithmetic offset test (it pins C3's
  formula), delete the "real inconsistency" framing and the hypothetical-512 narrative.
  `column_count == 0` is legal and yields a zero-length column region (the format is
  self-describing); `column_stats` returns an empty `Vec`, tested. *Cost if wrong: test wording.*

**Compute note.** `cargo test -p idl-rs chart_decimation` and `cargo test -p idl-rs tile::`,
each asserting non-zero `passed` (L3-R8). `column_stats` and `MAX_TIER` are additive `pub`
symbols; `SessionHandle::decimate_tile`'s body changes but not its signature — no
`cargo check -p idl-rs-cli --tests` mandated here.

---

## Task 11 — Raster endpoint (plan 746–837)

**Gaps**

- **G11.1 — "no prior implementation" is false.** `scatter::scatter_density` (`scatter.rs:130`)
  is a 2-D count histogram with exactly the layout Step 1 specifies —
  `counts[r * bins + c]`, `r` = y bin (`scatter.rs:111-113, 185`) — and `scatter::pair_finite`
  (`scatter.rs:34`, already `pub(crate)`) is the "skip non-finite pairs" pass. The degenerate
  rules **diverge**: `scatter_density` returns a full zero grid with finite bounds and folds a
  zero-width axis into bin 0 (`scatter.rs:153-158, 176-181`); the plan returns empty vectors.
  Two 2-D histograms in one crate answering the same degenerate input differently.
- **G11.2 — `build_spectrogram_raster_bytes` cannot call `spectrogram()`.** The landed signature
  takes **seven** arguments (`spectrogram.rs:41-49`) — the plan's builder passes five, omitting
  `detrend: Detrend` and `scaling: Scaling`. `Scaling` changes every pixel (Magnitude = `|X|` in
  input units vs. Density = PSD in units²/Hz). `spectrogram` also takes `data: Vec<f64>` by
  value, so a `&[f64]` builder copies.
- **G11.3 — the spectrogram raster is transposed and vertically flipped, twice unstated.**
  `SpectrogramResult.power` is row-major `n_times × n_freqs` (`spectrogram.rs:17-19`): **row =
  time, column = frequency.** The raster is row-major `height × width`, row 0 = **top**
  (C3 spec 643–645). "Rebin `power` onto `(width, height)`" therefore puts time on Y; and even
  once transposed, freq bin 0 (DC) lands on row 0 = top, inverting every spectrogram convention.
- **G11.4 — the stated justification for `counts` being `ny × nx` is wrong.** Plan 779–780 cites
  "`SpectrogramResult`'s existing row-major convention"; there, the row index is the **x** axis.
  The chosen layout is right (it matches `scatter_density`); the reason given is not.
- **G11.5 — the raster ships no axis extents and no colour scale.** C3 §3.6's header is
  magic/version/width/height/format/reserved only. Design §4 (line 86–87) puts the RGBA raster
  "under the chart's axes" — Plot draws those axes and needs the domains
  (`times_secs`/`freqs_hz`, or `bin_edges_x`/`bin_edges_y`), and a legend needs the normalisation
  `(vmin, vmax)`. `Histogram2dResult` computes `bin_edges_x`/`_y` and the raster path discards
  them. **Structural.**
- **G11.6 — C3 open question 6.4 is assigned to L3, and the plan reassigns it away.** Spec
  899–906: "Assigned: **L3** — pin `SpectrogramParams { window_size, hop_size }` and
  `Histogram2dParams { y_channel, x_bins, y_bins }` … and revise §3.6 in the same change." Plan
  1246–1253 says "Assigned: whoever resolves C3 open question 6.4 (**not L3**)". Also
  `hop_size ≠ noverlap` (`hop = nperseg − noverlap`) and `FftWindow`/`Detrend`/`Scaling` cannot
  cross a `Record<string, number>` at all.
- **G11.7 — Step 2's colour rule and Step 3's degenerate test contradict each other.** Step 2
  maps only NaN to `[0,0,0,0]` and sends an all-equal/empty input to "the LUT's zero point";
  Step 3 then asserts a degenerate input yields "a transparent (all-zero-alpha) pixel region".
  An empty histogram is all-zero counts → `t = 0.0` → Turbo's opaque dark blue, not transparent.
  The test as written fails the code as specified.
- **G11.8 — linear min-max on counts, unremarked.** Density counts are heavily skewed; linear
  normalisation collapses nearly every occupied bin onto the LUT's low end. Verified: no
  `colorous` or any colour crate in `core/Cargo.toml` — hand-roll Turbo, as the plan's fallback says.

**Proposed rulings**

- **L3-R31.** `histogram2d` reuses `scatter::pair_finite` and its module doc names
  `scatter::scatter_density` as the session-coupled sibling (one algorithm, two entry points).
  Degenerate rule aligned to `scatter_density`, not to `HistogramResult::empty()`: whenever
  `nx > 0 && ny > 0`, return a **full-size** `counts` grid (zeros) with resolved `bin_edges_x/y`;
  a zero-width axis collapses to bin 0 (`scatter.rs:176-181`); `Histogram2dResult::empty()` only
  for `nx == 0 || ny == 0`. This is what makes Step 3's "degenerate input still produces a
  well-formed raster" reachable without a special case. *Cost if wrong: one early-return branch.*
- **L3-R32.** `pub fn build_spectrogram_raster_bytes(samples: &[f64], sample_rate_hz: f64,
  width: u16, height: u16, window: FftWindow, nperseg: usize, noverlap: usize, detrend: Detrend,
  scaling: Scaling) -> Vec<u8>` — no L3-invented defaults; the landed CLI's defaults
  (`Hann`, `nperseg = 0`, `noverlap = 0`, `Mean`, `Density`, `cli/src/main.rs:172-185`) are what
  L5's wrapper passes, cited in the doc comment. Orientation, stated once and tested: pixel
  `(x, y)` reads `power[frame_of(x) * n_freqs + (n_freqs − 1 − bin_of(y))]` — **x = time,
  row 0 = highest frequency**, nearest-cell rebin, documented as the resampling method.
  `noverlap` keeps the engine's name; the doc comment carries `hop = nperseg − noverlap` so C3's
  `hop_size` converts at exactly one site. Test: `a steady tone — its energy row sits at the same
  y for every x, and moving the tone up in frequency moves the row up (toward row 0)`.
  *Cost if wrong: two arguments and one index expression, caught by that test.*
- **L3-R33 (structural; L3 owns it per C3 spec 903).** L3 drafts the C3 §3.6 revision this lane
  is assigned: pin `SpectrogramParams { window_size, hop_size, window, detrend, scaling }` and
  `Histogram2dParams { y_channel, x_bins, y_bins }` (replacing `params: Record<string, number>`,
  which cannot carry the three enums or the second channel id), and add the raster's **axis
  extents and colour-scale range** (G11.5) as a small JSON side-channel — a separate
  `raster_meta(...)` command, **not** stuffed into the 16-byte header, so the pixel layout stays
  at version 1. Drafted as a delta file for the lead to apply, exactly as R22's batch was; L3
  codes the Rust to match now. Task 11's SPEC line changes from "no spec change needed" to
  **spec-during**. *Cost if wrong: contract text with no shipped consumer.*
- **L3-R34.** Colour rules, stated once: `turbo_rgba8(t)` returns `[0,0,0,0]` for a non-finite
  `t` and the pinned Turbo endpoints for `0.0`/`1.0`. `normalize_to_colormap` guards `0/0 → 0.0`.
  `build_histogram2d_raster_bytes` maps **`count == 0` to `f64::NAN` before normalising**, so an
  empty bin is transparent and the chart's gridlines show through (design §4's "raster under the
  chart's axes"); normalisation spans the non-zero counts only. That, and nothing else, makes
  Step 3's transparent-degenerate-region test pass. Linear scaling is kept and its skew recorded
  as a `// TODO(idl0):` naming a log/percentile option as an L6 display decision, not a Rust one
  (CLAUDE.md §3, "no renderer-only parameters"). *Cost if wrong: one `if count == 0` and a comment.*

**Compute note.** Plan 833's `cargo test -p idl-rs "histogram2d|colormap|raster"` matches zero
tests (L3-R8). Run three: `histogram2d`, `colormap`, `raster::`, each non-zero. Plus
`cargo test -p idl-rs scatter` once — L3-R31 changes no `scatter` behaviour but leans on it.

---

## Task 12 — Cursor readout (plan 841–881)

**Gaps**

- **G12.1 — the algorithm is already written, privately.** `nearest_by_t_us`
  (`handle.rs:954-969`) is nearest-sample over `t_us` by `partition_point`, **clamped at both
  ends** (`handle.rs:961-962`), with the plan's exact tie rule — `<=` picks `lo`, the earlier
  sample (`handle.rs:963`). Re-implementing it in `cursor.rs` puts two nearest-sample rules in
  one crate that can silently diverge on the tie.
- **G12.2 — `NaN` is not `None`.** `nearest_by_t_us` returns `f64::NAN` for empty arrays, and a
  NaN *sample* is legitimate everywhere else in this crate (`decimate_tile_pure`'s whole NaN
  contract). `cursor_readout` must decide emptiness from `min(t_us.len(), v.len()) == 0`, never
  from `is_nan()`. Not stated.
- **G12.3 — L3-R12's case is missing from the test table.** An axis-less result (scalar
  definition, `{col[]}`, any rate-0 source) has `t_us.len() == 0` with `v.len() > 0`.
  `min(0, n) == 0` → `None` is the right answer, and none of the plan's six tests covers it.
- **G12.4 — shape vs C3.** Plan returns `Vec<(String, Option<f64>)>`; C3 §3.7 returns
  `{ t_us, values: Record<string, number | null> }` (spec 656–661). A `Vec` admits duplicate ids
  a JSON object cannot represent, and the `t_us` echo has no core source. Fine, but say who folds.
- **G12.5 — "no sample *near* `t_us`" (spec 659) vs. unconditional clamping.** Under the plan's
  clamp, a channel whose last sample is 400 s before the cursor still returns a value and the
  frontend cannot tell. C3's own wording implies a proximity bound nobody has specified. → Q4.
- **G12.6 — design §3 vs C3 §3.7.** Design line 78 lists "cursor readouts" among heavy arrays
  crossing as raw bytes; C3 §3.7 makes them JSON. C3 is signed and a readout is a handful of
  scalars — C3 wins. One line so this is not re-opened at review.

**Proposed rulings**

- **L3-R35.** `session/handle.rs` gains `pub(crate) fn nearest_at_t_us(samples: &[f64],
  t_us: &[i64], target_us: i64) -> Option<f64>` — the existing body, returning `None` iff
  `samples.len().min(t_us.len()) == 0`; the seconds-taking `nearest_by_t_us` becomes a wrapper
  (`(t_secs * 1e6).round() as i64`, `unwrap_or(f64::NAN)`), so no v2 behaviour moves.
  `cursor::cursor_readout` calls it — **one** nearest-sample rule in the crate. Signature
  unchanged (`&[(&str, &[i64], &[f64])]`, `t_us: i64`), doc comment stating: results are in
  request order; a duplicate channel id yields two entries and is the caller's problem; L5 folds
  to C3's `Record` and supplies the `t_us` echo; existence checking is L5's (C3's
  `invalid_argument` + `detail.channel`, spec 662–666), and this function never sees an unknown
  channel. Tests: the plan's six, plus `axis-less channel (empty t_us, three values) — None`
  (L3-R12) and `NaN sample at the nearest index — Some(NaN), not None`. `handle.rs` is landed L1
  code — same cross-lane authorisation as L3-R28. *Cost if wrong: one wrapper function.*

**Compute note.** `cargo test -p idl-rs cursor` and `cargo test -p idl-rs session::handle`
(L3-R35 refactors a function three landed call sites use). No `pub` signature changes.

---

## Task 13 — `migrate-workbook` (plan 885–990)

**Gaps**

- **G13.1 — `math_channels[].id` is dropped, and Stage 2 cannot work without it.** Legacy
  §6 (`docs/legacy/idl0-workbook_format.md:282, 305-317`): charts reference math channels by
  **`id`** (`ChartSlot.mathChannelIds`); `id` defaults to `name` only for hand-authored files —
  the app assigns UUIDs and `builtin:…`. C2 §6's mapping table has **no row for
  `math_channels[].id`**, and §6.1's rename pass rewrites `[OldName]` and `channel("Old Name")`,
  both name-space. Consequence: after migration every `_migrate_charts` entry's
  `mathChannelIds: ["<uuid>"]` resolves to nothing and Stage 2 emits charts with no math marks —
  silently. This is the migration's largest data-loss path and no test in the plan can see it.
- **G13.2 — `math_channels[].color` has no destination.** C2 §6 says "dropped at this stage …
  carried forward as a **fallback**" (spec 778) and Stage 2 reads it (spec 846), but **no key is
  defined anywhere to carry it**. `_migrate_charts` is a `ChartSlot[]` with no per-definition
  slot. Plan 956–959 punts: "wherever this plan chooses to stage it". Structural — L6's
  TypeScript has to read whatever is chosen.
- **G13.3 — a migrated definition can land on a reserved name.** C2 §6 refuses only *constants*
  colliding with `pi/tau/e/g` (spec 779). `RESERVED_NAMES` is 15 entries (`v3/error.rs:51-54`,
  R20). A v2 channel named `Session`/`Channel`/`Constants`/`G` derives to a reserved identifier;
  one named `Time` is already a valid identifier and is returned unchanged straight onto the
  reserved list. Either way the migration emits a file **its own `parse_workbook` rejects**.
- **G13.4 — `existing` is never seeded with the already-valid names.** C2 §6.1 runs the algorithm
  only for names failing `identifier`, so a channel already named `roll_deg` and another
  deriving to `roll_deg` collide with nothing in step 5's set. Order of claiming decides who
  gets `_2`; C2 says "in source order" but the plan's two-callsite split loses it.
- **G13.5 — `workbook_version` range, three sources, two answers.** Legacy doc:119 "Current max
  is **1** … a value > 1 throws". C2 §6: "(1 or 2)", refuse `> 2`. Landed
  `SUPPORTED_WORKBOOK_VERSION: u32 = 2` (`workbook/model.rs:11`) with absent defaulting to `1`
  (`model.rs:13-14`). The engine agrees with C2; the legacy doc is stale.
- **G13.6 — `worksheets[].tables[]` does not exist.** C2 §6 (spec 780) says "and legacy
  `worksheets[].tables[]` if present". The legacy format names exactly one legacy array,
  `charts` (a flat `ChartSlot[]`, legacy doc:142); tables live only at `blocks[].content.table`
  (legacy doc:154-167; landed `BlockContentRaw::Table { table }`, `model.rs:73-79`). An
  implementer transcribing C2 hunts a phantom path.
- **G13.7 — block metadata dropped with no row and no warning.** `blocks[].id`, `placement`,
  `overlayTargetId`, `overlayOpacity`, and a table block's `rowSource` (`authored` |
  `lapSelection`, legacy doc:172-174). `rowSource == "lapSelection"` makes a table a *live N-lap
  comparison*; migrating it as an authored table silently changes what it shows.
- **G13.8 — "copied verbatim" cannot mean byte-identical.** Holding `content.table` as
  `serde_json::Value` (plan 899) and re-serialising reorders keys — `serde_json::Map` is a
  `BTreeMap` unless `preserve_order` is on, and it is not (`core/Cargo.toml`). Say "semantically
  identical JSON" or a reviewer will demand text equality.
- **G13.9 — `generate_cell_id()` is private** (`v3/cell.rs:88`). Plan 950 reuses it.
- **G13.10 — the CLI shape is undecided, and the spec-first task freezes it first.** Plan 969
  declares two positionals; plan 982 verifies "`--input`/`--output` (or positional args…)";
  Task 14's SPEC text (plan 1098) writes two positionals. Every landed subcommand takes a
  positional path plus `-o/--output` (`cli/src/main.rs:56, 64, 72-77`).
- **G13.11 — the CLI error envelope is not mentioned.** Bulk commands route failure through
  `emit_bulk(command, Result<(), CliError>)` with a closed `ErrorKind`
  (`cli/src/envelope.rs:38-56, 281-289`); `main.rs:1-12` states the contract. `MigrateError` has
  no mapping and the plan prints report lines with no envelope at all.
- **G13.12 — no `cli/tests/` directory exists** (verified: `cli/` holds `Cargo.toml`, `src/`).
  The plan's "check first" is answered: inline `#[cfg(test)]` in `cli/src/main.rs`.
- **G13.13 — `workbook_id` copied verbatim may not be a UUID.** C2 §1 requires a UUIDv4 `id`
  (spec 33) and Task 1 enforces it (`v3/error.rs:33-36`); legacy doc:112 says "UUIDv4 **in the
  app**" — a hand-authored file's id is free text. Verbatim copy → unparseable v3 file.

**Proposed rulings**

- **L3-R36 (structural — see Q3).** The migration carries an **identity map**, not a rename list:
  `MigrationReport { pub renamed: Vec<(String, String)>, pub identifier_by_v2_id:
  BTreeMap<String, String>, pub dropped: Vec<String> }`, and the emitted front matter gains one
  transient key beside `_migrate_charts`:
  `_migrate_math: { "<v2 math_channel id>": { "identifier": "roll_deg", "color": "#FF2196F3" } }`,
  deleted by the app in the same Stage-2 pass that deletes `_migrate_charts` (C2 §6's own
  idempotence rule, spec 858–860). One key closes G13.1 and G13.2 together. Lead-owned C2 §6
  amendment; L3 codes it now and Task 13's tests assert it. **PROVISIONAL.**
  *Cost if wrong: one front-matter key, unshipped — but omitting it loses every migrated chart's
  math marks with no error.*
- **L3-R37.** One derivation pass in **source order** over `math_channels[]`. `existing` starts
  empty and every assigned identifier is inserted as assigned — valid-as-is names included — so
  step 5's `_2` fires in either direction. After deriving or accepting, an identifier in
  `RESERVED_NAMES` (`v3/error.rs:51`) takes the same `_2`/`_3` suffix path, with the original
  preserved as `# label:` exactly as a sanitised name is. `derive_identifier(original, existing)`
  keeps its signature; the reserved check lives in the caller, with its own tests
  (`v2 channel named "Session" — migrates to session_2 and the output parses`;
  `v2 channel named "Time" — valid identifier but reserved, migrates to Time_2`). Constants keep
  C2 §6's harder rule (refuse on `pi/tau/e/g`) — a constant's collision is the author asserting a
  value; a definition's is an accident of sanitisation. *Cost if wrong: one loop and two tests.*
- **L3-R38.** CLI shape, pinned before Task 14 writes it: `idl-rs migrate-workbook <INPUT>
  --output <OUTPUT>` — positional input (house pattern), `-o/--output` **required** (unlike
  `export`/`math`, where stdout is a legal sink; a `.idl1wb` on stdout would interleave with the
  rename report). Bulk command: `emit_bulk("migrate-workbook", …)`; `MigrateError` maps
  `Io → ErrorKind::Io`; unsupported/absent version, undeserialisable JSON, and the
  reserved-constant refusal → `InvalidInput` with `details` naming the offender. The report
  (`"<old>" → "<new>"` per line, then a count) goes to **stdout**; the error envelope to stderr.
  *Cost if wrong: one `#[arg]` attribute and a match arm.*
- **L3-R39.** Corrections to C2 §6 that Task 13 implements: accept `workbook_version` in
  `1..=workbook::SUPPORTED_WORKBOOK_VERSION` (`model.rs:11` — use the constant, never a literal),
  absent → `1`. `workbook_id` is copied verbatim **only when it parses as a UUID**; otherwise a
  fresh `Uuid::new_v4()` is minted and the substitution recorded in the report (G13.13). Table
  blocks are read and re-emitted as `serde_json::Value` — "verbatim" means semantically
  identical JSON, not identical text (G13.8). The legacy array is `worksheets[].charts[]` only;
  **there is no `worksheets[].tables[]`** (C2 spec 780 is wrong — legacy doc:142). Block
  metadata and `rowSource` are dropped with one report line each, never silently, and a
  `rowSource == "lapSelection"` table gets an explicit warning that its live-lap behaviour is
  gone. `generate_cell_id` → `pub(crate)`. `use crate::workbook::v3::parse_workbook` explicitly
  in tests — bare `parse_workbook` in `workbook/` resolves to the **v2** reader
  (`workbook/mod.rs:12`). *Cost if wrong: all inside the migration, no shipped consumer.*

**Compute note.** `cargo test -p idl-rs workbook::migrate`, then
`cargo test -p idl-rs-cli` (Task 13 adds a subcommand — the whole crate is small).
`cargo check -p idl-rs-cli --tests` is implied by the latter. Plan 986's `-p idl-rs -p idl-rs-cli
migrate` filter is fine but must assert non-zero `passed` (L3-R8).

---

## Task 14 — SPEC §17a rewrite (plan 994–1120)

**Gaps**

- **G14.1 — the line range is wrong by ~130 lines.** §17a is `docs/IDL0_SPEC.md:1544–1611`
  (`## 17b.` at 1613), not "~1412–1479". A blind edit at 1412 lands inside §15/§16.
- **G14.2 — §17a.5 "Import policy" is deleted without replacement.** Spec 1603–1609 (no local
  match → import preserving UUID; UUID match → Replace or Import-as-copy) is live app behaviour;
  the plan reuses the §17a.5 slot for Migration. Nothing in C2 covers import (C2 §7 is *merge*).
- **G14.3 — Step 2's grep misses the table of contents.** `docs/IDL0_SPEC.md:32` reads
  `| 17a | Workbook Entity | Analyze tab, Drive sync |` — matched by neither `§17a` nor `17a\.`,
  and its "Drive sync" is precisely what D7 removes.
- **G14.4 — four other sites contradict the new §17a and are in no Files list.** Line 1793:
  "User-defined constants … inserted as inline numeric literals … **There is no symbolic
  constant reference syntax**" — flatly contradicts C2 §3.1/§3.2 (and, per G15.1, is the
  behaviour Task 15's v2 arm depends on). Line 2270: "A channel's identity is its stable `id`
  (charts reference channels by `id`); expressions reference channels by `name`" — v3 has one
  flat identifier namespace. Lines 2883/2889: `<workbookId>.idl0wb` and "synced under
  `IDL0/workbooks/…` with last-write-wins by `updated_at_ms`" — contradicts C4 and per-cell merge.
- **G14.5 — a pre-existing stale claim will surface in the same pass.** §17a.2 (spec 1578–1579)
  says the engine consumes `overlay_layouts` "directly via `idl-rs overlay --workbook`". There is
  no `overlay` subcommand (`cli/src/main.rs` has 16; verified). Not L3's to fix — do not let it
  become a blocker.
- **G14.6 — spec-first ordering only helps if L3-R38 is settled first.** Task 14's text pins the
  CLI invocation; if Task 13 later picks `--output`, the spec is wrong on the day it lands.
- **G14.7 — not a gap, stated so a reviewer does not "fix" it.** The draft's `{length, t, v}`
  with `t` in seconds is correct: R22 narrowed the *wire* shape to `HostChannelRef`, but §17a
  describes what the JS cell sees, which is L3-R21's full `HostChannel`.

**Proposed ruling**

- **L3-R40.** Task 14 re-locates its range **by heading text** (`## 17a.` through the line before
  `## 17b.`), never by number; the true range today is 1544–1611. The plan's migration section
  becomes **§17a.6**; **§17a.5 keeps Import policy**, edited only for the new extension and to
  state that an id collision on import is still Replace / Import-as-copy — the one sanctioned way
  a workbook gets a new `id`, since C2 §1 makes `id` immutable. Step 2's sweep becomes
  `grep -n "17a\|idl0wb\|workbook_version\|Drive sync" docs/IDL0_SPEC.md`; line 32, 1793, 2270,
  2883 and 2889 are fixed in the same commit, or each named in the commit message as a deliberate
  deferral. G14.5 is recorded, not fixed. *Cost if wrong: one section number and four edits.*

---

## Task 15 — Done-when proofs (plan 1124–1172)

**Gaps**

- **G15.1 — the headline test cannot pass as written: the v2 arm has no constants.** Step 1
  requires a definition "using a front-matter constant", then evaluates it through
  `math::evaluate(&def.expression, …)`. Today's evaluator resolves only the built-ins
  `g/pi/tau/e`; `parse_with_constants` is what Task 4 is *adding*. A v2 expression naming a user
  constant fails `UnknownChannel` on the v2 side. SPEC:1793 says the idl0 app inserted user
  constants as **inline numeric literals**, so no real v2 file contains such a reference either —
  the fixture is both unrepresentative and unevaluatable.
- **G15.2 — `CellEvalResult.host_value` does not exist.** Plan 1142. Under L3-R25 (approved, R21)
  the shape is `CellEvalResult { cell_id, kind, defs: Vec<CellDefResult>, errors }`; values live
  at `defs[i].value: Option<HostChannel>`.
- **G15.3 — matching "by original name via the `MigrationReport`" only covers renamed
  definitions.** `renamed` (plan 903) holds pairs for sanitised names only; an unchanged name has
  no entry. Closed by L3-R36's `identifier_by_v2_id`.
- **G15.4 — `v3.t.len() == v2.samples.len()` is wrong for every axis-less definition** (L3-R12,
  L3-R21: `t` is empty for a scalar result). It will fail on any fixture containing one.
- **G15.5 — `cargo test --workspace`** (plan 1168) is forbidden by R13(c) and L3-R27.
- **G15.6 — `SessionHandle::from_channels` exists** (`handle.rs:243`) — plan 1136 verified, no gap.

**Proposed ruling**

- **L3-R41.** Step 1's fixture drops the user-constant definition and keeps: one AHRS-shaped name
  needing sanitisation, one `[Name]` cross-reference, one plain arithmetic definition, one
  scalar (`avg = mean([X])`) to exercise the axis-less case. A separate, **v3-only** test covers
  constants (no v2 arm exists to compare against — SPEC:1793 is the citation). Assertions:
  `v2.samples == v3_def.value.v` **bit-for-bit**; `v3_def.value.length == v2.samples.len()`;
  `t.len() ∈ {0, length}` with `0` **only** for the scalar. Definitions are matched through
  `MigrationReport.identifier_by_v2_id` (L3-R36), and values are read from
  `defs[i].value` (L3-R25), not `host_value`. "Byte-for-byte" is scoped in the test's doc
  comment: *identical `f64` samples out of the same evaluator on the same inputs* — v3 constants,
  the `t_us` axis and Q1's rate correction are new information, not parity regressions.
  Step 3 becomes L3-R27's `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`, moved to
  Task 16 (below). *Cost if wrong: one fixture definition and three assertions.*

---

## Task 16 — CHANGELOG, TASKS, lane brief (plan 1176–1210)

**Gaps**

- **G16.1 — no test gate at all**, while Task 15 carries the forbidden `--workspace` run. The
  lane's single full run has no home.
- **G16.2 — the CHANGELOG claims work this lane did not do.** "a 69-function builtin catalog" is
  listed under **Added**; the plan's own self-review (1270–1272) says C2 §3.3 is "already
  implemented in `math/eval.rs`, no v3 work needed". Design §4's L3 row also promises a **tier
  cache** (line 187) that no task builds — ticking `- [x] L3 core workbook v3` reads as delivered.
- **G16.3 — `runs/2026-09-03/lanes/l3-workbook/BRIEF.md` already exists** (written for this run,
  alongside `brief-task1…9.md`). Step 3 says "Create" — a blind write destroys the lead's brief.

**Proposed ruling**

- **L3-R42.** Task 16 gains **Step 0**, the lane's one full run: `cargo test -p idl-rs
  -p idl-rs-cli -- --test-threads=4`, never `--workspace` (R13(c), L3-R27), and it replaces
  Task 15 Step 3. The CHANGELOG line drops "69-function builtin catalog" (consumed, not added)
  and gains the consumer-visible surface Tasks 10–13 actually ship: `MAX_TIER`, the `IDLT`/`IDLR`
  layouts, `cursor_readout`, and the two transient front-matter keys (`_migrate_charts`,
  `_migrate_math`). The `TASKS.md` tick carries a parenthetical naming the two deferrals — tier
  cache (design line 187) and Stage 2 chart conversion (L6). Step 3 **appends a
  "Delivered" section to the existing `BRIEF.md`**; it does not create or overwrite it.
  *Cost if wrong: none — strictly less compute and strictly more accurate text.*

---

## Questions only Isaac can answer

**Q3 — Do the real `.idl0wb` files in the archive have app-assigned UUID `id`s on their math
channels, and what should migration do when a chart references one that cannot be resolved?**
G13.1 is only catastrophic for *app-created* workbooks (UUID ids, charts referencing them);
hand-authored files omit `id`, so `id == name` and everything resolves. L3-R36's `_migrate_math`
map fixes it either way, but the refusal policy is a product call: refuse the whole migration,
or migrate and list the unresolved chart references in the report. *Recommendation if no answer:
migrate, emit `_migrate_math`, and list every unresolved `mathChannelIds` entry in the report —
a migration that refuses on a chart the author may not care about is worse than one that tells
the truth about what it could not carry.* Also worth knowing whether any real workbook has
`rowSource: "lapSelection"` tables (G13.7).

**Q4 — Should a cursor readout clamp, or return `null` past the end of a channel?** C3 §3.7 says
"`null` if the channel has no sample **near** `t_us`" (spec 659); the plan clamps
unconditionally, so a channel whose last sample is 400 s earlier still reports a value.
A proximity bound needs a tolerance nobody has specified. *Recommendation if no answer: clamp —
`nearest_by_t_us` already clamps everywhere else in the engine (`handle.rs:961-962`), and C3 §3.7's
prose is amended to "nearest recorded sample; `null` only when the channel has no samples".*
Cheap to reverse; it is one comparison.

---

## Note on channel

The brief names no `questions.md`; per the exemplar and R21's handling of Q2, questions and
lead-owned rulings are raised here. **L3-R29** (tile time axis), **L3-R33** (the C3 §3.6 revision
C3 itself assigns to L3) and **L3-R36** (`_migrate_math`, a C2 §6 amendment) are structural and
marked **PROVISIONAL**; L3 codes the recommended behaviour now. **L3-R28** and **L3-R35** edit
landed L1 files (`session/handle.rs`, `chart_decimation.rs`) and need the same cross-lane
authorisation R23 gave L2.

PRE-READ COMPLETE: 40 gaps, 15 proposed rulings, 2 Isaac questions
