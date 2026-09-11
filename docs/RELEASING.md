# Releasing

Version source of truth is `app/src-tauri/tauri.conf.json`'s `version` field.
Bump it first, commit, then cut the tag:

```
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

`release.yml` triggers on any `v*` tag push (also runnable manually via
Actions → "Release" → Run workflow, for testing without a tag). It builds
`windows-latest` and `ubuntu-22.04` in parallel and opens a **draft** GitHub
Release named `idl1 <tag>` — a tag containing `-` (e.g. `-alpha.1`) is
marked prerelease.

## Artifacts per OS

- **Windows** — `.msi` and `.exe` (NSIS) installers.
- **Linux** — `.AppImage` and `.deb`.

Nothing is code-signed yet (Windows cert, Android keystore) — that's a
follow-up. Windows installers trigger a SmartScreen "unrecognized app"
warning; users click "More info" → "Run anyway". Linux packages carry no
warning but are similarly unverified.

## Publishing the draft

Actions creates the release as a draft with both platforms' artifacts
attached once their jobs finish. Open it under Releases, check the
artifacts, edit notes if needed, then click "Publish release".

## Linux runtime notes

- The `.AppImage` needs no install — `chmod +x` and run.
- The `.deb` depends on `libwebkit2gtk-4.1-0` (pulled in automatically by
  `apt install ./idl1_*.deb`, or install manually first).
- BLE uses bluez via D-Bus; the app must have Bluetooth permission at the
  desktop-environment level (varies by distro/session).
- The window keeps native title-bar decorations on Linux (ruling R216) —
  only Windows uses the custom title bar.

## In-app updates (ruling R231)

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

Until these exist, `release.yml` still runs: it publishes an **unsigned**
draft to this repo instead (the `owner`/`repo`/token fall back), same as
before R231. Nothing breaks — updates just stay off until the pubkey is
real.

### Release body

The release's body is not written by hand: a step in `release.yml` runs
`.github/scripts/extract-changelog.sh` against `CHANGELOG.md`, pulling
the section under `## [<version>]` (the tag with its leading `v`
stripped) through to the next `##` heading. If that heading does not
exist yet — the usual case, since entries land under `## [Unreleased]`
as they're written — it falls back to the `Unreleased` section instead.
Rename `Unreleased` to the version before tagging if you want the
CHANGELOG itself to carry a permanent per-version heading; either way the
release body is correct.

## Minute budget

The superproject repo is private (2000 Actions minutes/month) — cut
releases only on tags, not on every push. See `docs/CI.md` for the rest of
the CI budget.
