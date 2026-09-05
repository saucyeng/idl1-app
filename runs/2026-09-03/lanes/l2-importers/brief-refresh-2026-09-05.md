# L2 briefs — refresh against landed `main` (2026-09-05)

Refresh of the L2 (importers) lane's brief files, written 2026-09-04, against
`main` as of 2026-09-05: idl1-app `bfaa888`, `rust` submodule (idl-rs)
`75589bc` (post-L5 merge). No cargo/npm was run; nothing was committed; only
the files listed below were touched.

**Files edited:** `BRIEF.md`, `brief-task1.md`, `brief-task2.md`,
`brief-task3.md`, `brief-task4.md`, `brief-task6.md`, `review-STANDING.md`.
**Files deliberately not edited:** `brief-task5.md` (nothing in it is stale —
see below), `pre-read-tasks1-6.md` (a survey artifact, not a brief; see
question Q5).

`review-STANDING.md` is not one of the six implementer briefs, but it carried
a `deg_e7` instruction that would have made a reviewer grade correct R27 code
as a Critical finding. Treated as in scope under "the brief files."

---

## (a) Edits made, per file

### `BRIEF.md`

| # | Edit | Justification |
|---|---|---|
| B1 | Scope: `fitparser` `0.11.0` → `0.9` ("ruling L2-R9") | R23 approved L2-R9; only 0.9.0 is resolvable. Confirmed `rust/Cargo.lock` has `fitparser 0.9.0` and `rust/core/Cargo.toml:27` has `fitparser = "0.9"` (still in `[dev-dependencies]`, as Task 4 expects). |
| B2 | New paragraph after Scope: GPS is physical decimal degrees, `unit: deg`, every source; `GPS_Altitude` m, `GPS_Heading` deg; R27 superseded R23 and landed at idl-rs `7e10797` | Ruling R27. Lane-level statement so no task brief is the only place it appears. |
| B3 | Dependency gate: "Checked 2026-09-03: both return `0` — gate is not yet open" → re-checked 2026-09-05, both return `1`, gate open | Ran both greps against `rust/core/src/session/mod.rs`: `pub t_us: Vec<i64>` → 1, `pub source_format: SourceFormat` → 1. |
| B4 | "Done when": `cargo test --workspace` → the §8 gate `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`, plus an explicit ban on a bare `cargo test` | CLAUDE.md §8. The §8 hook was extended to deny a bare `cargo test` at `de3cf95` ("L5 LANDED", harness-gap note). |
| B5–B8 | Open-questions heading annotated; Q1, Q3, Q4 marked **closed** with the closing fact | Q1: C1 §4.1's FIT/GPX row names `GPS_SpeedKmh`/`GPS_Heading` (R7). Q3: C3 §2 lines 150–156 carry the seven `import_*` rows. Q4: `quick-xml 0.41.0` present in `rust/Cargo.lock`. |
| B9 | Q7 (archive) annotated: a FIT sample exists as of the L5 merge; Tasks 1–6 still land on synthetic fixtures | "L5 LANDED" ledger entry ("FIT sample available"); R23 Q4. |
| F1 | Rewrapped the Scope opening line after B1 | Cosmetic, keeps the file's ~78-column wrap. |

### `brief-task1.md`

| # | Edit | Justification |
|---|---|---|
| T1a | Read-first: ledger `R23` → `R23` (Q1–Q4) **and** `R27`, "read both, in that order" | R27 supersedes R23 Q1; the implementer must see both. |
| T1b | Correction 1 rewritten end to end: `deg_e7` everywhere → physical decimal degrees everywhere; adds `GPS_Altitude` m / `GPS_Heading` deg; states that §15a.3's existing "not scaled ×1e7 … physical degrees directly" sentence is now **correct** and must be kept, with one added sentence extending it to FIT; adds "do not write `deg_e7` anywhere in §15a" | R27. The previous text told the implementer to delete the one sentence that R27 makes true. Also cites landed consumers verified today: `rust/core/src/gps.rs` (doc comment: "degrees, ruling R27; no rescaling happens here"), `rust/core/src/laps/distance.rs:20` (`M_PER_UNIT = 111_320.0`, no `/1e7`). |
| T1c | Correction 2 units list: `GPS_Latitude`/`GPS_Longitude` → `deg_e7` becomes `deg` | C1 §4.1's FIT/GPX-derived row, as amended for R27. |

Note on paths: correction 1 previously cited `gps.rs`; the file is
`rust/core/src/gps.rs`, **not** `rust/core/src/session/gps.rs`. The new text
uses the correct path.

### `brief-task2.md`

| # | Edit | Justification |
|---|---|---|
| T2a | "HEAD on `main` (post L1 merge `76b640a`)" → "(post-L5 merge `75589bc`, 2026-09-05)" | idl-rs `main` is `75589bc` ("merge: L5 Tauri glue (wave 1)"). The old hash would have failed the brief's own verify-first step. |
| F2 | Rewrap after T2a | Cosmetic. |

Everything else in this brief verified as still true: `ImportOutcome` /
`ImportWarning` collisions are real (`store::import::ImportOutcome` exists;
`session/mod.rs:17` re-exports `ImportWarning`), the C3 §2 note naming
`rust/core/src/import/error.rs` is present, the 2-job cap matches
`~/.cargo/config.toml` (`jobs = 2`).

### `brief-task3.md`

| # | Edit | Justification |
|---|---|---|
| T3a | Read-first: C1 §4.1 "(already amended — `deg_e7`, units)" → "(already amended — decimal-degree GPS units per R27, per-channel units)" | R27; C1 §4.1's row now reads `unit: deg`. |
| T3b | Read-first: ledger `R23` → `R23` **and** `R27`, with a pointer that the pre-read's own Q1 discussion (its lines 44–46, 328–331) predates R27 and is history | R27; the pre-read is unedited and still argues `deg_e7`. |
| T3c | L2-R1 units: `deg_e7` → `deg` for lat/lon | C1 §4.1 as amended. |
| T3d | The `Q1` ruling block replaced by an `R27` block: parse lat/lon as decimal degrees and store unchanged, `unit: deg`, no ×1e7; plan:180 is correct as drafted | R27. The `Option`-semantics sentence is preserved verbatim. |
| T3e | Golden-fixture assertions: `[450_000_000.0, 450_010_000.0, 450_030_000.0]` → `lat == [45.0, 45.001, 45.003]`, `lon == [-90.0, -90.001, -90.003]`; adds a note that `assert_eq!` on `f64` is safe because nothing rescales the parsed value | R27, and the plan's own fixture (plan:828–851: lat 45.0/45.001/45.002/45.003, lon -90.0/-90.001/-90.002/-90.003, index 2 dropped as a duplicate timestamp). |
| T3f | "Do not" list inverted: do not scale by 1e7, do not write `unit: deg_e7` | R27. |
| T3g | Style line: lat/lon `deg_e7` → `deg` | R27. |
| T3h | Spec-discipline line: "already states the ×1e7 conversion" → "the decimal-degree storage (R27)" | R27, and matches T1b's rewritten §15a text. |
| T3i | Rewrap of the read-first block after T3a | Cosmetic. |

Verified unchanged and correct: `session/mod.rs:233,278` really are
`from_f64_with_times` and `with_unit`.

### `brief-task4.md`

| # | Edit | Justification |
|---|---|---|
| T4a/T4b | Read-first: C1 §4.1 "(amended — `deg_e7`, …)" → decimal-degree GPS units per R27; ledger `R23` → `R23` **and** `R27`; `parquet.rs` lines `236–267` → `238–267` | R27. `write_session_parquet` starts at `rust/core/src/store/parquet.rs:238`. |
| T4c | `Cargo.lock:1297` → `Cargo.lock:1307` | The `fitparser` package block is at `rust/Cargo.lock:1307` today. |
| T4d | L2-R1 units: `deg_e7` → `deg` for lat/lon | C1 §4.1 as amended. |
| T4e | The `Q1` ruling block replaced by an `R27` block: `semicircles_to_deg` stays as drafted **and** the `push_channel` accessors stay as the plan drafts them (`\|r\| r.lat_deg`, `\|r\| r.lon_deg`, no `* 1e7`), `unit: deg` | R27. This is the largest substantive change in the refresh: the old brief instructed the implementer to add a ×1e7 multiply that R27 now forbids. |
| T4f | Golden-fixture assertions: `[450_000_000.0, 225_000_000.0, 112_500_000.0]` / `[-900_000_000.0, -450_000_000.0, 0.0]` → `[45.0, 22.5, 11.25]` / `[-90.0, -45.0, 0.0]`, plus "each channel's `unit` is `deg`" | R27; the plan's own values, restored. |
| T4g | "Do not" item rewritten: do not scale by 1e7 anywhere, do not write `unit: deg_e7` | R27. |
| T4h | Style line: lat/lon `deg_e7` → `deg` | R27. |
| T4i | Spec-discipline line: "the ×1e7 conversion" → "the decimal-degree storage (R27)" | R27. |
| T4j | Report-back line now also asks for confirmation that no ×1e7 or `deg_e7` string appears anywhere | Carries forward the L5 lesson recorded in "L5 LANDED": when a claim is corrected in one file, grep for it everywhere before calling it fixed. |
| T4k | "Keep (unaffected)" test note: dropped the now-false "Q1's scaling is applied at the call site" clause | R27 — there is no call-site scaling any more. |
| T4l/F3 | Rewrapping of two lines the edits ran long | Cosmetic. |

Verified unchanged and correct: `row_indices_for` at `parquet.rs:71`
(brief says 67–83), `recorded_us_array` at `parquet.rs:133` (brief says
133–140), `write_session_parquet`'s signature `(data_root, session,
importer_version)` unchanged, and the `seen_sources` first-channel-only loop
L2-R10 targets is still present at `parquet.rs:249–264`.

### `brief-task5.md` — no edits

Read in full. It cites no GPS unit, no commit hash, no line number, and no
symbol that has moved; its COMPUTE RULES are already a single targeted
`-p idl-rs import::csv::` filter. C1 §4.2's `csv` `source_kind` token and the
empty-string `unit` convention it depends on are still in the contract.

### `brief-task6.md`

| # | Edit | Justification |
|---|---|---|
| T6a | COMPUTE RULES: the `--workspace` ban now also names a bare `cargo test`, and cites the §8 hook (`de3cf95`) | "L5 LANDED" harness-gap note. The gate command itself was already correct (`-p idl-rs -p idl-rs-cli -- --test-threads=4`). |
| T6b | New paragraph in the Q2 ruling: L5's `rust/tauri/src/session_source.rs:38` (`load_session`) calls `synthesize_base_channels` on every session read back from `data.parquet`, so the fallback also fires for `eval_workbook`/`cursor_readout`/`fetch_tile`; the implementer must report it and must **not** add an `idl-rs-tauri` run without a lead ruling | Landed L5 code, verified today. This consumer did not exist when the brief was written. See question Q3. |
| T6c | `UnknownExtension` flag now names **L5 Task 9** (deferred to ride with L2 — R50, "L5 LANDED") and cites C3 **§3.3**'s `invalid_argument` for an unrecognised `importer_id` | R35/R50 and the L5 landing record. |
| T6d | Read-first gains C3 **§3.3** (`import_file`/`list_importers`) as the downstream shape, with an explicit "read it, do not build to it" and a one-line statement of the argument mismatch (path + `importer_id` vs extension + bytes) | Item 3 of the dispatch. See question Q1. |
| T6e | Read-first: ledger `R23` → `R23` (and `R27` for context — it changed no signature this task touches) | R27 landed between briefing and dispatch. |

Verified unchanged and correct in this brief: `store/parquet.rs:158` is
indeed the `channel_kind` `event`/`fixed-rate` line; `crate::store::atomic`'s
`sha256_hex` is `pub` (`atomic.rs:54`); `ParseResult.import_warnings` exists
(`session/mod.rs:385`) and is still read nowhere in `store/import.rs`, so
G0.6's silent drop is still live; `synthesize_base_channels`' bail-out guard
is still literally `if max_rate <= 0.0 || max_rate_len == 0 { return
Vec::new(); }` (`synthesis.rs:51`); `ImportReport`'s current fields are
`session_id`, `blob_sha256`, `data_parquet`, `outcome`,
`session_json_created`, `truncation_warning` (`import.rs:155–168`), and
`import_idl0`'s signature is `(&Path, &[u8]) -> Result<ImportReport,
ImportError>` (`import.rs:177`), both as the brief assumes.

### `review-STANDING.md`

| # | Edit | Justification |
|---|---|---|
| RSa | The `deg_e7` spec-conformance bullet inverted: GPS is physical decimal degrees for every source (R27, landed `7e10797`), `GPS_Altitude` metres, `GPS_Heading` degrees, and a leftover ×1e7 or `with_unit("deg_e7")` is now the **Critical** finding | R27. Left as written, this bullet would have failed correct code. |
| RSb | COMPUTE RULES: "No full suite" now names both `cargo test --workspace` and a bare `cargo test` as §8 hook-denied | CLAUDE.md §8 plus the `de3cf95` hook extension. |

---

## (b) Item 3 — L5 Task 9 (`import_file` Tauri command) findings

**There is no `import_directory` command.** C3 §3.3 "Import (L2)" defines
exactly two commands: `import_file(path, importer_id, progress)` and
`list_importers()`. Nothing named `import_directory` appears anywhere in C3,
in `rust/tauri/src/`, or in the ledger. The dispatch's phrasing
("`import_file`/`import_directory` commands") does not match the contract.

**The import commands do not exist yet.** `rust/tauri/src/commands/` contains
`catalog.rs`, `cursor.rs`, `device.rs`, `mod.rs`, `rasters.rs`, `tiles.rs`,
`workbook.rs`. There is no `import.rs`. That matches R50 and the "L5 LANDED"
entry: Task 9 was never implemented and rides with L2.

**No L5 `TODO(idl0)` constrains `import_file`.** Grepping `TODO(idl0)` across
`rust/tauri/src/` returns ten hits, all about other things: catalog `skipped`
reporting, per-call parquet re-reads (twice, including
`session_source.rs:23`), the sharded blob-path duplication and config parsing
in `device.rs`, raster resampling (twice), the `HostChannel` byte path, the
workbook scan cost, and per-row `context` binding. None mentions import. So
`session_source.rs` leaves the `import_file` shape unconstrained.

**But `session_source.rs` does constrain Task 6.** `load_session`
(`session_source.rs:31–40`) calls `synthesize_base_channels` on every session
it reads back from `data.parquet`. Task 6's Q2 fallback therefore changes
behaviour for every FIT/GPX/CSV session loaded through `eval_workbook`,
`cursor_readout`, `fetch_tile` and `fetch_raster` — a behavioural change in a
landed crate that `cargo check` cannot detect and this lane's gate does not
test. Recorded in the brief (edit T6b) and raised as question Q3.

**Three genuine mismatches between core `import_file` (L2-R13) and C3 §3.3**,
all of which land on Task 9 rather than on L2, and none of which I decided:

1. **Selector.** C3's command takes `importer_id: string | null` (`null` =
   extension auto-detect, otherwise one of `list_importers`' ids). L2-R13's
   core function takes an `extension: &str`. Task 9 must translate. See Q1.
2. **`.idl0` routing.** L2-R13 explicitly says core `import_file` does not
   handle `"idl0"`; that stays `import_idl0`. But C3 §3.3's single
   `import_file` command lists `parse_invalid_magic_bytes`,
   `parse_unsupported_schema_version` and `parse_truncated_record` among its
   errors, i.e. it is expected to accept `.idl0`. Task 9 must branch. See Q1.
3. **Return type.** C3 §3.3 resolves with `SessionSummary` (§3.2), which is a
   **catalog row** — `store::catalog_read::SessionSummary` carries
   `created_at_ms`, `lap_count`, `duration_ms`, `rider`/`bike`/`venue_name`
   and friends. Core `import_file` returns `ImportReport` and, like
   `import_idl0`, never touches the catalog (today only `idl-rs-cli`'s
   `cmd_import` rebuilds it, `cli/src/main.rs:1010`). Task 9 needs a catalog
   step. See Q4.

**No breakage from Task 6's new `pub` surface.** `ImportErrorKind` is not
matched anywhere outside `rust/core/src/store/import.rs` (grepped
`cli/src`, `tauri/src`, `core/src`), and `ImportReport` is only read, never
constructed, outside core. So adding variants and a field is additive for
both `idl-rs-cli` and `idl-rs-tauri`, and the brief's mandated
`cargo check -p idl-rs-cli --tests` remains the right check.

**`list_importers` has no core backing.** Core will have
`import::importer_for_extension` (Task 3) and per-importer
`importer_version()` (Task 2, L2-R4), but nothing that enumerates
`{ id, label, extensions }`. See Q2.

---

## (c) Questions for the lead

No `runs/2026-09-03/questions.md` exists, so these are raised here, in that
template's shape. **Nothing below was decided; the affected brief text was
left as written except where an edit is named.**

### Q1 — Does L2 change core `import_file`'s signature to serve C3 §3.3, or does L5 Task 9 adapt?

- **Where:** `brief-task6.md` (L2-R13); C3 §3.3, spec lines 443–452.
- **Context:** L2-R13 specifies `import_file(data_root, extension: &str, bytes: &[u8])` and explicitly refuses `"idl0"`. C3 §3.3's command is `import_file(path, importer_id: string | null, progress)` and lists the three `parse_*` errors, so it must accept `.idl0` too. Someone has to bridge id → extension and branch `.idl0` → `import_idl0`.
- **Blast radius:** structural — it fixes a `pub` signature in `core` that Task 9 and every later import caller build on.
- **Options:** (A) leave L2-R13 as ruled; Task 9 does the id→extension mapping and the `.idl0` branch in the Tauri layer. (B) widen core `import_file` to take an importer id and absorb `.idl0`, making it the single entry point.
- **Recommendation:** (A). The `.idl0` path has its own landed entry point, its own R18 ordering invariant and its own tests; folding it in mid-lane rewrites working code for no user-visible gain. Routing on a file extension is a UI-adjacent decision, which CLAUDE.md §2 puts above `core`. If Task 9 later wants one call, it can add a thin `core` router then, with both halves already tested.
- **Affected outputs:** none marked PROVISIONAL — `brief-task6.md` states the mismatch (edit T6d) without changing L2-R13.

### Q2 — Where does `list_importers()`'s `{ id, label, extensions }` registry live?

- **Where:** C3 §3.3 `list_importers`; `rust/core/src/import/mod.rs` (Task 2/3).
- **Context:** C3 requires `ImporterInfo[]` with a stable id, a human label and an extension list. Core will only have `importer_for_extension` and per-importer version constants. No brief in this lane creates a registry, and nothing in the lane needs one.
- **Blast radius:** structural — the id strings become an IPC vocabulary the frontend routes on, and `import_file`'s `importer_id` argument is validated against them.
- **Options:** (A) L2 adds a small `pub fn importers() -> &'static [ImporterInfo]` in `core::import`, and `importer_for_extension` is derived from it. (B) Task 9 hardcodes the four rows in the Tauri crate.
- **Recommendation:** (A), but as a Task 7 or a Task 9 Step 0, not by widening any of Tasks 2–6. The id/extension pairing is a property of the importer set, which lives in `core`; two copies of that table (one for dispatch, one for display) is exactly the drift `review-STANDING.md` already calls a finding.
- **Affected outputs:** none. No brief was changed for this.

### Q3 — Must Task 6 run an `idl-rs-tauri` test filter, given Q2's fallback reaches `session_source::load_session`?

- **Where:** `rust/tauri/src/session_source.rs:38`; `brief-task6.md` Q2 ruling.
- **Context:** `load_session` calls `synthesize_base_channels` on every session read back from parquet, so Q2's new fallback changes what `eval_workbook`/`cursor_readout`/`fetch_tile`/`fetch_raster` see for event-driven sessions. The signature does not change, so `cargo check` proves nothing, and §8 caps the lane at `-p idl-rs -p idl-rs-cli`.
- **Blast radius:** structural — it changes the lane's merge gate, on a memory-bound machine.
- **Options:** (A) no extra run; the implementer reports the reach and the lead decides at the merge gate. (B) add one `cargo test -p idl-rs-tauri session_source` to Task 6. (C) add it to the merge gate for the whole lane.
- **Recommendation:** (A), with the reporting obligation already written into the brief (edit T6b). L5's own landed tests build fixed-rate sessions, so the fallback branch should not fire in them at all; paying for the Tauri dependency graph to prove a no-op is the wrong trade at 16 GB. Revisit at the gate if Task 6's report says otherwise.
- **Affected outputs:** none marked PROVISIONAL; `brief-task6.md` tells the implementer to report and not to add the run unilaterally.

### Q4 — Who updates the catalog after a non-`.idl0` import?

- **Where:** C3 §3.3 (return `SessionSummary`); `rust/core/src/store/import.rs`; `rust/core/src/store/catalog_read.rs`.
- **Context:** C3's `import_file` resolves with a `SessionSummary`, which is a catalog row (`created_at_ms`, `lap_count`, `duration_ms`, …). Neither `import_idl0` nor L2-R13's `import_file` touches the catalog; only `idl-rs-cli`'s `cmd_import` rebuilds it afterwards.
- **Blast radius:** structural — it decides whether "the catalog is an index" stays a rebuild-only artifact or gains an incremental-insert path.
- **Options:** (A) Task 9's Tauri command calls `rebuild_catalog` after a successful import, then reads the row back via `catalog_read::get_session`. (B) core gains an incremental `catalog::insert_session`. (C) `import_file` returns `ImportReport` on the wire and C3 §3.3 is amended.
- **Recommendation:** (A) for wave 1. It reuses landed code, keeps the catalog rebuildable-by-construction, and the cost is bounded at wave-1 data sizes. (B) is the real answer eventually and should be a recorded deferral, not this lane's work.
- **Affected outputs:** none. No brief was changed for this.

### Q5 — Should `pre-read-tasks1-6.md` be annotated for R27?

- **Where:** `runs/2026-09-03/lanes/l2-importers/pre-read-tasks1-6.md`, lines 44–46 and 328–331.
- **Context:** The pre-read still argues for `deg_e7` (its Q1), and every task brief tells the implementer to read the pre-read's own section for that task. I edited only the brief files; `brief-task3.md` and `brief-task4.md` now warn that the pre-read's Q1 discussion predates R27 (edits T3b, T4b). The pre-read itself is untouched.
- **Blast radius:** contained — one survey artifact, and the briefs already carry the correction.
- **Options:** (A) leave it as the historical record it is. (B) add a one-line SUPERSEDED banner at the top.
- **Recommendation:** (B), one line, same treatment C1 §4.1 got for its own R23 paragraph. Two briefs currently have to say "ignore that part," which is a load-bearing instruction sitting in the wrong file.
- **Affected outputs:** none.

---

## Cross-checks run (no finding produced)

- Every file path, symbol and line number cited by an edited brief was
  checked against the working tree: `session/mod.rs:17,233,278,385`,
  `store/parquet.rs:71,133,158,238,249–264`, `store/atomic.rs:54`,
  `store/import.rs:155,177`, `session/synthesis.rs:29,48,51`,
  `parse/mod.rs:29` (`IDL0_IMPORTER_VERSION = "0.1.0"`),
  `store/catalog.rs:29–41` (`CatalogErrorKind::{Io, Sql, NotFound}`, R46),
  `store/catalog_read.rs` (R40's seven read functions),
  `tauri/src/session_source.rs:38`, `cli/src/main.rs:994,1010`,
  `~/.cargo/config.toml` (`jobs = 2`), `rust/Cargo.lock` (`fitparser 0.9.0`,
  `quick-xml 0.41.0`), `rust/core/Cargo.toml:27`.
- `Channel`'s eight fields are `channel_id`, `t_us`, `t_recorded_us`,
  `nominal_rate_hz`, `column`, `source_kind`, `unit`, `gaps` — as every brief
  assumes. No brief needed a change for this.
- `catalog_read.rs` and `CatalogErrorKind::NotFound` are new since the briefs
  were written, but no L2 brief references the catalog at all, so nothing was
  stale there.
- COMPUTE RULES sections re-read in all six task briefs: every one names a
  targeted `-p idl-rs` filter with the non-zero-`passed` rule; only Task 6
  names a full-suite command, and it already names the correct §8 gate. No
  brief contained `cargo test --workspace` after the `BRIEF.md` fix.
- Grepped all seven edited files for `deg_e7`, `1e7` and `--workspace`
  afterwards: every surviving occurrence is either a historical reference
  ("superseded by R27") or a prohibition. No instruction to produce `deg_e7`
  remains anywhere in the lane's briefs.
