# Sources — react-flow

Fetched 2026-09-05. React Flow is not in the M0 ecosystem pins table (wave-3 material per the
brief); docs reflect whatever is current on reactflow.dev at fetch time — no version pin to
match against.

| file | source URL | notes |
| --- | --- | --- |
| `llms.txt` | https://reactflow.dev/llms.txt | Index of all doc pages with one-line descriptions (not full text). |
| `custom-nodes.md` | https://reactflow.dev/learn/customization/custom-nodes | Guide page. Site is a Next.js/Nextra app with no `.md` suffix route (`/…\.md` returns 404); fetched the rendered HTML and converted the `<article>` content to Markdown with `turndown`, stripping nav/header/footer/aside. Inline JSX code samples render as single-line backtick spans rather than fenced blocks — an artifact of the site's syntax highlighter markup, not missing content. |
| `node-toolbar.md` | https://reactflow.dev/api-reference/components/node-toolbar | `<NodeToolbar />` component API reference, same conversion method. |
| `uncontrolled-flow.md` | https://reactflow.dev/learn/advanced-use/uncontrolled-flow | The brief asked for a "controlled-flow guide" page; reactflow.dev has no page at that path. This "Uncontrolled Flow" guide is the closest match — it explains React Flow's controlled-vs-uncontrolled state model directly (the controlled pattern is otherwise documented piecemeal across `useNodesState()`/`useEdgesState()` API reference pages, not fetched here to keep this wave-3 slice small). |

All fetches succeeded on the first try.
