# Sources — shadcn

Fetched 2026-09-06 from the `shadcn-ui/ui` repo's `main` branch, `apps/v4/content/docs/` (the
v4 docs site's own MDX source — shadcn/ui docs are not versioned per release; the site tracks
`main` continuously). `shadcn` CLI version pinned for this task and every later UI-2/3/4 task:
**`4.21.0`** (`npx shadcn@4.21.0 …`), recorded via `npx shadcn@latest --version` on 2026-09-06.

| file | source URL |
| --- | --- |
| `vite.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/installation/vite.mdx |
| `components-json.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/(root)/components-json.mdx |
| `theming.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/(root)/theming.mdx |
| `components/button.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/button.mdx |
| `components/badge.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/badge.mdx |
| `components/input.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/input.mdx |
| `components/select.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/select.mdx |
| `components/checkbox.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/checkbox.mdx |
| `components/switch.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/switch.mdx |
| `components/toggle-group.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/toggle-group.mdx |
| `components/tabs.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/tabs.mdx |
| `components/collapsible.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/collapsible.mdx |
| `components/tooltip.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/tooltip.mdx |
| `components/scroll-area.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/scroll-area.mdx |
| `components/dialog.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/dialog.mdx |
| `components/sheet.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/sheet.mdx |
| `components/dropdown-menu.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/dropdown-menu.mdx |
| `components/context-menu.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/context-menu.mdx |
| `components/popover.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/popover.mdx |
| `components/sonner.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/sonner.mdx |
| `components/table.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/table.mdx |
| `components/resizable.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/resizable.mdx |
| `components/command.mdx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/radix/command.mdx |

Notes:
- These are the "Vite" install page, `components.json` reference, the theming/CSS-variables
  page, and the 19 component pages this lane's tasks (UI-1 through UI-4) need, per the brief.
- The component docs live under the repo's `radix` variant directory (`apps/v4/content/docs/
  components/radix/`) — the v4 docs site also carries `base/` and `aria/` variants for other
  primitive libraries; this project uses Radix per UI-DIRECTION decision 19, so only the
  `radix/` pages were fetched.
- The `npx shadcn add` CLI itself performs an authoring-time network fetch of component source
  from a registry endpoint when generating files (not from these docs pages) — see the brief's
  "Offline safety of `npx shadcn add`" section. All fetches for this SOURCES.md and all
  `shadcn add` invocations in this task reached the network on the first try; nothing was
  hand-written as a fallback.
