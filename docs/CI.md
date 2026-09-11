# CI

## `ci.yml`

Runs on every push to `main` and on manual dispatch. Two jobs, both
`ubuntu-latest`, 45 min timeout each:

- `rust` — checks out the `rust` submodule, installs Tauri v2's Linux build
  deps, then runs three separate `cargo test` steps (idl-rs + idl-rs-cli,
  idl-rs-tauri, idl-transport), each `--test-threads=4`. Never `--workspace`.
- `app` — `npm ci`, `tsc --noEmit`, `vitest run` in `app/`.

Concurrency: one run per ref, newer pushes cancel in-flight ones.

## `android-apk.yml`

Manual only (`workflow_dispatch`), never on push. Builds a debug APK via
`tauri android build --debug`, running `android init` first if
`app/src-tauri/gen/android` doesn't exist yet. Uploads the APK(s) as artifact
`idl1-android-debug`. Release signing (keystore secret) is a follow-up.

To trigger: GitHub → Actions tab → "Android APK (debug)" → Run workflow.

## `coverage.yml`

Manual only (`workflow_dispatch`), never on push — tarpaulin instruments
every test binary and is much slower than a plain `cargo test` run. Two
`ubuntu-latest` jobs, 90 min timeout each:

- `rust-coverage` — same checkout/prereqs/toolchain/cache as `ci.yml`'s
  `rust` job, then installs `cargo-tarpaulin` via `taiki-e/install-action`
  and runs it once over all four crates (`idl-rs`, `idl-rs-cli`,
  `idl-transport`, `idl-rs-tauri`), `--test-threads=4`, writing Cobertura XML
  and an HTML report to `rust/target/coverage`. Uploads that directory as
  artifact `rust-coverage`, and prints the overall line-coverage percentage
  (read from the Cobertura XML) as a job summary line.
- `app-coverage` — `npm ci`, then `vitest run --coverage` (v8 provider,
  configured in `app/vitest.config.ts`), uploading `app/coverage` as
  artifact `app-coverage`. Open `index.html` in the downloaded artifact for
  the per-file breakdown.

To trigger: GitHub → Actions tab → "Coverage" → Run workflow. Read the
numbers either from the job summary (Rust) or by downloading the artifacts
and opening the HTML reports (both crates and app).

## `release.yml`

Tag-triggered (`v*`) or manual dispatch, never on push. Builds Windows and
Linux installers and opens a draft GitHub Release. See `docs/RELEASING.md`
for the full process.

## Minute budget

Superproject repo is private: 2000 Actions minutes/month. `ci.yml` is the
frugal default; the Android build is comparatively expensive (NDK + Rust
Android targets + Gradle) and is opt-in for that reason.

## Running the app in development

`npm run tauri:dev` and `npm run tauri dev` both work and are both safe.
Both go through `app/scripts/tauri.mjs`, a wrapper that adds
`--config src-tauri/tauri.dev.conf.json` to the `dev` subcommand and passes
every other subcommand through untouched. That is a Tauri v2 config overlay
(the CLI's `-c, --config` flag takes "JSON strings or paths to JSON, JSON5
or TOML files to merge with the default configuration file") whose only
substantive key is `identifier: "com.saucyeng.idl1.dev"`. It also retitles
the window "idl1 (dev)" so the two are distinguishable on screen.

The wrapper exists rather than a documented "always type this one" rule
because the unprotected command is the one a developer types by habit. An
explicit `--config` of your own suppresses the overlay, so a deliberate
choice is still possible.

Why it matters (ruling R196): Tauri derives `app_data_dir()` from the
identifier, so without the overlay a `tauri dev` run opens, writes to, and
can delete from the **same** `%APPDATA%\com.saucyeng.idl1` library a release
build uses — the finding that opened `runs/2026-09-10/DELETE-AUDIT.md`. With
it, development lives in `%APPDATA%\com.saucyeng.idl1.dev` and the real
library is untouchable from a dev build.

The release identifier in `tauri.conf.json` is unchanged, so `tauri build`
and every bundle target are unaffected; the overlay is only ever passed on
the `tauri:dev` path.

## Config overlays replace arrays

`tauri.dev.conf.json` and `tauri.windows.conf.json` both define `app.windows`; JSON merge replaces the array wholesale, so the dev overlay must repeat `"decorations": false` (R216) or the dev build shows the native title bar. Any new window property must be added to both.
