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

## Minute budget

Superproject repo is private: 2000 Actions minutes/month. `ci.yml` is the
frugal default; the Android build is comparatively expensive (NDK + Rust
Android targets + Gradle) and is opt-in for that reason.
