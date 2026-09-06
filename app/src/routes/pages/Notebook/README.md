# Notebook tab

`plotForm/` is a pure module implementing the C2 §5.3 Plot subset:
`generate(props) → code` and `parse(code) → props | null`, zero React,
zero IPC, zero DOM. `model/` is pure TypeScript over cell segmentation
(C2 §2), tier selection, the tile cache, the point budget, and the
gesture→settle state machine — also zero React, zero IPC. `host/` is the
sandboxed iframe host: the `postMessage` protocol (pure) plus a thin host
object built on it. `sandbox/` is the iframe's own bundle
(`@observablehq/runtime` + Plot + d3 + Inputs) — it never imports
`@tauri-apps/api` and is not unit-tested, since it is rendering.
`components/` is React, also not unit-tested. **The only modules allowed
to call `invoke()` are the existing `app/src/ipc/*.ts` wrappers** — every
Notebook module takes an injected fetcher function instead, which is what
makes `model/` testable without mocking Tauri, and what keeps the sandbox
iframe (which cannot reach IPC at all — no `allow-same-origin`) honest
about what crosses its boundary.
