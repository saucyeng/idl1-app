# IBM Plex Mono / Plex Sans — font source

Source: npm packages `@ibm/plex-mono@2.5.0` and `@ibm/plex-sans@1.1.0`
(https://www.npmjs.com/package/@ibm/plex-mono/v/2.5.0,
https://www.npmjs.com/package/@ibm/plex-sans/v/1.1.0), fetched 2026-09-06.
Per R93 the packages were installed only to extract the font files, then
dropped — the repo has no build-time dependency on a font registry.

The npm packages' own subsetting (`fonts/split/woff2/*-Latin1/2/3.woff2`)
does not line up with the "latin" / "latin-ext" split named in the brief, so
the six files here were built from each package's `fonts/complete/woff2/`
(full Unicode) files with `fonttools`' `pyftsubset` (installed transiently,
not committed to this repo), keeping the combined Google-Fonts "latin" +
"latin-ext" `unicode-range` (`U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC,
U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193,
U+2212, U+2215, U+FEFF, U+FFFD` plus `U+0100-02BA, U+02BD-02C5, U+02C7-02CC,
U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF,
U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF`) and all
OpenType layout features (`--layout-features='*'`). Verified after
subsetting that Basic Latin, Latin-1 Supplement and Latin Extended-A
codepoints (e.g. U+0041 `A`, U+00E9 `é`, U+0100 `Ā`) and the Euro sign
(U+20AC) all resolve in the output font's `cmap`.

| file | weight | family |
| --- | --- | --- |
| `ibm-plex-mono-400.woff2` | Regular (400) | IBM Plex Mono |
| `ibm-plex-mono-500.woff2` | Medium (500) | IBM Plex Mono |
| `ibm-plex-mono-600.woff2` | SemiBold (600) | IBM Plex Mono |
| `ibm-plex-sans-400.woff2` | Regular (400) | IBM Plex Sans |
| `ibm-plex-sans-500.woff2` | Medium (500) | IBM Plex Sans |
| `ibm-plex-sans-600.woff2` | SemiBold (600) | IBM Plex Sans |

No CDN, no Google Fonts, ever — these six files are the only source `@font-face`
in `app/src/styles/fonts.css` resolves against.
