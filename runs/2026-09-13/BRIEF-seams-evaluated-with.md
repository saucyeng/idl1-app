# Brief: burst-seam spans on the wire, and `evaluated_with` written by core (R237)

Lean owner (Sonnet), Rust core + tauri + small TS. Worktrees: Rust `idl-rs-worktrees/seams`, app
`../idl1-app-worktrees/seams`. Read CLAUDE.md (§8; R235; memory gates 4 GB core/cli, 6 GB
tauri/app), the errors-staleness digest entry (2026-09-13) and its CHANGELOG/UI-DIRECTION notes,
C1 §3.3 (burst-seam correction), C3 §3.5 (tiles) and §3.4, C2 §1 front matter, R135's advisory-key
precedent (`graph`), and where the app reads `evaluated_with` (the version banner) and draws gap
hatching (tile no-sample sentinel).

## Do (commit after every task)
1. **Seam spans on the wire.** C1 §3.3's corrected burst seams leave no sentinel in the samples,
   so the app cannot hatch them. Add a C3 §3.5 `fetch_tile` sibling field or a small command
   `fetch_seams(session_id, channel) -> { spans: [t0_us, t1_us][] }` (spec-during, DTO byte-exact;
   choose the cheaper one and say why), served from the session cache; the app hatches seams
   with the same soft pattern as gaps, a second tone. `app/src/ipc` mirror + a pure test.
2. **`evaluated_with` written by core.** The workbook renderer records `evaluated_with: {app:
   "<semver>", engine: "<semver>"}` as an advisory front-matter key (C2 §1 text; never read by
   parser/evaluator; merged like `graph`) whenever the app saves a workbook after evaluation; the
   app's banner already reads it. Test: a rendered workbook carries the key; an old file without
   it still parses.
3. CHANGELOG `[docs]`; regenerate any generated docs the change touches.

## Gates
Targeted filters, `cargo test -p idl-rs-tauri --lib -- --test-threads=4`, `-p idl-rs -p
idl-rs-cli`, `cargo check -p idl-rs-cli --tests`, `cargo check -p app` from the app worktree; app
tsc + vitest. One reviewer (sonnet). Merge both repos (main into branch first, --no-ff), submodule
bump, retire in the R171 order with the tightened check. Contract text in the app worktree. Lanes
never create branches or edit files in the main checkout. Before merging, re-run the tauri lib
gate on the merged branch. Never push. Report 8 lines or fewer.
