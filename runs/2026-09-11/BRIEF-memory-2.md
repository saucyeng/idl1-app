# Brief: memory 2 -- the eval host-channel path and one global budget (R211)

Lean owner, Rust `idl-rs` core + `idl-rs-tauri`, no app change expected. Worktree: Rust
`idl-rs-worktrees/memory-2`. Read CLAUDE.md, rulings R203 and R211, `runs/2026-09-10/
MEMORY-SURVEY.md`, the memory lane's own TASKS.md follow-ups ("eval engine's host-channel path
still decodes whole sessions"; "`finish_import` keeps the parsed Session for lap indexing"),
and `rust/tauri/src/session_cache.rs` (the R203 cache) plus `rust/core/src/store/parquet.rs`
(`read_channel`).

## Incident
Opening the largest session (`817a54…`, ~490 MB parquet; a 22.6 M-sample channel is
181,132,664 bytes as f64) in the notebook with the shakedown workbook (about nine channel
cells plus a spectrum) killed the app: `memory allocation of 181132664 bytes failed`,
`STATUS_STACK_BUFFER_OVERRUN`, with 17 GB of commit free on the machine. The console shows
two rounds of host-channel binds immediately before. Diagnosis: each cell's host-channel
request goes down the eval path that decodes the **whole session** (every channel, f64),
several requests run concurrently, each passes the R203 failsafe individually, and their
sum exceeds what the process can commit. The same allocation size killed the CLI fold-in
earlier for the same reason (one whole-session decode plus the parsed Session).

## Rulings (R211; do not ask)
1. **The eval host-channel path reads through the `SessionCache` per channel** (column
   reads via `read_channel`), never `load_session`. Same for `fetch_host_channel`, spectra
   (`fetch_fft`) and anything else that serves samples to the sandbox. After this lane,
   `load_session` has exactly three callers: import verification, export, rebuild; assert
   that in a test that greps the source (like the delete guard).
2. **One process-wide memory budget, not per-request checks.** The R203 budget becomes a
   byte-counting semaphore in `session_cache`: every decode reserves its estimated bytes
   before allocating and releases on drop; a request that cannot reserve **waits** (bounded,
   e.g. 30 s) for others to finish rather than failing, and only returns
   `resource_exhausted` when its single request alone exceeds the whole budget. Tests:
   N concurrent requests whose sum exceeds the budget serialise and all succeed; one
   oversized request fails typed; a waiter times out typed.
3. **Import and lap indexing hold one copy.** `finish_import` indexes laps from the
   per-channel `ChannelSamples` it already wrote (or re-reads the columns it needs), never
   from the whole parsed `Session` kept alive after the write. Peak for a 395 MB log must
   drop below 2 GB private; measure with the release CLI on `Documents\idl1-library\data`'s
   largest blob (copy that blob to a temp data dir for the measurement; never modify the
   library).
4. **Nothing panics on allocation.** Any `Vec::with_capacity`/`vec![]` that scales with a
   session goes through `try_reserve` and maps failure to `resource_exhausted`. Grep for
   the remaining sites and fix them.

## Gates
Targeted filters per task, then `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`,
`-p idl-rs-tauri`, `cargo check -p idl-rs-cli --tests`, `cargo check -p app` from
`app/src-tauri` in the MAIN checkout (no app worktree in this lane). Manual proof: the
release CLI import peak from ruling 3, and, if Isaac is available, opening `817a54…` in the
dev app with the shakedown workbook without a crash; otherwise report the CLI number only.
Merge `--no-ff` into the submodule's main from the main checkout, bump the submodule pointer
with a plain commit, CHANGELOG line (superproject), TASKS.md updated. Retire the Rust
worktree, delete the branch. Never push. Report 12 lines or fewer.
