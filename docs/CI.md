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

## Minute budget

Superproject repo is private: 2000 Actions minutes/month. `ci.yml` is the
frugal default; the Android build is comparatively expensive (NDK + Rust
Android targets + Gradle) and is opt-in for that reason.
