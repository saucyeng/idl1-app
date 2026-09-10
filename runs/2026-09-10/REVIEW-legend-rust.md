# Review: legend lane, Rust half (idl-rs commit 6e88c97)

**Commit reviewed:** `6e88c97` in `idl-rs-worktrees/legend` (branch `legend`)
`colormap: turbo_stops(n); RasterMeta carries ramp_stops for both raster kinds (R177, C3 3.6)`

**Files touched:**
- `core/src/colormap.rs` (+86)
- `tauri/src/commands/rasters.rs` (+110)

**Test command and result (per dispatch, not rerun by this review — cargo is
off-limits to the reviewer):**
- `cargo test -p idl-rs colormap` — reported 10 passed. Verified statically:
  `grep -c "#[test]" core/src/colormap.rs` = 10, matching exactly (4
  pre-existing + 6 new `turbo_stops_*` tests).
- `cargo test -p idl-rs-tauri raster` — reported 39 passed. Verified
  statically: `grep -c "#[test]" tauri/src/commands/rasters.rs` = 39,
  matching exactly.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No findings. Diff matches brief items 1–2 and C3 §3.6/R177 exactly. | — |

## Detail (why this is clean)

**Item 1 — `turbo_stops`.** `core/src/colormap.rs:84-101`. Signature matches
brief: `pub fn turbo_stops(n: usize) -> Vec<[u8; 4]>`. Sampling formula is
exactly `turbo_rgba8(i as f64 / (n - 1) as f64)` for `i in 0..n`. Doc comment
present, states units/semantics (endpoints, opacity, `n < 2` behaviour) and
cross-references R177/C3 §3.6. `n < 2` returns the two endpoints
(`turbo_rgba8(0.0)`, `turbo_rgba8(1.0)`), documented in the doc comment as
specified. Tests cover: length (`turbo_stops_length_matches_the_requested_count`),
endpoints equal direct calls
(`turbo_stops_endpoints_are_the_ramps_own_endpoints`), all-alpha-255
(`turbo_stops_every_stop_is_opaque`), monotone `t` sampling matches direct
calls at `n=9` (`turbo_stops_sample_t_evenly_and_match_direct_ramp_calls`),
the `n<2` case for both `n=0` and `n=1`
(`turbo_stops_below_two_returns_the_two_endpoints`), plus a non-tautological
"not a flat colour" sanity check. All tests use real Arrange/Act/Assert with
blank lines and `thing_condition_result`-style names (Rust identifiers can't
carry em dashes, and the repo's existing tests use the same underscore
convention — consistent, not a deviation).

**Item 2 — `RasterMeta.ramp_stops`.** `tauri/src/commands/rasters.rs:287-308`.
Field added: `pub ramp_stops: Vec<[u8; 4]>`, doc comment states the sampling
rule, endpoint inclusion, opacity, and the R177/single-Turbo rule verbatim
matching the C3 §3.6 doc. `RAMP_STOP_COUNT = 16` satisfies the spec's
`n >= 16`. Only one construction site exists —
`RasterMetaOut::from_core` (line 310-325) — called from both the
`"spectrogram"` (line 437) and `"histogram2d"` (line 470) arms of
`fetch_raster_meta_via`, i.e. every raster kind the meta command serves
today. Grep confirms no other `RasterMetaOut { .. }` struct literal exists
anywhere in the crate, so there is no second, stale construction site an
IPC caller could hit. The serialized shape (`Vec<[u8; 4]>`, no
`rename_all`, field already snake_case) matches the contract's
`[number,number,number,number][]` under the existing serde convention used
by every other field on this struct (x_domain, magnitude_unit, etc. — not a
new pattern).

**R177 compliance — no second Turbo.** `turbo_stops` calls `turbo_rgba8`
directly; it is not a second lookup table. Traced the raster pixel encoders
(`core/src/raster.rs`, `build_spectrogram_raster_bytes` and
`build_histogram2d_raster_bytes`) through `colorize_with_bounds` →
`turbo_rgba8` — the same function `turbo_stops` samples. New tests verify
this empirically rather than just by code inspection: `ramp_stops_describe_the_pixels_a_histogram2d_raster_actually_encodes`
checks a real emitted pixel equals the last ramp stop, and
`ramp_stops_describe_the_pixels_a_spectrogram_raster_actually_encodes`
checks every opaque emitted pixel is a colour on a fine (4097-sample)
resampling of the same ramp — non-tautological, would fail if a
second/different ramp were introduced. `fetch_raster_meta_histogram2d_ramp_stops_match_the_spectrograms`
directly asserts both kinds report identical stops, matching the brief's
"assert that in a test by comparing a known pixel to a stop" requirement.

**Scope.** Diff touches only the two files the brief names; no app-side
files, no unrelated formatting churn (style matches surrounding hand-formatted
code, consistent with CLAUDE.md §7). Commit message is single-line, no AI
attribution trailer, matches CLAUDE.md §7.

**Layering.** `turbo_stops` lives in `core::colormap` (numbers), the DTO
field and its population live in `tauri` glue — correct per CLAUDE.md §2.
No Tauri/async/network leaking into core.

**Docs/errors (§5).** Doc comments present on both new public symbols
(`turbo_stops`, `ramp_stops` field) with units/semantics spelled out. No
`unwrap()` on data introduced (only `.last().unwrap()` in test code on a
`Vec` the test just asserted is non-empty — acceptable in test code, not
data-path production code). No typed-error surface changed by this commit
(no new fallible path).

## Verdict rationale

The commit is a narrow, correctly-scoped implementation of brief items 1–2:
`turbo_stops`'s formula, endpoint/opacity semantics and `n<2` fallback match
the brief and the C3 §3.6 doc verbatim; `RasterMeta.ramp_stops` is wired
through the single existing construction site so both raster kinds the meta
command serves carry it; and R177's central constraint — one Turbo,
never reimplemented — is verified by tests that compare real encoded pixels
to the reported stops, not merely restated in a comment. Test counts
(10 and 39) were confirmed by direct `#[test]` counts in the two files,
matching the dispatch's reported gate numbers exactly. No scope creep, no
formatting churn, no missing doc comments, no second Turbo definition.

VERDICT: CLEAN
