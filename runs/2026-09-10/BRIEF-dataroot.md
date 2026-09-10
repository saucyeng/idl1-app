# Brief: data root safety (R196) -- lean owner, Rust + app + tauri config

Read: CLAUDE.md, ruling R196, C4 §1 ("Missing root", "Moving the root"), C3 §3.10
`move_data_dir`, `runs/2026-09-10/DELETE-AUDIT.md`. Survey pointers: `rust/tauri/src/paths.rs`,
`rust/tauri/src/commands/app.rs` (`resolve_data_dir`, `set_data_dir`), `app/src/routes/pages/
Settings/{DataSection.tsx,dataDir.ts,settingsBackend.ts}`, `app/src-tauri/tauri.conf.json`.
Worktrees: Rust `idl-rs-worktrees/dataroot`, app `../idl1-app-worktrees/dataroot`.

## Tasks (one commit each)
1. core/tauri: missing-root policy. `resolve_data_dir` returns a typed `DataDirMissing { path }`
   (map to `io` with `detail: { path, reason: "missing_root" }` on the wire) when the override
   path is absent or unwritable; it must not create it or fall back. Test: absent override
   path -> error, default untouched, bootstrap file unchanged.
2. tauri: `move_data_dir` per C3 §3.10: copy the five trees, verify each blob's sha256 against
   its path, rebuild the catalog at the destination (existing rebuild path), then set the
   override and reopen; refuse nested/non-empty/unwritable targets. Progress phases as spec.
   Tests with tempdirs: round trip, a corrupted copy is detected and the override is NOT
   switched, old root untouched.
3. tauri: delete-guard test: a `#[test]` that scans `core/src`, `transport/src`, `tauri/src`
   for `remove_dir_all|remove_dir\(|remove_file\(` outside `#[cfg(test)]` and asserts the set
   of (file, function) equals the allowlist from DELETE-AUDIT.md, so a new delete site fails
   the build until audited. Keep the allowlist in the test with one comment per entry.
4. app: Settings > Data gains "Move library to..." (folder picker, confirm, progress, result),
   and a launch-time blocking screen for `missing_root` showing the path with Retry / Choose
   folder (Choose calls the existing `set_data_dir` flow). Pure modules tested; no jsdom.
5. app/src-tauri: dev identifier `com.saucyeng.idl1.dev` for `tauri dev` only (Tauri v2
   `--config` overlay file `tauri.dev.conf.json` wired into the `npm run tauri dev` script, or
   the equivalent documented mechanism; verify from the Tauri docs in node_modules, do not
   guess). Release identifier unchanged. Note in docs/CI.md.
6. `ipc/app.ts` mirror for `move_data_dir`; CHANGELOG line; TASKS.md entry.

Gates: targeted filters, then `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`,
`-p idl-rs-tauri`; `cargo check -p idl-rs-cli --tests` after core pub changes; app tsc + vitest.
Merge both repos (main into branch first), submodule bump, retire in R171 order, never push.
