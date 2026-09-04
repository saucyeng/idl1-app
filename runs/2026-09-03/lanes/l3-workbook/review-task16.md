# L3 Task 16 review — lane close-out (CHANGELOG, TASKS, BRIEF)

Worktree/repo under review: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`, branch
`main`, commit `c21b84b` ("docs: L3 workbook v3 complete -- CHANGELOG, TASKS, lane brief
(migration dropped per R30)"). Scope: `CHANGELOG.md`, `TASKS.md`,
`runs/2026-09-03/lanes/l3-workbook/BRIEF.md` only — matches `git show --stat c21b84b`
exactly (3 files, no stray file pulled in). Cross-checked against the idl-rs worktree
`C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook` (branch
`wave1-l3-workbook`, clean, HEAD `60a6c98`) and against Task 14's commit `f29bf74`, which
lives in the idl1-app repo itself (not the idl-rs worktree). Out of scope: the idl1-app
repo's other pending unrelated changes (`app/src-tauri/Cargo.toml`, `rust` submodule
pointer, various untracked `runs/**/review-*.md` files) — untouched by this commit, and
ignored here.

## Test command and result
None run. Task 16 is docs-only; the dispatch for this review states explicitly to run no
cargo at all, since there is nothing to test and the lane's one full run
(`cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`, 898 passed / 0 failed) already
ran as Step 0 of the implementer's own task and is reported inside `BRIEF.md`'s "Delivered"
section. No independent reproduction was performed or required.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `CHANGELOG.md:47` | The new bullet's `gps_channel_values` clause reads `` `gps_channel_values` (landed by L1) amended to match ``. `gps_channel_values` was not landed by L1: `git log -S"pub fn gps_channel_values" --follow -- core/src/session/handle.rs` shows it was introduced at `2657e07` ("Initial release after repo split"), which predates every wave-1 lane commit (L1's own first `store:` commit is `8842199`, well after `2657e07` in history). It is pre-existing legacy code carried over from before the rewrite's lane structure began, not something L1 built this wave. The functional claim (behaviour amended to `null` past a channel's span, R39) is accurate; only the provenance parenthetical is wrong. | Change `(landed by L1)` to something accurate, e.g. `(pre-existing session-handle code)` or drop the parenthetical entirely — the clause reads fine without it. |

No Critical findings. No other Important findings.

## Checks performed (all pass)
- **CHANGELOG `Added` clause, cross-checked against commits.** Every claim in the new
  bullet (`CHANGELOG.md:33-49`) traced to a real commit on `wave1-l3-workbook`: front-matter/
  cell-id parsing → `e018db9`; constants table + deps-first resolver → `2d8e4b6`/`34291d5`;
  `if()` three-operand axis fold (R33) → `34291d5` (verified in `core/src/math/eval.rs:1011-1030`,
  matches `combine_t_us` called twice against both `t`/`f` operands); table-cell wiring →
  `2936118`; host-variable data / `${...}` extraction, exclusive cross-session lookup, lap-count
  message (R34) → `f7c757b` (verified byte-for-byte in `core/src/workbook/v3/host.rs:126-130`
  and its test at line 346: `"channel(\"X\", lap: 1): no lap 1 in this session's lap table
  (no laps recorded)"`); R35's deferred pairing-check documentation → confirmed present as
  `// TODO(idl0):` at `host.rs:96` naming L6 as owner; tile v2 layout, `MAX_TIER` → `b1a33d4`/
  `1f04286`; raster + `raster_meta`, R38 resolution-independent colour bounds → `caf4d06`/
  `e5d9a4e`/`812f761` (verified `finite_bounds(&s.power)` is scanned pre-rebin in
  `core/src/raster.rs:113` and again in `spectrogram_raster_meta`); cursor `null` outside span
  (R31) → `489247e` (verified in `core/src/cursor.rs:34-40`, matches CHANGELOG and its own doc
  comment exactly); `gps_channel_values` amendment (R39) → `039df03` (verified in
  `core/src/session/handle.rs:505-530`, doc comment cites R39/R31 explicitly).
- **(b) No migration terms.** Searched `CHANGELOG.md`, `TASKS.md`, and the new BRIEF section
  for `migrate-workbook`, `migrate_workbook_text`, `MigrationReport`, `_migrate_charts`,
  `_migrate_math`, "C2 §6 Stage 1" — none appear as claimed-delivered. The two hits for
  `69-function` and `migrate-workbook Stage 1` are both inside BRIEF.md's untouched header
  (lines 5 and 12, within the append-only lines 1–41), stale pre-R30 text the task correctly
  left alone.
- **(c) R39 called out plainly as a behaviour change to landed code.** CHANGELOG's clause
  names it explicitly: `` `gps_channel_values` (landed by L1) amended to match — `null` past
  a channel's recorded span rather than a frozen last value (R39) `` — a reader upgrading can
  see the trace-colouring change without digging into the ledger (module a mislabeled
  attribution, see Findings).
- **(d) R37/R31 CHANGELOG-clause judgement.** R37 (dropping `g` from the C2 §2.5 fixture) is
  a spec-example/test-fixture correction with no shipped-behaviour change — correctly omitted
  from `Added`. R31 is not merely implied but explicitly cited by name in the cursor clause
  (`` cursor readout, `null` outside a channel's recorded span (C3 §3.7, R31) ``) — a reader
  who wants the ruling can find it by name; the judgement that a separate clause was
  unnecessary is correct.
- **(e) BRIEF.md append-only + Done-when (1).** `git show c21b84b -- ...BRIEF.md` shows a pure
  addition (`@@ -39,3 +39,78 @@`, no `-` lines) — lines 1–41 of the original 41-line file are
  byte-identical; the appended section says so in its own first line. Done-when (1) restated
  as "every v3 math-cell value equals a direct `math::evaluate` on the same expression against
  the same session, bit-for-bit," with the same not-a-weakening reasoning as ledger R36
  ((i) evaluator-produces-idl0's-numbers already proven by `tests_parity.rs`, (ii) v3-pipeline-
  routes-without-altering-values now proven by Task 15 Step 1) — matches R36 word-for-sense.
  Both cited test names (`workbook_v3_pipeline_values_match_a_direct_evaluate_bit_for_bit`,
  `tile_built_from_an_evaluated_math_cell_matches_decimate_channel_directly`) exist verbatim in
  `core/src/workbook/v3/tests_pipeline.rs:68,129`.
- **(f) L5 function list, spot-checked (all 10 entries, not just 4).** Every `file:line`
  citation in the appended "Functions L5 needs" section was verified against the actual landed
  source with `grep -n`: `tile::build_tile_bytes` (`tile.rs:28`), `chart_decimation::MAX_TIER`
  (`chart_decimation.rs:19`), `chart_decimation::column_stats` (`chart_decimation.rs:123`),
  `chart_decimation::column_times_us` (`chart_decimation.rs:169`),
  `raster::RasterMeta` (`raster.rs:30`), `raster::build_spectrogram_raster_bytes` (`raster.rs:93`),
  `raster::build_histogram2d_raster_bytes` (`raster.rs:144`), `raster::spectrogram_raster_meta`
  (`raster.rs:192`), `raster::histogram2d_raster_meta` (`raster.rs:217`),
  `cursor::cursor_readout` (`cursor.rs:26`) — every line number matches exactly, and every
  signature (argument names, types, return types) matches the landed source verbatim, not the
  approximate signatures the task brief warned might be stale.
- **Commit hygiene.** Single-line commit message, no AI attribution trailer; explicit paths
  staged (`CHANGELOG.md TASKS.md runs/.../BRIEF.md`), no `git add -A`; `docs/` untouched by
  this commit (Task 14's SPEC edit is a separate, earlier commit `f29bf74`); the shared
  checkout `C:\...\idl1-app\rust` is clean and still on `main`.
- **TASKS.md wording.** `TASKS.md:23-24` matches the brief's mandated text exactly, including
  the required deferrals parenthetical (tier cache, Stage 2 chart conversion, migration/R30).
- **Design-doc citation.** "design §4 L3 row, line 187" checked against
  `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md:187` — the L3 row does list "tier
  cache" among its scope items, confirming the deferral citation is accurate.

## Verdict rationale
The close-out is accurate and disciplined everywhere it matters: no migration-related term
is claimed as delivered, R39's behaviour change to already-shipped code is stated plainly
rather than buried, the Done-when (1) restatement matches R36's reasoning including the
not-a-weakening argument, BRIEF.md's header is genuinely untouched, and the L5 function list
was independently re-read from source rather than copied stale — every one of the ten
file:line citations checks out exactly, a materially better hit rate than the "verify at
least four" the dispatch asked for. The one real defect is a single misattributed provenance
parenthetical — `gps_channel_values` credited to L1 when it in fact predates the entire
wave-1 lane structure (introduced at the pre-split initial commit). It doesn't overclaim
functionality (the behavioural claim is correct and verified) and the fix is a one-clause
wording change with no cascading effect on the rest of the document, so this is Important,
not Critical, and does not block shipping the close-out as-is pending the small fix.

VERDICT: NEEDS_FIXES
