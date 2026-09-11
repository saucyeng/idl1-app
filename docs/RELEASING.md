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

## Minute budget

The superproject repo is private (2000 Actions minutes/month) — cut
releases only on tags, not on every push. See `docs/CI.md` for the rest of
the CI budget.
