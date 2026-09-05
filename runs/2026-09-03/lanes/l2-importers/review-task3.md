# L2 Task 3 review — GPX importer

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers`,
branch `wave1-l2-importers`. Commit under review: `13aafa4ff190d0ff644e22e771c760d66bcd4360`
("core: GpxImporter -- port of gpx_parser.dart onto C1's Session/Channel model"),
parent `9cbd43d` (Task 2). In scope: `Cargo.lock`, `core/Cargo.toml`,
`core/src/import/gpx.rs` (new), `core/src/import/mod.rs`. Worktree status was
clean at HEAD `13aafa4`, nothing else present. No `docs/` changes (correct —
out of this worktree). No files outside `core/src/import/` and the two
dependency files touched.

## Test command and result

Not re-run (CLAUDE.md §8 / standing brief: readers verify statically, do not
build). Implementer reports `cargo build -p idl-rs` clean and
`cargo test -p idl-rs import::gpx::` → `10 passed; 0 failed`.

Static trace: the diff's `#[cfg(test)] mod tests` in `gpx.rs` defines exactly
10 `#[test]` functions (`gpx_importer_golden_fixture_maps_channels_and_drops_duplicate_timestamp`,
`gpx_importer_no_trackpoints_returns_typed_error`,
`gpx_importer_missing_lat_returns_typed_error`,
`gpx_importer_malformed_xml_returns_typed_error`,
`gpx_importer_no_timestamps_at_all_synthesizes_once_and_omits_epoch_ms`,
`gpx_importer_some_missing_timestamps_drops_them_and_keeps_epoch_ms`,
`gpx_importer_self_closing_trkpt_with_valid_lat_lon_imports_successfully`,
`gpx_importer_cdata_wrapped_time_parses_like_plain_text`,
`parse_iso8601_utc_ms_at_the_year_2000_anchor_matches_known_epoch`,
`parse_iso8601_utc_ms_rounds_subsecond_fraction_ties_away_from_zero`), all of
which fall under the `import::gpx::` filter — a `10 passed` result is
consistent with the diff and plausible (not a "filter matches nothing" false
pass, L3-R8). Every test compiles against landed types: `Channel::from_f64_with_times`/
`with_unit` (`core/src/session/mod.rs:233,278`), `ImportedSession`,
`ImporterWarning::new`, `ImporterError` variants — all exist with the
signatures used. Each test asserts specific, behaviour-tied values (exact
`t_us` vectors, exact `materialize()` values, exact warning counts and
substring content, exact `timestamp_utc_ms`) that would fail if the
corresponding logic broke — traced each one against the code by hand (see
Checks performed).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `docs/IDL0_SPEC.md:1479-1481,1502-1512` (Task 1's docs worktree, not this commit) | SPEC §15a.3 is stale relative to the rulings this commit implements: the `<ele>`→`GPS_Altitude` table row still says `0.0` when absent ("matches Dart"), contradicting L2-R6's Option semantics (no zero-fill, landed in this commit); the "Missing timestamps" prose still describes the plan's original single-fallback behaviour ("missing individual points get the same per-index synthesis with their own warning"), contradicting L2-R7's case-(c) drop-and-anchor-at-minimum behaviour, also landed in this commit. The brief's closing "spec discipline" line asserts "Task 1's §15a.3 (as corrected by its own brief) already states … the case-(b)/(c) timestamp split this task implements" — that assertion does not match the SPEC text as it currently reads. | Not this task's fix to make (docs/ is out of scope for an idl-rs-worktree task per lane rules — Task 1 owns SPEC edits). Needs a follow-up docs task/lead ruling to correct §15a.3's altitude-zero-fill and missing-timestamp prose to match L2-R6/R7 as landed, so a later reader of SPEC alone isn't misled. |
| Minor | `core/src/import/gpx.rs:~528` (`gpx_importer_no_timestamps_at_all_synthesizes_once_and_omits_epoch_ms`) | The one assertion distinguishing "one warning for the whole file" content-wise is `outcome.warnings[0].message.contains('2')` — checks for a bare digit character, not the warning's actual shape (e.g. `"trackpoint"` or `"synthesized"`). It would pass even if the message text were unrelated but happened to contain a `'2'` elsewhere. | Assert `.contains("2 GPX trackpoints")` or `.contains("synthesized a 1 Hz index")` instead, matching the specificity of the sibling case-(c) test's `.contains("trackpoint 0")`/`.contains("no parseable")` assertions. |
| Minor | case-(c) test (`gpx_importer_some_missing_timestamps_drops_them_and_keeps_epoch_ms`) — no line, a coverage gap not a code defect | The task's brief's own fixture guidance and the implementer's test both use ascending, non-duplicate timestamps for the timestamped points, so the dedup pass's `t_us <= last` branch (which also fires on genuinely non-monotonic, not just duplicate, timestamps) is only exercised by the golden fixture's *duplicate*-timestamp case, never by a genuinely *out-of-order* case within case (c) specifically (untimestamped-drop + non-monotonic-drop interacting in the same file). Read by inspection the branch is correct for both duplicate and out-of-order values (same `<=` comparison, same warning path) — this is a coverage gap, not a suspected bug. | Optional follow-up test: a case-(c) fixture with an untimestamped point plus two timestamped points where the second timestamped point precedes the first in wall-clock time, asserting the later-arriving-but-earlier-timed point is dropped with a warning and doesn't corrupt `t0`. Not required to unblock merge — the underlying logic is straightforward and shared with the already-tested duplicate path. |
| Minor | Step 5 / commit hygiene | The brief's explicit `git add` list (`Cargo.toml src/import/mod.rs src/import/gpx.rs`) omits the top-level `Cargo.lock`, but the commit includes a one-line `Cargo.lock` change (the new `quick-xml` dependency-list entry) — a necessary companion to the `Cargo.toml` edit, not a stray file. Not a `git add -A` violation (the diff has no unrelated files), just an incomplete explicit-path list in the brief itself. | No action — noting for the record; the file is correctly in scope even though the brief's literal list didn't spell it out. |

No Critical findings.

## Checks performed (all pass)

- **R27 (GPS decimal degrees).** `lat.materialize()`/`lon.materialize()` assert
  plain decimal values (`45.0, 45.001, 45.003` / `-90.0, -90.001, -90.003`);
  `unit == "deg"` asserted directly; grepped the whole file for `1e7`,
  `deg_e7`, and any multiply on `lat_deg`/`lon_deg` — none found. `GPS_Latitude`/
  `GPS_Longitude` are pushed unconditionally (no `Option`-gating), matching
  R27's "no Option semantics" note.
- **L2-R1 (no `Channel {}` literal; units).** Every channel is built through
  `push_channel`, which itself only calls
  `Channel::from_f64_with_times(..).with_unit(..)` (`gpx.rs:~187`) — grepped
  for `Channel {` and `Channel{` in the file, no hits. Units verified
  verbatim against C1 §4.1: `deg` (lat/lon), `m` (altitude), `ms_raw`
  (epoch), `bpm`/`rpm`/`W` (HR/cadence/power).
- **L2-R6 (no zero-fill, per-field `Option`).** `push_channel` filters on
  `f(&trkpts[i]).is_some()` per sample, never `.unwrap_or(0.0)` — grepped,
  none present. Each optional channel (`GPS_Altitude`, `HR_BPM`,
  `Cadence_RPM`, `Power_W`) is gated by
  `kept.iter().any(|&(i, _)| trkpts[i].<field>.is_some())`, i.e. gated on
  the **kept** set as required, not the raw trackpoint list. Golden fixture
  test confirms `GPS_Altitude`/`HR_BPM` end up with exactly 2 samples
  (`[1500.0, 1501.0]`/`[140.0, 142.0]`), not 3, and `Cadence_RPM`/`Power_W`
  are absent entirely (no point in the fixture has `<cad>`/`<power>`).
- **L2-R7 (time origin, case split).**
  - Partition (`any_timestamped`) happens once, before any `t_us` math,
    exactly as specified.
  - Case (b): `kept` built as `i * 1_000_000` per the ruling's own formula;
    `timestamp_utc_ms = 0`; `create_epoch_ms = false` so `GPS_EpochMs` is
    never constructed; exactly one warning for the whole file
    (`gpx_importer_no_timestamps_at_all_synthesizes_once_and_omits_epoch_ms`
    asserts `warnings.len() == 1` and the channel's absence).
  - Case (c): untimestamped points are dropped with a per-point warning
    naming the index (`"dropped GPX trackpoint {i}: no parseable <time>"`);
    `t0_ms` is computed via `.min()` over the timestamped set, not
    `trkpts[0]` — traced against the test
    (`gpx_importer_some_missing_timestamps_drops_them_and_keeps_epoch_ms`,
    point 0 untimestamped, points 1/2 timestamped with point 1's time as
    the minimum, `t_us == [0, 2_000_000]`, `timestamp_utc_ms ==
    946_684_800_000`); `GPS_EpochMs` is present with absolute-ms values
    (`[946_684_800_000.0, 946_684_802_000.0]`), never mixed with
    synthesized index-ms — the two code paths (`create_epoch_ms` flag) are
    structurally exclusive.
  - Duplicate/non-monotonic dedup runs only over the timestamped set,
    dropping on `t_us <= last`, one warning per drop — golden fixture's
    index-2 duplicate (`12:00:01Z` repeated) is dropped with a warning
    naming `"trackpoint 2"`, and `t_us == [0, 1_000_000, 3_000_000]`
    confirms only the first of the pair survives.
- **L2-R8 (self-closing trkpt; CDATA).** `Event::Empty` for `trkpt` calls
  the same `read_lat_lon` helper as `Event::Start`, pushes a bare `TrkPt`
  with no `<ele>`/`<time>`/extensions — test
  `gpx_importer_self_closing_trkpt_with_valid_lat_lon_imports_successfully`
  confirms it imports rather than raising `GpxMissingLatLon`.
  `Event::CData` has its own match arm with the same body as `Event::Text`
  (decode + `assign_field`) — test `gpx_importer_cdata_wrapped_time_parses_like_plain_text`
  confirms a CDATA-wrapped `<time>` parses to a real timestamp
  (`GPS_EpochMs` present, `timestamp_utc_ms == 946_684_800_000`, zero
  warnings) rather than falling into the missing-timestamp path.
  `GpxMissingLatLon`'s only remaining raise site is `read_lat_lon` itself,
  on a genuinely absent `lat`/`lon` attribute — confirmed by
  `gpx_importer_missing_lat_returns_typed_error`.
- **`GPX_IMPORTER_VERSION`/`importer_version`.** Const defined and
  doc-commented (C1 §4.3 reference); `importer_version(&self) ->
  &'static str` returns it directly (L2-R4).
- **`importer_for_extension` (R51 Q2).** `core/src/import/mod.rs`'s addition
  is the minimal `match ext { "gpx" => Some(Box::new(gpx::GpxImporter)), _ =>
  None }` the brief asked for — not an `importers()` registry (that's
  deferred to a not-yet-written Task 7 per R51's ruling). `pub mod gpx;`
  added as the first module line, matching Step 3.
- **Malformed-XML fixture change.** Verified against the vendored
  `quick-xml-0.41.0` source
  (`registry/src/index.crates.io-.../quick-xml-0.41.0/src/reader/state.rs:224-233`):
  `check_end_names` (on by default) only raises
  `Error::IllFormed(IllFormedError::MismatchedEndTag)` when an actual
  mismatched `End` event is encountered; an `Eof` reached with elements
  still open on the internal tag stack produces no such event and is not
  itself flagged as an error anywhere in `reader/mod.rs`'s event loop — the
  reader simply yields `Event::Eof`. So `<gpx><trk>` (open at EOF, no
  mismatched close ever seen) does **not** error in this version, confirming
  the implementer's stated reason for retargeting the fixture to
  `<gpx><trk></gpx>` (a `</gpx>` that actually mismatches the still-open
  `<trk>`), which does trigger `MismatchedEndTag`. This is a correct,
  verified deviation from the plan's original fixture, not a gap: nothing
  in C1/SPEC §15a.3 requires treating an EOF-truncated-but-locally-well-formed
  document as an error (CLAUDE.md §5's "recover what's readable" cuts the
  other way — a truncated exported file with fully-closed trackpoints so far
  would currently import them rather than hard-failing, which is defensible
  and not contradicted by any cited rule).
- **`Importer`/`ImportedSession`/`ImporterWarning`/`ImporterError` reuse.**
  All imported from `super::{ImportedSession, Importer, ImporterError,
  ImporterWarning}` (Task 2's landed types), none redeclared.
- **Errors/panics.** No `Err(String)` anywhere; every fallible path returns
  a named `ImporterError` variant that exists in `core/src/import/error.rs`.
  Only one `.expect()` on the production path
  (`gpx.rs:86`, `"any_timestamped guarantees at least one entry"`), and it is
  structurally guaranteed by the preceding `if !any_timestamped` branch —
  not a panic risk on untrusted input, and it carries an explanatory
  message (CLAUDE.md §5's "no unexplained `.unwrap()`/`.expect()`" is
  satisfied by the explanation). No indexing into `trkpts`/`kept` beyond
  bounds established by construction.
- **`parse_iso8601_utc_ms`.** Hand-verified `days_since_epoch` against the
  known constant (2000-01-01 = 10,957 days since epoch — the function
  returns exactly that). Verified the sub-ms rounding manually for
  `.1235` → 124 ms (matches the ties-away-from-zero test) and for `.1`/`.12`
  (100 ms / 120 ms, both correct). Only `Z`-suffixed timestamps are
  accepted (`strip_suffix('Z')?` returns `None` otherwise) — GPX's fixed
  UTC-only `<time>` shape per SPEC §15a.3, so no offset-suffix support is
  needed or present; no unaddressed leap-year edge case (the Hinnant
  algorithm is leap-year-correct by construction, confirmed against the
  2000-01-01 anchor which is itself a (divisible-by-400) leap year boundary
  case).
- **Doc comments / units.** `GpxImporter`, `GPX_IMPORTER_VERSION`, `TrkPt`
  and all its fields, `push_channel`, `parse_trkpts`, `read_lat_lon`,
  `assign_field`, `parse_iso8601_utc_ms`, `days_since_epoch` all carry doc
  comments; units stated in prose on every numeric field/return
  (deg/m/bpm/rpm/W/ms_raw/µs as applicable).
- **Test naming/shape.** All ten tests are Arrange/Act/Assert with blank
  lines between sections, named `thing_condition_result` (underscore-joined,
  matching the standing brief's note that literal em dashes aren't valid
  identifiers). Each asserts concrete values traceable to the logic under
  test, not just "does not panic."
- **Hygiene.** Commit is a single line, no AI-attribution trailer. `git
  show --stat` matches the brief's file list plus the necessary
  `Cargo.lock` companion (see Minor finding above). No reformatting outside
  the new/touched lines — `gpx.rs` is entirely new content so there's no
  churn to check there; the two one-line diffs in `Cargo.toml`/`Cargo.lock`
  are pure additions. Nothing under `docs/` touched; the shared checkout
  and other worktrees untouched.

## Verdict rationale

The implementation is correct and thorough against every ruling in the
brief: R27's decimal-degree storage, L2-R1's channel-construction discipline,
L2-R6's no-zero-fill Option semantics gated on the kept set, L2-R7's full
case-(b)/(c) split with minimum-anchored `t0` and mutually-exclusive
`GPS_EpochMs` handling, and L2-R8's self-closing-trkpt/CDATA fixes are all
landed exactly as specified and each is backed by a test that would fail if
the behaviour regressed. The two deviations the dispatch flagged for
particular scrutiny are both sound: the malformed-XML fixture swap is
verified correct against the vendored `quick-xml` 0.41.0 source, and the
case-(c) test's use of ascending timestamps is a real but minor coverage
gap (the shared dedup branch is exercised by the golden fixture's duplicate
case, just not by a genuinely out-of-order case within case (c)
specifically) rather than a bug. The one Important finding — SPEC §15a.3's
altitude-zero-fill and missing-timestamp prose being stale relative to what
this commit correctly implements — is real and worth a follow-up docs
correction, but it sits entirely in a different worktree/lane (Task 1's
`docs/IDL0_SPEC.md`, which this task cannot and should not touch), so it
does not reflect a defect in this commit's own files. Nothing here rises to
Critical, and no Important finding is actually fixable within this task's
scope, so this ships as is.

VERDICT: CLEAN
