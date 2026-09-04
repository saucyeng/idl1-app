# L2 Task 5 — implementer brief (CSV importer)

You are the implementer for L2 Task 5 of the idl1 rewrite — the trivial CSV
importer (design doc D4, low priority). TDD, ONE commit, then report. This
is the smallest of the three format tasks.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers`,
  branch `wave1-l2-importers`, HEAD must be Task 4's commit (given in the
  dispatch message), status clean. Verify first; if not, stop and report.
  Leave `.cargo/config.toml` alone.
- Work ONLY there. Do NOT touch the shared checkout
  (`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`), `idl1-app`
  beyond READING files named below, or any other worktree. Do NOT edit
  `docs/`. Do NOT push.
- Read first: `CLAUDE.md`; the L2 plan's `### Task 5`
  (`docs/superpowers/plans/2026-09-03-idl1-wave1-l2-importers.md`, lines
  1396–1607 — your starting point, **with the corrections below applied**);
  contract C1 §3.1, §4.1, §4.2 (already amended — `csv` `source_kind` token,
  empty-string `unit` convention, `csv_t_recorded_us`'s union-of-channels
  note); the pre-read `pre-read-tasks1-6.md`'s Task 5 section (G5.1–G5.5);
  ledger `R23`; Task 2's landed `src/import/mod.rs`/`error.rs`.

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; do not
override). `cargo build -p idl-rs`, then `cargo test -p idl-rs import::csv::`.
Non-zero `passed` required (standing rule, L3-R8). No full suite, no
tarpaulin, no `-j`, no `.cargo/` edits, never `cargo fmt`. One cargo process
at a time, foreground. `cargo check -p idl-rs-cli --tests` NOT required this
task.

## Rulings that change the plan's drafted code

**L2-R1 — no `Channel {}` struct literal.** Build every channel via
`Channel::from_f64_with_times(name, 0.0, values, t_us, "csv")` (plan:1496's
bare struct literal is missing `t_recorded_us`/`unit` — same class as
G3.1/G4's Channel-literal gap). **No `.with_unit(..)` call needed** —
`from_f64_with_times` already defaults `unit` to the empty string, which is
exactly L2-R11's requirement below; calling `.with_unit("")` explicitly is
redundant, not wrong, but skip it for a cleaner diff.

**L2-R7(a) — `t0` is the minimum `t_seconds` across every data row, not the
first row's.** Plan:1458's `first_t_seconds.get_or_insert(t_seconds)`
anchors on whichever row is read first, which is only correct if the file
happens to be sorted by `t_seconds` — not guaranteed (G5.3: "each channel
column is deduplicated independently... monotonic non-decreasing is not
required" for the file as a whole). A later row with a smaller `t_seconds`
than an earlier one currently produces a negative `t_us` for every sample on
it, violating C1 §3.1/§3.5. Fix: **two passes** (or track a running
minimum across the existing single pass and defer all `t_us` computation to
a second pass over already-parsed `(row_idx, t_seconds, cells)` tuples) —
compute `first_t_seconds = min(t_seconds over every data row)` before
computing any row's `t_us`. `Session.timestamp_utc_ms` stays `0` regardless
(§15a.4 — CSV has no wall-clock anchor at all; this is not the FIT/GPX
epoch-anchor case, don't conflate the two).

**L2-R11 — header validation; `source_kind`/`unit`.** Reject
(`CsvMalformed`) a header where: the first column isn't literally
`t_seconds` (plan already does this); any *other* column is named `t`,
`Time`, or `Distance` (collides with the Parquet union-axis column or the
synthesized base channels — G5.4); or any column name (including
`t_seconds` itself) is duplicated within the header (two Arrow fields with
the same name — G5.4). Add these two checks to Step 1's header-parsing
block, before computing `channel_names`. `unit` is the empty string for
every CSV channel (free, via `from_f64_with_times`'s default — see L2-R1
above); `source_kind` is `"csv"` (plan already has this correct).

## The task (plan Task 5, Steps 1–4, corrected)

- [ ] **Step 1: Write `src/import/csv.rs`** — plan:1409–1576's code as your
  base (the comma-split parsing, per-cell `Option` semantics via empty-cell
  skip, per-column dedup-and-warn logic are all correct as drafted and
  unaffected by any ruling above). Apply L2-R1 (constructor, not struct
  literal), L2-R7(a) (two-pass minimum), and L2-R11 (header guards) to
  `Importer::import`'s body. Rename `ImportOutcome`/`ImportWarning` →
  `ImportedSession`/`ImporterWarning` (Task 2's L2-R2). Add
  `const CSV_IMPORTER_VERSION: &str = "0.1.0";` (doc-commented, C1 §4.3) and
  implement `importer_version()` (Task 2's L2-R4).
- [ ] **Step 2: Wire `csv` into `import/mod.rs`** — plan:1580–1590,
  unchanged.
- [ ] **Step 3: Build and test** — `cargo build -p idl-rs`, then
  `cargo test -p idl-rs import::csv::` per COMPUTE RULES.
- [ ] **Step 4: Commit** — explicit paths (NOT `git add -A`):
  `git add src/import/mod.rs src/import/csv.rs` — message
  `core: CsvImporter — trivial t_seconds+channel-columns shape (D4, low priority)`.
  Single line, no AI attribution trailer.

## Tests (extend the plan's three, per the rulings above)

Keep, adjusted only if the L2-R1 rename touches field access (it shouldn't —
`materialize()`/`t_us` are unaffected):
`csv_importer_golden_fixture_maps_columns_and_drops_duplicate_row`,
`csv_importer_missing_header_returns_typed_error`,
`csv_importer_no_data_rows_returns_typed_error`. Add:
- L2-R7(a): a CSV whose rows are **not** sorted by `t_seconds` (e.g. row 0
  has `t_seconds=1.0`, row 1 has `t_seconds=0.0`) produces `t_us[0] == 1e6`
  (not `0`) and `t_us[1] == 0` (not negative) — i.e. the minimum anchors
  `t=0` regardless of row order.
- L2-R11: a header containing a column literally named `t`, `Time`, or
  `Distance` returns `CsvMalformed`; a header with a duplicated column name
  (e.g. `t_seconds,a,a`) returns `CsvMalformed`.
- Confirm (assert directly, don't just rely on the constructor default) that
  an imported channel's `unit` field is the empty string.

## Do not

- Do not use `Channel {}` struct literal syntax (L2-R1).
- Do not anchor `t0` on the first row encountered (L2-R7(a)) — the minimum
  `t_seconds` across every row.
- Do not accept a header column named `t`/`Time`/`Distance`, or a duplicated
  column name (L2-R11).
- Do not set `Session.timestamp_utc_ms` to anything but `0` — CSV has no
  epoch source, unlike FIT/GPX.

## Style / hygiene

Doc comment on every public symbol; units on every numeric value (`t_us`
µs); typed errors only; A/A/A tests named `thing — condition — result`;
match surrounding hand-formatted style.

## Spec discipline (say it out loud in your report)

"no spec change needed" — Task 1's §15a.4 already fixes this shape; C1
§4.2's `csv` token/empty-`unit`/union-of-channels amendments (already
signed) are what L2-R11 and Task 4's `parquet.rs` fix (L2-R10) together
implement for CSV's own `csv_t_recorded_us` column — no further contract
text needed from this task.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line
(`passed` count); per-step done/deviated; confirmation the two-pass minimum
is in place and the out-of-order test passes; confirmation both header
guards reject as specified; confirmation no `Channel {}` struct literal
remains; anything ambiguous you resolved (say how) or that needs a lead
ruling (stop and report instead of guessing — CLAUDE.md §1).
