# Brief: session memory -- one decode, column reads, bounded cache, failsafe (R203)

Lean owner, Rust core + tauri, small app part. Worktrees: Rust `idl-rs-worktrees/memory`,
app `../idl1-app-worktrees/memory`. Read CLAUDE.md, ruling R203, `runs/2026-09-10/
MEMORY-SURVEY.md` (file:line evidence for every claim below; do not re-survey), C3 §1
(`resource_exhausted` error kind, already written). Incident: a multi-hour session (395 MB
`.idl0`) killed the app with `memory allocation of 60391864 bytes failed`.

## Rulings (R203; do not ask)
1. **Column reads.** Parquet is columnar; a request for one channel reads that column (plus
   the time column) and nothing else. Add `store::parquet::read_channel(session_dir,
   channel) -> ChannelSamples` (Arc-backed) and use it from tiles, cursor, rasters and the
   eval engine's host-channel path. `load_session` (whole file) survives only for import
   verification, export and rebuild.
2. **One decode per session, bounded.** `rust/tauri/src/state.rs` gains a `SessionCache`:
   `session_id -> channel -> Arc<ChannelSamples>`, LRU by bytes with a budget = min(2 GiB,
   25 % of physical RAM) read once at startup (use the `sysinfo` crate's total-memory only,
   or `std` if you find a way; state which). Every command that serves samples goes through
   it; a channel is decoded at most once while it is resident. Eviction on budget; a
   `session_forgotten`/reimport/`delete_session` path invalidates. Tests: hit/miss, eviction
   order, invalidation.
3. **Import holds one copy.** `import_idl0`'s `std::fs::read` becomes a memory map
   (`memmap2`, pure Rust, add it to core) so the raw bytes are the OS's pages, not a heap
   copy; the parsed `Session` is written to parquet **per channel batch** and each channel's
   Vec dropped as its batch is written, so peak is ~1 channel + the map, not 3 × file size.
   Parity test: the parquet written before and after is byte-identical for the fixtures.
4. **Failsafe, never abort.** Before any allocation that scales with a session (import,
   decode, raster), estimate bytes (samples × channels × width) and compare against the
   cache budget plus a margin; if it will not fit, return the typed error
   `resource_exhausted` with `detail: { needed_bytes, budget_bytes, hint }` (C3 §1). The
   app shows it as a toast ("Session too large for available memory: 1.9 GB needed, 1.2 GB
   budget") and the notebook keeps running. No `abort`, no panic, no `unwrap` on allocation.
5. **App retention.** `Notebook/index.tsx`'s `combinedChannelDataRef` evicts entries whose
   cell or window is no longer mounted (its sibling refs already do); add the pure decision
   module + test. Nothing else in the app changes.

## Gates
Rust: targeted filters per task, then `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`,
`-p idl-rs-tauri`, `cargo check -p idl-rs-cli --tests` (core `pub` changes), `cargo check -p app`
from the app worktree's `app/src-tauri` (R199). Manual proof, once: import the 395 MB
`2026-09-07_09-43-52` session from `C:\Users\isaac\Documents\idl1-library` (already folded in;
do NOT touch `Documents\sessions`) with the release CLI, then open it in the dev app and pan;
report peak private bytes of `app.exe` from Task Manager or `Get-Process` before and after.
App: tsc + vitest. Merge both repos (main into branch first), submodule bump, CHANGELOG,
retire in the R171 order with PowerShell `Remove-Item node_modules` + `Test-Path` False first.
Never push. Report 12 lines or fewer.
