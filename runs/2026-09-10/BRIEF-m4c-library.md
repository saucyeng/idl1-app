# Brief: M4c library (R191) -- Rust + app, Opus lane owner

Spec is written (spec-first): C4 §2 inbox, C1 §3.1 user-supplied start, C3 §3.3 library
commands. Survey with file:line evidence: `runs/2026-09-10/M4C-SURVEY.md`. Ruling R191.
Worktrees: Rust `idl-rs-worktrees/m4c` (idl-rs), app `../idl1-app-worktrees/m4c` (junctioned
node_modules). CLAUDE.md §7: Rust DTOs, `app/src/ipc/` and C3 move together; C3 has moved.

## Tasks, in order (one commit each; gates per CLAUDE.md §8; Rust half owns the cargo slot)
1. core: `timestamp_source` on the session model + serde (default `"header"`/`"gps_backfill"`/
   `"source_file"` as the importer knows; C1 §3.1); `set_session_start` write path (atomic,
   C4 §4); catalog row updated. Tests: round-trip, `0` stays unknown, user value wins for reads.
2. core: importer staleness query (stored vs current constant per importer) and
   rebuild-from-blob keeping human-owned fields and dropping `derived/`. Tests: a stale row
   is listed; rebuild preserves `venue_name`/notes/tags/user start; failure leaves the old
   parquet intact.
3. core: folder scan (non-recursive, extension -> importer id, sha256 -> already imported,
   `.idl0` header peek for start). Tests against fixtures in `core` (the two small reference
   `.idl0` files under `C:\Users\isaac\Documents\Saucy\IDL0\reference` may be copied into the
   test fixtures if a suitable one is not already there; keep them under 100 KB).
4. tauri: the five C3 commands with DTOs byte-exact to the spec, typed errors, and the
   inbox: an `InboxWatcher` (notify + debounce + 2 s stable-size + launch scan) that drives
   the existing import path and moves failures to `inbox/failed/` with `.error.txt`;
   `unsupported_platform` on mobile targets via cfg. Gate `cargo test -p idl-rs-tauri`.
5. app: `ipc/maintenance.ts` (or `ipc/import.ts`) mirrors; Data page: "start time unknown,
   set it" prompt on a session with `timestamp_utc_ms === 0` (`sort.ts:86` already treats 0
   as unknown); "Rebuild N stale sessions" in `MaintenancePanel.tsx` over the existing
   maintenance driver; "Import folder..." on the import panel: folder picker (dialog plugin,
   `directory: true`), preview table from `scan_folder` with already-imported rows greyed,
   then per-row `import_file` enqueue into the existing queue; inbox status line on the Data
   page. Pure modules tested (preview shaping, stale summary, prompt decision); no jsdom.
6. CHANGELOG line (superproject), TASKS.md M4c entry.

## Rulings for the lane (do not ask)
- Inbox path is fixed at `<data>/inbox`; no setting. Watching uses the `notify` crate already
  in `rust/tauri`; a second watcher struct, not a generalisation of `WorkbookWatcher`.
- `scan_folder` hashes files to answer `already_imported`; it is allowed to be slow on a
  folder of large files and is called once per picker use, never on a timer.
- A user start on a session with a known importer time is allowed (C1 says so); the prompt
  only appears for `0`.
- The rebuild keeps lap and track-visit data by re-running the same detection the import
  path runs; if that cannot be made identical to import, escalate.

## Gates
Rust: task-targeted filters (non-zero passed), then `cargo test -p idl-rs -p idl-rs-cli --
--test-threads=4` and `-p idl-rs-tauri`; `cargo check -p idl-rs-cli --tests` after any core
`pub` change. App: `npx tsc --noEmit`, `npx vitest run` (report counts vs main's baseline).
Merge both repos as the legend lane did; retire in the R171 order; never push.
