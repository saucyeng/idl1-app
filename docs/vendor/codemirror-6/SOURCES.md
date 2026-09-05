# Sources — codemirror-6

Fetched 2026-09-05.

| file | source URL | notes |
| --- | --- | --- |
| `system-guide.md` | https://codemirror.net/docs/guide/ | HTML fetched then converted to Markdown (nav/header/footer stripped, `turndown`); site has no versioned docs snapshot, this is the current `main` guide. |
| `reference-index.md` | https://codemirror.net/docs/ref/ | Same conversion. This is the single-page reference index covering `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `codemirror` (the `basicSetup` bundle), and other core packages — large (~475 KB as Markdown). |
| `lang-javascript-README.md` | https://raw.githubusercontent.com/codemirror/lang-javascript/main/README.md | Package version `6.2.5` on npm, matching the `@codemirror/lang-javascript` `^6.2.5` pin. Repo carries a "moved to code.haverbeke.berlin" banner but the GitHub mirror's README is current and complete. |
| `lang-markdown-README.md` | https://raw.githubusercontent.com/codemirror/lang-markdown/main/README.md | Package version `6.5.2` on npm, matching the `@codemirror/lang-markdown` `^6.5.2` pin. |

All fetches succeeded on the first try. `codemirror.net` does not publish per-version doc
snapshots (no tags found for `lang-javascript`/`lang-markdown` on GitHub either — releases are
tracked via changesets, not git tags), so the guide/reference pages reflect the current site,
verified against the pinned npm package versions where a version string was available.
