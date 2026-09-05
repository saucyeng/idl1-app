# L2 Task 5 review — CSV importer + fit.rs/parquet.rs follow-up

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers`,
branch `wave1-l2-importers`. Commits under review: `af4cd99764c6247e0e3ec5b5868836da6228904b`
("core: CsvImporter -- trivial t_seconds+channel-columns shape (D4, low
priority)") and its follow-up `227d3f1b643343b9530cab032f4afdba98e60eca`
("core: fit.rs -- explain three safe unwraps, fix stale recorded_us_array
doc (Task 4 review follow-ups)"). Worktree status is clean at HEAD `227d3f1`,
nothing else present. `af4cd99` touches exactly `core/src/import/csv.rs`
(new, 305 lines) and `core/src/import/mod.rs` (2 lines, `pub mod csv;` +
one match arm) — nothing else, matching the brief's authorized file list
exactly (`git add -A` not used). `227d3f1` touches exactly `core/src/import/fit.rs`
(18 changed lines: three bare `.unwrap()` → `.expect(...)`) and
`core/src/store/parquet.rs` (15 changed lines: `recorded_us_array`'s doc
comment rewritten) — exactly the two files Task 4's review Minors named, no
more. No `docs/` changes in this worktree. Nothing outside these four files
touched.

## Test command and result

Not re-run (CLAUDE.md §8 / standing brief: readers verify statically, do not
build — the harness denies a reviewer's cargo invocation outright since
2026-09-05). Implementer reports:

- `cargo build -p idl-rs` — clean.
- `cargo test -p idl-rs import::csv::` — `6 passed; 0 failed`.
- `cargo test -p idl-rs import::fit::` — `4 passed; 0 failed`.

Static trace: `core/src/import/csv.rs` has exactly 6 `#[test]` functions
(`csv_importer_golden_fixture_maps_columns_and_drops_duplicate_row`,
`csv_importer_missing_header_returns_typed_error`,
`csv_importer_no_data_rows_returns_typed_error`,
`csv_importer_out_of_order_rows_anchors_t0_to_file_wide_minimum`,
`csv_importer_reserved_column_name_returns_typed_error`,
`csv_importer_duplicated_column_name_returns_typed_error`) — matches
`import::csv:: 6 passed` exactly, a genuine count not a "filter matches
nothing" false pass. `core/src/import/fit.rs` still has exactly 4 `#[test]`
functions (227d3f1 only touches production code, not the test module) —
matches `import::fit:: 4 passed` exactly, confirming the `.expect()`
rewrite didn't change fit.rs's own test behaviour. Each test's assertions
were hand-traced against the production code (below) rather than taken on
report.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|

No Critical, Important, or Minor findings.

## Checks performed (all pass)

- **§15a.4 input shape.** Header `t_seconds,<channel>,...`, comma-separated,
  no quoting/escaping — `csv.rs:30` (`header.split(',')`) and `csv.rs:69`
  (`line.split(',')`) match. First column must be literally `t_seconds`
  (`csv.rs:31`). Empty cell ⇒ no sample, not zero (`csv.rs:107-109`,
  `if cell.is_empty() { continue; }`). `t_us[row] = round((t_seconds[row] −
  t_seconds[first_row]) × 1e6)` (`csv.rs:138`,
  `((t_seconds - first_t_seconds) * 1_000_000.0).round() as i64`) — matches
  the spec formula exactly. `Session.timestamp_utc_ms = 0` unconditionally
  (`csv.rs:159`) — never derived from anything, matching L2-R7(a)'s "stays 0
  regardless" instruction and distinguishing CSV from FIT/GPX's epoch-anchor
  case.
- **L2-R11 header guards.** Reserved-name loop (`csv.rs:42-48`) rejects any
  non-first column literally named `t`/`Time`/`Distance` with
  `CsvMalformed`; duplicate-name loop (`csv.rs:49-56`) rejects any repeated
  column name including a duplicated `t_seconds`, via a `HashSet` over
  *all* columns (not just `columns[1..]`). Both run before `channel_names`
  is computed, per the brief's placement instruction. Both dedicated tests
  (`csv_importer_reserved_column_name_returns_typed_error`,
  `csv_importer_duplicated_column_name_returns_typed_error`) hand-traced:
  each constructs a header that trips exactly one guard and asserts
  `Err(CsvMalformed(_))` — genuinely discriminating (a header without the
  offending column would pass).
- **Event-driven metadata.** Every channel built with `nominal_rate_hz =
  0.0` (`csv.rs:144`, second arg to `from_f64_with_times`) and `source_kind
  = "csv"` (`csv.rs:147`) — matches C1 §4.2's amended `csv` token and
  event-driven convention (ruling R23/§15a.4).
- **L2-R1 (constructor, not struct literal).** Every channel built via
  `Channel::from_f64_with_times(name.to_string(), 0.0, values, t_us, "csv")`
  (`csv.rs:142-148`) — grepped the whole file for `Channel {`/`Channel{`,
  no hits. No `.with_unit(..)` call, matching the brief's explicit "skip it
  for a cleaner diff" instruction. Read `Channel::from_f64_with_times`'s
  actual body (`core/src/session/mod.rs:233-250`): it defaults `unit:
  String::new()` — confirms the empty-string unit claim is a property of
  the constructor, not an assumption. `csv_importer_golden_fixture_...`
  asserts `a.unit == ""` and `b.unit == ""` directly (`csv.rs:201,211`),
  per the brief's instruction not to just rely on the default silently.
- **L2-R7(a) (two-pass minimum, not first-row anchor).** First pass
  (`csv.rs:67-88`) parses every data row into `(row_idx, t_seconds, cells)`
  while tracking `min_t_seconds` via `Some(match ... m.min(t_seconds) ...)`
  — never anchoring on the first row read. `first_t_seconds` is only
  computed once this pass completes (`csv.rs:90-93`), before any `t_us` is
  derived. The added test
  (`csv_importer_out_of_order_rows_anchors_t0_to_file_wide_minimum`,
  `csv.rs:247-271`) uses a file where row 0 has the larger `t_seconds`
  (`1.0`) and row 1 has the true minimum (`0.0`); hand-computed: min =
  `0.0`, so row 0 (val `10.0`) gets `t_us = (1.0-0.0)*1e6 = 1_000_000` and
  row 1 (val `20.0`) gets `t_us = (0.0-0.0)*1e6 = 0` — matches the test's
  asserted `a.t_us == [0, 1_000_000]`, `a.materialize() == [20.0, 10.0]`
  exactly (ascending-time order, per C1 §3.5 invariant 1, not document
  order).
- **The added sort (`csv.rs:101`), not explicitly demanded by the brief but
  introduced by the implementer to make the per-channel dedup loop
  comparison-order-correct.** Verified this doesn't violate §15a.4: the
  spec section contains no "document order preserved" requirement — it only
  says "each channel column is deduplicated independently" and that the
  file-wide order "is not required" to be monotonic. C1 §3.4 (which §15a.4
  explicitly incorporates by reference for the dedup rule) says duplicate
  handling drops "the *later* duplicate sample" — later in time, which only
  has a well-defined meaning once rows are processed in ascending
  `t_seconds` order; sorting first is the correct implementation of that
  rule, not a deviation from it. The sort is stable
  (`Vec::sort_by`, Rust's guaranteed-stable sort) and compares via
  `partial_cmp(...).unwrap_or(Equal)` — this can only return `None` (and
  fall back to `Equal`, preserving original relative order for that pair)
  if a `t_seconds` value is `NaN`, which requires the literal string `nan`/`NaN`
  in the CSV; Rust's `f64::from_str` does accept that, so this path is
  reachable but is not spec-relevant (CSV files are `f64`-parsed elsewhere
  too) and does not panic. Both channels' final output order is by
  ascending `t_us` (matching C1 §3.5 invariant 1 for the eventual
  `data.parquet` layout), so sorting is the *correct* behaviour here, not
  merely a benign side effect — this does not need a lead ruling.
- **Per-channel dedup after the sort is equivalent to the pre-sort
  single-pass dedup for already-sorted input.** Traced: for a channel
  whose column is sorted ascending by construction (any subsequence of a
  globally-sorted-by-`t_seconds` sequence is itself sorted), the running
  `last.0` comparison at `csv.rs:117-125` correctly identifies and drops
  the later of any equal/non-increasing pair, with a warning naming the
  row and column (`csv.rs:119-122`) — never silently dropped. The golden
  fixture's duplicate-row test confirms two independent per-channel
  warnings for the same duplicated `t_seconds=1.0` row (columns `a` and
  `b` both hit it), asserting `outcome.warnings.len() == 2` — hand-computed
  correctly (see below).
- **Golden fixture hand-computed.** `t_seconds,a,b` /
  `0.0,10.0,1.0` / `1.0,11.0,2.0` / `1.0,12.0,3.0` / `2.5,13.0,` — already
  ascending, sort is a no-op. Column `a`: rows kept at `t_seconds` `0.0,
  1.0, 2.5` (second `1.0` row dropped, one warning), giving `t_us = [0,
  1_000_000, 2_500_000]`, values `[10.0, 11.0, 13.0]` — matches the test's
  assertion exactly. Column `b`: rows kept at `0.0, 1.0` (second `1.0` row
  dropped, one warning; the last row's `b` cell is empty and skipped before
  reaching the dedup check, contributing no warning), giving `t_us = [0,
  1_000_000]`, values `[1.0, 2.0]` — matches exactly. Total warnings = 2,
  matching the asserted count.
- **Out-of-order test's own hand-computation** — see L2-R7(a) bullet above;
  confirmed correct.
- **No `Channel {}` literal, no redundant `.with_unit`.** Confirmed by grep
  (see L2-R1 bullet).
- **`CSV_IMPORTER_VERSION` / `importer_version()`.** Const defined
  (`csv.rs:11`), doc-commented with a reference to C1 §4.3;
  `importer_version(&self) -> &'static str` returns it directly
  (`csv.rs:169-171`).
- **`"csv"` in `importer_for_extension`, no `importers()` registry.**
  `mod.rs`'s only change is `pub mod csv;` plus one new match arm `"csv" =>
  Some(Box::new(csv::CsvImporter))` — minimal, no registry function added,
  consistent with Task 3/Task 4's identical treatment of `gpx`/`fit` and
  R51 Q2's deferral of a registry to the not-yet-dispatched Task 7.
- **Typed errors only.** Every failure path returns `ImporterError::CsvMalformed`
  or `ImporterError::NotUtf8` (both pre-existing variants from Task 2's
  `error.rs`, not redeclared) — grepped for `Err(String)`/`panic!`/bare
  `.unwrap()` on production-path data in `csv.rs`: none found. The single
  `.unwrap_or(...)` (the sort comparator, discussed above) is not on an
  `Option`/`Result` from parsed data in the failure-prone sense — it's a
  total function over a comparison result, defensive against NaN, not a
  panic risk.
- **No panic on malformed input, traced (not all explicitly tested, see
  below).** Ragged row (`cells.len() != columns.len()`) → `CsvMalformed`
  (`csv.rs:70-76`), not tested by a dedicated test but not required by the
  brief's test list either; non-numeric `t_seconds`/cell value →
  `CsvMalformed` via `.parse().map_err(...)` (`csv.rs:77-82`, `csv.rs:110-115`),
  same — not dedicated-tested, not brief-required; empty file (0 lines
  after blank-line filtering) → `CsvMalformed("empty file")`
  (`csv.rs:27-29`) — the closest existing test
  (`csv_importer_no_data_rows_returns_typed_error`) covers header-only, not
  fully-empty input, so a genuinely-empty-byte-string case is untested;
  CRLF is handled correctly by Rust's `str::lines()`, which splits on both
  `\n` and `\r\n` by contract; a UTF-8 BOM prefix on the header line is not
  stripped anywhere, so a BOM'd file's first cell would read
  `"\u{FEFF}t_seconds"` and fail the `columns[0] != "t_seconds"` check with
  a typed `CsvMalformed` — safe (no panic), just stricter than a
  BOM-tolerant importer might be. None of these four untested paths (empty
  file, ragged row, non-numeric cell, BOM) is a functional defect: every
  one is traced to a typed-error return, never a panic or silently-wrong
  output, and none is in the brief's mandated test list (which only adds
  the L2-R7(a) and L2-R11 tests on top of the three plan-drafted ones) — a
  coverage gap, not a correctness bug, so not raised as a table finding.
- **Doc comments / units.** Module doc (`csv.rs:1-4`), `CsvImporter`
  (`csv.rs:13-16`), `CSV_IMPORTER_VERSION` (`csv.rs:10`) all doc-commented;
  no other public symbols in this file. Trait method impls (`import`,
  `source_format`, `importer_version`) are undocumented at the impl site,
  matching `gpx.rs`/`fit.rs`'s identical convention (doc lives on the trait
  definition in `mod.rs`) — not a deviation.
- **Test naming/shape.** All six tests are Arrange/Act/Assert with blank
  lines between sections, named `thing_condition_result` (underscore-joined,
  per the standing brief's note that literal em dashes aren't valid
  identifiers), each with a `///` comment giving the literal
  `thing — condition — result` form above it. Each asserts concrete,
  traceable values (exact `t_us`, exact `materialize()` output, exact
  `unit`, exact warning count, or the specific typed-error variant) — none
  is a bare "does not panic" test.
- **Task 4 review follow-ups (`227d3f1`) fully closed.** Both Minors from
  `review-task4.md` are closed exactly as prescribed: all three bare
  `.unwrap()`s on `r.timestamp_utc_s` in `fit.rs` (lines 132, 139, 159 in
  the pre-fix version) are now `.expect("timestamp_utc_s is Some -- records
  without one were dropped above")`, matching the sibling `.expect(...)`
  calls' existing pattern in the same function one line later, byte-for-byte
  consistent across all three call sites. `parquet.rs`'s `recorded_us_array`
  doc comment no longer asserts the disproven "one call per source, they
  all share `t_us`" invariant — it now correctly describes the per-channel,
  caller-merges-with-first-fill-wins usage L2-R10 introduced, and cites
  L2-R10/C1 §3.2 directly. Neither commit changed any test, matching the
  reported unchanged `import::fit:: 4 passed` count.
- **Hygiene.** Both commits are single-line messages, no AI-attribution
  trailer. `git show --stat` for each matches the expected file list
  exactly, `git add -A` not used. No reformatting outside touched/added
  lines — `csv.rs` is entirely new content; `mod.rs`'s diff is two
  surgical additive lines; `fit.rs`'s diff is a surgical three-site
  `.unwrap()` → `.expect()` replacement; `parquet.rs`'s diff is a
  surgical doc-comment rewrite only. Nothing under `docs/` touched in this
  worktree; the shared checkout and other worktrees untouched (not
  inspected further here since the dispatch's scope is this worktree only).

## Verdict rationale

The CSV importer lands every ruling in the brief correctly: L2-R1's
constructor-only channel construction (with the brief's own "skip
`.with_unit`" shortcut correctly taken), L2-R7(a)'s genuine two-pass
file-wide minimum (not first-row anchor, hand-traced and test-confirmed
with an out-of-order fixture), and L2-R11's two header guards (reserved
name, duplicate name), each backed by a dedicated test that would fail if
its behaviour regressed. The one design choice beyond the brief's literal
text — sorting rows by `t_seconds` before the per-channel dedup pass — was
checked against §15a.4 and C1 §3.4/§3.5 directly and found to be the
*correct* implementation of the "drop the later duplicate, output in
ascending time order" rule those sections already require, not an
unauthorized deviation, so it does not need a lead ruling. The golden
fixture's warning count and both channels' `t_us`/values were hand-computed
independently and match the test's assertions exactly. `227d3f1` fully and
verifiably closes both of Task 4's review Minors, with no test-count change.
The only gaps found — four untested-but-safely-typed-error edge cases
(fully empty file, ragged row, non-numeric cell, BOM prefix) — are traced
to typed errors with no panic risk and are not in the brief's mandated test
list, so they don't rise to a table finding. This ships as is.

VERDICT: CLEAN
