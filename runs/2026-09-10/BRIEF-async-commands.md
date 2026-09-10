# Brief: no command blocks the UI; scan is instant; import status is global (R201)

Lean owner, Rust `idl-rs-tauri` + app. Worktrees: Rust `idl-rs-worktrees/async-cmds`, app
`../idl1-app-worktrees/async-cmds`. Read CLAUDE.md, ruling R201, C3 §1 (command conventions)
and §3.3 (`scan_folder`). Facts: Tauri v2 runs a non-`async` `#[tauri::command]` on the main
thread, so `scan_folder` (which sha256-hashes every file in the folder), `import_file` and
`reimport_sessions` all freeze the webview for their whole duration. Isaac hit this with a
193-file, 6.9 GB folder: "just scanning", app frozen.

## Rulings (R201; do not ask)
1. **Every command that touches the filesystem beyond a stat, or computes over a session,
   runs off the main thread.** Audit every `pub fn` under `rust/tauri/src/commands/` and
   mark each such command `#[tauri::command(async)]` (least invasive: the body stays
   synchronous and runs on Tauri's thread pool). Commands that only read managed state or
   return constants stay as they are. List the before/after in the report. C3 §1 gains one
   sentence stating this rule; spec-during.
2. **`scan_folder` never hashes.** It returns instantly from directory metadata: `path`,
   `file_name`, `size_bytes`, `importer_id` by extension, `session_start_utc_ms` from the
   `.idl0` header peek only (a 4 KiB read), and `already_imported: null`. C3 §3.3's
   `ScanEntry.already_imported` becomes `boolean | null`, documented as "null = not
   checked; import de-duplicates by content hash regardless". The preview shows "checked on
   import" for null. Spec-during.
3. **Import status is global.** The existing import queue (`Data/importQueue.ts`,
   `importDriver.ts`) gets a small status chip in the shell top bar, visible on every route:
   "Importing 12 / 193 · <current file name>" with a per-file progress fraction from the
   `Progress` channel, "Import done · 190 ok, 3 failed" for a minute afterwards, and a click
   that navigates to the Data page's import panel. Pure module `shell/importStatus.ts`
   (queue state -> chip text), tested; the chip component is not unit-tested.
4. **Bulk import must not be all-or-nothing.** The preview's rows are individually
   checkable, defaulting to all; "Import selected" enqueues only those. The queue already
   runs per file, so partial imports and cancellation of the remainder ("Stop after current")
   are queue-level features: add "Stop after current" if the queue lacks it.

## Gates
Rust: `cargo test -p idl-rs-tauri -- --test-threads=4`, then `cargo check -p app` from the
app worktree's `app/src-tauri` (R199). App: `npx tsc --noEmit`, `npx vitest run`. Merge both
repos (main into branch first), submodule bump, CHANGELOG line (superproject), retire in the
R171 order using PowerShell `Remove-Item node_modules` inside the app worktree's `app/` and
`Test-Path` = False before `git worktree remove`. Never push. Report 12 lines or fewer.
