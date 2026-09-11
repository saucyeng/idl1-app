# Brief: updater -- check, notes, restart to update (R231)

Lean owner (Sonnet), TypeScript + tauri.conf/capabilities + Cargo.toml of app/src-tauri + release.yml;
cargo only for one `cargo check -p app` at the end under the two-slot rule. Worktree
`../idl1-app-worktrees/updater`. Read CLAUDE.md, ruling R231, R216 (custom title bar),
R220 (status bar, menu bar), `.github/workflows/release.yml`, `docs/RELEASING.md`,
`app/src-tauri/{tauri.conf.json,tauri.windows.conf.json,tauri.dev.conf.json,Cargo.toml,
capabilities/default.json,src/lib.rs}`, `app/src/shell/{StatusBar*,menuModel.ts,commandRegistry.ts}`.
Tauri v2 updater docs are in node_modules (`@tauri-apps/plugin-updater` README) and the plugin's
Rust crate docs; do not guess signatures.

## Do
1. Add `tauri-plugin-updater` and `tauri-plugin-process` (Rust + JS packages), register in lib.rs,
   capabilities `updater:default`, `process:allow-restart`. `plugins.updater` config: `pubkey` from
   a placeholder constant `"REPLACE_WITH_PUBKEY"` and `endpoints` =
   `https://github.com/saucyeng/idl1-releases/releases/latest/download/latest.json`; a startup
   guard disables checking while the pubkey is the placeholder (log once). Dev builds never
   check (`tauri.dev.conf.json` sets `plugins.updater.active: false` if the schema allows, else
   gate on the dev identifier).
2. Pure module `shell/updateState.ts` (idle | checking | available{version, notes, date} |
   downloading{pct} | ready | error) with tests; a checker that runs on launch (+30 s) and every
   4 h, never on the interaction path; `Help ▸ Check for updates…` in the menu bar; status-bar item
   "Update available · vX" opening a Release notes panel in the sidebar (Markdown render of the
   release body) with "Restart to update" (download with progress → install → relaunch) and
   "Later".
3. `release.yml`: set `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` from
   secrets, `includeUpdaterJson: true` in tauri-action, publish to `owner: saucyeng`,
   `repo: idl1-releases` using `secrets.RELEASES_TOKEN` (fall back to the app repo when the secret
   is absent, so the workflow keeps working before Isaac creates it); release body = the tag's
   CHANGELOG section (a small script extracts `## [X.Y.Z]` … next heading); document all of it
   in `docs/RELEASING.md` (keygen command, the two secrets, the public repo, the token scope).
4. CHANGELOG `[docs]`. Gate: tsc, vitest, vite build, YAML parse, `cargo check -p app` when the
   slot rule allows. One reviewer (sonnet). Merge --no-ff (main into branch first), retire in
   the R171 order. Never push. Report 8 lines.
