#!/usr/bin/env bash
# Write <dir>/latest.json, the in-app updater's manifest (docs/RELEASING.md
# "In-app updates"), from the signed desktop installers in <dir>. A file
# without its .sig is left out; with no signed file at all, no manifest is
# written and the step only warns -- builds then keep their old version.
#
# Usage: updater-manifest.sh <dir> <version> <url-base> <file-prefix> <notes>
#   <file-prefix>  idl1-app-v0.2.0 for a tag, idl1-app-nightly for nightly
set -euo pipefail

dir="$1"
version="$2"
base="$3"
prefix="$4"
notes="$5"

entries=()

# add <updater target> <file name>: one platform entry, if signed.
add() {
  local file="$dir/$2"
  if [ -f "$file" ] && [ -f "$file.sig" ]; then
    entries+=("$(jq -n --arg key "$1" --arg url "$base/$2" --rawfile sig "$file.sig" '{($key): {url: $url, signature: $sig}}')")
  fi
}

# The plugin looks for `<os>-<arch>-<installer>` first, then `<os>-<arch>`;
# a Linux install it can't place as deb or rpm is updated as an AppImage.
add windows-x86_64-nsis "$prefix-windows-x64-setup.exe"
add windows-x86_64 "$prefix-windows-x64-setup.exe"
add linux-x86_64-deb "$prefix-amd64.deb"
add linux-x86_64-appimage "$prefix-x86_64.AppImage"
add linux-x86_64 "$prefix-x86_64.AppImage"

if [ "${#entries[@]}" -eq 0 ]; then
  echo "::warning::no signed desktop installer in $dir -- no latest.json, nothing updates in place"
  exit 0
fi

printf '%s\n' "${entries[@]}" | jq -s \
  --arg version "$version" \
  --arg notes "$notes" \
  --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{version: $version, notes: $notes, pub_date: $date, platforms: add}' > "$dir/latest.json"
cat "$dir/latest.json"
