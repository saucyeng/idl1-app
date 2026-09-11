# Brief: laps and shapes -- the engine work lap charts need (R233)

Lean owner, Rust core + tauri, spec-during (C2 §3.3 builtin rows, §3.6 minimal shapes, §4 row
derivation; C3 IDLH lap column + windowed table command), app mirrors only. Worktrees: Rust
`idl-rs-worktrees/laps-shapes`, app `../idl1-app-worktrees/laps-shapes` (contract text + ipc
mirrors). Read CLAUDE.md (§8 two slots, ≥ 6 GB; tauri gate `--lib`), rulings R125, R127, R217,
R233; the tier B draft and C2 as lifted; `runs/2026-09-11/REVIEW-chart-port-b.md`, the b2 lane's
escalation text in the digest; `core/src/math/{catalog,eval,resolve}.rs`, `MathLapContext`,
`core/src/table/*`, `tauri/src/commands/{workbook,table_cmd}.rs` (the `AxisKind::Time`
hardcode and the `table_cell_value` TODO), IDLH v2 in C3 §3.4.

## Do (commit after every task)
1. **Builtins** `lap_number()`, `lap_time()`, `sector_time(i)` in `math_builtin_catalog()` with
   unit rules (`s`, dimensionless), C2 §3.3 rows, and shape-polymorphism per R217.3: scalar in
   a row context, `[lap]` in a math cell. Closes the catalog/spec drift the docs lane filed.
2. **Minimal shapes** (C2 §3.6): the evaluator carries an axis kind on values (`Time` | `Lap`);
   `[lap]` values exist; reductions over `[lap]` where §3.6 already defines them; everything
   else unchanged. `workbook.rs` stops hardcoding `AxisKind::Time` and sets `Lap` for `[lap]`.
3. **IDLH lap column**: a `[lap]` value serialises with `axis_kind = Lap` and `t` = lap number
   (1-based, f64) so the existing decoder reads it; C3 §3.4 text; `app/src/ipc` mirror unchanged
   if the byte layout holds, else updated together.
4. **Row derivation**: `rowSource: "windowLaps"` yields one row per lap of the selected windows;
   `mainRowId` → `baseline_row`; the `"fastest"`-under-`authored` validation rule; a windowed
   table command (`table_cell_value` gains the selected windows argument; C3 §3.4) so the app
   can evaluate a lap table for the current selection. No app table UI here (next lane).
5. Lap progression then evaluates: a per-lap scalar `[lap]` from a definition or `lap_time()`;
   verify the tier B lap-progression chart draws through the existing host-var path with the
   IDLH lap column (a small app change is allowed if the binding needs the axis kind).

## Gates
Targeted filters, then `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`, `cargo test -p
idl-rs-tauri --lib -- --test-threads=4`, `cargo check -p idl-rs-cli --tests`, `cargo check -p app`
from the app worktree; app tsc + vitest. One reviewer (sonnet). Merge both repos (main into
branch first, --no-ff), submodule bump, CHANGELOG `[docs]`, retire in the R171 order with the
tightened check. Contract text in the app worktree. Lanes never create branches or edit files in
the main checkout. Before merging, re-run the tauri lib gate on the merged branch. Never push.
Report 12 lines or fewer.
