# Sources — react-19

Fetched 2026-09-05 from the `reactjs/react.dev` repo's `main` branch (the docs site's own
Markdown+MDX source, not the rendered HTML — cleaner and matches what the site publishes).

| file | source URL |
| --- | --- |
| `useSyncExternalStore.md` | https://raw.githubusercontent.com/reactjs/react.dev/main/src/content/reference/react/useSyncExternalStore.md |
| `useTransition.md` | https://raw.githubusercontent.com/reactjs/react.dev/main/src/content/reference/react/useTransition.md |
| `useDeferredValue.md` | https://raw.githubusercontent.com/reactjs/react.dev/main/src/content/reference/react/useDeferredValue.md |
| `useRef.md` | https://raw.githubusercontent.com/reactjs/react.dev/main/src/content/reference/react/useRef.md |

Note: the brief's "Canvas/ref callback pattern page (`useRef`)" names `useRef` itself, not a
separate page — `useRef.md` covers "Manipulating the DOM with a ref" and ref-callback patterns
directly; no page named "Canvas" exists on react.dev (checked, including
`learn/manipulating-the-dom-with-refs.md` and `learn/escape-hatches.md` — neither is
canvas-specific either, so nothing extra was fetched).

These pages are MDX (React docs use custom `<Intro>`, `<Note>`, `<Sandpack>` components inside
Markdown) rather than plain Markdown — left as-is since converting would risk losing example
code embedded in `<Sandpack>` blocks; the prose and code samples are readable as-is.

`react.dev`'s docs are not versioned per React release in this repo (docs track the latest API,
which is React 19 as pinned: `react`/`react-dom` `^19.2.8`); no version mismatch to flag.

All fetches succeeded on the first try.
