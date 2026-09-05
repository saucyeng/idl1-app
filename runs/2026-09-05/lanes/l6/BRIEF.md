# L6 (Notebook tab) — lane brief

Wave 2, UI track. This lane turns `NotebookPage`'s wave-1 canvas polyline
into the notebook design §6 describes. Tasks 1–4 are dispatched now; Tasks
5+ wait on Open Question Q1 (npm dependencies) and the Q9 shell task, ruled
in R52 but not yet applied to `main` as of this writing — confirm before
dispatching Task 5.

## Scope

Everything under `app/src/routes/pages/Notebook/**` and this lane's own
`*.test.ts` files. Nothing in `rust/`, `app/src-tauri/`, or any lead-owned
shared file (operating brief §2: `App.tsx`, `App.css`, `main.tsx`,
`routes/types.ts`, `state/AppState.tsx`, `package.json`/lockfile,
`vite.config.ts`).

Full task list and rationale: `docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md`.
This wave of briefs covers Tasks 1–4 only:

- Task 1 — `routes/pages/Notebook/` directory move, re-export shim, no shell touch.
- Task 2 — `plotForm.generate(props) → code` over C2 §5.3.
- Task 3 — `plotForm.parse(code) → props | null`, custom-code detection, exhaustive round trip.
- Task 4 — `model/cells.ts`: a narrow, non-authoritative fence scan over C2 §2.2/§2.4.

## Branch and worktree

Branch `wave2-l6-notebook`, worktree
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
created off `main` by whoever runs Task 1 (the plan's Global Constraints):

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
git worktree add -b wave2-l6-notebook "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook" main
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook"
git submodule update --init -- rust
cd app && npm ci
```

Working directory for every task: that worktree's `app/`. Tasks 2–4 reuse
the same worktree and branch (verify HEAD is the prior task's commit,
status clean, before starting).

## Ownership

This lane writes only under `app/src/routes/pages/Notebook/**` and its own
`*.test.ts` files. `app/src/ipc/*.ts` takes additive type fixes only, and
only where a file disagrees with C3 as written — never a new command. A
need to touch any lead-owned file (listed above) is a question to the lead,
applied as a serialized shell task on `main`, then rebased — never decided
by an implementer. None of Tasks 1–4 need a lead-owned file touched beyond
Task 1's read-only observation about `App.tsx` (handled by the shim, not by
editing it).

## Gates

Per task, run from the worktree's `app/`:

```
npx tsc --noEmit && npx vitest run <filter named in the task's brief>
```

`vitest` must report a non-zero `passed` count — a filter matching nothing
is a failed gate, not a pass. No cargo, ever, in this worktree (the `rust/`
submodule is initialised only so `tsc` and imports resolve; the §8 hook
denies any cargo invocation whose cwd is under `idl1-app-worktrees/wave2-*`).

Lane merge gate (after Task 16, not part of this wave of briefs):
`npx tsc --noEmit && npx vitest run` (whole TS suite), then the lead merges
to `main` and eyeballs the tab in the running dev app.

## Open questions and their R52 status (Tasks 1–4 only)

- **Q1 (npm dependencies)** — ruled `(a)`: eight packages added by a lead
  shell task, `htl` pinned at `1.0.0`. **Not yet applied to `main`** as of
  this brief's writing (`app/package.json` still carries only the wave-1
  dependency set) — irrelevant to Tasks 1–4, which need no dependency
  (confirmed against the plan: Tasks 2–4 are pure TypeScript with zero
  imports beyond what's already in the tree). Blocks Task 5 onward.
- **Q3 (who segments cells, TS or Rust)** — ruled `(a)`: a narrow,
  non-authoritative TS fence scan (Task 4), Rust remains the sole evaluator.
  Applied directly in `brief-task4.md` below.
- **Q9 (shared-file touches)** — ruled: batch `App.tsx`'s Notebook import,
  `AppState`'s `activeSessionId` slice, and `package.json` into one lead
  shell task before dispatch; `vite.config.ts` held until Task 5 reports.
  **Not yet applied to `main`** as of this writing (`App.tsx` still imports
  `./routes/pages/NotebookPage`, `AppState.tsx` has no `activeSessionId`) —
  irrelevant to Tasks 1–4: Task 1's re-export shim is exactly the
  workaround the plan built so this lane never blocks on that shell task.

Q2, Q4–Q8 block later tasks (5, 7, 13+) and are out of scope for this wave
of briefs; see the plan's Open Questions section and R52 for their rulings.

## Done when (Tasks 1–4)

- All four commits land on `wave2-l6-notebook`, one per task, each passing
  its own gate with a non-zero `passed` count.
- `plotForm.generate`/`parse` round-trip every worked example in C2 §5.3
  byte-identically, and the exhaustive generator-based round-trip test
  (Task 3) passes over the full closed grammar.
- `model/cells.ts` correctly scans the C2 §2.2/§2.4 fence grammar
  (id/no-id, inert fences, nested inert fences, prose attachment) with no
  semantic parsing of cell bodies.
- `App.tsx` still resolves `NotebookPage` via the Task 1 shim; nothing
  outside `Notebook/**` and this lane's `*.test.ts` files changed.
- Reviewer verdict `CLEAN` or `NEEDS_FIXES` (with a small/mechanical fix)
  on each of the four tasks.

Design authority for the whole lane: `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`
§6, §10; contract `docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`;
ruling R52 (`runs/2026-09-03/decisions.md`); `CLAUDE.md`.
