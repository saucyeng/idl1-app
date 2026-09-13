# Review: wire-golden lane (R236)

Commits: Rust `bf178bb`, `33257f8` (vs merge-base `b0ffc61`); App `ca6915d`, `81c7ee6`, `581fa7c` (vs merge-base `ed02fc3`).

Files touched: `core/src/wire_golden.rs` (new), `core/src/lib.rs`, `core/src/commands/table.rs`,
`cli/src/docs_cmd.rs`, `cli/src/verbs/store.rs`; `app/src/ipc/golden/{idlh-v2-time,idlh-v2-lap,idlt-v2,idls-v1,idlg-v1,idlr-v1}.{bin,json}`,
`app/src/ipc/golden/loadFixture.ts`, `app/src/ipc/{hostChannel,tiles,scatter,gps,rasters}.golden.test.ts`,
`.github/workflows/ci.yml`, `docs/CI.md`, `CHANGELOG.md`, `docs/CLI-REFERENCE.md`, `app/src/shell/cliTable.json`,
`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`.

## Test commands and results

- `cargo test -p idl-rs-cli` (Rust worktree): **106 passed; 0 failed**.
- `cargo test -p idl-rs commands::table` (Rust worktree): **18 passed; 0 failed** (plus 1 filtered integration binary, 0 tests, ok).
- `npx vitest run src/ipc --reporter=verbose` (app worktree, `app/`): **22 files, 120 passed; 0 failed**, includes all 6 `*.golden.test.ts` cases.
- `npx tsc --noEmit` (app worktree, `app/`): clean, no output.

## Byte-level cross-check

Manually decoded every committed `.bin` with a byte-offset script and compared against its `.json` sibling and the real encoder source (`gps_wire.rs`, `scatter_wire.rs`, `raster.rs`, `host_channel_wire.rs`, `chart_decimation.rs`): `idlh-v2-time`, `idlh-v2-lap`, `idls-v1`, `idlg-v1`, `idlr-v1` all match exactly (header fields, array contents, pixel bytes). `idlt-v2`'s JSON (columnMin/Max/Mean = [0,255.5→127.5 etc.], columnTUs) matches `column_stats`/`column_times_us` given 1024 real samples across 4 columns. Both `axis_kind` values (`Time`, `Lap`) are exercised per the brief. No RNG, no timestamps, no `SystemTime`/`rand` use anywhere in `wire_golden.rs`; `wire_run_twice_writes_identical_bytes` and `build_wire_fixtures_is_deterministic_across_calls` cover determinism directly, and little-endian encoding is asserted by every underlying encoder's own tests.

CI freshness step (`ci.yml` lines 78-85) is correctly placed next to the workbook/CLI-reference freshness steps, runs `idl-rs docs wire --out app/src/ipc/golden` — an exact match to `docs_cmd.rs`'s `DocsAction::Wire { out }` / `cli/src/verbs/store.rs`'s `wire()` — then `git diff --exit-code` on the same path. `docs/CI.md` documents the same command. The C3 §1 sentence is present verbatim as specified by the brief, correctly located under §1 (Conventions).

## Findings

| Severity | file:line | Finding | Fix |
| --- | --- | --- | --- |
| Minor | app/src/ipc/tiles.golden.test.ts:33 | Comment "column region (column 0 real, 1-3 NaN/sentinel)" is stale/wrong: with 1024 samples at tier 0 across 4 columns, every column (0-3) is real data (confirmed against `wire_golden.rs`'s own doc comment and the decoded `idlt-v2.json`, which has 4 non-NaN columnMin/Max/Mean values). Leftover from the task-2 scaffold commit (`81c7ee6`, "no fixtures yet") that was never updated once the real fixture landed. Does not affect what the test actually asserts (deep-equal against the JSON, which is correct). | Fix the comment to say all 4 columns carry real data, or drop the parenthetical. |
| Minor | docs/CI.md:41 | Says the per-format vitest lives at "`app/src/ipc/*.test.ts`"; the actual files are `*.golden.test.ts`. Not incorrect (glob would still match) but imprecise given the repo's convention of naming these `.golden.test.ts` distinctly from the hand-built `.test.ts` decoder tests. | Say `app/src/ipc/*.golden.test.ts`. |

No Critical or Important findings. Scope matches the brief exactly: all 5 binary formats (IDLH, IDLT, IDLS, IDLG, IDLR) covered, one `.bin`/`.json` pair each (IDLH gets two, exercising both `axis_kind` values as required); every format already has a TS decoder, so no `TODO(idl0)` stub was needed (n/a case correctly not invoked). No unrequested source changes found — the diff is limited to the fixture builder, CLI wiring, generated fixtures/tests, and the four required doc/changelog/spec touches. CLAUDE.md orders followed: doc comments present on all new public symbols, units implied/documented (seconds, metres, RGBA8), no `unwrap()` in the new non-test code paths, `wire_golden.rs` correctly declared pure (no fs access) and layered under `core`. Tests are Arrange/Act/Assert with blank lines and `thing — condition — result` names.

## Verdict rationale

Every fixture's bytes were independently decoded and checked field-by-field against the real encoders and against the committed JSON; all six match exactly. Both required gates pass with non-zero counts. CI wiring and CLI reference/table regeneration are internally consistent and correctly placed. The only issues found are two stale/imprecise comments that don't affect correctness or test validity.

VERDICT: CLEAN
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\runs\2026-09-13\REVIEW-wire-golden.md
COUNTS: critical=0 important=0 minor=2
NOTES: All 5 wire formats' committed .bin/.json fixtures verified byte-for-byte against the real encoders; only issue is a stale comment in tiles.golden.test.ts claiming columns 1-3 are NaN when all 4 are real data.
