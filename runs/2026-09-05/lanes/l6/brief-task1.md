# L6 Task 1 — implementer brief (`routes/pages/Notebook/` directory move, no shell change)

You are the implementer for L6 Task 1 of the idl1 rewrite — the first task
of the Notebook tab lane, and the only one in this wave of four that touches
no logic at all. TDD is not applicable here (a pure file move); ONE commit,
then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. It does not exist yet — create it:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
  git worktree add -b wave2-l6-notebook "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook" main
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook"
  git submodule update --init -- rust
  cd app && npm ci
  ```
  HEAD on `main`, status clean. Verify first; if not, stop and report.
- Work ONLY in `app/` inside this worktree. Do NOT touch
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` (shared checkout — must
  stay on `main`), the `rust/` submodule (init only, never build, never
  edit), or any other worktree. Do NOT edit anything under `docs/`. Do NOT
  push.
- **No cargo, ever, in this worktree** — the §8 hook denies it. `rust/` is
  initialised only so `tsc` and imports resolve.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`;
  this lane's `runs/2026-09-05/lanes/l6/BRIEF.md`; the plan's Global
  Constraints and `## Task 1` (`docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md`,
  lines 81–252) — this brief transcribes it with nothing changed, read the
  plan section too for the full rationale; the current
  `app/src/routes/pages/NotebookPage.tsx` and `app/src/App.tsx` (both read
  below, so their content is already given to you — you do not need the
  shared checkout for this, the worktree has its own copy).

## Why this task exists (context, not a step)

`App.tsx` is lead-owned (operating brief §2) and currently imports
`./routes/pages/NotebookPage`. This lane needs the page to become a
directory (`Notebook/index.tsx` plus subdirectories for the modules later
tasks add), but a directory named `Notebook` with an `index.tsx` does
**not** satisfy the specifier `./routes/pages/NotebookPage` — Vite/Node
resolution needs either the old file to exist or `App.tsx` to change. Since
`App.tsx` is lead-owned, this task leaves a **one-line re-export shim** at
the old path instead of asking for a shell task — the lane never blocks on
it. The shim is deleted by Task 16 together with the lead's one-line
`App.tsx` change, applied together at the lane merge gate.

## The task

**Files:**
- Create: `app/src/routes/pages/Notebook/index.tsx` (the wave-1 page,
  moved verbatim except two import paths), `app/src/routes/pages/Notebook/README.md`.
- Delete (as a file, replaced by the shim below): the old
  `app/src/routes/pages/NotebookPage.tsx` content — the path itself is kept,
  now holding only the shim.
- Modify: nothing else.

**Interfaces:** unchanged — `export default function NotebookPage()`
remains the export the shim re-exports. The component itself keeps its
current name and signature; only its file location changes.

- [ ] **Step 1: Move the page**

  ```bash
  git mv src/routes/pages/NotebookPage.tsx src/routes/pages/Notebook/index.tsx
  ```
  Content is unchanged **except** its two relative imports, which each gain
  one `../` because the file moved one directory deeper:
  ```ts
  import { getSession, listSessions } from "../../../ipc/catalog";
  import { fetchTile, type DecodedTile } from "../../../ipc/tiles";
  ```
  (was `../../ipc/catalog` and `../../ipc/tiles`). No other line changes.

- [ ] **Step 2: Leave a re-export shim at the old path**

  Write `app/src/routes/pages/NotebookPage.tsx` as exactly:
  ```ts
  /** Re-export shim so `App.tsx` (lead-owned, operating brief §2) keeps its
   *  existing import specifier while L6 builds the tab out under
   *  `Notebook/`. Deleted by Task 16 together with the one-line `App.tsx`
   *  change, applied by the lead as a shell task at the lane merge. */
  export { default } from "./Notebook";
  ```

- [ ] **Step 3: Write `Notebook/README.md`**

  One paragraph naming the five subdirectories this lane's later tasks add
  and the rule that binds them together. Content (verbatim, adjust nothing):
  ```markdown
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
  ```

- [ ] **Step 4: Gate**

  ```
  npx tsc --noEmit && npx vitest run src/ipc
  ```
  Expected: `tsc` silent (no errors). **This task's gate is `src/ipc`, not
  `src/routes/pages/Notebook`** — vitest matches nothing under
  `Notebook/` yet (there are no `*.test.ts` files there until Task 2), and a
  filter matching nothing is a failed gate (CLAUDE.md, standing rule). The
  `src/ipc` filter runs the landed IPC test suite (≥ 1 passed) to prove the
  move broke no import elsewhere. Every later task in this lane uses its own
  real filter under `Notebook/`.

- [ ] **Step 5: CHANGELOG**

  Add under `[Unreleased]` in `CHANGELOG.md`:
  ```
  - **Notebook tab: page becomes a directory (L6 Task 1).** routes/pages/NotebookPage.tsx → routes/pages/Notebook/index.tsx with a re-export shim; no behaviour change.
  ```

- [ ] **Step 6: Commit**

  Explicit paths (NOT `git add -A`):
  ```
  git add src/routes/pages/Notebook/index.tsx src/routes/pages/Notebook/README.md src/routes/pages/NotebookPage.tsx ../CHANGELOG.md
  ```
  (adjust the `CHANGELOG.md` path to wherever it actually lives relative to
  `app/` — check with `git status` before committing; do not blind-copy this
  path if the repo layout differs). Message, single line, no AI attribution
  trailer:
  ```
  app: Notebook page becomes a directory (L6 Task 1)
  ```

## Do not

- Do not change the component's exported name, props, or any line of logic
  — this is a pure move plus two import-path edits.
- Do not touch `App.tsx` — the shim exists precisely so this task never
  needs to.
- Do not run any cargo command in this worktree.
- Do not add a `Notebook/plotForm/`, `model/`, `host/`, `sandbox/`, or
  `components/` directory yet — those are created by Tasks 2 and onward,
  each with its own files. An empty placeholder directory here is a finding.
- Do not use `git add -A` — list files explicitly so an accidental stray
  file (e.g. `node_modules` drift, an editor swap file) cannot slip into the
  commit.

## Spec discipline (say it out loud in your report)

"No spec change needed" — this task is a pure refactor with no behaviour
change; the plan's own spec-discipline note assigns any SPEC writing to
Task 16.

## Report back (concise)

Commit hash + `git show --stat`; the exact gate command and its result line
(the `tsc` line, and vitest's `passed`/`failed` counts); confirmation the
two import paths in the moved file now read `../../../ipc/catalog` and
`../../../ipc/tiles`; confirmation `NotebookPage.tsx` now contains only the
shim; per-step done/deviated; anything ambiguous you resolved (say how) or
that needs a lead ruling (stop and report instead of guessing — CLAUDE.md
§1).
