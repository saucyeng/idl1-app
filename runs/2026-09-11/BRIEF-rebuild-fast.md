# Brief: rebuild-fast -- incremental catalog rebuild, in the background (R219)

Lean owner, Rust core + tauri + cli, small app part. Worktrees: Rust `idl-rs-worktrees/
rebuild-fast`, app `../idl1-app-worktrees/rebuild-fast`. Read CLAUDE.md (§8: at most two cargo
processes, ≥ 6 GB commit free before each), rulings R81, R207, R219; C4 §5 "Rebuild procedure"
step 1 as amended today; `rust/core/src/store/catalog.rs` (`rebuild_catalog`), `catalog_read.rs`,
`rust/tauri/src/commands/catalog.rs` (`rebuild_catalog_via`), the indexing lane's job/progress
pattern (`index_progress`/`index_status`, `state::IndexJob`, the chip in `AppShell`), and the
notebook's empty-state rebuild trigger (grep `rebuild_catalog` in `app/src`). Finding behind
this: on Isaac's 159-session library the rebuild re-hashed 6.6 GB of blobs while the notebook
awaited it; lap indexing was a no-op (no tracks).

## Rulings (do not ask)
1. **Incremental step 1.** `rebuild_catalog` opens the existing `catalog.sqlite` (if any)
   read-only and, for each blob path whose `(sha256, size_bytes, mtime_ms)` matches an
   existing row, inserts that row into the staging database without hashing; only new or
   changed paths are hashed. Report counts: `blobs_carried`, `blobs_hashed`. `verify_data_dir`
   keeps the full hash pass and is unchanged.
2. **Background job with progress.** `rebuild_catalog` becomes a job like the index job:
   `start_rebuild_job() -> bool`, `rebuild_status()`, event `rebuild_progress { phase:
   "blobs" | "tracks" | "sessions" | "laps" | "workbooks", done, total }`; the staged
   database swaps in atomically at the end (unchanged), and the app keeps reading the old
   catalog until then. C3 §3.2 text in the same commit (spec-during), DTOs byte-exact,
   `app/src/ipc/` mirror.
3. **No route awaits a rebuild.** The notebook's empty-state trigger (R81) now starts the job
   and shows the chip ("Rebuilding catalog 12 / 159"); it renders whatever the catalog has
   meanwhile and refreshes on the job's completion event. `rescan`/maintenance-panel callers
   likewise. The CLI `fold-in`/`rebuild` end-of-run rebuild uses the incremental path and
   prints the two counts.
4. Proof: release CLI on a copy of ten sessions (temp data dir; never the library): a second
   rebuild after a no-op change reports `blobs_hashed: 0` and runs in well under a second;
   touching one blob's mtime re-hashes exactly one.

## Gates
Targeted filters, then `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`, `-p
idl-rs-tauri`, `cargo check -p idl-rs-cli --tests`, `cargo check -p app` from the app
worktree's `app/src-tauri`. App: tsc + vitest. Merge both repos (main into branch first,
--no-ff), submodule bump, CHANGELOG, TASKS.md, retire in the R171 order (`rmdir node_modules`
from cmd inside the app worktree's `app/`, confirm gone, remove worktrees, delete branches,
node_modules non-empty and unchanged). Lanes never create branches or edit files in the main
checkout. Never push. Report 10 lines or fewer.
