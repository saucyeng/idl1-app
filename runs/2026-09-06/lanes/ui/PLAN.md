# UI lane — styling pass (UI-1 … UI-11)

Design input: `runs/2026-09-06/ui/UI-DIRECTION.md` (status final, adopted by
**R92**). Companion survey: `runs/2026-09-06/ui/FLUTTER-UI-SURVEY.md`.
Rulings: `runs/2026-09-06/RULINGS-DIGEST.md` (read this, not the ledger).
Operating rules: `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §2 (ownership),
§4 (gates, effects rule + its tightening), §7 (token economy).

TypeScript only. No cargo in any UI worktree. Every task is one commit, one
review, one merge to `main` by the lead before the next dependent task starts.

## Order (R92)

```
UI-1 tokens+fonts → UI-2 primitives → UI-3 overlays → UI-4 shell
  ├─ concurrent after UI-4:  UI-5 Device | UI-6 Data | UI-7 Settings
  └─ serial after UI-4, one worktree:
       UI-8 Plot theme → UI-9 CodeMirror → UI-10 Notebook frame → UI-11 cursor+transport
```

UI-1→4 are strictly serial: each needs the previous merged to `main`.
UI-5/6/7 start only after UI-4 is on `main`; they touch disjoint page
directories and never the shell. UI-8→11 are the Notebook worktree, serial,
one writer at a time; they may start as soon as UI-4 is on `main` and run
concurrently with UI-5/6/7.

## Worktrees

| Task | Worktree | Path |
|---|---|---|
| UI-1 … UI-7 | `ui-<n>` | `C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-<n>` |
| UI-8 … UI-11 | `ui-8` (= R92's "the Notebook worktree") | `…/idl1-app-worktrees/ui-8` |

Create with `git worktree add`; the shared checkout stays on `main` (R9/R10).
UI-9/10/11 each merge `main` into `ui-8` before starting (R19 pattern).

## Lead-owned files, and who may touch them

Operating brief §2 lists `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`,
`state/AppState.tsx`, `package.json`/lockfile, `vite.config.ts` as lead-owned.
R92 grants them inside these tasks, with lead review:

| File | Task allowed to edit | Nobody else |
|---|---|---|
| `app/package.json` + lockfile | UI-1 (all deps), UI-2 (icons only), UI-3, UI-4 (`cmdk`/resizable deps) | — |
| `app/vite.config.ts` | UI-1 (Tailwind plugin) | — |
| `app/src/main.tsx` | UI-1 (stylesheet import) | — |
| `app/src/App.css` | UI-1 (deletes it) | — |
| `app/src/App.tsx` | UI-1 (drops the `App.css` import line), UI-4 (rewrites) | — |
| `app/src/routes/types.ts` | UI-4 (tab order) | — |
| `app/src/state/**` | UI-4 | — |
| `app/src/routes/pages/Device/index.tsx` | UI-4 (visibility wiring only), UI-5 | — |

Everything under `rust/`, `app/src-tauri/`, and every contract stays frozen.
No task adds an IPC command; no task adds a new effect that starts IPC.

## Standing rules for every task in this lane

- **Gate:** `cd app && npx tsc --noEmit && npx vitest run <filter>`; vitest must
  report a non-zero `passed` count. Reviewer runs the same once.
- **No CDN, no runtime fetch** (CLAUDE.md §3, R92): fonts, CSS, components and
  icons come from `node_modules` or committed files.
- **No hex outside `tokens.css`.** UI-1's `tokenSheet.test.ts` enforces this
  repo-wide; every later task keeps it green.
- **Effects rule** (operating brief §4 + tightening): styling adds no effect
  that starts IPC or `postMessage`; width-dependent layout lives in a pure
  module read by a resize listener, never in an effect that fetches.
- **Tests:** every new pure module gets `*.test.ts` beside it (CLAUDE.md §4).
  UI rendering is not unit-tested.
- **Parity:** every idl0 feature dropped or deferred goes in the report's
  "Parity gaps" line with a reason. Silence is not deferral.
- Cite `docs/vendor/**`, never a live doc site. CHANGELOG bullet per task;
  NUL-byte check on every file touched; never amend a reported commit.
