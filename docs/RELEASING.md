# Releasing

Version source of truth is `app/src-tauri/tauri.conf.json`'s `version` field.
Bump it first, commit, then cut the tag:

```
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

`release.yml` triggers on any `v*` tag push. A `version` job first fails the
run if the tag is not `v` + `tauri.conf.json`'s version. Then three jobs
build in parallel and upload their files as workflow artifacts, and one
final `release` job publishes them together as a single GitHub Release on
this repo, named `idl1 <tag>` (the idl0-app pattern: separate build and
publish, so parallel uploads cannot race). A tag containing `-` (e.g.
`-alpha.2`) is marked prerelease. The release is published immediately,
not drafted.

Running it by hand (Actions → "Release" → Run workflow, any branch) is a
dry run: every platform builds and its files stay on the run as
artifacts, but nothing is published.

## Nightly (every push to `main`)

A push to `main` runs the same three builds and publishes them on one
moving prerelease, tag `nightly`, which is deleted and recreated at the new
commit each time. (Until 2026-10-15 this tag was `alpha`, which collided
with the `-alpha.N` prerelease tags; the workflow now deletes the old
`alpha` release.) Nothing is bumped or tagged by hand. The file names carry
no version, so these never change:

- release page: `https://github.com/saucyeng/idl1-app/releases/tag/nightly`
- APK: `https://github.com/saucyeng/idl1-app/releases/download/nightly/idl1-app-nightly-arm64.apk`

The APK is published as soon as the Android job finishes (`nightly` job);
the Windows and Linux files are attached to the same release when they
finish (`nightly-desktop` job), also if only one of the two built. The
release title, `idl1 nightly (build <n>, <sha7>)`, carries the build number
and commit; the app's own version string stays at `tauri.conf.json`'s until
the next tagged release. A newer push cancels the run still building an
older one. A push that changes only `docs/`, `runs/` or Markdown files
builds nothing.

## Artifacts per platform

- **Android** — `idl1-app-v<version>-arm64.apk`, release-signed (arm64
  only; covers essentially every current phone).
- **Windows** — `…-windows-x64-setup.exe` (NSIS). No MSI: WiX only
  accepts numeric versions, so `0.1.0-alpha.2` cannot build one.
- **Linux** — `…-x86_64.AppImage` and `…-amd64.deb`.

Each file has a `.sha256` beside it. The release body is a download table
followed by the version's `CHANGELOG.md` section (see "Release body").

The Windows installers are not code-signed: they trigger a SmartScreen
"unrecognized app" warning; users click "More info" → "Run anyway".

## Android signing

The APK is signed with idl1's own release key (not idl0's: the package id
differs, so the two apps never update over each other anyway). The keystore
lives on the lead's machine at `~/.android/idl1-release.jks`, with its alias
and password in `~/.android/idl1-release.txt`, and is stored as four repo
secrets that `release.yml` restores:

- `ANDROID_KEYSTORE_B64` — `base64 -w0 idl1-release.jks`
- `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD` — the same password
  (PKCS12 keystores have one)
- `ANDROID_KEY_ALIAS` — `idl1`

`gen/android/app/build.gradle.kts` reads the path (`ANDROID_KEYSTORE_PATH`)
and the three values from the environment; with none set, a local release
build comes out unsigned. **Back the keystore up.** Losing it means no
release can ever update an installed copy again: every user would have
to uninstall first.

Every APK carries the **same** `versionCode`, `ANDROID_VERSION_CODE` at
the top of `release.yml` (100000; 2026-10-15). Android installs an APK over
the installed app when its `versionCode` is equal or higher, so with one
fixed value any build installs over any other, and nightly, beta and stable
switch freely in both directions. Android never decides which build is
newer; the app's own update check does (C3 §3.10). Builds before
2026-10-15 used the run number (up to 24), so 100000 sits above them.
**Never lower it**, or every installed copy refuses the next build. The CI
run number survives only as the `(build <n>)` label in release titles.

`android-apk.yml` builds a debug APK (arm64) on demand, for
trying an Android change without cutting a release.

## Linux runtime notes

- The `.AppImage` needs no install — `chmod +x` and run.
- The `.deb` depends on `libwebkit2gtk-4.1-0` (pulled in automatically by
  `apt install ./idl1_*.deb`, or install manually first).
- BLE uses bluez via D-Bus; the app must have Bluetooth permission at the
  desktop-environment level (varies by distro/session).
- The window keeps native title-bar decorations on Linux (ruling R216) —
  only Windows uses the custom title bar.

## Channels and in-app update checks

| Channel | Built from | Checks |
|---|---|---|
| **stable** | a `vX.Y.Z` tag | the newest `vX.Y.Z` release |
| **beta** | a `vX.Y.Z-<pre>` tag (e.g. `v0.2.0-beta.1`; the older `-alpha.N` tags count) | the newest semver tag, prerelease or not |
| **nightly** | every push to `main` (the moving `nightly` release) | the moving release |

`release.yml` sets `VITE_RELEASE_CHANNEL`, `VITE_APP_VERSION` and
`VITE_BUILD_NUMBER` on the desktop and Android build steps; a local build
has no channel and never checks. Settings ▸ About ▸ **App updates** can
pick a different channel and has **Check for updates**; otherwise a build
checks its own channel once, 5 s after launch (`check_app_update`, C3
§3.10). A newer release shows as a banner above the tab bar on a phone, or
the status-bar chip on desktop. "Download" opens the APK on Android (the
browser downloads it, a tap installs it over the running build) and the
release page on desktop.

**Switching channels works at any time.** Picking a channel other than
the build's own is a switch, and the check always offers that channel's
latest release, whatever its version. It installs because every APK has
the same `versionCode` (see "Android signing"). On the build's own
channel, nightly is newer by the build label in its title, and beta and
stable by semver. An older version can still fail to open data a newer one
wrote. Session files are versioned and the catalog rebuilds, so this is
rare, but the Settings note says so.

## In-app updates (ruling R231)

**Currently off.** The channel check above is what notifies today.
`release.yml` neither signs updater bundles nor writes
`latest.json`. This repo went public on 2026-09-23, so the separate
`idl1-releases` repo described below is no longer needed: the endpoint can
point at this repo's `releases/latest/download/latest.json`. Wiring it up
means the keypair and pubkey steps below, plus the signing env and a
`latest.json` step in the `release` job.

The app checks for updates on launch (+30 s) and every 4 h, and from
`Help ▸ Check for updates…`. It fetches
`https://github.com/saucyeng/idl1-releases/releases/latest/download/latest.json`
— `tauri-apps/tauri-action`'s `includeUpdaterJson: true` writes that file
onto every release automatically.

### Why a second, public repo

This repo is private, and the updater's `latest.json` must be fetchable
without authentication (the plugin has no way to attach a token to that
request). Releases therefore publish to a separate **public**
`saucyeng/idl1-releases` repo instead of here. Only the release job's
target changes — source, issues and everything else stay in this repo.

### One-time setup (Isaac)

1. **Create the public repo** `saucyeng/idl1-releases` (empty; the
   workflow creates releases in it, nothing else needs to live there).
2. **Generate the signing keypair**, from `app/`:
   ```
   npm run tauri signer generate -- -w ~/.tauri/idl1.key
   ```
   This prints a public key and writes the private key (optionally
   password-protected) to the path given.
3. **Put the public key in the app**: replace
   `"REPLACE_WITH_PUBKEY"` in `app/src-tauri/tauri.conf.json`'s
   `plugins.updater.pubkey` with the printed public key, commit. Until
   this is done, the app's own startup guard (`app/src-tauri/src/lib.rs`)
   never registers the updater plugin, so update checks are silently off
   — the same guard also fires for dev builds (the `.dev` identifier),
   so a developer's local build never checks either.
4. **Store two repo secrets** on *this* repo (`idl1-app`), Settings →
   Secrets and variables → Actions:
   - `TAURI_SIGNING_PRIVATE_KEY` — the private key file's contents.
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — its password, if one was set
     (empty string otherwise).
5. **Create `RELEASES_TOKEN`**: a GitHub fine-grained personal access
   token scoped to the `saucyeng/idl1-releases` repo only, with
   **Contents: Read and write** (that's what `tauri-action` needs to
   create a release and upload assets) and no other repos or
   permissions. Store it as a secret named `RELEASES_TOKEN` on *this*
   repo.

Until the pubkey is real, the app's startup guard keeps update checks
off, so nothing breaks.

### Release body

The release's body is not written by hand: a step in `release.yml` runs
`.github/scripts/extract-changelog.sh` against `CHANGELOG.md`, pulling
the section under `## [<version>]` (the tag with its leading `v`
stripped) through to the next `##` heading. If that heading does not
exist yet — the usual case, since entries land under `## [Unreleased]`
as they're written — it falls back to the `Unreleased` section instead.
Rename `Unreleased` to the version before tagging if you want the
CHANGELOG itself to carry a permanent per-version heading; either way the
release body is correct. A section over 60,000 characters (GitHub caps
release bodies at 125,000) is replaced by a link to `CHANGELOG.md` at the
tag, which is what happens while everything since the start still sits
under `Unreleased`.

## Minute budget

This repo is public (since 2026-09-23), so Actions minutes on standard
runners are free. Tagged releases run on tags; nightly runs on
every push to `main` that changes more than docs.
The Windows + Linux release of `v0.1.0-alpha.1` took 31 min wall-clock;
Android adds a third parallel job. See `docs/CI.md` for the rest of the CI budget.
