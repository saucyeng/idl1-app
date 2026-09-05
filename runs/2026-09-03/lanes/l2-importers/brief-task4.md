# L2 Task 4 — implementer brief (FIT importer + `parquet.rs` union fix)

You are the implementer for L2 Task 4 of the idl1 rewrite — the FIT
importer, plus one authorized edit to a landed L1 file. TDD, ONE commit,
then report. Read the "GPS_EpochMs — do not double-offset" ruling carefully
before writing that one line; it's the easiest mistake in this task.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers`,
  branch `wave1-l2-importers`, HEAD must be Task 3's commit (given in the
  dispatch message), status clean. Verify first; if not, stop and report.
  Leave `.cargo/config.toml` alone.
- Work ONLY there. Do NOT touch the shared checkout
  (`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`), `idl1-app`
  beyond READING files named below, or any other worktree. Do NOT edit
  `docs/`. Do NOT push. **Exception, explicitly authorized by ledger R23**
  (cross-lane authorization through the lead, CLAUDE.md §7): this task edits
  `src/store/parquet.rs`, a landed L1 file, per L2-R10 below — nothing else
  outside `src/import/` and `Cargo.toml`.
- Read first: `CLAUDE.md`; the L2 plan's `### Task 4`
  (`docs/superpowers/plans/2026-09-03-idl1-wave1-l2-importers.md`, lines
  1003–1394 — your starting point for the FIT decode plumbing, **not** the
  dependency version or the GPS_EpochMs formula, both corrected below);
  contract C1 §3.1, §3.4, §4.1 (amended — decimal-degree GPS units per
  R27, the `GPS_EpochMs` formula, the `fit_t_recorded_us`
  union-of-channels note); the pre-read
  `pre-read-tasks1-6.md`'s Task 4 section (G4.1–G4.7); ledger `R23` **and
  `R27`** (R27 supersedes R23's Q1 — the pre-read's Q1 discussion predates
  it); the landed `src/store/parquet.rs` lines 238–267
  (`write_session_parquet`'s `<source>_t_recorded_us` loop — this is what L2-R10 changes) and
  `row_indices_for`/`recorded_us_array` (lines 67–83, 133–140 — the helpers
  you reuse, unchanged); Task 3's landed `src/import/gpx.rs` `push_channel`
  (your FIT one already matches its shape — no change needed there, just
  confirm consistency).

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; do not
override). In order: `cargo build -p idl-rs`, then
`cargo test -p idl-rs export::fit::` (regression check — see L2-R9), then
`cargo test -p idl-rs import::fit::`, then
`cargo test -p idl-rs store::parquet::` (L2-R10's own new test plus the
existing suite). Each must report non-zero `passed` (standing rule,
L3-R8). No full suite, no tarpaulin, no `-j`, no `.cargo/` edits, never
`cargo fmt`. One cargo process at a time, foreground. `cargo check -p
idl-rs-cli --tests` NOT required this task (no `pub` signature outside
`core` changes — `write_session_parquet`'s own signature is unchanged, only
its body).

## Rulings that change the plan's drafted code

**L2-R9 — `fitparser` stays `0.9`, promoted verbatim, no bump to `0.11.0`.**
The plan's Step 1/Step 5 both assume a bump to `0.11.0` — do not do that.
Only `0.9.0` is actually resolvable/vendored here (`Cargo.lock:1307`,
`~/.cargo/registry`), and it's the only version whose `record`-message
decoding has actually been read against this plan's field assumptions
(G4.1 — confirmed correct field-by-field against `0.9.0`'s own
`profile/decode.rs`). In `Cargo.toml`: delete `fitparser = "0.9"` from
`[dev-dependencies]`; add `fitparser = "0.9"` under `[dependencies]` — same
version string, different section, nothing else. Skip plan Step 2's
"confirm 0.11.0" framing and Step 5's "if fitparser 0.11.0's field
names/types differ..." — neither applies (G4.7); just build normally and
treat `cargo test -p idl-rs export::fit::` as a plain promoted-dependency
regression check (that module uses the same `fitparser::from_bytes`/
`.kind()`/`MesgNum::Record`/`.fields()`/`.name()` surface this importer
uses — if promoting the dependency broke anything there, it would show up
here first).

**L2-R1 — no `Channel {}` struct literals; units.** Same as Task 3: build
every channel via `Channel::from_f64_with_times(channel_id, 0.0, values,
t_us, "fit").with_unit(unit)`, never plan:1198–1205's bare struct literal
(missing `t_recorded_us`/`unit` — G4.5-adjacent, same class as G3.1). Units:
`deg` for lat/lon (below), `m` for `GPS_Altitude`, `ms_raw` for
`GPS_EpochMs`, `bpm`/`rpm`/`W` for `HR_BPM`/`Cadence_RPM`/`Power_W`.

**R27 — lat/lon are physical decimal degrees, stored unchanged.** R23's Q1
answer (`deg_e7`, ×1e7) was superseded by ruling R27, and R27 has landed
(idl-rs `7e10797`) — every consumer (`core/src/gps.rs`, `laps::distance`,
`laps::gate_*`, `tracks::*`) reads decimal degrees now.
`semicircles_to_deg` (plan:1069–1071) stays exactly as drafted, returning
plain decimal degrees, and its test
`semicircles_to_deg_quarter_circle_is_45_degrees` (asserting `45.0`) keeps
passing unchanged. The `push_channel` accessors also stay as the plan
drafts them at plan:1154–1155 — `|r| r.lat_deg` and `|r| r.lon_deg`, no
scaling — with `unit: deg`. There is **no** ×1e7 anywhere in this file, and
the plan's own plain-decimal golden values stand (see Tests below).

**Q3 — `GPS_EpochMs` from `record.timestamp`, on rows carrying a position.
Do NOT re-add the FIT-epoch offset — it is already folded in.** This is the
one place the plan's own doc comment (plan:143) and C1 §4.1's stated formula
use the same variable name for two different things — read carefully.
`fitparser`'s `Value::Timestamp(dt)` → `dt.timestamp()` (what
`FitRecord.timestamp_utc_s` already holds, per `import()`'s existing
`"timestamp" => { if let Value::Timestamp(dt) = ... { r.timestamp_utc_s =
Some(dt.timestamp()); } }` arm) is **already Unix-epoch seconds** — the
`fitparser` crate itself adds the FIT-epoch offset
(`631_065_600`, 1989-12-31 → 1970-01-01) internally before returning it
(plan:143's own note: "`.timestamp()`... is UTC epoch seconds, matching C1
§3.1's `(fit_timestamp_s + 631065600)` formula **with the offset already
folded in**"). C1 §4.1's stated formula,
`GPS_EpochMs = (fit_timestamp_s + 631_065_600) * 1000`, names the **raw
wire-level** FIT-epoch seconds value — which this importer never stores
(it only ever stores `fitparser`'s already-offset `.timestamp()` result).
Applying `+ 631_065_600` a second time to `r.timestamp_utc_s` would silently
shift every `GPS_EpochMs` value ~20 years into the future — a Critical-class
bug a golden test must catch. The correct code, consistent with this same
function's own `timestamp_utc_ms = first_utc_s * 1000` line (plan:1164,
which likewise never re-adds the offset): add a `GPS_EpochMs` channel via
`push_channel` with accessor
```rust
|r| (r.lat_deg.is_some() && r.lon_deg.is_some())
    .then(|| r.timestamp_utc_s.unwrap() as f64 * 1000.0)
```
— present only on records carrying a position (both lat and lon decoded),
value = `timestamp_utc_s * 1000`, nothing added. Unit `ms_raw`.

**L2-R7(a) — `t0` is the minimum, not the first record.** Plan:1135's
`first_utc_s = records[0].timestamp_utc_s.unwrap()` assumes `records[0]` is
chronologically earliest — not guaranteed (G4.6, same class as GPX's G3.4).
Fix: after the `records.retain(|r| r.timestamp_utc_s.is_some())` filter,
`let first_utc_s = records.iter().map(|r| r.timestamp_utc_s.unwrap()).min().unwrap();`
Everything downstream (`t_us` computation, `Session.timestamp_utc_ms =
first_utc_s * 1000`) stays as drafted, just fed the corrected value.

**L2-R7(d) — a timestamp-less record is dropped with a warning, not
silently.** Plan:1128's `records.retain(|r| r.timestamp_utc_s.is_some());`
drops silently — the only silent drop in this function (every other drop
already warns). Before the `retain`, count (or collect indices of) the
records about to be dropped and push one `ImporterWarning` per dropped
record (e.g. `"dropped FIT record {i}: no timestamp"`) — matching this same
function's existing per-record warning style for duplicate/non-monotonic
drops, for a reader's consistency. If none of your records had a timestamp
in the first place (all dropped), the existing empty-check
(`if records.is_empty() { return Err(FitMalformed(...)) }`) still applies
after the warnings are collected — an error, not a report full of warnings
and nothing else.

**L2-R10 — fix `store/parquet.rs`'s `<source>_t_recorded_us` construction to
use the union of a source's channels, not just the first one.** This is the
landed-L1 file edit R23 authorizes. Today (`write_session_parquet`, lines
~249–264), the loop dedups by `source_kind` and builds the
`<source>_t_recorded_us` column from **only the first channel** of that
`source_kind` it encounters (`if seen_sources.contains(...) { continue; }`
skips every subsequent channel of the same source entirely — both for field
registration *and* for the array's actual values). This assumption
("a source's channels share one `t_us`") holds for every device source
(§3.2) but Task 4's own `push_channel` deliberately breaks it: each FIT
channel only has samples on the records that carried *that* field, so an
indoor-trainer file (no GPS at all) or a ride where GPS acquires late
produces a `fit_t_recorded_us` column that's null on rows where `t` isn't —
violating C1 §4.1's "bit-identical to `t`" requirement for `fit_t_recorded_us`
(also newly explicit in C1's own amended text, same amendment as Q1/Q3).

Fix: for each distinct `source_kind` among non-synthesized channels, collect
**every** channel with that `source_kind` (not just the first), and build
the recorded-us array by merging each one's own `row_indices_for`/
`t_recorded_us_or_t_us()` contribution into one `Vec<Option<i64>>` of
`n_rows` — i.e. replace the current "compute `rows`/call
`recorded_us_array` once, from the first channel, then `continue` for the
rest" with "for the first channel of a new `source_kind`, register the
field as today; then for **every** channel of that `source_kind` (including
the first), scatter its own `(row, recorded value)` pairs into one shared
`Vec<Option<i64>>`, only building the final `Arc<Int64Array>` once all of
that source's channels have contributed." Rows two channels of the same
source might both cover should carry the same recorded value in practice
(same underlying record's timestamp) — no special conflict handling needed,
just don't let a later channel overwrite an earlier one's already-filled
row with `None`.

**Test (symptom, per L2-R10's own ruling text).** In `store::parquet`'s test
module: build a `Session` with two `source_kind: "fit"` channels whose
`t_us` sets are disjoint on some rows (e.g. `GPS_Latitude` present on
records `[0, 2]`, `HR_BPM` present on records `[0, 1, 2]`) — write it via
`write_session_parquet`, read the file back, assert `fit_t_recorded_us` is
**non-null on every row** `t` has (not just the rows the first-registered
channel happened to cover).

## The task (plan Task 4, Steps 1–6, corrected)

- [ ] **Step 1: Promote `fitparser`** per L2-R9 (not the plan's 0.11.0 bump).
- [ ] **Step 2: Build, run `export::fit::` regression check** per L2-R9/G4.7
  (skip the plan's "confirm 0.11.0" framing).
- [ ] **Step 3: Write `src/import/fit.rs`** — plan:1033–1359's code as your
  base for `FitRecord`, `semicircles_to_deg`, `numeric_value`, the CRC-16
  test helper, `build_fit_fixture`/`golden_rows` (unaffected by any ruling
  above, confirmed correct — G4.1/G4.3). Rewrite `Importer::import`'s body
  per L2-R1/Q1/Q3/L2-R7(a)/L2-R7(d) above; rename `ImportOutcome`/
  `ImportWarning` → `ImportedSession`/`ImporterWarning` (Task 2's L2-R2). Add
  `const FIT_IMPORTER_VERSION: &str = "0.1.0";` (doc-commented, C1 §4.3) and
  implement `importer_version()` (Task 2's L2-R4).
- [ ] **Step 4: Wire `fit` into `import/mod.rs`** — plan:1362–1373,
  unchanged.
- [ ] **Step 5: Edit `src/store/parquet.rs`** per L2-R10 above, plus its
  symptom test.
- [ ] **Step 6: Build and test** — the four commands under COMPUTE RULES, in
  order.
- [ ] **Step 7: Commit** — explicit paths (NOT `git add -A`):
  `git add Cargo.toml src/import/mod.rs src/import/fit.rs src/store/parquet.rs`
  — message
  `core: FitImporter (fitparser 0.9, C1 §4.1 mapping); fix fit/gpx/csv_t_recorded_us to union channels (L2-R10)`.
  Single line, no AI attribution trailer.

## Tests (update the plan's golden fixture assertions)

- `GPS_Latitude`/`GPS_Longitude` values are plain decimal degrees (R27):
  `lat.materialize() == vec![45.0, 22.5, 11.25]`,
  `lon.materialize() == vec![-90.0, -45.0, 0.0]` — the plan's own values,
  unchanged — and each channel's `unit` is `deg`.
- Add a `GPS_EpochMs` assertion on the golden fixture's 3 kept records:
  `epoch.materialize() == vec![(T0 as f64) * 1000.0, (T0+1) as f64 * 1000.0,
  (T0+3) as f64 * 1000.0]` — i.e. `timestamp_utc_s * 1000` exactly, **no**
  `+ 631_065_600`. This is the test that catches the double-offset bug.
  (Note: the existing `build_fit_fixture` helper writes lat/lon on every
  row, so this fixture cannot exercise the "no position → no `GPS_EpochMs`
  sample" branch — that's a pre-existing fixture-generator limitation, not
  this task's to fix; don't add a test that can't actually be built with
  the current fixture shape.)
- Add a test for L2-R7(d): a fixture with one record's timestamp field
  omitted (or, simpler, a small standalone byte sequence with fewer
  timestamp-carrying records) produces a warning naming the dropped record.
  If building such a fixture is impractical with the existing field-count-7
  layout, a unit-level test on the warning-collection logic in isolation is
  acceptable — say which you did in your report.
- Keep (unaffected):
  `fit_importer_malformed_bytes_returns_typed_error`,
  `semicircles_to_deg_quarter_circle_is_45_degrees` (still asserts `45.0`
  — under R27 there is no scaling to apply anywhere, in this function or
  at its call sites).

## Do not

- Do not bump `fitparser` to `0.11.0` (L2-R9).
- Do not scale lat/lon by 1e7 anywhere, and do not write `unit: deg_e7`
  (R27) — `semicircles_to_deg`'s decimal output is stored as is.
- Do not add `+ 631_065_600` to `r.timestamp_utc_s` anywhere (Q3) — it is
  already Unix-epoch seconds.
- Do not leave `records.retain(..)` silently dropping timestamp-less records
  (L2-R7(d)).
- Do not "solve" `fit_t_recorded_us`'s sparseness by zero-filling FIT
  channels instead of fixing `parquet.rs` (L2-R10's own explicit warning) —
  that corrupts contract-mandated data instead of fixing the real bug.
- Do not touch `export/fit/mod.rs`'s logic (only a build-fix if strictly
  necessary, which L2-R9 makes moot — expect no changes there at all).

## Style / hygiene

Doc comment on every public symbol; units on every numeric value (`t_us` µs,
lat/lon `deg`, epoch `ms_raw`); typed errors only; A/A/A tests named
`thing — condition — result`; match surrounding hand-formatted style.

## Spec discipline (say it out loud in your report)

"no spec change needed" — Task 1's §15a.2 (as corrected by its own brief)
already states the decimal-degree storage (R27) and the `GPS_EpochMs`
formula this task implements; C1 §4.1's `fit_t_recorded_us` union-of-channels note (already
amended, same ledger entry) is what L2-R10 implements.

## Report back (concise)

Commit hash + `git show --stat`; all four test commands and result lines
(each `passed` count); per-step done/deviated; confirmation the
`GPS_EpochMs` value uses no double offset (quote the actual formula you
wrote); confirmation `semicircles_to_deg`'s own unit test still asserts
`45.0`, and that no ×1e7 scaling or `deg_e7` unit string appears anywhere;
confirmation of the `parquet.rs` union fix and its symptom test;
anything ambiguous you resolved (say how) or that needs a lead ruling (stop
and report instead of guessing — CLAUDE.md §1).
