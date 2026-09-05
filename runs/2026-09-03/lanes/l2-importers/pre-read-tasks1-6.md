> **SUPERSEDED IN PART (2026-09-05, ruling R51):** this pre-read's Q1 discussion (lines ~44–46, ~328–331) argues for `deg_e7`; ruling **R27** reversed that — GPS coordinates are physical decimal degrees, `unit: deg`, for every source. Read the refreshed briefs, not this file, for GPS units. Everything else here stands as adjudicated in R23.

# L2 pre-read — Tasks 1–6 vs. signed contracts and landed `main`

Read-only pass. Line refs: plan = `docs/superpowers/plans/2026-09-03-idl1-wave1-l2-importers.md`;
code = shared checkout `rust/core/src` on `main` (post-L1 merge `76b640a`, plus L3's landed work).
Every `Channel`/`Session` premise is now checkable against real code, unlike when the plan was written
(its own gate greps at plan:27-32 both return `1` today — the gate passes).

---

## Cross-cutting (affects Tasks 2–6)

- **G0.1 — every `Channel {}` literal in the plan fails to compile.** `Channel` has **eight**
  fields (`session/mod.rs:127-184`); the plan supplies six. Missing: `t_recorded_us: Option<Vec<i64>>`
  and `unit: String`, both added post-sign to C1 §2 by ruling R5. Hits plan:655-662 (GPX),
  plan:1198-1205 (FIT), plan:1496-1503 (CSV). The `Session {}` literals are fine (7/7).
- **G0.2 — two name collisions with landed public types.** `crate::import::ImportOutcome`
  (plan:339, a struct) vs. `crate::store::import::ImportOutcome` (`store/import.rs:144`, an enum
  `Written|Skipped|Regenerated`). `crate::import::ImportWarning` (plan:350, `{message}`) vs.
  `crate::session::ImportWarning` (`seam_correction.rs:49`, `{kind, message}`, re-exported at
  `session/mod.rs:17`). L5's `import_file` will `use` both sides.
- **G0.3 — C3 §2 names a file the plan does not create.** C3 §2's post-sign note (spec:173) fixes
  `ImporterError`'s home as `rust/core/src/import/error.rs`; the plan puts it in `mod.rs`.
- **G0.4 — no `importer_version` anywhere.** C1 §4.3 requires "the specific importer module's own
  version (`idl0`/`fit`/`gpx`/`csv`)"; R18 item 4 set the precedent (`parse::IDL0_IMPORTER_VERSION`,
  `parse/mod.rs:29`). `write_session_parquet(data_root, session, importer_version)`
  (`store/parquet.rs:238-242`) cannot be called without one. The plan defines none.
- **G0.5 — nothing calls these importers.** Plan:7 defers "`data.parquet`/Arrow writing, catalog
  insertion, and CLI subcommand wiring" to L1 — but L1 landed and retired, and R18 put the pipeline
  in `store::import` with **`import_idl0` only** (`store/import.rs:177`), keyed to `crate::parse`.
  Answering the lead's check (a): the plan correctly does **not** re-implement blob/parquet/
  `session.json` writing per importer (R18-conformant), but it also never plugs in. As drafted the
  lane ships three importers whose output nothing stores. See **L2-R13**.
- **G0.6 — pre-existing, L1's, relevant here:** `import_idl0` discards `result.import_warnings`
  (`store/import.rs:182-245`) — the exact caller `ParseResult`'s own doc comment (`session/mod.rs:380-385`)
  warns about. Whatever channel L2's warnings take should fix this at the same time.

---

## Task 1 — SPEC §15a (plan 84–273, prose only)

**Gaps**

- **G1.1 — GPS scale: contract-correct, consumer-fatal.** §15a.3 (plan:180) is right against C1 §4.1's
  FIT/GPX row (`unit: deg`, decimal). But every landed consumer assumes ×1e7: `gps.rs:3-8,20-41`
  copies `GPS_Latitude`/`GPS_Longitude` verbatim ("no rescaling happens here"), `laps::distance` /
  `laps::gate_synthesis` work in ×1e7 throughout (R17 ruling 1), `tracks::detect` likewise. C1 §4.1
  puts **two different units under one column name**, disambiguated only by the `unit` column
  metadata that `build_gps_track` never reads. A FIT/GPX session gets silently wrong lap geometry.
  **Q1 below — not L2's to decide.**
- **G1.2 — FIT sessions get no GPS fixes at all.** `build_gps_track` (`gps.rs:23-26`) returns empty
  unless `GPS_Latitude`, `GPS_Longitude` **and `GPS_EpochMs`** are all present. §15a.2 (plan:152-154)
  says FIT never populates `GPS_EpochMs`. Consequence: no lap detection, no track visits, no
  gate crossings on any FIT import — independent of G1.1. **Q3.**
- **G1.3 — no `Time`, no `Distance` on any L2 session.** §15a.4 and Tasks 3/4/5 set
  `nominal_rate_hz = 0.0` on every channel. `synthesize_base_channels` (`synthesis.rs:29-53`)
  returns `[]` unless some channel has `nominal_rate_hz > 0.0`. So C2's `[Time]`, `session.json`'s
  `*_time_secs`, and the workbook time axis are all absent for FIT/GPX/CSV. `synthesize_distance_base`
  (`synthesis.rs:104-110`) additionally requires `GPS_SpeedKmh` at rate > 0, so R7's Task 8 speed
  channel at 0.0 Hz still yields no `Distance`. **Q2.**
- **G1.4 — `source_kind: "csv"` is not in C1 §4.2's token list** (`imu0`…`hr_rr`, `fit`, `gpx`), and
  §4.1 has no `csv_t_recorded_us` row. §4.2's "new sensors get a new lower-`snake_case` token without
  a schema change" clause covers it — but §15a must say so, not leave a reviewer to infer it.
- **G1.5 — §15a.2's "FIT has no equivalent field" for `GPS_EpochMs` is false.** `record.timestamp` is
  precisely a UTC instant, and C1 §4.1's FIT/GPX row lists `GPS_EpochMs` without excluding FIT.

**Proposed rulings**

- **L2-R1.** Importers never write a `Channel` struct literal. Use
  `Channel::from_f64_with_times(id, nominal_rate_hz, samples, t_us, source_kind).with_unit(u)`
  (`session/mod.rs:233,278`) — the constructor L1 wrote for exactly this case ("the path for
  event-driven and imported channels"). Units verbatim from C1 §4.1's FIT/GPX row: `GPS_Latitude`/
  `GPS_Longitude` `deg`, `GPS_Altitude` `m`, `GPS_EpochMs` `ms_raw`, `GPS_SpeedKmh` `km/h`,
  `GPS_Heading` `deg`, `HR_BPM` `bpm`, `Cadence_RPM` `rpm`, `Power_W` `W`. *Cost if wrong: none —
  it also insulates L2 from the next C1 §2 field addition.*
- **L2-R2.** Rename to end the collisions: `ImportOutcome` → **`ImportedSession`**, `ImportWarning`
  → **`ImporterWarning`**. *Cost if wrong: two identifiers, no consumers yet.*
- **L2-R3.** `ImporterError` (and its `Display`/`Error` impls) live in `rust/core/src/import/error.rs`
  per C3 §2's own text; `mod.rs` re-exports it. *Cost if wrong: one file move.*
- **L2-R4.** Per-importer version constants — `import::fit::FIT_IMPORTER_VERSION`,
  `import::gpx::GPX_IMPORTER_VERSION`, `import::csv::CSV_IMPORTER_VERSION`, each `"0.1.0"`,
  doc-commented per C1 §4.3 — and `Importer` gains `fn importer_version(&self) -> &'static str`.
  *Cost if wrong: one trait method; without it nothing can call `write_session_parquet`.*

**Compute note.** Prose only, no build.

---

## Task 2 — `Importer` trait / module skeleton (plan 277–515)

**Gaps**

- **G2.1** — G0.2, G0.3 land here (this task defines both colliding types).
- **G2.2 — the stated test counts are wrong.** `cargo test -p idl-rs import::` (plan:506) is a
  **substring** filter, so it also runs `store::import::tests::*` — 10 landed tests
  (`plan_import` ×5, `import_idl0` ×5, `store/import.rs:274-458`). "three tests `ok`" fails as an
  expectation. Same slip in Task 5 Step 3 and Task 6 Step 3.
- **G2.3 — plan:488-496 is eight lines of self-contradicting instruction** about a `pub mod hook;`
  line that is not in the block it warns about. Delete it from the brief; Task 6 Step 2 adds the line.
- **G2.4 — `session_id_from_blob_hash` does not enforce C4 §3's charset.** C4 §3 fixes `[0-9a-f]`,
  16–64 chars; `blob_sha256.chars().take(16)` passes uppercase or short input straight through.
- **G2.5 — the two test hash fixtures are 62 and 63 chars** (plan:448, plan:462), not 64. The
  assertions still pass; the fixture is not a SHA-256.

**Proposed ruling**

- **L2-R5.** `session_id_from_blob_hash` lowercases and validates: returns
  `Result<String, ImporterError>` (`NotUtf8` is wrong here — add one variant, or debug-assert and
  lowercase-only), or minimally `.to_ascii_lowercase()` plus a doc-comment precondition naming C4 §3
  and a test with an uppercase input. Fixtures become real 64-char hashes (`"ab".repeat(32)` is 64).
  *Cost if wrong: one `map` and a doc line.*

**Compute note.** `cargo test -p idl-rs import::mod` matches nothing (there is no `mod` segment in a
test path) — use `cargo test -p idl-rs import::tests` for this task alone, and expect a **non-zero**
`passed` count (L3-R8's rule: a filter matching nothing is a failed gate).

---

## Task 3 — GPX importer (plan 519–999)

**Gaps**

- **G3.1** — G0.1 (plan:655-662 misses `t_recorded_us`, `unit`).
- **G3.2 — the zero-fill fabricates data.** plan:618 `Some(p.ele_m.unwrap_or(0.0))` and plan:654
  `.unwrap_or(0.0)`: a trackpoint with no `<ele>` becomes **0 m elevation**, one with no `<hr>`
  becomes **0 bpm** — and the golden test asserts it (plan:872,876). Task 4's FIT importer does the
  opposite for the same channels (plan:1180-1197, per-field `Option`). C1 §4.5's nullable columns
  exist precisely for "no sample for this channel at this row".
- **G3.3 — the partial-timestamp fallback produces a 56,000-year session.** plan:587-596 synthesizes
  `i * 1000` **ms** for an untimestamped point, then plan:596 takes `first_utc_ms =
  trkpts[0].time_utc_ms`. If trkpt 0 lacks `<time>` and trkpt 1 has a real one (≈1.78e12 ms),
  `t_us[1] = (1.78e12 − 0) × 1000 ≈ 1.78e18` µs, and `Session.timestamp_utc_ms = 0`. The same
  synthesized index-milliseconds are written verbatim into `GPS_EpochMs`, a column C1 §4.1 defines
  as "verbatim raw `i64` UTC ms **from the receiver**".
- **G3.4 — `t0` is the first trackpoint, not the minimum.** C1 §3.1 fixes `t0_us` as the *minimum*
  across every channel. As drafted, negative `t_us` is avoided only because the dedup loop
  (plan:600-613) drops any point earlier than the first — reported as "duplicate/non-monotonic",
  which it is not.
- **G3.5 — a legal GPX construct is rejected with a wrong error.** plan:695-701: `Event::Empty` with
  local name `trkpt` returns `GpxMissingLatLon("<trkpt/> has no children and cannot carry a
  timestamp")`. `<trkpt lat="45.0" lon="-90.0"/>` is valid GPX with valid coordinates; the whole
  import fails.
- **G3.6 — `Event::CData` is unhandled**, so `<time><![CDATA[…]]></time>` silently yields no
  timestamp and falls into G3.3's path. Low probability, silent.
- **G3.7 — `quick-xml` provenance: confirmed, no action.** `0.41.0` is in `rust/Cargo.lock:3370` and
  vendored at `~/.cargo/registry/src/index.crates.io-…/quick-xml-0.41.0`. Promoting it to a direct
  dependency costs one crate compile and **no** lock re-resolution. R7 already approved the pin.

**Proposed rulings**

- **L2-R6.** **GPX stops zero-filling.** Per-field `Option` semantics identical to FIT's
  `push_channel`: a field absent from a trackpoint contributes no sample to that channel. The golden
  test becomes `GPS_Altitude.t_us == [0, 1_000_000]`, `materialize() == [1500.0, 1501.0]`; `HR_BPM`
  likewise. `gpx_parser.dart`'s `0.0` default is explicitly **not** ported, and §15a.3 says so.
  *Cost if wrong: one closure and two test literals; the alternative writes sea-level elevation and
  a 0 bpm heart rate into a schema that has nulls.*
- **L2-R7.** **Time origin and missing timestamps, stated once for all three importers:**
  (a) `t0` is the **minimum** converted timestamp across every sample (C1 §3.1), and
  `Session.timestamp_utc_ms` is that minimum;
  (b) a GPX file where **no** trackpoint has a parseable `<time>` keeps the ported 1 Hz synthesis,
  but with `timestamp_utc_ms = 0` ("unknown") and **no `GPS_EpochMs` channel** — a synthesized index
  is not a receiver epoch — and **one** warning for the file, not one per point;
  (c) a GPX file where **some** trackpoints have one: the timestamped points define the axis and
  untimestamped points are **dropped**, one warning each. Synthesized index-ms and epoch-ms never
  share an axis;
  (d) FIT records with no `timestamp` are dropped **with a warning** (plan:1128 drops them silently,
  unlike every other drop in the same function — CLAUDE.md §5).
  *Cost if wrong: (c) loses points a zero-fill would have kept at a fabricated time; (b)/(d) are
  strictly more information than the draft.*
- **L2-R8.** GPX accepts self-closing trackpoints: `Event::Empty` with local name `trkpt` reads
  lat/lon exactly as `Event::Start` does and pushes a `TrkPt` with no `<ele>`/`<time>`/extensions.
  `GpxMissingLatLon` is reserved for a trkpt genuinely missing an attribute. `Event::CData` is
  handled alongside `Event::Text`. *Cost if wrong: two match arms.*

**Compute note.** `cargo test -p idl-rs import::gpx` (7 tests as drafted; 7 after L2-R6/R8 changes
expectations, +1 if a self-closing-trkpt test is added). Non-zero `passed` required.

---

## Task 4 — FIT importer (plan 1003–1392)

**Gaps**

- **G4.1 — `fitparser` 0.11.0 is not obtainable here; 0.9.0 is, and the plan's decoding assumptions
  are verified against it.** `Cargo.lock:1297` pins `0.9.0`; `~/.cargo/registry/{src,cache}` holds
  only `0.9.0`. Open Question 8 already admits 0.11's decoding was never inspected. Against 0.9.0,
  line by line: field 2 → **`enhanced_altitude`**, scale 5 / offset 500, i.e. `raw/5 − 500`
  (`profile/decode.rs:26516-26544`), with plain `altitude` emitted only under
  `DecodeOption::KeepCompositeFields` — exactly as plan:145 states; `heart_rate`/`cadence`/`power`
  keep their integer variants because `apply_scale_and_offset` (`profile/mod.rs:288-297`) is a no-op
  at scale 1/offset 0; `position_lat`/`position_long` stay `Value::SInt32`; `timestamp` (field 253,
  `FieldDataType::DateTime`) becomes `Value::Timestamp(DateTime<Local>)` whose `.timestamp()` is Unix
  epoch **seconds** with the FIT-epoch offset already folded in (`lib.rs:166,276`). The fixture
  arithmetic (`altitude_raw` 10 000 → 1500.0 m) is correct **on 0.9.0**.
- **G4.2 — the bump costs a lock re-resolution on a jobs=2 machine.** `~/.cargo/config.toml` is
  `jobs = 2` after the R13 addendum's OOM. `Cargo.lock` was the L1 merge's only conflict (`76b640a`);
  a lane-local version bump makes the L2 merge harder for no verified gain.
- **G4.3 — the duplicated CRC helper is necessary; confirming so a reviewer doesn't flag it.**
  `export/fit/mod.rs:5` is `mod encoder;` (**private**), so `crate::export::fit::encoder::crc16`
  (`encoder.rs:12`) is unreachable from `crate::import::fit`. The plan's table and algorithm match it,
  and its hand-rolled framing matches `FitWriter::finish` byte for byte.
- **G4.4 — timestamp-less records are dropped silently** (plan:1128) — see L2-R7(d).
- **G4.5 — sparse per-channel `t_us` breaks `fit_t_recorded_us`.** `write_session_parquet`
  (`parquet.rs:249-267`) builds each `<source>_t_recorded_us` column from the **first** channel
  carrying that `source_kind`, on the documented assumption that a source's channels share one
  `t_us`. Task 4's `push_channel` (plan:1187-1197) deliberately breaks that: each channel covers only
  the records that carried *its* field. C1 §4.1 requires `fit_t_recorded_us` to be "bit-identical to
  `t`". An indoor-trainer file (no GPS) or a ride whose GPS acquires late yields a column that is
  null on rows where `t` is not.
- **G4.6 — `timestamp_utc_ms = first_utc_s * 1000`** (plan:1164) is the first record, not the minimum
  (C1 §3.1) — same class as G3.4, closed by L2-R7(a).
- **G4.7** — Task 4 Step 2's "fix `export/fit/mod.rs` if 0.9→0.11 breaks it" becomes a no-op under
  L2-R9; keep the `export::fit::` run as a plain regression check.

**Proposed rulings**

- **L2-R9.** **`fitparser` stays at `0.9`**, promoted verbatim from `[dev-dependencies]` to
  `[dependencies]`. It is what the lock already resolves, what `export::fit`'s tests already exercise,
  and the only version whose `record`-message decoding anyone has actually read (G4.1). The M0
  ecosystem pin is a recommendation for *new* dependencies, not a mandate to bump an in-tree one
  mid-lane on a memory-constrained machine (R13). Bumping to 0.11.0 is a separate one-task change
  after Isaac's archive arrives and can prove it necessary. *Cost if wrong: if 0.9 misdecodes a real
  Garmin file, the bump is one Cargo.toml line plus whatever `match` arms move — the same work,
  deferred until a real file can justify it.*
- **L2-R10.** **`<source>_t_recorded_us` scatter is L1's bug to fix, not L2's to work around.**
  `parquet.rs:249-267` must build the column from the **union of every channel's `t_us` for that
  `source_kind`**, not the first channel's, or C1 §4.1's "bit-identical to `t`" cannot hold for any
  multi-coverage FIT session (G4.5). That is a landed L1 file — the lead places the fix; L2's own
  tests can prove the symptom (a FIT `Session` with GPS on half the records → read back → assert
  `fit_t_recorded_us` non-null on every row). Do **not** "solve" it by zero-filling FIT channels.
  *Cost if wrong: one function; the alternative corrupts a contract-mandated column.*

**Compute note.** `cargo test -p idl-rs import::fit` (3 tests), then `cargo test -p idl-rs export::fit`
as the promoted-dependency regression check. Both must report non-zero `passed`.

---

## Task 5 — CSV importer (plan 1396–1605)

**Gaps**

- **G5.1** — G0.1, and `unit` has **no source at all** for CSV: C1 §4.2 requires the key always, and a
  bare header name supplies nothing.
- **G5.2** — `source_kind: "csv"`, G1.4.
- **G5.3 — negative `t_us` is reachable.** plan:1458 anchors on the **first data row**'s `t_seconds`.
  A channel whose first non-empty cell is on a later row with a smaller `t_seconds` gets a negative
  `t_us` — C1 §3.1 requires `t_us >= 0` and `t[0] == 0`. Closed by L2-R7(a).
- **G5.4 — header names are unguarded.** A CSV column named `t`, `Time` or `Distance` collides with
  the Parquet union-axis column or the synthesized channels; a duplicated header name produces two
  Arrow fields with the same name. Neither is checked.
- **G5.5 — warning volume.** Dedup is per-column by design, so one duplicated `t_seconds` row in a
  20-column CSV emits 20 near-identical warnings. Correct, worth documenting.

**Proposed ruling**

- **L2-R11.** CSV header validation: reject (`CsvMalformed`) a column named `t`, `Time`, `Distance`,
  or duplicated within the header; `unit` is the empty string for every CSV channel (C1 §4.2 requires
  the key, not a non-empty value — `column_metadata` at `parquet.rs:156` writes it unconditionally);
  `source_kind` is `"csv"`, declared in §15a.4 as a new C1 §4.2 token under that section's own
  forward-compatibility clause. *Cost if wrong: two guards and a doc line.*

**Compute note.** `cargo test -p idl-rs import::csv` (3 tests, +2 for the new guards).

---

## Task 6 — Post-import hook (plan 1609–1755)

**Gaps**

- **G6.1 — `cargo test --workspace` (plan:1746) is forbidden.** R13 standing rule (c): full suite
  once per lane, at the merge gate. R19 item 4: the merge gate is `-p idl-rs -p idl-rs-cli`,
  **explicitly not** `--workspace`, because that builds `idl-rs-tauri`'s Tauri graph for nothing —
  the graph the R13 addendum records OOM-killing this machine.
- **G6.2 — the hook is attached at the wrong point to do its stated job.** `import_with_hook`
  (plan:1654-1663) fires on an in-memory `Session` with no `data_root`. Materialised derived channels
  are `derived/<hash>.parquet` files (C1 §5) — they need the data root and the *stored* session. With
  R18's pipeline landed, the only place a real hook can fire is inside `store::import`, after
  `write_session_parquet`.
- **G6.3 — `import_with_hook<I: Importer>` cannot take `importer_for_extension`'s `Box<dyn Importer>`**
  without a deref dance at every call site.

**Proposed ruling**

- **L2-R12.** Task 6 ships `PostImportHook` + `NoopPostImportHook` **only**, with a doc comment saying
  it is wired by whoever adds the non-`.idl0` path to `store::import` (L2-R13), and no
  `import_with_hook`. If the lead keeps `import_with_hook`, it takes `&dyn Importer`. Test gate:
  `cargo test -p idl-rs import::` (expect **13+** tests — the 10 in `store::import` come along);
  end-of-lane `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`; **never `--workspace`**;
  `cargo check -p idl-rs-cli --tests` once at the end (the R18-addendum blind spot — L2 adds only new
  `pub` items, so this is cheap belt-and-braces, not a signature audit). *Cost if wrong: a function
  deleted before it had a caller.*

---

## The structural one — L2-R13 (entry point)

`store::import` exposes `import_idl0` only (`store/import.rs:177`), hard-keyed to `crate::parse`.
L2's importers need the identical sequence — blob write → `plan_import` → `data.parquet` →
`session.json` — over an `Importer` instead of the `.idl0` parser. That is `store/`, which the plan's
own lane-boundary bullet (plan:64) excludes, and L1 is retired.

**Recommendation:** L2 adds one task widening its boundary by one file:
`store::import::import_file(data_root: &Path, extension: &str, bytes: &[u8]) -> Result<ImportReport, ImportError>`,
dispatching via `importer_for_extension`, calling `write_session_parquet(.., importer.importer_version())`
(L2-R4), and mapping `ImporterError` → `ImportErrorKind` using C3 §2's seven `import_*` rows. It is a
~30-line generalisation of `import_idl0`, and L2 is the only lane holding the context. The
alternatives — a follow-on L1' task, or pushing it into L5's Tauri command — either re-open a retired
lane or violate R18 item 1 ("core owns the pipeline"). **Lead's call, not L2's.**

---

## Confirmed correct as drafted (no change; listed so the reviewer doesn't re-litigate)

- The dependency gate (plan:27-32) passes: `session/mod.rs:137` and `:356`.
- `pub mod import;` sorts between `histogram` and `integration` (`lib.rs:16-17`). ✓
- The plan does **not** re-implement blob/parquet/`session.json` writing per importer — R18-conformant.
- `Session {}` literals match all seven fields.
- Record-level (FIT) / trackpoint-level (GPX) dedup is genuinely equivalent to C1 §3.4's per-channel
  rule *for channels that share one `t_us`*, and the reasoning at plan:160-167 is sound.
- The duplicated FIT CRC-16 helper is required (G4.3) and matches `encoder.rs:12`.
- `quick-xml 0.41.0` is already resolved and vendored (G3.7).
- `parse_iso8601_utc_ms` / `days_since_epoch` (Hinnant) are correct; the 2000-01-01 anchor test is a
  real check.

---

## Questions only Isaac can answer

**Q1 — GPS coordinate scale for FIT/GPX: `deg` or `deg_e7`?** C1 §4.1's FIT/GPX row says decimal
`deg`; every landed consumer (`gps.rs`, `laps::distance`, `laps::gate_synthesis`, `tracks::detect`)
assumes ×1e7, and R17 ruled the whole lap stack works in ×1e7 throughout. Option (A): importers emit
×1e7 with `unit: deg_e7`, one convention everywhere — needs a C1 §4.1 amendment narrowing
"always-physical" to exclude lat/lon. Option (B): keep C1's `deg` and teach `build_gps_track` to
rescale by source — needs unit metadata threaded into `gps.rs` and every downstream consumer.
*Recommendation: (A).* It is the smaller change (a constant in two importers vs. plumbing metadata
through four modules), and it keeps one scale for every GPS consumer. Not derivable from a contract
— C1 currently says the opposite.

**Q2 — do FIT/GPX sessions get `Time` and `Distance`?** They cannot today: `synthesize_base_channels`
needs one channel with `nominal_rate_hz > 0` and every L2 channel is `0.0` (G1.3). Option (A):
FIT/GPX declare `nominal_rate_hz = 1.0` (metadata only — C1 §3.5 invariant 4 still forbids deriving
time from it, and `synthesis.rs:64` already takes `Time`'s values from real `t_us`), CSV stays `0.0`.
Option (B): change `synthesize_base_channels` to fall back to the longest event-driven channel — a
landed L1 file. *Recommendation: (A).* Cheapest, touches nothing landed, and 1 Hz is the honest
nominal for both formats. The cost is that C1 §4.2's `channel_kind` then reads `fixed-rate` for a
source that is genuinely irregular — which is why this is Isaac's call, not a silent default.

**Q3 — does FIT populate `GPS_EpochMs`?** §15a.2 says no; `gps.rs:23-26` then returns **zero fixes**
for every FIT session, so no laps, no track visits, regardless of Q1/Q2. FIT's `record.timestamp` is
a UTC instant and C1 §4.1's FIT/GPX row lists `GPS_EpochMs` without excluding FIT.
*Recommendation: yes* — `GPS_EpochMs = (fit_timestamp_s + 631065600) * 1000` on rows carrying a
position, unit `ms_raw`, and strike §15a.2's "FIT has no equivalent field" sentence.

**Q4 — the real FIT/GPX archive (plan Open Question 7): what proceeds without it?** All six tasks,
every golden test and every error path — the synthetic FIT fixture is now verified decodable against
fitparser 0.9's own profile decoder (G4.1). What does **not**: whether a real Garmin file writes
field 2 (→ `enhanced_altitude`) or field 78 directly; whether it carries `speed`/`enhanced_speed` and
`<speed>`/`<course>` (Task 8's direct path) or needs the derived fallback; and whether 0.9 decodes a
modern FIT profile at all. *Recommendation: land Tasks 1–6 on synthetic fixtures; hold Task 8 and any
`fitparser` bump for the archive.*

---

PRE-READ COMPLETE: 36 gaps, 13 proposed rulings, 4 Isaac questions
