# L8w Task 13 — implementer brief (`app/src-tauri` dialog plugin — the lane's one Tauri build)

You are the implementer for L8w Task 13: add the `tauri-plugin-dialog` crate
and its capability, and the `@tauri-apps/plugin-dialog` npm package, to
`app/src-tauri`/`app/`. This is the **only task in the lane that touches
`app/src-tauri`/`app/package.json`**, and its gate is a build/check, not a
`cargo test` filter. ONE commit, then report.

## GATE — same as every L8w task; verify before opening the worktree

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. If either fails, STOP and report.

## Where

- **This task works in the idl1-app worktree only** — there is no rust-side
  change:
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l8w-write-amendment`,
  branch `wave2-l8w-write-amendment`.
- Do NOT touch `docs/`. Do NOT touch anything under `app/src/` — R55's own
  text and the operating brief's ownership rule both say the seam swap in
  `Data/ipcStubs.ts`'s import flow is a **lead shell task**, not this one.
  Adding the crate/package/capability is this task's entire scope.
- Do NOT push.
- **Files:** modify `app/src-tauri/Cargo.toml`, `app/src-tauri/src/lib.rs`,
  `app/src-tauri/capabilities/default.json`, `app/package.json`.

- Read first: `CLAUDE.md` §8 (compute rules — this task's own gate is a
  build, run it once, not repeatedly "to be sure"); plan Task 13 in full
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`);
  ruling R55 in `runs/2026-09-03/decisions.md` ("no dialog plugin exists in
  the repo today; `L7a`'s `pickImportFile()` seam is a pasted-path input
  pending this... the seam is swapped by a shell task then"); the landed
  `app/src-tauri/Cargo.toml`, `app/src-tauri/src/lib.rs`,
  `app/src-tauri/capabilities/default.json` **in full** (all three are
  short — read them, don't guess their current shape); `app/package.json`
  (to see the existing `@tauri-apps/*` dependency versions, so the dialog
  plugin's npm package pins consistently with what's already there).

## COMPUTE RULES — non-negotiable

This task's gate is **not** a `cargo test` filter — no Rust/TS logic is
added, only dependency + capability wiring. The proof is a build/check, run
**once**. Pick one of:
- (a) `npm run tauri dev` — the more complete proof (a real window opens),
  matching this lane's "one real Tauri build" framing.
- (b) `cargo check -p app_lib` (proves the new plugin dependency compiles)
  plus `npm install` + `npx tsc --noEmit` in `app/` (proves the npm package
  resolves and the TS side still typechecks) — lighter, doesn't need a
  window to actually open.

Your call which to run — document which and paste its output in full in
your report. Run it **once**; no rerun "to be sure" (CLAUDE.md §8). No
`cargo fmt`, no `cargo tarpaulin`, no `cargo doc`. One cargo process on the
machine at a time — if `npm run tauri dev` triggers a cargo build under the
hood, that counts as this task's one cargo process; do not also separately
run `cargo check` afterward.

## Key logic

1. **`app/src-tauri/Cargo.toml`**: add `tauri-plugin-dialog` under
   `[dependencies]`. Resolve its version against the pinned `tauri = "2.11.5"`
   — run `cargo add tauri-plugin-dialog` (or hand-edit + `cargo check` to
   confirm resolution) and record whatever version it actually resolves to
   in your commit message and report, per the plan's own instruction ("pin
   whatever `cargo add tauri-plugin-dialog` resolves to against that Tauri
   version, record the resolved version in the task's commit"). Stage
   `Cargo.lock` too (CLAUDE.md's general rule: a manifest change stages its
   lock file alongside it).
2. **`app/src-tauri/src/lib.rs`**: add `.plugin(tauri_plugin_dialog::init())`
   to the `tauri::Builder::default()` chain, alongside the existing
   `.setup(...)`/`.invoke_handler(...)` calls — do not reorder the existing
   chain, just insert this one call (builder methods are order-sensitive in
   general, but `.plugin()` before `.invoke_handler()` is the conventional
   placement; read Tauri's own plugin-registration example if the current
   file's structure makes the insertion point unclear, don't guess blindly).
3. **`app/src-tauri/capabilities/default.json`**: add `"dialog:default"` to
   the existing `"permissions"` array (alongside `"core:default"` — do not
   remove or reorder the existing entry).
4. **`app/package.json`**: add `@tauri-apps/plugin-dialog` at whatever
   version the existing `@tauri-apps/*` entries in this file suggest is the
   compatible line for this project's pinned Tauri v2 (check the existing
   entries' versions first, then pick a compatible dialog-plugin version —
   do not guess a version disconnected from what's already pinned).

## Do not

- Do not touch `app/src/` at all — not `Data/ipcStubs.ts`, not any new
  `app/src/ipc/` file. The seam swap is a separate lead shell task.
- Do not run `cargo fmt`, `cargo tarpaulin`, or `cargo doc`.
- Do not rerun the build/check "to be sure" — one run, its output pasted in
  full in your report.
- Do not touch `rust/` at all — this task has no rust-worktree component.
- Do not push.

## Style / hygiene

No new Rust/TS logic to doc-comment — this is dependency and capability
wiring only. Keep the diff minimal and surgical to the four files named
above.

## Spec discipline (say it out loud in your report)

"No spec change needed" — this task wires infrastructure C3/R55 already
call for; no command shape or contract changes.

## The task, in order

- [ ] **Step 1: Confirm the gate**, open/reuse the app worktree.
- [ ] **Step 2: Read the four files' current state** (Cargo.toml, lib.rs,
      capabilities/default.json, package.json).
- [ ] **Step 3: `cargo add tauri-plugin-dialog`** (or hand-edit) in
      `app/src-tauri/`, note the resolved version.
- [ ] **Step 4: Add `.plugin(tauri_plugin_dialog::init())`** to `lib.rs`.
- [ ] **Step 5: Add `"dialog:default"`** to the capability's permissions.
- [ ] **Step 6: Add `@tauri-apps/plugin-dialog`** to `app/package.json` at a
      version consistent with the existing `@tauri-apps/*` pins.
- [ ] **Step 7: Run the chosen proof** (`npm run tauri dev` or the
      `cargo check -p app_lib` + `npm install` + `npx tsc --noEmit`
      combination), once, capture its full output.
- [ ] **Step 8: Commit** — explicit paths: `git add app/src-tauri/Cargo.toml
      app/src-tauri/Cargo.lock app/src-tauri/src/lib.rs
      app/src-tauri/capabilities/default.json app/package.json` (add
      `app/package-lock.json`/`app/node_modules` lockfile too if `npm
      install` changed it and the repo tracks it — check `git status`
      first, do not blindly `git add -A`) — message
      `app: wire tauri-plugin-dialog crate + capability + npm package (R55)`.

## Report back (concise)

Commit hash + `git show --stat`; the resolved `tauri-plugin-dialog` version
and the `@tauri-apps/plugin-dialog` npm version chosen, and why; which proof
you ran (a or b) and its full output; confirmation nothing under `app/src/`
was touched; confirmation `rust/` was untouched; anything ambiguous you
resolved (say how) or that needs a lead ruling (stop and report instead of
guessing — CLAUDE.md §1).
