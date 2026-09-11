#!/usr/bin/env bash
# Extracts one version's section from CHANGELOG.md for the release body
# (ruling R231, docs/RELEASING.md). Looks for `## [<version>]` first — the
# heading a version keeps once the lead has renamed it off `Unreleased` —
# and falls back to `## [Unreleased]` for a tag cut while the entries
# still sit there. Either way, the section runs to the next `## [`
# heading or end of file. Prints a warning to stderr (not a failure) if
# neither is found, so the workflow step still succeeds with an empty
# body rather than failing the whole release.
set -euo pipefail

version="$1"
changelog="${2:-CHANGELOG.md}"

# Prints heading's section, trimmed of leading/trailing blank lines.
extract_section() {
  local heading="$1"
  awk -v heading="$heading" '
    $0 == heading { found = 1; next }
    found && /^## \[/ { exit }
    found { print }
  ' "$changelog" | awk '
    { lines[NR] = $0; if ($0 !~ /^[[:space:]]*$/) last = NR }
    END {
      start = 1
      while (start <= NR && lines[start] ~ /^[[:space:]]*$/) start++
      for (i = start; i <= last; i++) print lines[i]
    }
  '
}

body="$(extract_section "## [${version}]")"
if [ -z "$body" ]; then
  echo "extract-changelog: no '## [${version}]' section, falling back to Unreleased" >&2
  body="$(extract_section "## [Unreleased]")"
fi

if [ -z "$body" ]; then
  echo "extract-changelog: no matching CHANGELOG section for ${version}" >&2
fi

echo "$body"
