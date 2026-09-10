# Brief: CLI library commands (R197) -- lean owner, idl-rs-cli only

Read: CLAUDE.md; ruling R197 item 1 (`runs/2026-09-03/decisions.md`); the core functions the
M4c lane landed (`rust/core/src/store/import.rs` for import + plan_import, the staleness
query and `reimport_session`, the folder scan module; find them via `git -C rust log
--oneline -8 -- core/src` and the M4c merge `5f37750`); the existing CLI `Import` command in
`rust/cli/src/main.rs` (~line 265, `cmd_import` ~line 1078) as the pattern. Worktree: Rust
`idl-rs-worktrees/cli-library` (branch `cli-library`). No app half, no C3 change: the CLI is not
an IPC surface. "No spec change needed": say so in the commit.

## Commands (clap subcommands under `idl-rs library`)
- `fold-in <folder> --data-dir <dir> [--move] [--recursive] [--dry-run]` — scan the folder
  (core scan: extension -> importer, sha256 -> already imported), print a preview table
  (file, importer, size, already-imported, start time or "unknown"), then import each file
  through the same core path the app uses. `--move` deletes each source file only after its
  blob's sha256 has verified in the store; a file that fails import is never deleted.
  `--dry-run` prints the table and exits. Summary line at the end: imported / skipped
  (already present) / failed / unknown-start counts, and the list of failed paths.
- `scan <folder> --data-dir <dir>` — the preview table only.
- `stale --data-dir <dir>` — `list_stale_sessions` as a table (session id, importer, stored
  vs current version).
- `rebuild --data-dir <dir> [--all | <session_id>...]` — `reimport_session` per id, progress
  per session, summary.
Exit code non-zero if any file failed. Human-readable output; `--json` flag on each command
emitting one JSON object (the app's C3 DTO shapes where one exists) for scripting.

## Rulings
- Wrappers only: no logic in the CLI that the core does not already own. If a needed
  function is not `pub` in core, make it `pub` with a doc comment and run
  `cargo check -p idl-rs-cli --tests`; that is the only core change allowed.
- `--move` across volumes is delete-after-verify, never rename.
- Never touch `Documents\sessions` or any real data dir in tests: tempdirs only, with the
  small synthetic `.idl0` fixtures core tests already build.

## Gates
`cargo test -p idl-rs-cli` (non-zero passed), `cargo check -p idl-rs-cli --tests`, then
`cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` once. Merge `--no-ff` into the
submodule's main from the main checkout, bump the submodule pointer in the superproject with
a plain commit, CHANGELOG line (superproject only), retire the worktree, delete the branch.
Never push. Report 10 lines or fewer.
