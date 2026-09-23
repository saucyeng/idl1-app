# CI

## `ci.yml`

Runs on every push to `main` and on manual dispatch. Two jobs, both
`ubuntu-latest`, 45 min timeout each:

- `rust` — checks out the `rust` submodule, installs Tauri v2's Linux build
  deps, then runs three separate `cargo test` steps (idl-rs + idl-rs-cli,
  idl-rs-tauri, idl-transport), each `--test-threads=4`. Never `--workspace`.
  It then regenerates `docs/WORKBOOK-REFERENCE.md` with
  `idl-rs docs workbook`, `app/src/routes/pages/Notebook/model/functionCatalog.json`
  with `idl-rs docs workbook --json` and `docs/CLI-REFERENCE.md` +
  `app/src/shell/cliTable.json` with `idl-rs docs cli`, runs
  `git diff --exit-code` over each, does the same for `app/src/ipc/golden`
  with `idl-rs docs wire`, and finishes with `cargo check -p app`.
- `app` — `npm ci`, `tsc --noEmit`, an import-cycle scan (`madge --circular`
  over `app/src`; `.madgerc` skips type-only imports, which are erased at
  runtime), then `vitest run` in `app/`. The cycle scan exists because a
  value import cycle between a component and its pure model module threw
  "Cannot access before initialization" on every page load (2026-09-14)
  while `tsc`, `vitest` and `vite build` all stayed green.

Concurrency: one run per ref, newer pushes cancel in-flight ones.

## The generated workbook reference

`docs/WORKBOOK-REFERENCE.md` is generated in part: its math-builtin sections
and its retired-name table come from `idl-rs`'s own catalogs
(`core/src/math/catalog.rs` and `core/src/math/alias.rs`), and the prose
sections after them are the files in `docs/reference-src/`, appended in
filename order. Regenerate it with:

    cargo run --manifest-path rust/Cargo.toml -p idl-rs-cli --       docs workbook --out docs/WORKBOOK-REFERENCE.md --src docs/reference-src

CI runs exactly that and then `git diff --exit-code`, so a lane that adds,
renames or re-documents a builtin and forgets to regenerate fails the build
rather than shipping a reference that disagrees with the engine (ruling R222
item 1). The renderer writes LF line endings on every platform and reads the
curated files with CRLF normalised, so a Windows-generated file and the
Linux CI run produce identical bytes.

The same file is bundled into the app as a Tauri resource
(`bundle.resources` in `app/src-tauri/tauri.conf.json`) and read at runtime
by `read_workbook_reference` for the Docs panel. `docs/CLI-REFERENCE.md` is
bundled the same way, read by `read_cli_reference` for `help.cliReference`
(ruling R244/R249).

## The generated function catalog

`app/src/routes/pages/Notebook/model/functionCatalog.json` is the same
`core/src/math/catalog.rs` catalog as above, as sorted JSON rather than
Markdown (ruling R249): `functionCatalog.ts`'s `MATH_FUNCTIONS` reads it
directly, so the editor's completion and hover can no longer disagree with
the engine the way the hand-transcribed array this file replaced twice did.
Regenerate with:

    cargo run --manifest-path rust/Cargo.toml -p idl-rs-cli -- docs workbook --json --out app/src/routes/pages/Notebook/model/functionCatalog.json

CI runs exactly that and then `git diff --exit-code`, the same gate
`app/src/shell/cliTable.json` already has (ruling R230 item 2).

## The wire golden fixtures

`app/src/ipc/golden/` holds one `<format>-v<n>.bin`/`.json` pair per binary
IPC format (`IDLH`, `IDLT`, `IDLS`, `IDLG`, `IDLR`, ruling R236): a small
fixed fixture encoded by the engine's own wire encoders
(`core/src/wire_golden.rs`), and the decoded expectation a vitest per format
(`app/src/ipc/*.golden.test.ts`) deep-equals its TS decoder's output against.
Regenerate with:

    cargo run --manifest-path rust/Cargo.toml -p idl-rs-cli -- docs wire --out app/src/ipc/golden

CI runs exactly that and then `git diff --exit-code`, so an encoder changed
without regenerating the goldens fails the build instead of shipping a `.bin`
the TS decoders were never actually tested against. Deterministic: fixed
literal inputs, little-endian regardless of host, no RNG and no timestamps.

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
