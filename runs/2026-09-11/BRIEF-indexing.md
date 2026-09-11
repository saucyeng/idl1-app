# Brief: indexing -- progress, incremental, all cores, CLI does it too (R207/R208.1)

Lean owner, Rust core + tauri + cli, small app part. Worktrees: Rust `idl-rs-worktrees/indexing`,
app `../idl1-app-worktrees/indexing`. Read CLAUDE.md, rulings R207, R208 item 1, R203/R211 (the
`SessionCache`, the process-wide budget, `resource_exhausted`), and the catalog rebuild /
lap-index code (`rust/core/src/store/catalog.rs` `rebuild_catalog`, `store/lap_index.rs`,
`rust/tauri/src/commands/catalog.rs` `rescan_tracks`/`rebuild_catalog_via`, and where the
notebook triggers indexing on open). Incident: first open of a 159-session library ran ~3
cores for 10+ minutes behind a spinner saying "looking for workbooks", with 0 `lap_summary`
rows written until the end.

## Rulings (do not ask)
1. **Indexing never sits between the user and a workbook.** Opening a workbook or a session
   needs only that session's index; if it is missing, index that one session (through the
   cache, per column) and open. Library-wide indexing (after a rebuild, a fold-in, a
   detector version bump) is a background job started by the app on launch and by
   `rebuild_catalog`, visible, cancellable, resumable per session.
2. **Incremental and durable per session.** Each session's lap/track index commits in its own
   transaction as it finishes; a killed app loses at most one session's work; the job
   restarts by skipping sessions whose stored `lap_detector_version`/`track_visits_library_hash`
   are current (the staleness fields already exist).
3. **All cores, bounded by memory.** Sessions index on a rayon pool of `physical_cores - 1`
   workers (add `rayon` to core if absent; `num_cpus`/`std::thread::available_parallelism`),
   with each worker's decode reserving through the R211 byte semaphore so N workers never
   exceed the budget; workers wait, never fail, for memory.
4. **Progress and label.** A C3 §3.2 event `index_progress { done, total, current_session_id,
   phase: "laps" | "tracks" }` and command `index_status()`; the app's import chip (R201)
   shows "Indexing 12 / 159 · <session name>" while it runs and "Index complete" afterwards.
   The notebook's "looking for workbooks" label is replaced by the true state of whatever it
   is waiting on; no spinner says something it is not doing.
5. **The CLI indexes too.** `idl-rs library fold-in` and `rebuild` run the same indexing job
   (same core function, same pool) at the end, printing per-session progress, so a folded-in
   library opens ready. `idl-rs library index --data-dir <dir> [--all | ids]` exists for reruns.
6. Spec-during: C3 §3.2 gains the event and command; C4 §5 gains one paragraph on
   per-session index transactions. DTOs byte-exact.

## Gates
Targeted filters per task, then `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`,
`-p idl-rs-tauri`, `cargo check -p idl-rs-cli --tests`, `cargo check -p app` from the app
worktree's `app/src-tauri`. Manual proof with the release CLI on a copy of ten sessions from
`Documents\idl1-library\data` in a temp data dir (never the library itself): wall time and
peak private bytes with 1 worker vs the pool. App: tsc + vitest. Merge both repos (main into
branch first), submodule bump, CHANGELOG, TASKS.md, retire in the R171 order (`rmdir
node_modules` from cmd inside the app worktree's `app/`, confirm gone, then remove). Lanes
never create branches in the main checkout. Never push. Report 12 lines or fewer.
