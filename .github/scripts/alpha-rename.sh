#!/usr/bin/env bash
# Rename release.yml's versioned build files to the rolling alpha names and
# rewrite their checksums: idl1-app-v<version>-<rest> -> idl1-app-alpha-<rest>.
#
# Usage: alpha-rename.sh <dir> <version>
set -euo pipefail

dir="$1"
version="$2"

cd "$dir"
rm -f ./*.sha256
for f in idl1-app-v"${version}"-*; do
  [ -e "$f" ] || { echo "::error::no idl1-app-v${version}-* files in $dir"; exit 1; }
  mv "$f" "idl1-app-alpha-${f#idl1-app-v"${version}"-}"
done
for f in *; do sha256sum "$f" > "$f.sha256"; done
