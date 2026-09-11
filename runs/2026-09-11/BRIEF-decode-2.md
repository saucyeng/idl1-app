# Brief: decode 2 -- shared time axis, parallel channel decodes (R232)

Lean owner, Rust core + tauri, no app change expected beyond the progress ring reflecting real
progress. Worktree: Rust `idl-rs-worktrees/decode-2` (an app worktree only if a mirror changes).
Read CLAUDE.md (§8: two cargo slots, ≥ 6 GB free; tauri gate is `--lib`), rulings R203, R208.1,
R211, R221, R232; `runs/2026-09-11/MEASURE-decode-timing.md` (the numbers, do not re-survey);
`rust/tauri/src/session_cache.rs` (LRU by bytes, the in-flight byte semaphore), `rust/core/src/
store/parquet.rs` (`read_channel`), the indexing lane's rayon pool + memory gate (R208.1), and
the `decode_progress` event (R221).

## Rulings (R232; do not ask)
1. **One axis decode per (session, source).** A source's `_t_recorded_us` column is read once
   and held as its own cache entry (`Arc<[i64]>` or the existing axis type), shared by every
   channel of that source; a channel decode reads only its value column and borrows the axis
   entry. Eviction accounts for the axis once; evicting an axis while channels of that source
   are resident is forbidden (pin while referenced). Test: six channels of one source decode
   the axis exactly once (count reads); memory accounting sums correctly.
2. **Parallel channel decodes.** When one request (a cell bind, a report, a raster) needs
   several channels that are not resident, decode them on the shared rayon pool (R208.1),
   each worker reserving through the R211 byte semaphore; requests wait, never fail, and
   the cache dedupes concurrent decodes of the same channel (one decode, many waiters).
   Test: N channels requested concurrently decode once each; wall time on the 10-session copy
   drops roughly by the worker count (report the numbers, before/after, on the 516 MB session
   copied to a temp dir; never the library).
3. **Progress stays honest**: `decode_progress` is emitted per row group per channel, so the
   per-cell ring advances with real work; the notebook chip's "3 of 9 channels" counts the
   parallel set correctly (done when all resident).
4. No C3 change expected (say so); if the cache key shape leaks into a DTO, escalate.

## Gates
Targeted filters, then `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`, `cargo test -p
idl-rs-tauri --lib -- --test-threads=4`, `cargo check -p idl-rs-cli --tests`, `cargo check -p app`
from the main checkout is NOT allowed (lanes never touch main): use an app worktree if you need
one. One reviewer (sonnet). Merge (main into branch first, --no-ff), submodule bump in the
superproject with a plain commit from the main checkout's merge step, CHANGELOG `[docs]` with the
before/after numbers, retire the worktree. **Before merging, re-run the tauri lib gate on the
merged branch; the lead re-runs it on main before pushing.** Never push. Report 10 lines.
