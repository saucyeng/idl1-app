# Sources — observable-plot

Fetched 2026-09-05 from `github.com/observablehq/plot` at tag `v0.6.17` (exact match to the
`@observablehq/plot` `^0.6.17` pin in `docs/superpowers/specs/2026-09-02-idl1-m0-ecosystem.md`),
via `raw.githubusercontent.com/observablehq/plot/v0.6.17/docs/...`.

Files are VitePress-flavored Markdown (some carry `<script setup>` / frontmatter blocks used to
drive live examples on the docs site); the prose, options tables, and code samples are intact.

| file | source path |
| --- | --- |
| `getting-started.md` | `docs/getting-started.md` |
| `features/plots.md` | `docs/features/plots.md` (the `plot()` options reference — options index) |
| `features/scales.md` | `docs/features/scales.md` |
| `marks/line.md` | `docs/marks/line.md` |
| `marks/dot.md` | `docs/marks/dot.md` |
| `marks/rect.md` | `docs/marks/rect.md` |
| `marks/rule.md` | `docs/marks/rule.md` |
| `marks/text.md` | `docs/marks/text.md` |
| `marks/image.md` | `docs/marks/image.md` |
| `marks/raster.md` | `docs/marks/raster.md` |
| `marks/axis.md` | `docs/marks/axis.md` (axes) |
| `marks/tip.md` | `docs/marks/tip.md` (interactions: tip) |
| `interactions/pointer.md` | `docs/interactions/pointer.md` |
| `interactions/crosshair.md` | `docs/interactions/crosshair.md` |
| `transforms/bin.md` | `docs/transforms/bin.md` |
| `transforms/group.md` | `docs/transforms/group.md` |
| `transforms/window.md` | `docs/transforms/window.md` |

Skipped: the gallery, and `docs/api.md` — that page is a client-side-rendered index
(`<script setup> import {data} from "./data/api.data"`) with no static content to fetch; the
actual `plot()` options are documented in `features/plots.md` instead, which was fetched.

All fetches succeeded on the first try.
