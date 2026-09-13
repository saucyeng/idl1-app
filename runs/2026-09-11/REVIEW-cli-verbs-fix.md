# Review: cli-verbs fix for the `--main-lap` / silent-whole-session finding

Commits reviewed:
- rust `11c9e99` — `cli: --main-lap, so a lap-scoped cell is not silently the whole session`
  (`idl-rs-worktrees/cli-verbs`)
- app `7920382` — `runs: C6 records the lap-context rule and the dry-run asymmetry`
  (`idl1-app-worktrees/cli-verbs`)
- app `1a0deda` — `cli: regenerate the reference and the table copy for --main-lap`
  (`idl1-app-worktrees/cli-verbs`)

Files touched:
- `core/src/commands/lap_ops.rs` (new), `core/src/commands/mod.rs`, `core/src/commands/table.rs`
- `cli/src/verbs/workbook.rs`, `cli/src/verbs/mod.rs`
- `docs/superpowers/specs/2026-09-11-idl1-c6-cli.md`, `runs/2026-09-11/REVIEW-cli-verbs.md`
- `CHANGELOG.md`, `app/src/shell/cliTable.json`, `docs/CLI-REFERENCE.md`

Test command: none run per instructions (Rust lane — no cargo invoked). Gates already
reported green by the dispatch: core 1507 passed, cli 101 passed, `cargo check -p idl-rs-cli
--tests` and `cargo check -p idl-rs-tauri --lib` clean. Verified statically only.

No TypeScript files were touched by the app-side commits (JSON/Markdown/docs only), so no
vitest/tsc gate applies to this follow-up.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `cli/src/verbs/workbook.rs:323-390` | The new CLI-layer branches (`--main-lap` without `--track` → usage error, negative/oversized `--main-lap` → usage error, unknown lap → not_found mapping, the stderr note) have zero direct tests. Only the pure `core::commands::lap_ops::lap_context` function is unit-tested (thoroughly); the glue that turns `Option<i64>` into `MainLap` and maps `lap_ops`'s `Err(Vec<u32>)` into a `CliError` is untested. A regression here (e.g. wrong `ErrorKind`, dropped usage check) would not be caught by the suite. | Add 2-3 tests around `lap_context`/`session_context` in `workbook.rs` (or a thin integration test) covering: `--main-lap` without `--track` is a usage error; an out-of-range lap number surfaces `ErrorKind::NotFound` with the right `available_lap_numbers`. |
| Minor | `cli/src/verbs/workbook.rs:366-369` | `--main-lap 0` passes `u32::try_from(0)` (0 is a valid `u32`) so it never hits the "must be a positive lap number" usage error; it instead falls through to the `NotFound` "available lap numbers" error from `lap_ops`. The end result is still a rejection with a sane message, just not the one the usage-error text promises for non-positive input. | Reject `0` explicitly alongside negative values if "positive" is meant literally, or reword the usage message to cover only the true failure mode (negative/overflow). |

## Verification notes

1. **Does the fix close the hole?** Yes. `core::commands::lap_ops::lap_context` now fills all
   four `MathLapContext` fields the buggy version left half-built: `main_lap_bounds`,
   `main_sectors` (flattened in arrival order, matching `sector_number()`'s counting order),
   `main_lap_number`, and it never touches `baseline_row` (correctly documented as the table's
   Main row, not a lap). It errors with the available lap numbers when the named lap does not
   exist, closing the exact "silently becomes whole-session" failure mode the previous reviewer
   found. `cli/src/verbs/workbook.rs::lap_context` calls into it and correctly threads
   `--main-lap` through; `session_context` correctly rejects `--main-lap` given without
   `--track`.

2. **Is "no default, warn on stderr" defensible given `--session` is a file path?** Verified by
   reading `core/src/commands/table.rs`: all four workbook rows that gained `MAIN_LAP_FLAG`
   (`check`, `eval`, `data`, `export`) have `data_dir: false`, and `cli/src/main.rs::load` calls
   `SessionHandle::from_path`, which reads the named file directly (`std::fs::read`) — there is
   no `--data-dir` flag on these rows and no session-id resolution path for them. So for the
   workbook verbs `--session` really is always a `.idl0` file with no `session.json` alongside
   it to read a `main_lap_number` from (that field lives in `core/src/store/catalog_read.rs`'s
   catalog-backed session doc, used by the `data_dir: true` rows like `track detect`, which
   this fix does not touch). The earlier reviewer's suggestion doesn't apply to this code path;
   "no default, note on stderr, typed not_found on a bad name" is the right call here.

3. **Layering.** `core/src/commands/lap_ops.rs` has no `clap`, no `tauri`, no I/O — pure
   function over `&[Lap]`. Correctly placed in `core`; the CLI-only concerns (arg parsing,
   `CliError`, stderr note) stay in `cli/src/verbs/workbook.rs`. Compliant with CLAUDE.md §2.

4. **Test quality (`lap_ops.rs`).** All 8 tests are Arrange/Act/Assert with blank lines, named
   `thing — condition — result` (e.g. `a_main_lap_that_does_not_exist_is_an_error_listing_the_ones_that_do`,
   `the_baseline_row_is_never_set_from_laps`), and each asserts something specific and
   non-vacuous — bounds order, sector flattening order, error contents on a bad number, error
   contents on an empty lap set, and explicitly that `baseline_row` is untouched. These are
   genuine regression tests for the exact bug reported. The one added test in
   `cli/src/verbs/mod.rs` (`every_workbook_verb_that_takes_a_track_also_takes_a_main_lap`) checks
   only that all four rows with `--track` and `ValueKind::Path` also parse `--main-lap` via
   clap — a real check (it iterates the table and asserts the list isn't empty, then a
   non-trivial per-row assertion), but it is arg-parsing-only, not behavioural.

5. **Docs.** `core/src/commands/table.rs`'s `MAIN_LAP_FLAG` doc comment states units (1-based
   lap number) and the no-default rationale. `lap_ops.rs` has doc comments on the module, the
   `MainLap` enum and both its variants, and `lap_context` (including an `# Errors` section).
   No `Err(String)` anywhere in the new code — `lap_context` returns `Result<MathLapContext,
   Vec<u32>>` (a structured error payload) and the CLI wraps it in the existing typed
   `CliError`/`ErrorKind::NotFound`. `CHANGELOG.md` and the new C6 spec section both record the
   flag, its no-default rule, and its cost when absent, satisfying §6.

6. **Generated files.** `app/src/shell/cliTable.json` and `docs/CLI-REFERENCE.md` diffs show
   `--main-lap` (`kind: integer`, matching help text) added on exactly the same four rows that
   gained `MAIN_LAP_FLAG` in `table.rs` (`workbook check`, `workbook eval`, `workbook data`,
   `workbook export`) — no more, no less. Consistent.

## Verdict rationale

The fix is correct and closes the exact hole the previous review found: the context is now
built in one pure `core` function that fills all four fields together, the CLI wiring rejects
the invalid combinations, and the "no default" design is verified against the actual code
(workbook verbs never touch `session.json`, so there is nothing to default from). Layering,
docs, typed errors, and the generated-file consistency all check out. The one real gap is that
the CLI-layer glue in `workbook.rs` — the part that turns a raw `--main-lap` value and a
`lap_ops` error into user-facing behaviour — has no direct test, only the pure function
underneath it does; that's a coverage gap worth closing but not a correctness defect, so it is
Important rather than Critical, and doesn't block approval on its own.

VERDICT: APPROVED
