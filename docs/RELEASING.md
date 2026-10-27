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

## In-app updates (ruling R231; on since 2026-10-26)

A desktop **nightly** or **stable** build updates itself. Five seconds
after launch, and every 4 h after that, it reads its channel's
`latest.json`. A newer version is downloaded in the background without
asking. Once it is downloaded, the status bar shows "Update ready ·
restart to apply" (in the narrow layout, a banner with Restart). Clicking
Restart installs it:

- **Windows:** the NSIS installer runs with a small progress window, then
  starts the new version.
- **Ubuntu (`.deb`):** the system password prompt (`pkexec`) appears, then
  the app relaunches. Cancelling the prompt leaves the old version running.
- **AppImage:** the file is replaced in place and the app relaunches.

**Beta builds, Android, and channel switches** keep the channel check above:
"Update available" with a Download link. A switch is always a download,
because the updater only knows its own build's feed.

| Build | Feed |
|---|---|
| nightly | `releases/download/nightly/latest.json` (set at build time) |
| stable | `releases/latest/download/latest.json` (`tauri.conf.json`); GitHub serves it from the newest non-prerelease |

**Versions.** The updater installs a version newer than the running one.
Every nightly used to carry `tauri.conf.json`'s version, so the `version`
job now gives the desktop build a rising one: `0.1.0-beta.3` becomes
`0.1.0-beta.3.nightly.<run>`, and `0.2.0` becomes `0.2.0-nightly.<run>`. The
chrome shows it as "build <run>". File names and the channel check still
use the base version.

**Signing.** The `tauri build` step turns on `createUpdaterArtifacts` when
the `TAURI_SIGNING_PRIVATE_KEY` secret is set, so every installer gets a
`.sig`. `.github/scripts/updater-manifest.sh` writes `latest.json` from
the signed files: it runs in `nightly-desktop` after the rename, and in
`release` for a tag. Without the secret the build still passes, unsigned,
with a warning. No manifest is written, and no build updates in place.

**Gaps.** For about ten minutes after each push the nightly release holds
only the APK, while the desktop files are still building. A check in that
window fails silently, and the next check, 4 h later, finds the update. A
build installed before signing was switched on never updates itself;
install one signed nightly by hand.

### Keys (Isaac)

- **Private key:** `~/.tauri/idl1-updater.key` on the dev machine. It has
  no password; the file is the secret. **Back it up.** If it is lost, every
  installed copy refuses updates signed with a new key, and each machine
  has to reinstall by hand once.
- **Public key:** `plugins.updater.pubkey` in `app/src-tauri/tauri.conf.json`.
- **Repo secret:** `TAURI_SIGNING_PRIVATE_KEY` holds the private key file's
  contents. Set it with
  `gh secret set TAURI_SIGNING_PRIVATE_KEY -R saucyeng/idl1-app < ~/.tauri/idl1-updater.key`.
  The password variable is set to empty in the workflow, so it needs no
  secret.

The app's startup guard (`app/src-tauri/src/lib.rs`) still never registers
the updater for a dev build (the `.dev` identifier).

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
