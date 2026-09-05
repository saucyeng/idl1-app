# L2 Task 4 review — FIT importer + `parquet.rs` union fix

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers`,
branch `wave1-l2-importers`. Commits under review: `151f1a92bd59ccb221b94b581866f44ce5344f60`
("core: FitImporter (fitparser 0.9, C1 §4.1 mapping); fix fit/gpx/csv_t_recorded_us
to union channels (L2-R10)") and its follow-up `275267ef3bb8bf015c427633b659981f1f6e041f`
("core: gpx tests -- assert warning wording exactly, add out-of-order+untimestamped
t0 case (Task 3 review follow-ups)"). Worktree status is clean at HEAD `275267e`,
nothing else present. In scope for `151f1a9`: `core/Cargo.toml`, `core/src/import/fit.rs`
(new), `core/src/import/mod.rs`, `core/src/store/parquet.rs` — exactly the file
list the brief authorized (the L2-R10 `parquet.rs` edit under the explicit
cross-lane authorization, ledger R23). In scope for `275267e`: `core/src/import/gpx.rs`
only. No `Cargo.lock` delta in `151f1a9` (fitparser was already present in
`Cargo.lock` as a dependency edge from Task 3's dev-dependency use, so moving it
to `[dependencies]` in `Cargo.toml` required no lockfile change — not a gap).
No `docs/` changes in this worktree (correct). Nothing outside the named files
touched.

## Test command and result

Not re-run (CLAUDE.md §8 / standing brief: readers verify statically, do not
build — and the harness denies a reviewer's cargo invocation outright since
2026-09-05). Implementer reports, in order:

- `cargo build -p idl-rs` — clean.
- `cargo test -p idl-rs export::fit::` — `21 passed; 0 failed`.
- `cargo test -p idl-rs import::fit::` — `4 passed; 0 failed`.
- `cargo test -p idl-rs store::parquet::` — `10 passed; 0 failed`.
- (Separately, Task 3 follow-up) `cargo test -p idl-rs import::gpx::` —
  `11 passed; 0 failed`.

Static trace, each filter checked against the actual `#[test]` count in the
relevant file (a `passed` count consistent with the diff, not a "filter
matches nothing" false pass, L3-R8):

- `core/src/export/fit/mod.rs` (14) + `core/src/export/fit/encoder.rs` (7) =
  21 `#[test]` functions — matches `export::fit:: 21 passed` exactly. This
  module is untouched by the diff; the count matching confirms the promoted
  `fitparser` dependency didn't regress its own decode surface
  (`from_bytes`/`.kind()`/`MesgNum::Record`/`.fields()`/`.name()`), per L2-R9's
  own framing of this run as the regression check.
- `core/src/import/fit.rs` has exactly 4 `#[test]` functions
  (`fit_importer_golden_fixture_maps_channels_and_drops_duplicate_timestamp`,
  `fit_importer_malformed_bytes_returns_typed_error`,
  `semicircles_to_deg_quarter_circle_is_45_degrees`,
  `dropped_timestampless_record_raises_a_warning_naming_its_index`) — matches
  `import::fit:: 4 passed` exactly. Each compiles against landed types
  (`Channel::from_f64_with_times`/`with_unit`, `ImportedSession`,
  `ImporterWarning::new`, `ImporterError::FitMalformed`) and asserts concrete,
  behaviour-tied values (exact `t_us`, exact `materialize()` output, exact
  warning substrings) traced by hand against the production code (see Checks
  performed).
- `core/src/store/parquet.rs` has exactly 10 `#[test]` functions after the
  diff (9 pre-existing + 1 new,
  `fit_t_recorded_us_is_non_null_on_the_union_of_its_channels_rows`) — matches
  `store::parquet:: 10 passed` exactly. The new test constructs a `Session`
  with two `fit`-source channels whose `t_us` are disjoint on row 1
  (`GPS_Latitude` covers rows `[0,2]`, `HR_BPM` covers rows `[0,1,2]`), writes
  it, re-opens the raw Parquet file, and asserts `fit_t_recorded_us` has zero
  nulls across all 3 rows — this genuinely discriminates the pre-fix
  first-channel-only bug from the fix (traced the merge loop by hand; see
  Checks performed).
- `core/src/import/gpx.rs` has exactly 11 `#[test]` functions after `275267e`
  (10 from Task 3 + 1 new,
  `gpx_importer_untimestamped_and_out_of_order_points_both_dropped_t0_anchors_to_true_minimum`)
  — matches `import::gpx:: 11 passed` exactly.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `core/src/import/fit.rs:132,139,159` | Three bare `.unwrap()` calls on `r.timestamp_utc_s` (an `Option<i64>`) with no explanatory string, on the production path. They are structurally safe — `records.retain(\|r\| r.timestamp_utc_s.is_some())` (line 132, just above) guarantees every remaining record has `Some`, so these can never panic on real input — but CLAUDE.md §5 calls for "no unexplained `.unwrap()`/`.expect()` on production-path data," and the very next `.expect(...)` at line 134 (`"records is non-empty (checked above)"`) and the sibling `gpx.rs:86` `.expect("any_timestamped guarantees at least one entry")` both correctly explain an equally-guaranteed unwrap in the same file/lane. These three are the odd ones out. | Change the three bare `.unwrap()`s to `.expect("timestamp_utc_s is Some — records without one were dropped above")` (or equivalent), matching the pattern this same function already uses one line later. |
| Minor | `core/src/store/parquet.rs:132-138` (`recorded_us_array`'s doc comment) | The doc comment above `recorded_us_array` still reads "One call per distinct `source_kind` present, using any one of that source's channels (they all share the same `t_us`/`t_recorded_us` by construction — one FIFO read per source, C1 §3.2)." That invariant is exactly what L2-R10 disproves and fixes — the new caller in `write_session_parquet` now calls this function once per channel of a source_kind (not once per source), merging the results. The function's own doc was not updated to reflect its new call pattern, leaving a stale, now-false statement immediately above the code this commit's own rationale explicitly contradicts. | Update the doc comment to describe the new multi-call, merge-by-caller usage (e.g. "Scatters one channel's own `t_recorded_us_or_t_us()`... called once per channel of a `source_kind`; the caller merges every channel's contribution into one array, first-fill-wins, per L2-R10"). |

No Critical or Important findings.

## Checks performed (all pass)

- **R27 (GPS decimal degrees).** `semicircles_to_deg` (`fit.rs:61-63`) computes
  `raw as f64 * (180.0 / 2_147_483_648.0)` with no further scaling anywhere;
  golden fixture asserts `lat.materialize() == [45.0, 22.5, 11.25]`,
  `lon.materialize() == [-90.0, -45.0, 0.0]`, both `unit == "deg"`. Grepped
  the whole file for `1e7`/`deg_e7`/any multiply on `lat_deg`/`lon_deg` —
  none. `semicircles_to_deg_quarter_circle_is_45_degrees` still asserts
  `45.0` unchanged.
- **Q3 (`GPS_EpochMs`, no double offset).** Verified against the actual
  vendored `fitparser` 0.9.0 source
  (`~/.cargo/registry/.../fitparser-0.9.0/src/profile/mod.rs:53-75`):
  `TimestampField::to_date_time` adds the raw wire value (FIT-epoch seconds)
  to a reference instant of 1989-12-31 00:00:00 UTC, and `Value::Timestamp`'s
  `.timestamp()` (`lib.rs:276`) then returns that instant's true Unix-epoch
  seconds — this conversion is timezone-independent (the reference instant
  is anchored via `from_utc_datetime`, so `.timestamp()` returns the same
  value regardless of the machine's local timezone). 1989-12-31 00:00:00 UTC
  is exactly `631_065_600` Unix seconds, matching the test's own
  `FIT_EPOCH_OFFSET_S` constant. The importer's `"timestamp"` match arm
  (`fit.rs:92-100`) stores `dt.timestamp()` directly into
  `r.timestamp_utc_s` with no further addition; `GPS_EpochMs`'s accessor
  (`fit.rs:170-172`) computes `r.timestamp_utc_s.unwrap() as f64 * 1000.0`
  with no offset added a second time. The golden fixture's `unix_s(raw) =
  raw + FIT_EPOCH_OFFSET_S` helper correctly models what `fitparser` actually
  returns, and the corrected assertion (`epoch.materialize() ==
  [unix_s(T0)*1000.0, unix_s(T0+1)*1000.0, unix_s(T0+3)*1000.0]`) is right —
  this is the test that would have caught a double-offset bug, and it's
  wired correctly.
- **`GPS_EpochMs` presence gating.** Present only when `lat_deg.is_some() &&
  lon_deg.is_some()` (`fit.rs:171`), matching SPEC §15a.2's "on every
  `record` message carrying a position (both `position_lat` and
  `position_long` present)" and C1 §4.1's amended text verbatim.
- **L2-R1 (channel construction; units).** Every channel built via
  `push_channel`, which itself only calls `Channel::from_f64_with_times(...)
  .with_unit(...)` (`fit.rs:220`) — grepped for `Channel {`/`Channel{` in
  `fit.rs`, no hits. Units verified against C1 §4.1 and SPEC §15a.2's table:
  `deg` (lat/lon), `ms_raw` (epoch), `m` (altitude), `bpm`/`rpm`/`W`
  (HR/cadence/power) — all match the call sites exactly.
  `Channel::from_f64_with_times`'s actual signature
  (`core/src/session/mod.rs:233-247`) matches every call's argument order and
  types.
- **Per-field `Option` semantics.** `push_channel` only pushes a
  `(t_us, value)` pair when `f(&records[i])` is `Some` (`fit.rs:214-218`);
  channels with zero resulting samples are dropped afterward
  (`channels.retain(|c| !c.t_us.is_empty())`, `fit.rs:179`) rather than
  written empty. No zero-fill anywhere in the file.
- **L2-R9 (`fitparser` 0.9, promoted, not 0.11.0).** `core/Cargo.toml`: single
  `fitparser = "0.9"` line under `[dependencies]`, removed from
  `[dev-dependencies]` — no leftover second declaration (read the full file).
  No `Cargo.lock` diff was needed or made (fitparser's package entry
  pre-existed from Task 3's dev-dependency use). `export::fit::`'s 21-test
  regression check passing (matched against the file's actual test count)
  confirms the promotion didn't break the shared decode surface.
- **Field-by-field mapping verified against the vendored `fitparser` 0.9.0
  source** (`profile/decode.rs`'s `record_message` match arms), not just the
  importer's own assumptions: field `0`/`1` → `position_lat`/`position_long`,
  `Value::SInt32`, scale 1/offset 0 (semicircles, unscaled) — matches
  `fit.rs`'s `Value::SInt32(v)` match arm. Field `2` → composite-extracted
  into `enhanced_altitude` by default (scale 5, offset 500, i.e. `physical =
  raw/5 − 500`, confirmed via `apply_scale_and_offset`,
  `profile/mod.rs:288-297`) since `DecodeOption::KeepCompositeFields` is not
  requested — matches `fit.rs`'s `"enhanced_altitude" =>` arm and the
  fixture's own doc comment (`physical = raw/5 − 500`); hand-computed
  `10_000/5 − 500 = 1500`, `10_005/5 − 500 = 1501`, `10_020/5 − 500 = 1504`
  against the golden fixture's `altitude_raw` values — matches the test's
  asserted `[1500.0, 1501.0, 1504.0]` exactly. Field `3`/`4` →
  `heart_rate`/`cadence`, `FieldDataType::UInt8`, scale 1/offset 0 — matches
  `numeric_value`'s `UInt8` arm. Field `7` → `power`,
  `FieldDataType::UInt16`, scale 1/offset 0, units `"watts"` — matches
  `numeric_value`'s `UInt16` arm and the golden fixture's raw `power` values
  passing through unscaled (`[200.0, 205.0, 215.0]`).
- **`FitDataRecord`/`FitDataField` API surface** (`.kind()`, `.fields()`,
  `.name()`, `.value()`) checked against `fitparser`'s actual `lib.rs`
  (lines 54-136) — all exist with the signatures the importer uses.
- **L2-R7(a) (t0 = minimum, not first record).** `first_utc_s` computed via
  `.iter().map(...).min().expect(...)` (`fit.rs:142-146`), fed downstream to
  both the `t_us` computation and `Session.timestamp_utc_ms = first_utc_s *
  1000` — not `records[0]`.
- **L2-R7(d) (timestamp-less record dropped with a warning).** Before
  `records.retain(...)`, the loop at `fit.rs:126-131` pushes one
  `ImporterWarning` per timestamp-less record, naming its index and reason
  (`"dropped FIT record {i}: no timestamp"`) — no silent drop. The
  empty-check (`if records.is_empty() { return Err(...) }`) still applies
  after the warnings are collected. The dedicated test
  (`dropped_timestampless_record_raises_a_warning_naming_its_index`)
  exercises this exact loop in isolation, per the brief's own explicit
  allowance for the fixture's structural limitation (every fixture record
  always carries a `timestamp` field, so it cannot itself produce an
  undecoded one) — correctly disclosed as the approach taken, not silently
  substituted.
- **Record-level duplicate/non-monotonic dedup.** One warning per dropped
  record, at the record level (`fit.rs:150-162`), matching the doc comment's
  stated rationale (every field on a FIT record message shares one
  timestamp) and SPEC §15a.2's "Timestamp dedup is record-level" section.
  Golden fixture's duplicate row (index 2, same timestamp as index 1) is
  dropped with `"record 2"` named in the one warning, and `t_us == [0,
  1_000_000, 3_000_000]` for the three survivors.
- **`FIT_IMPORTER_VERSION`/`importer_version()`.** Const defined,
  doc-commented (C1 §4.3 reference), `importer_version(&self) -> &'static
  str` returns it directly.
- **`"fit"` in `importer_for_extension`, no `importers()` registry (R51
  Q2).** `core/src/import/mod.rs`'s only change is `pub mod fit;` plus one
  new match arm `"fit" => Some(Box::new(fit::FitImporter))` — minimal, no
  registry function added, consistent with Task 3's identical treatment of
  `gpx` and R51's deferral of a registry to a later task.
- **L2-R10 (`parquet.rs` union-of-channels fix).** Read the full function
  before and after: the `seen_sources` dedup still registers the
  `<source>_t_recorded_us` field exactly once per distinct `source_kind`
  (`parquet.rs:266-271`), but the array itself is now built by iterating
  *every* channel of that `source_kind`
  (`session.channels.iter().filter(|c2| c2.source_kind == c.source_kind)`,
  `parquet.rs:281`), scattering each channel's own
  `t_recorded_us_or_t_us()` values into a shared `Vec<Option<i64>>` of
  `n_rows`, first-channel-to-fill-a-row wins (`if merged[i].is_none() &&
  arr.is_valid(i)`, `parquet.rs:288-290`) — never overwriting an
  already-filled row with `None`. The symptom test constructs exactly the
  scenario L2-R10 describes (two `fit` channels, disjoint `t_us` on row 1)
  and reads the raw Parquet file back (bypassing `read_session_parquet`,
  which drops these columns from its `Channel` output, correctly noted in
  the test's own comment) to assert zero nulls across all 3 rows — this
  would fail under the pre-fix first-channel-only logic (row 1 would be
  null, since `GPS_Latitude` — registered first — doesn't cover it).
- **`.idl0` path unaffected.** Traced the idl0 case through the new code:
  idl0 sessions' same-`source_kind` channels (e.g. `imu0`'s AccelX/Y/Z) share
  identical `t_us`/`t_recorded_us` by construction (one FIFO read per
  source, C1 §3.2) — the merge loop still runs once per channel but each
  iteration fills the same rows with the same values, so behaviour is
  identical to before for every already-tested idl0 fixture. The 9
  pre-existing `store::parquet::` tests (all idl0-shaped, per
  `sample_session()`) are included in the reported `10 passed`, confirming
  no regression.
- **Errors/panics.** No `Err(String)` anywhere; `fitparser::from_bytes`'s
  error is mapped to the typed `ImporterError::FitMalformed`
  (`fit.rs:85`), an existing, reused variant (not redeclared). The malformed
  fixture test (`fit_importer_malformed_bytes_returns_typed_error`) confirms
  a non-FIT byte sequence returns the typed error rather than panicking. No
  indexing beyond bounds established by construction. (See Minor findings
  above re: three unexplained-but-safe `.unwrap()`s.)
- **Golden fixture decodability.** `build_fit_fixture` constructs a
  minimal-but-valid 14-byte-header FIT file with one definition message
  (global mesg 20 = record, 7 fields matching the real FIT profile's field
  numbers/base types) and a correct CRC-16 (verified the table-driven
  algorithm against the same one used in `export::fit::encoder` per the
  file's own doc comment — duplicated rather than reached into, correctly
  justified by `export/`'s privacy and this lane's scope boundary,
  CLAUDE.md §7).
- **Doc comments / units.** `FitImporter`, `FIT_IMPORTER_VERSION`,
  `FitRecord` and all its fields, `semicircles_to_deg`, `numeric_value`,
  `push_channel` all carry doc comments with units stated in prose where
  applicable.
- **Test naming/shape.** All four `fit.rs` tests and the one new
  `parquet.rs`/`gpx.rs` test are Arrange/Act/Assert with blank lines between
  sections, named `thing_condition_result` (underscore-joined, matching the
  standing brief's note that literal em dashes aren't valid identifiers).
  Each asserts concrete, traceable values, not just "does not panic."
- **Task 3 review follow-ups (`275267e`).** Both of Task 3's review Minors
  are closed exactly as promised: the vague `.contains('2')` assertion is
  now an exact string match
  (`"2 GPX trackpoints have no parseable <time> — synthesized a 1 Hz index"`,
  checked byte-for-byte against the actual production message string at
  `gpx.rs:63` — matches). The new out-of-order test
  (`gpx_importer_untimestamped_and_out_of_order_points_both_dropped_t0_anchors_to_true_minimum`)
  hand-traced step by step against `gpx.rs`'s actual case-(c) logic:
  point 0 (no `<time>`) dropped with its own warning; of the two timestamped
  points, point 1 (`00:00:02Z`) is seen first in document order and kept
  (`t_us = 2_000_000` relative to `t0_ms` = the *true* minimum,
  `00:00:00Z`, computed via `.min()` over all timestamped points before the
  document-order dedup pass runs); point 2 (`00:00:00Z`, appearing later in
  the document) is then dropped by the dedup pass because its computed
  `t_us` (`0`) is `<=` the already-kept `last_t_us` (`2_000_000`) — even
  though point 2 is the one carrying the file's true minimum timestamp. The
  test's asserted `lat.t_us == [2_000_000]`,
  `session.timestamp_utc_ms == 946_684_800_000`, and both exact warning
  strings all match this traced execution exactly — a genuinely
  discriminating test for the subtle "t0 anchors to a point the dedup pass
  itself later drops" case.
- **Hygiene.** Both commits are single-line messages, no AI-attribution
  trailer. `git show --stat` for each matches the brief's file list exactly
  (`151f1a9`: `Cargo.toml`, `src/import/mod.rs`, `src/import/fit.rs`,
  `src/store/parquet.rs`; `275267e`: `src/import/gpx.rs` only) — no stray
  `git add -A` inclusions. No reformatting outside touched
  lines — `fit.rs` is entirely new content; `parquet.rs`'s diff is a
  surgical replacement of the one loop body plus an appended test;
  `gpx.rs`'s diff is a surgical one-line replacement plus one appended
  test. Nothing under `docs/` touched in this worktree; the shared checkout
  and other worktrees untouched.

## Verdict rationale

The FIT importer is correct and thorough against every ruling in the brief:
R27's decimal-degree storage, Q3's no-double-offset `GPS_EpochMs` formula
(independently verified against the vendored `fitparser` 0.9.0 source, not
just trusted from the implementer's report), L2-R1's channel-construction
discipline, L2-R7(a)/(d)'s minimum-anchored `t0` and warn-don't-silently-drop
rule, and the record-level dedup rationale are all landed exactly as
specified, each backed by a test that traces correctly against the actual
code and would fail if the behaviour regressed. Every FIT field mapping
(position, altitude's composite-field extraction and its `raw/5 − 500`
scale/offset, heart rate, cadence, power) was checked field-by-field against
`fitparser`'s own `profile/decode.rs`, not just the importer's stated
assumptions, and all match. The `parquet.rs` L2-R10 fix is a correct,
narrowly-scoped merge-by-union implementation with a symptom test that
genuinely discriminates the bug it fixes, and the `.idl0` path is unaffected
by construction (same-source channels already share `t_us`, so the new
per-channel merge loop is a no-op behaviourally for that case, confirmed by
the 9 pre-existing idl0-shaped tests still passing). The `275267e` follow-up
correctly and verifiably closes both of Task 3's review Minors. The only two
findings are Minor: three structurally-safe-but-unexplained `.unwrap()`s
that diverge from this same file's (and the sibling `gpx.rs`'s) own
established practice of explaining an equally-guaranteed unwrap, and one
stale doc comment on `recorded_us_array` that still asserts the exact
one-`t_us`-per-source invariant this commit's own rationale disproves.
Neither is a functional defect, a spec deviation, or a build risk — this
ships as is, with the two Minors worth folding into a future
docs/hygiene pass rather than a fix-up dispatch.

VERDICT: CLEAN
