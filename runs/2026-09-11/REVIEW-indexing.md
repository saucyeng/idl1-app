# Review: indexing lane

**Commits reviewed:** uncommitted working trees, branch `indexing` in both worktrees
(`idl-rs-worktrees/indexing`, `idl1-app-worktrees/indexing`), diffed against each
repo's `main`.

**Files touched (Rust):** `core/src/store/index_job.rs` (new), `core/src/store/lap_index.rs`,
`core/src/store/catalog.rs`, `core/src/store/mod.rs`, `core/Cargo.toml`,
`tauri/src/commands/index.rs` (new), `tauri/src/commands/catalog.rs`, `tauri/src/state.rs`,
`tauri/src/session_cache.rs`, `tauri/src/error.rs`, `tauri/src/lib.rs`, `tauri/src/commands/mod.rs`,
`cli/src/library.rs`, `Cargo.lock`.

**Files touched (app):** `app/src/ipc/index_job.ts` (+test), `app/src/shell/importStatus.ts`,
`app/src/shell/indexStatus.test.ts`, `app/src/shell/ImportStatusChip.tsx`,
`app/src/routes/pages/Notebook/components/WorkbookBar.tsx`, `app/src/routes/pages/Notebook/index.tsx`,
`app/src-tauri/src/lib.rs`, `CHANGELOG.md`, `TASKS.md`.

**Spec touched:** C3 §3.2 (new `start_index_job`/`index_status`/`cancel_index_job`/
`index_progress`), C4 §5 (per-session index transaction paragraph) — both read, match
the code byte-for-byte on field names and phase strings.

**Test command:** none run by me (gates reported green per dispatch: core 1381, cli 64,
tauri 397, app 209 files / 2093, `cargo check -p app` clean). Verified statically by
reading the diffs and the listed test bodies; did not run cargo/npm.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `tauri/src/commands/index.rs:124-126` | `start_index_job` is declared `Result<bool, IpcError>` and C3 §3.2 documents `io`/`internal` errors for it ("`<data>/sessions/`/`<data>/tracks/` unreadable", "`catalog.sqlite` will not open"), but the body is `Ok(spawn_index_job(app))` — it can never return `Err`. `spawn_index_job` claims the run slot and hands the real work to a detached thread; if `index_library` then fails inside `run_index_job` (unreadable `tracks/`, `catalog.sqlite` won't open), `job.finish(report.as_ref().ok())` is called with `None`, which leaves `last_run` untouched and resets `running` to `false` — `index_status()` afterward is indistinguishable from "never started." The failure is silently discarded: no rejected promise, no toast, no chip, no `last_run`. This is worse than the incident this lane fixes (at least the old path failed *loudly*, on-screen). | Either pre-flight-check `<data>/sessions/`, `<data>/tracks/` and `catalog.sqlite` synchronously in `start_index_job` before spawning (matching the documented error rows), or store the setup error in `IndexJob` state (e.g. `last_run`/a new field) so `index_status()` can surface it, and update C3 if the contract is meant to describe the async-surfaced case instead. |
| Minor | `core/src/store/index_job.rs:436-459` doc comment | `index_one_session`'s doc says the stamps-current fast path "is safe to call before every open" and "skips in microseconds," but the fast path still runs *after* `load_track_library` (reads every `.idl0t` under `<data>/tracks/`, parses each) and `open_catalog` (opens `catalog.sqlite`) on every single call — `list_laps` now pays this on every session view, not just when the index is actually stale. Likely negligible for a small track library, but the doc comment overclaims what the "cheap" path actually costs, and nothing bounds it as the track library grows. | Either check `session_index_is_current` before loading the track library/opening the catalog (it only needs the hash, which can be computed from track file mtimes/names more cheaply, or cached), or soften the doc comment to state the real cost. |
| Minor | `core/src/store/catalog.rs:616-627` (`ensure_blob_row` fast path) | The new "skip verify_blob when the row already exists" behaviour has no dedicated test proving a corrupted/missing blob file after first indexing does *not* cause the second `index_session` call to fail (the existing `index_session_called_twice_is_idempotent…` test never touches the blob between calls, so it can't distinguish "always re-verifies" from "verifies once"). | Add a test that corrupts/removes the blob file between two `index_session` calls and asserts the second call still succeeds (or add a docs-only caveat if this is considered adequately covered by inspection). |
| Minor | `app/src/routes/pages/Notebook/index.tsx` (whole-file diff) | The diff touches all ~3092 lines with `git diff`, but `git diff -b` shows exactly one real content change (`WorkbookNotices` gains `rescanning`). The file's line endings were flipped somewhere in this lane's edit, which is unrelated reformatting churn on untouched lines (CLAUDE.md §7) even though it's whitespace-only, not logic. | Re-save the file with its original line endings (or confirm the whole repo intends to normalize and do it as its own commit), so the real one-line change is visible in `git diff` without `-b`. |
| Minor | `idl-rs-worktrees/indexing/cli/src/library.rs` (`LibraryAction::Index`) | `--all` is `conflicts_with = "session_ids"` but the match arm binds it `all: _` and never reads it — omitting both `--all` and any session ids already indexes the whole library (empty `session_ids` → `run_index` lists every session), so `--all` has no behavioural effect beyond documenting intent. Not wrong, but the brief's `[--all | ids]` phrasing reads as if one of the two is required; as implemented, neither is. | Either use `all` to require one of `--all`/ids be given (reject the ambiguous "neither" case), or drop the flag and document that no-args means "everything, resumable" — currently it's a silent no-op field. |

**Verdict rationale.** The core design is careful and correct: `ByteBudget`/`SessionCache`'s
`DecodeBudget` impl genuinely bounds N workers under one ceiling with a "wait, never fail"
semantics that cannot deadlock (a request is clamped to 4/5 of budget before the margin is
applied, so the only-fits-when-idle escape hatch is provably unreachable for indexing
workers); the `Mutex<Connection>` is held only for the brief per-session catalog commit,
never across a decode, so workers can't serialize behind I/O; per-session commits, the
`lap_detector_version`/`track_visits_library_hash` staleness check, and cancellation are all
implemented and tested exactly as ruled; the CLI runs the identical core job at the end of
`fold-in`/`rebuild`; the DTOs and `"tracks"`/`"laps"` phase strings match C3 §3.2 verbatim,
confirmed with a byte-exact unit test on the Rust side; `list_laps` indexes only its own
session before returning, matching ruling 1's "opening a session needs only that session's
index." The TASKS.md entry is unusually honest about what this lane does *not* fix (the
actual 10-minute incident cost is `rebuild_catalog`'s blob re-verification and stage-and-swap
design, not lap indexing, which the lane discovered and correctly left to a lead ruling
rather than scope-creeping a fix). The one real defect is that `start_index_job`'s documented
`io`/`internal` errors are structurally unreachable — a broken data directory makes the
background job silently no-op forever with no user-visible signal, which undercuts CLAUDE.md
§5's "never a crash on bad data" spirit by replacing a crash with silence. That is fixable
without touching the rest of the design and does not, on its own, invalidate the lane, but it
should not ship unfixed.

VERDICT: NEEDS_FIXES
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\runs\2026-09-11\REVIEW-indexing.md
COUNTS: critical=0 important=1 minor=4
NOTES: start_index_job can never surface its own documented io/internal setup errors — a broken tracks/sessions dir or unopenable catalog.sqlite makes the background job silently no-op with no toast and no last_run change.
