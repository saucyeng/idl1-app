# Review: R27 GPS decimal-degrees conversion (regression review)

**Commits:** `132504c` "R27: GPS lat/lon/altitude/heading become physical
units, not raw deg_e7" (single commit, diffed against `e0440bb`).

**Worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`
(branch `fix-gps-decimal`).

**Files touched:** `core/src/estimate/run.rs`, `core/src/export/fit/mod.rs`,
`core/src/gps.rs`, `core/src/laps/distance.rs`, `core/src/laps/gate_synthesis.rs`,
`core/src/laps/geometry.rs`, `core/src/laps/model.rs`,
`core/src/math/variance_geom.rs`, `core/src/parse/records.rs`,
`core/src/parse/v3.rs`, `core/src/session/mod.rs`,
`core/src/store/session_json.rs`, `core/src/track_artifact/{model,read,write}.rs`,
`core/src/tracks/{detect,geometry}.rs`.

**Test commands run** (targeted filters, per dispatch, one cargo process at
a time, no `-j` override, full suite not rerun since it was already green at
this commit):

- `cargo test -p idl-rs gps -- --test-threads=4` → **22 passed; 0 failed**
- `cargo test -p idl-rs laps -- --test-threads=4` → **36 passed; 0 failed**
- `cargo test -p idl-rs tracks -- --test-threads=4` → **18 passed; 0 failed**
- `cargo test -p idl-rs export -- --test-threads=4` → **38 passed; 0 failed**
- `cargo test -p idl-rs parse -- --test-threads=4` → **91 passed; 0 failed**
  (this filter also happened to catch `track_artifact::read`'s tests, since
  its module path contains "parse" in test names)

Note: `track_artifact::write`'s round-trip tests (`write_then_read_round_trips_*`)
matched none of the five dispatched filters — `track_artifact` doesn't
contain "tracks" as a substring. I did not add a sixth cargo invocation to
cover this gap (compute rules cap the run to the filters named in the
dispatch); I verified that file's logic and its (a) claims by static reading
and independent arithmetic instead (below).

## (a) `.idl0t` boundary — SPEC read and round-trip arithmetic, verified

SPEC §17b.1 (`docs/IDL0_SPEC.md:1691`): *"Gates are `lat1_deg`/.../`lon2_deg`
… coordinates are raw degrees × 1e7."* This is stated as a fixed property of
the `.idl0t` JSON wire format, independent of the engine's internal `Gate`/
`GpsFix` scale. The implementer's premise is correct: now that R27 moves
`Gate`/`GpsFix` to physical decimal degrees, the `track_artifact/model.rs`
DTO boundary needs an explicit conversion where none was needed before (both
sides used to be ×1e7).

Round-trip arithmetic re-derived independently (not taken on the
implementer's word): for a value `deg` believed to originate as a real
7-decimal-digit measurement, `n = round(deg * 1e7)` then `n / 1e7` recovers
`deg` bit-exactly on IEEE-754 f64 in every case tested (200,000 random
7-decimal-digit values in `[-90, 90]`, 0 mismatches), whereas `n * 1e-7`
fails to round-trip bit-exactly in ~29% of the same sample, because `1e-7`
is not exactly representable in binary floating point while `1e7` is, and
division by an exact power-representable value is correctly rounded. The
code's choice of `/ 1e7` on read (`model.rs:149-152,181`) paired with
`(x * 1e7).round()` on write (`model.rs:207-210,241-242`) is correct.

**Finding:** the claim that "the test proves it over a range of values" does
not hold — see table below (Important).

## (b) Epsilon completeness — checked every touched-file tolerance

Searched all 17 touched files' diffs and their test modules for numeric
tolerances/thresholds. Findings:

| Constant | File | Status |
|---|---|---|
| `M_PER_UNIT` (was `111_320.0/1e7`) | `laps/distance.rs` | Rescaled → `111_320.0` ✓ |
| `ANCHOR_RESIDUAL_METRES = 5.0` | `laps/distance.rs` | Untouched — correct, it's metres, always was scale-invariant of GPS coordinate scale (it's a distance threshold, not a coordinate) |
| `ANCHOR_TANGENT_COS = 0.866` | `laps/distance.rs` | Untouched — correct, dimensionless cosine |
| `ANCHOR_MIN_SPEED_KMH = 5.0` | `laps/distance.rs` | Untouched — correct, km/h, never coordinate-scaled |
| `M_PER_DEG_UNITS` (was `111_320.0/1e7`) | `laps/gate_synthesis.rs` | Rescaled → `M_PER_DEG = 111_320.0` ✓ |
| `M_PER_DEG_UNITS` (was `111_320.0/1e7`) | `tracks/detect.rs` | Rescaled → `M_PER_DEG = 111_320.0` ✓ |
| `VisitParams` distance/time thresholds | `tracks/detect.rs` | Untouched — correct, they're metres/seconds, not coordinate-scaled |
| test sanity assertion `(delta_lon_e7 - 419.0).abs() < 5.0` | `laps/distance.rs` | Rescaled to `(delta_lon_deg - 0.0000419).abs() < 0.0000005` — proportionally equivalent (both ~1.2% relative tolerance) ✓ |
| `haversine_one_degree_latitude_is_about_111km` tolerance `1000.0` | `export/fit/mod.rs` | Untouched — correct, it's an absolute metres tolerance on an already-physical-degrees-in output, unaffected by the internal channel scale change |
| `IDL0_SPEC.md`/doc-comment residual `1e7` mentions | `laps/distance.rs`, `track_artifact/{model,read}.rs` | All are historical doc prose (R17 back-story) or the intentional `.idl0t`-boundary conversion (item a) — not live tolerances |

No unrescaled epsilon found. `math/variance_geom.rs`'s `to_deg` removal
(item c) also removes the one place a mixed-scale magnitude heuristic
existed; nothing else in the diff guesses at scale.

## (c) Deleted `to_deg` (`math/variance_geom.rs`)

`grep` for `to_deg(` across `core/src` after the diff: zero matches outside
the deleted definition — no caller was left dangling, and nothing can now
receive e7-scale data that `to_deg` would have auto-detected and rescued
(both of the two former callers, `build_overlay_reference`/
`build_main_positions`, now receive already-physical `GPS_Latitude`/
`GPS_Longitude` channel samples per R27's parse-time bake, verified in
`parse/records.rs`). Test count: exactly one `#[test]` fn deleted in the
whole diff (`to_deg_passes_through_degree_values_and_scales_e7`), zero
added — matches the reported 846→845 exactly (confirmed via
`git diff | grep -c '#\[test\]'` on added/removed lines).

## (d) `estimate/run.rs`'s deleted `/100` on GPS_Heading

Read the pre-image (`git show e0440bb:core/src/estimate/run.rs`): before
this commit, `GPS_Heading` was parsed as a raw wire value (no baked scale —
`parse_gps_record` pushed `heading as f64` verbatim), and this consumer's
`heading.samples[i] / 100.0` was the correct centidegrees→degrees
conversion for that raw value. This commit's `parse/records.rs` change bakes
`heading as f64 * 0.01` at parse time (matching R27/C1 §4.2's `GPS_Heading`
row), so the channel now arrives already in physical degrees; keeping the
`/100.0` here would double-convert (divide by 100 twice). Deleting it is
correct and necessary — not a pre-existing bug independent of this diff, but
a required consequence of the same parse-time bake, which the implementer's
"genuine bug fix" framing slightly overstates (it's not a latent bug that
existed before this commit; it would only become a bug if this deletion
were *missing*). Not filed as a finding — it doesn't change what a
maintainer would do with the diff, and the resulting value is correct.

## (e) Fixtures and parse-side bake vs. C1 §4.2

`parse/v3.rs`'s `gps_channel_unit` now returns `"deg"` for
`GPS_Latitude`/`GPS_Longitude`, `"m"` for `GPS_Altitude`, `"deg"` for
`GPS_Heading` (was `"deg_e7"`/`"m_e1"`/`"deg_e2"`) — matches C1 §4.2's target
row for these three exactly. `parse/records.rs` bakes `* 1e-7`, `* 0.1`,
`* 0.01` respectively with no `slot_for_i32`/metadata-scale call for these
three (only `GPS_SpeedKmh` keeps the metadata-scale slot, per §4.1's stated
one exception) — confirmed no `scale`/`offset` key is written for the three
converted columns. `parse/v3.rs`'s round-trip test was converted (not
weakened): the old exact `515_250_000.0`/`-1_234_567.0` assertions became
`assert_relative_eq!(..., 51.525, epsilon = 1e-9)` /
`assert_relative_eq!(..., -0.1234567, epsilon = 1e-9)` — same underlying raw
wire values, same assertion strength (relative to a physical value now,
correctly, since the division is not always bit-exact for e1e-9-level
epsilon is appropriate for one exact division). Every fixture I spot-checked
across `laps/distance.rs`, `laps/gate_synthesis.rs`, `tracks/detect.rs`,
`export/fit/mod.rs` converts the same real-world magnitude 1:1
(e.g. `1_000_000.0`→`0.1`, `45.0e7`→`45.0`, `501_163_000.0`→`50.1163`) — no
test's asserted real-world value changed, only its representation.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `core/src/track_artifact/write.rs:91`, `model.rs:143-152` | The `.idl0t` round-trip claim ("proven over a range of values") is not backed by the tests: `write_then_read_round_trips_every_field` exercises exactly one non-trivial coordinate (`50.1163`/`-122.9574`, the Whistler fixture) plus small integer gate coords (`1.0`–`24.0`) that trivially round-trip regardless of `/1e7` vs `*1e-7`. My own 200k-sample check confirms `/1e7` is in fact correct, but the shipped test suite would not have caught a regression to `*1e-7` on most real coordinates, since the one real value chosen happens to be one of the ~71% that round-trips either way. | Add a `#[test]` with several more decimal-degree values (varying sign, magnitude, decimal-digit count) asserting exact (`==`) round-trip, or a small property test over `-180.0..180.0` at 7-decimal precision. |
| Minor | `core/src/estimate/run.rs:96-99` (commit message / doc framing) | The doc comment and implied PR framing call the `/100.0` deletion a "genuine bug fix" as if pre-existing; it is in fact a necessary and correct consequence of this same commit's parse-time bake, not an independent latent bug — verified correct in both old and new code by reading the pre-image. | None required — code is correct; framing only, not filed against correctness. |

## Verdict rationale

Every hard item the dispatch asked to hunt for (a–e) checks out under
independent verification: the `.idl0t` SPEC reading is accurate, the
`/1e7`-vs-`*1e-7` arithmetic claim is correct (verified numerically, not
taken on faith), every epsilon in every touched file is either rescaled or
was already scale-invariant with no exceptions found, the deleted `to_deg`
helper has no orphaned caller and its test removal exactly accounts for the
846→845 delta, the `GPS_Heading` `/100` deletion is a correct and necessary
consequence of the parse-time bake, and the parse-side bake plus every
converted fixture matches C1 §4.2's target state (unit strings, no stray
`scale`/`offset` metadata, real-world values preserved). All five targeted
test filters pass with non-zero counts. The one substantive gap is that the
`.idl0t` round-trip test doesn't actually prove the general claim it's
cited for — a real but narrow test-completeness gap on the single highest-risk
boundary in this diff (a shared on-disk format with idl0), not a defect in
the shipped conversion itself. That's exactly one Important finding, no
Critical, and doesn't block landing but should be closed before this
boundary is trusted long-term.

VERDICT: NEEDS_FIXES
