#!/usr/bin/env python3
"""The `android-rebuild` job's matrix (release.yml, `version` job).

A push to `main` rebuilds the latest stable tag and the latest beta tag, so their APKs carry this run's
build number (the APK versionCode). Android only installs an APK whose
versionCode is at least the installed one's. With the rebuilds, someone on
nightly can switch back to beta or stable at any time (C3 §3.10,
docs/RELEASING.md "Channels").

Usage: android-matrix.py < `gh release list --json tagName,isDraft`
prints the matrix JSON: a list of {ref, version, channel}, at most two
entries, and `[]` when there are no tags.
"""
import json
import re
import sys

SEMVER = re.compile(r"^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$")


def key(tag):
    """Semver precedence key: numbers, then a release above its prereleases,
    then the prerelease identifiers part by part (numeric below alpha)."""
    m = SEMVER.match(tag)
    nums = tuple(int(x) for x in m.groups()[:3])
    pre = m.group(4)
    if pre is None:
        return nums + ((1,),)
    parts = tuple((0, int(p), "") if p.isdigit() else (1, 0, p) for p in pre.split("."))
    return nums + ((0,) + parts,)


def main():
    releases = json.load(sys.stdin)
    tags = [r["tagName"] for r in releases if not r.get("isDraft") and SEMVER.match(r["tagName"])]
    stable = [t for t in tags if SEMVER.match(t).group(4) is None]
    picks = []
    if stable:
        picks.append(max(stable, key=key))
    if tags:
        newest = max(tags, key=key)
        if newest not in picks:
            picks.append(newest)
    # The beta channel's latest may be a stable tag; it is then built once.
    matrix = [{"ref": t, "version": t[1:], "channel": "beta" if "-" in t else "stable"} for t in picks]
    print(json.dumps(matrix))


if __name__ == "__main__":
    main()
