# Review: laps-shapes (R233)

**Commits reviewed:**
- Rust (`idl-rs-worktrees/laps-shapes`, branch `laps-shapes`): `044514b`, `ef09d6c`, `b9f7180` (diff vs `main`)
- App/superproject (`idl1-app-worktrees/laps-shapes`, branch `laps-shapes`): `075b0a3`

**Files touched:** core/src/math/{eval,catalog,resolve,units,value,vector,variance_geom,mod,tests_parity}.rs,
core/src/table/{eval,mod,model}.rs, core/src/commands/lap_ops.rs, core/src/workbook/v3/{host,host_channel_wire,eval}.rs,
tauri/src/{session_source,commands/workbook}.rs, cli/src/table_cmd.rs; app: app/src/ipc/hostChannel.ts(+test),
app/src/ipc/workbook.test.ts, app/src/routes/pages/Notebook/model/{channelBindDriver,channelRebind}.test.ts,
docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md, docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md,
CHANGELOG.md.

**Test command / result (as reported, not re-run per instructions):** core 1534, cli 103, tauri lib 480 passed;
app tsc clean + 2718 vitest passed. Not independently executed (cargo is off-limits to reviewers; targeted
vitest/tsc gate was not re-run here since findings could be verified by static reading).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `rust/core/src/math/catalog.rs:709` | `sector_time`'s catalog `description` says "the lap's `i`-th sector **(1-based)**", but C2 §3.3's table, this lane's own code comment in `eval.rs` ("0-based, as C2 §3.3's own row states"), and the implementation itself (`idx = i.round() as usize` used directly as a 0-based index) are all 0-based. This string ships over `list_math_builtins` to the app's function reference/autocomplete (`functionCatalog.ts`), so a user reading in-app docs is told the wrong indexing base. No test asserts on description text, so nothing caught it. | Change the description to say "(0-based)" or drop the parenthetical, matching `sector_number()`'s existing "0-based sector index" wording. |
| Minor | `rust/core/src/table/eval.rs:509` | The `invalid_main_row` validation message has a large run of stray whitespace baked into the literal: `"...rowSource \"windowLaps\";                  name one of this table's own row ids instead"` (~18 spaces). Reads oddly wherever it surfaces (table UI, CLI `check`). No test checks the message text, only the `kind`. | Collapse to a single space. |
| Minor | `rust/core/src/table/eval.rs:~415` (`resolve_baseline_row`) | `a.partial_cmp(b).unwrap()` inside the `min_by` comparator is an `unwrap()` on data (lap times), which CLAUDE.md §5 disallows in general even though the preceding `.filter(|(_, t)| !t.is_nan())` makes the `None` case unreachable today. A future change to the filter (or an `Infinity` edge case someone "fixes" elsewhere) would make this panic silently reappear. | Use `.partial_cmp(b).unwrap_or(Ordering::Equal)` or a `total_cmp`-based comparator instead of asserting the invariant via `unwrap()`. |
| Minor | `rust/core/src/math/catalog.rs:686,697,708` | New entries use `shape: "scalar|[lap]"` (no spaces around `\|`) while every pre-existing dual-shape entry uses `"scalar \| [t]"` (spaced). Cosmetic, but it's a hand-typed table the module's own doc comments say to watch for transcription drift in. | Match the existing spacing convention. |
| Minor | `CHANGELOG.md` (Unreleased, laps-and-shapes entry) | "A per-lap value crosses to the notebook as itself, carrying lap numbers rather than seconds" is true at the byte/IPC layer but could be read as "the lap chart now works." Both C2 §3.6's own implementation-status note and the brief's task 5 are explicit that the lap-progression chart still does **not** draw (host-variable record has no `lap` key yet). The CHANGELOG entry never states this caveat. | Add a sentence noting the chart-drawing gap, mirroring the spec's own candor. |

## Correctness checks performed (no issues found)

- `lap_shaped`/`lap_channel`/`combine_axis` (`eval.rs`): shape-polymorphism (scalar in `row_lap` context, `[lap]`
  channel otherwise), `NoLapContext` on empty laps and on an unresolvable `row_lap`, `sector_time`'s 0-based
  negative/non-finite-index `Runtime` error, and `lap_time_secs` sourced from `LapSummary.lap_time_ms` (not
  `end - start`) all match C2 §3.3/§3.6 and are exercised by well-formed Arrange/Act/Assert tests with
  descriptive `thing — condition — result` names.
- `combine_axis` reports `MathEvalErrorKind::Type` (not a new `ShapeMismatch` kind) — matches C2 §3.6's own
  "minimal subset" note that it deliberately does not widen the C3 error-kind enum yet.
- `resolve_dependencies` (`resolve.rs`) correctly refuses to `store_math_with_times` a non-`Time`-axis result,
  matching C2 §3.6's "a `[lap]` definition is not stored back into the session's channel store."
- `to_host_channel`/`encode_host_channel_idlh`: axis now rides on the value (`HostChannel.axis`, `#[serde(skip)]`
  correctly kept off the JSON host-variable shape per C2 §5.1), both `fetch_host_channel(_v2)_via` call sites lost
  their `AxisKind::Time` argument as the brief demanded, and `AxisKind::None` is still forced whenever `t` is
  empty regardless of what the value claims.
- `plan_rows`/`resolve_baseline_row`/`evaluate_table_multi` (`table/eval.rs`): `WindowLaps` derivation is one row
  per lap in window-then-lap order with `"<sessionId>#<lapNumber>"` ids; `Authored` rows are matched by lap
  *number*, not position; `"fastest"` resolves to the lowest lap time among derived rows (ties → lowest index,
  `NaN` skipped) and is rejected under `Authored` via the new `invalid_main_row` `TableProblem`; each row gets
  its own `MathLapContext` (`row_lap`/`laps` set per row) without double-windowing — `CellLookup.window` already
  slices channel samples by time directly (`slice_by_time`), and the per-row `MathLapContext.main_lap_bounds` is
  deliberately left empty because a rate-0 lookup makes `window_index_range` a no-op, exactly as the code comment
  claims. Verified this by reading `CellLookup::lookup`.
- `laps_in_window`/`lap_span` (`session_source.rs`): overlap (not containment) with half-open bounds correctly
  covers all three `SpanDto` kinds (`Lap`, `Session`, `Range`) with one rule, matching the doc comment's reasoning.
- `table_cell_value` (`tauri/commands/workbook.rs`): now takes `lap_ctx`, plans rows, resolves baseline, and
  returns the **planned** model (not the authored one) alongside `results` — matches C3 §3.4's amended note that
  "`model` is the model as evaluated, not the model as written." No new `#[tauri::command]` was added, consistent
  with C3's "No new wire" paragraph — `eval_workbook_v2`'s existing per-window evaluation is what makes the table
  "windowed."
- `cli/src/table_cmd.rs`'s migration from `lap_windows` to `plan_rows`: `cmd_eval`'s previous unconditional
  `wt.table.rows` iteration is replaced by iterating `planned.rows`, and a `WindowLaps`-per-session stand-in
  (the whole bound session, matching a `SpanDto::Session` window) is supplied for headless invocations, which is
  a reasonable, explicitly-commented choice, not a silent behaviour loss. `cmd_check`'s prior `laps.is_empty()`
  special case is preserved by construction (empty `spans` → every `Authored` row binding falls through to
  `RowBinding::default()`, same result as before).
- App-side commit is contract mirror + IPC decoder only, as scoped: `hostChannel.ts` requires IDLH version 2,
  decodes `axisKind`, and rejects version 1 (previously-silent full rejection bug, now fixed and tested); no
  chart/host-variable-binding code was touched, matching task 5's explicit "not landed" status. C2/C3 spec edits
  read as accurate transcriptions of what the Rust side actually does (cross-checked `to_host_channel`,
  `encode_host_channel_idlh`, `plan_rows`, `resolve_baseline_row` against the corresponding prose).
- No layering violations: all lap/shape logic lives in `core`; `tauri` only wires context through; `app/src`
  changes are IPC-mirror plus test fixtures only.

## Verdict rationale

The implementation is faithful to the brief and to the C2/C3 rulings it lands (R233), including the judgment
calls the brief flagged for scrutiny — `lap_time()` reading `lap_time_ms` rather than `end - start`,
`sector_time(i)` being 0-based, `Type` standing in for `ShapeMismatch`, and `resolve_dependencies` refusing to
store non-`Time` definitions — all of which match the spec text this lane itself wrote and cross-check
consistently against the code. Tests are well-formed (Arrange/Act/Assert, descriptive names) and actually assert
the shapes/values they claim to. The one finding worth blocking on is minor-but-real: the `sector_time` catalog
description's "(1-based)" directly contradicts the spec, the code, and the function's own comment, and ships
over IPC to the app's function reference — a small, mechanical fix. The remaining findings (stray whitespace in
a validation message, an `unwrap()` protected by an upstream filter, a cosmetic shape-string spacing mismatch,
and a CHANGELOG completeness nit) are minor and do not indicate a design or correctness problem.

VERDICT: NEEDS_FIXES
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\laps-shapes\runs\2026-09-11\REVIEW-laps-shapes.md
COUNTS: critical=0 important=1 minor=4
