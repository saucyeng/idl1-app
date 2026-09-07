# Sources — tailwind-v4

Fetched 2026-09-06 from the `tailwindlabs/tailwindcss.com` repo's `main` branch (the docs
site's own MDX/TSX source, not the rendered HTML — the rendered pages are a client-rendered
Next.js app with no clean-text export). Upstream `tailwindcss` / `@tailwindcss/vite` version at
fetch time: `4.3.3` (checked against the npm registry, matches the pin used in this task).

| file | source URL |
| --- | --- |
| `using-vite.tsx` | https://raw.githubusercontent.com/tailwindlabs/tailwindcss.com/main/src/app/(docs)/docs/installation/(tabs)/using-vite/page.tsx |
| `theme.mdx` | https://raw.githubusercontent.com/tailwindlabs/tailwindcss.com/main/src/docs/theme.mdx |
| `functions-and-directives.mdx` | https://raw.githubusercontent.com/tailwindlabs/tailwindcss.com/main/src/docs/functions-and-directives.mdx |
| `upgrade-guide.mdx` | https://raw.githubusercontent.com/tailwindlabs/tailwindcss.com/main/src/docs/upgrade-guide.mdx |

Notes:
- `using-vite.tsx` is the Vite install guide. The docs site renders its steps from a `Step[]`
  array in this Next.js page component rather than a plain MDX file (there is no
  `installation/using-vite.mdx`); the JSX/TSX is readable and greppable as committed — the
  `code:` blocks contain the exact commands and files this task follows (`npm install
  tailwindcss @tailwindcss/vite`, the `vite.config.ts` plugin wiring, `@import "tailwindcss";`).
- `theme.mdx` is the `@theme` directive / theme-variables reference (namespaces like
  `--color-*`, `--font-*`, the `@theme inline` variant used for CSS-variable-based tokens).
- `functions-and-directives.mdx` documents `@import`, `@theme`, and the other v4 at-rules.
- `upgrade-guide.mdx` is the v3→v4 differences page (CSS-first config, removed `@tailwind`
  directives in favour of `@import "tailwindcss"`, renamed utilities, etc.) — used to confirm
  this task's `index.css` shape (`@import "tailwindcss";` then the token imports) matches v4,
  not a v3 config file.

All four fetches succeeded on the first try; nothing substituted.
