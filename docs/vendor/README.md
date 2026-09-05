# docs/vendor — pinned offline documentation snapshot

This directory is a pinned, offline snapshot of third-party library documentation for the idl1
frontend lanes. CLAUDE.md §3 says "offline-first means bundled: no CDN, ever" for the shipped
app; the same principle applies to the docs agents read while building it — a lane should not
need a live network fetch mid-task to look up an API. Everything here is plain Markdown or text,
no HTML, so it greps and reads like the rest of the repo.

## Layout

One subdirectory per library:

- `tauri-v2/` — Tauri v2 (`tauri`, `@tauri-apps/api`, and the `fs`/`dialog`/`opener` plugins)
- `observable-plot/` — `@observablehq/plot`
- `observable-runtime/` — `@observablehq/runtime`, `@observablehq/inspector`, `@observablehq/inputs`
- `codemirror-6/` — CodeMirror 6 core + `@codemirror/lang-javascript` / `@codemirror/lang-markdown`
- `react-flow/` — React Flow (wave-3 material; kept small)
- `react-19/` — React 19 reference pages for a handful of specific hooks

Each subdirectory has a `SOURCES.md` listing every file it contains, the URL it was fetched
from, the fetch date, and the upstream version or commit where one exists. Where a fetch failed
or a requested page didn't exist, that subdirectory's `SOURCES.md` says so explicitly rather than
silently substituting something else.

Versions were checked against the pins in
`docs/superpowers/specs/2026-09-02-idl1-m0-ecosystem.md` where the upstream source offers
versioned docs (GitHub tags for `observablehq/plot`, `observablehq/runtime`,
`observablehq/inputs`, and npm version checks for the CodeMirror language packages). Tauri and
React don't publish per-version doc snapshots, so those directories carry the current docs-site
content instead, verified as belonging to the same major version as the pin.

## How to refresh

Re-run the fetches listed in each `SOURCES.md`, overwrite the files, and update the fetch date
and any version numbers that changed. Refresh when a pin in the M0 ecosystem report bumps a
major/minor version, or when a brief needs a page that isn't here yet — add it as a new file in
the relevant subdirectory and record it in that directory's `SOURCES.md` the same way.

## How briefs use this

Briefs and plans cite these files by path (e.g. "see `docs/vendor/tauri-v2/llms-small.txt` for
the `ipc::Response` binary-response pattern") instead of telling an agent to fetch the live site.
If a brief needs something not covered here, extend this snapshot rather than reaching for a live
URL — that keeps the lane's context reproducible and offline.
