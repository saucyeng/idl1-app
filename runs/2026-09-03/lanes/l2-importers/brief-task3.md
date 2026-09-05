# L2 Task 3 — implementer brief (GPX importer)

You are the implementer for L2 Task 3 of the idl1 rewrite — port of
`gpx_parser.dart` onto the C1 `Session`/`Channel` model. TDD, ONE commit,
then report. This task's rulings substantially rewrite the plan's drafted
timestamp-handling — read all of them before writing code, the control flow
below is not the plan's.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers`,
  branch `wave1-l2-importers`, HEAD must be Task 2's commit (given in the
  dispatch message), status clean. Verify first; if not, stop and report.
  Leave `.cargo/config.toml` alone.
- Work ONLY there. Do NOT touch the shared checkout
  (`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`), `idl1-app`
  beyond READING files named below, or any other worktree. Do NOT edit
  `docs/`. Do NOT push.
- Read first: `CLAUDE.md`; the L2 plan's `### Task 3`
  (`docs/superpowers/plans/2026-09-03-idl1-wave1-l2-importers.md`, lines
  519–1000 — your starting point for the XML-parsing plumbing only, **not**
  the timestamp/channel-building logic, which this brief supersedes);
  contract C1 §3.1, §3.4, §4.1 (already amended — decimal-degree GPS units
  per R27, per-channel units), §4.2; the pre-read
  `pre-read-tasks1-6.md`'s Task 3 section (G3.1–G3.7); ledger
  `R23` **and `R27`** (R27 supersedes R23's Q1; the pre-read's own Q1
  discussion at its lines 44–46/328–331 predates R27 and is history, not
  instruction); Task 2's landed `src/import/mod.rs`/`error.rs` (`Importer`,
  `ImportedSession`, `ImporterWarning`, `ImporterError`,
  `session_id_from_blob_hash` — this task implements the trait, does not
  redefine any of these) — read them before writing anything.

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; do not
override). `cargo build -p idl-rs`, then `cargo test -p idl-rs import::gpx::`.
Non-zero `passed` required (standing rule, L3-R8). No full suite, no
tarpaulin, no `-j`, no `.cargo/` edits, never `cargo fmt`. One cargo process
at a time, foreground. `cargo check -p idl-rs-cli --tests` NOT required this
task.

## Rulings that change the plan's drafted code

**L2-R1 — no `Channel {}` struct literals; units.** Build every channel via
`Channel::from_f64_with_times(channel_id, 0.0, values, t_us, "gpx")
.with_unit(unit)` (`session/mod.rs:233,278`), never a bare struct literal
(plan:655–662 is missing `t_recorded_us`/`unit` and won't compile against
landed `Channel` — G3.1). Units, verbatim from C1 §4.1 (amended): `deg`
for `GPS_Latitude`/`GPS_Longitude` (see next ruling), `m` for `GPS_Altitude`,
`ms_raw` for `GPS_EpochMs`, `bpm`/`rpm`/`W` for `HR_BPM`/`Cadence_RPM`/
`Power_W`.

**R27 — lat/lon are physical decimal degrees, stored unchanged.** R23's Q1
answer (`deg_e7`, ×1e7) was superseded by ruling R27, and R27 has landed
(idl-rs `7e10797`): every consumer — `core/src/gps.rs`, `laps::distance`
(`M_PER_UNIT` back to plain `111_320.0`), `laps::gate_*`, `tracks::*` —
reads decimal degrees now. So plan:180's "not scaled ×1e7... C1's
non-device row stores physical degrees directly" is **correct as drafted**:
parse the `lat`/`lon` attributes as decimal degrees and push them into the
channel unchanged, `unit: deg`. No ×1e7 anywhere in this file.
`GPS_Latitude`/`GPS_Longitude` have no `Option` semantics (below) — every
kept trackpoint has both, or the import already failed with
`GpxMissingLatLon`.

**L2-R6 — no zero-filling; genuine per-field `Option` semantics.** Delete
plan:618's `Some(p.ele_m.unwrap_or(0.0))` and plan:654's `.unwrap_or(0.0)` in
`push_channel`. A trackpoint with no `<ele>` contributes **no sample** to
`GPS_Altitude` at that point — not a `0.0` sample — identical in spirit to
Task 4's FIT `push_channel` (filter-and-collect over `Option`, not
map-with-default). Rewrite `push_channel` to take `kept: &[(usize, i64)]`
(kept trackpoint index, its `t_us`) and an accessor `impl Fn(&TrkPt) ->
Option<f64>`, producing parallel `(t_us, value)` vectors only where the
accessor returns `Some` — same shape as Task 4's `push_channel`, so match it
for later-reader consistency. `GPS_Altitude`, `HR_BPM`, `Cadence_RPM`,
`Power_W` are all optional this way; `GPS_Latitude`/`GPS_Longitude` are
always dense over the kept set (never absent per point). Gate each optional
channel's presence on `kept.iter().any(|&(i, _)| f(&trkpts[i]).is_some())`
— gated on the **kept** set, not the full raw trackpoint list (a dropped
point's field shouldn't cause a channel to appear with zero real samples).

**L2-R7 — time origin and missing timestamps (governs GPX and FIT
identically; FIT's own version is in Task 4's brief). Rewrites the whole of
plan:582–613's single fallback path into two distinct cases:**

Partition trackpoints into those with a parseable `<time>` and those without
(after XML parsing, before any `t_us` math):

- **(b) — no trackpoint anywhere has a parseable `<time>`.** Keep the ported
  1 Hz index synthesis (`t_us[i] = i * 1_000_000`, i.e. `i × 1000` ms
  converted to µs — the plan's original formula, just scoped to this case
  only), but: `Session.timestamp_utc_ms = 0` ("unknown" — a synthesized
  index is not a receiver epoch), and **do not create a `GPS_EpochMs`
  channel at all** (not even from the synthesized values — synthesized
  index-ms and epoch-ms must never share an axis or a column). Emit **one**
  `ImporterWarning` for the whole file (e.g. `"N GPX trackpoints have no
  parseable <time> — synthesized a 1 Hz index"`), not one per point.

- **(c) — some trackpoints have a parseable `<time>`, some don't.** The
  timestamped points alone define the axis; every untimestamped point is
  **dropped**, each with its own `ImporterWarning` (e.g. `"dropped GPX
  trackpoint {i}: no parseable <time>"`). `GPS_EpochMs` **is** created (from
  the real, kept timestamps). `t0` is the **minimum** timestamp among the
  kept (timestamped) points (L2-R7(a) below), not the first one
  encountered.

- **(a) — t0 is the minimum, always** (C1 §3.1). In case (b), `t0 = 0` by
  construction (index synthesis starts at 0). In case (c),
  `t0_ms = kept.iter().map(|p| p.time_utc_ms.unwrap()).min().unwrap()`, and
  `Session.timestamp_utc_ms = t0_ms`. This replaces plan:596's
  `trkpts[0].time_utc_ms` (first point, not minimum — G3.3/G3.4: a GPX file
  is not guaranteed sorted by time, and anchoring on index 0 can produce a
  56,000-year `t_us` span or a wrong `timestamp_utc_ms`).

Within case (c)'s kept set (real timestamps only), the existing
duplicate/non-monotonic dedup logic (plan:600–613: drop the later sample,
one warning each) still applies, unchanged in spirit — it's now scoped to
run only over the timestamped, kept points rather than the whole raw list.

**L2-R8 — self-closing trackpoints; CDATA.** `<trkpt lat="45.0" lon="-90.0"/>`
(an `Event::Empty` with local name `trkpt`) is valid GPX with valid
coordinates — plan:695–701 currently rejects it with
`GpxMissingLatLon("<trkpt/> has no children...")`, which is wrong. Read
lat/lon from an `Event::Empty` exactly as `Event::Start` does (call the same
`read_lat_lon` helper), and push a `TrkPt` with no `<ele>`/`<time>`/
extensions (falls into L2-R7's missing-timestamp handling above, same as
any other untimestamped point). Reserve `GpxMissingLatLon` for a `<trkpt>`
genuinely missing the `lat` or `lon` attribute (its current, correct use in
`read_lat_lon`). Also handle `Event::CData` alongside `Event::Text` in
`parse_trkpts`'s match (plan:702's `Event::Text(t) => ...` arm — add a
`Event::CData(t) => ...` arm with the same body, or match both together) —
today a `<time><![CDATA[...]]></time>` silently yields no timestamp and
falls into the no-`<time>` path without this.

## The task (plan Task 3, Steps 1–5, corrected)

- [ ] **Step 1: Add `quick-xml` dependency** — plan Step 1, unchanged
  (`quick-xml = "0.41.0"` under `[dependencies]`; already resolved/vendored
  in this workspace, confirmed by the pre-read, G3.7 — no action needed
  beyond adding the line).
- [ ] **Step 2: Write `src/import/gpx.rs`** — plan:542–959's code as your
  base for `TrkPt`, `parse_trkpts`, `local_str`, `read_lat_lon`,
  `assign_field`, `parse_iso8601_utc_ms`, `days_since_epoch` (these are
  XML-plumbing/date-math, confirmed correct by the pre-read, unaffected by
  the rulings above — G3.7's confirmation covers `quick-xml`'s API
  surface). Rewrite `Importer::import`'s body and `push_channel` per L2-R1/
  R6/R7/R8 above; fix `read_lat_lon`'s only caller site for L2-R8; rename
  `ImportOutcome`/`ImportWarning` → `ImportedSession`/`ImporterWarning`
  throughout (Task 2's L2-R2). Add `const GPX_IMPORTER_VERSION: &str =
  "0.1.0";` (doc-commented, C1 §4.3) and implement
  `fn importer_version(&self) -> &'static str { GPX_IMPORTER_VERSION }`
  (Task 2's L2-R4).
- [ ] **Step 3: Wire `gpx` into `import/mod.rs`** — plan:962–980, unchanged:
  `pub mod gpx;` as the first module line; `importer_for_extension` matching
  `"gpx" => Some(Box::new(gpx::GpxImporter))`.
- [ ] **Step 4: Build and test.** `cargo build -p idl-rs`, then
  `cargo test -p idl-rs import::gpx::` per COMPUTE RULES.
- [ ] **Step 5: Commit** — explicit paths (NOT `git add -A`):
  `git add Cargo.toml src/import/mod.rs src/import/gpx.rs` — message
  `core: GpxImporter — port of gpx_parser.dart onto C1's Session/Channel model`.
  Single line, no AI attribution trailer.

## Tests (rewrite the plan's golden fixture assertions for the new rules)

The plan's golden fixture (plan:828–851, 4 trackpoints, one duplicate
timestamp, the last point missing `<ele>`/`<hr>`) still works as a base, but
its assertions must change:
- `GPS_Altitude`/`HR_BPM` now have only **two** samples each (not three) —
  the last kept point (no `<ele>`, no `<hr>`) contributes to neither channel
  (L2-R6), so `alt.t_us == [0, 1_000_000]`, `alt.materialize() == [1500.0,
  1501.0]`; same shape for `HR_BPM`.
- `GPS_Latitude`/`GPS_Longitude` values are plain decimal degrees (R27):
  `lat.materialize() == [45.0, 45.001, 45.003]` and
  `lon.materialize() == [-90.0, -90.001, -90.003]` — the plan's own
  plain-decimal assertions, kept as drafted. `assert_eq!` on `f64` is safe
  here: parsing `"45.001"` yields the same nearest-`f64` as the literal
  `45.001`, and nothing rescales it.
- Add a test for case (b): a GPX file where **no** point has `<time>` — one
  warning (not N), `Session.timestamp_utc_ms == 0`, and
  `channels.iter().all(|c| c.channel_id != "GPS_EpochMs")` (currently the
  plan's `gpx_importer_no_timestamps_at_all_synthesizes_and_warns` test
  (plan:924–936) asserts `warnings.len() == 2` — that's the old
  per-point behaviour; rewrite it to assert `1`).
- Add a test for case (c): a GPX file where one of several points lacks
  `<time>` — that point is dropped with a warning naming it, the kept
  points' `t_us` starts at 0 relative to the **minimum** kept timestamp, and
  `GPS_EpochMs` **is** present.
- Add a test for L2-R8: a self-closing `<trkpt lat="1.0" lon="2.0"/>` with
  no siblings imports successfully (falls into case (b) or (c) depending on
  what else is in the file) rather than raising `GpxMissingLatLon`.
- Keep (adjusted only for the L2-R6/Q1 value changes above):
  `gpx_importer_no_trackpoints_returns_typed_error`,
  `gpx_importer_missing_lat_returns_typed_error`,
  `gpx_importer_malformed_xml_returns_typed_error`,
  `parse_iso8601_utc_ms_at_the_year_2000_anchor_matches_known_epoch`,
  `parse_iso8601_utc_ms_rounds_subsecond_fraction_ties_away_from_zero`.

## Do not

- Do not zero-fill any optional field (L2-R6) — an absent `<ele>`/`<hr>`/
  `<cad>`/`<power>` means no sample, never `0.0`.
- Do not scale lat/lon by 1e7, and do not write `unit: deg_e7` anywhere
  (R27) — plain decimal degrees, `unit: deg`.
- Do not anchor `t0`/`timestamp_utc_ms` on the first trackpoint (L2-R7(a)) —
  the minimum, always.
- Do not synthesize `GPS_EpochMs` from index-ms in case (b), and do not mix
  synthesized index-ms with real epoch-ms on the same axis in case (c).
- Do not reject a self-closing `<trkpt/>` with valid lat/lon (L2-R8).
- Do not leave a `Channel {}` struct literal anywhere in this file (L2-R1).

## Style / hygiene

Doc comment on every public symbol; units on every numeric value (`t_us` µs,
lat/lon `deg`, altitude `m`, epoch `ms_raw`); typed errors only; A/A/A
tests named `thing — condition — result`; match surrounding hand-formatted
style.

## Spec discipline (say it out loud in your report)

"no spec change needed" — Task 1's §15a.3 (as corrected by its own brief)
already states the decimal-degree storage (R27), the per-field `Option`
semantics, and the case-(b)/(c) timestamp split this task implements.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line
(`passed` count); per-step done/deviated; confirmation of each rewritten
test's new expected values (list them); confirmation no `Channel {}` struct
literal remains; anything ambiguous you resolved (say how) or that needs a
lead ruling (stop and report instead of guessing — CLAUDE.md §1).
