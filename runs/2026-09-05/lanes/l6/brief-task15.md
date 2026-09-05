# L6 Task 15 — implementer brief (the two panes together — the editor shell)

You are the implementer for L6 Task 15 of the idl1 rewrite — pure assembly of
Tasks 11–14 into design §6's editing surface. No new logic module; this task
wires existing, already-tested pieces into one shell component. ONE commit,
then report.

## Before anything else: verify Task 14 landed

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook"
git log --oneline -20
```

You need a commit adding `Notebook/model/saveFlow.ts` and
`Notebook/components/ConflictBanner.tsx` (Task 14), and before it Task 13's
`workbookState.ts`/`CellList.tsx`/`MathCell.tsx`/`TableCell.tsx`/
`ProseSpan.tsx`. **If any is missing — STOP and report** which one. This
task has no logic of its own to speak of — it is entirely dependent on
Tasks 4, 11, 12, 13, 14's actual landed shapes, so read every one of the
following before writing anything:

- `Notebook/model/cells.ts` — `replaceCellBody(markdown, cellId, newBody)`
  (Task 4). This is the **one** function both panes write through; read its
  signature and doc comment exactly.
- `Notebook/plotForm/index.ts` — `generate`, `parse` (Tasks 2–3).
- `Notebook/components/CodePane.tsx` — its actual `CodePaneProps` as landed
  (Task 11 may have refined the sketch; use the real props).
- `Notebook/components/PropertiesForm.tsx` — its actual
  `PropertiesFormProps` as landed (Task 12).
- `Notebook/components/CellList.tsx`, `MathCell.tsx`, `TableCell.tsx`,
  `ProseSpan.tsx` (Task 13) and `Notebook/model/workbookState.ts`'s real
  `WorkbookState`/`workbookReducer` shape.
- `Notebook/components/ConflictBanner.tsx` and `Notebook/model/saveFlow.ts`
  (Task 14).

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. Status clean before starting.
- Work ONLY in `app/` inside this worktree. Do NOT touch the shared checkout,
  the `rust/` submodule, or any other worktree. Do NOT edit `docs/`. Do NOT
  push.
- **No cargo, ever, in this worktree.**
- **No new npm dependency.**

## Interfaces

None new — the plan is explicit: "this task assembles Tasks 11–14 into
design §6's editing surface." Selecting a cell opens **Properties** (for a
`js` cell whose code currently `parse`s successfully) and **Code** side by
side; Properties greys for custom code (Task 12's own behaviour, unchanged
here — this task just mounts it next to `CodePane`). Non-`js` cells (math,
table, prose) show **Code only** — there is no Properties form for them
(`plotForm` only covers the `js` Plot-chart subset, C2 §5.3).

## The task

**Files:**
- Create: `Notebook/components/EditorPanes.tsx`, `Notebook/components/CellFrame.tsx`
- Modify: `Notebook/index.tsx`

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Implement**

  `CellFrame.tsx`: the per-cell chrome — a select/click affordance that sets
  "the currently open cell" in local component state (or wherever
  `Notebook/index.tsx` already tracks selection; check Task 13's `index.tsx`
  for an existing selection concept before adding a second one), plus the
  cell's rendered output (`CellList.tsx`'s per-kind renderer from Task 13).

  `EditorPanes.tsx`: given the open cell's id and `kind`, `code`, renders:
  - `kind === "js"`: `CodePane` and `PropertiesForm` **side by side**.
    `PropertiesForm`'s `onChange(nextCode)` and `CodePane`'s debounced
    `onChange(nextCode)` both call the **same** handler —
    `replaceCellBody(markdown, cellId, nextCode)` → update `workbookState`'s
    markdown → re-`scanCells` → (debounced) `evalWorkbook`. This is the
    "write to the same cell body" loop the plan describes: an edit in
    Properties regenerates code that flows into Code's editor; an edit in
    Code re-`parse`s and either repopulates Properties (parse succeeded) or
    greys it (parse returned null, Task 12's own logic, unchanged).
    **Avoid an update loop**: when `PropertiesForm.onChange` fires, the code
    prop handed back to `CodePane` changes too — make sure this doesn't
    cause `CodePane` to re-fire its own debounced `onChange` for a change it
    didn't originate (e.g. by comparing incoming `code` against the editor's
    own last-emitted value before treating an external prop change as a new
    user edit, or by keying off a version/generation counter). State
    explicitly in your report which mechanism you used to prevent this loop
    and how you'd test it manually (this is rendering, not unit-tested per
    CLAUDE.md §4, but a reviewer needs to be able to reason about it from
    the code and your description).
  - Every other `kind`: `CodePane` only, no `PropertiesForm` mount at all.

  Mount `ConflictBanner` (Task 14) above the editor panes, visible whenever
  `saveFlow`'s state is `conflict`.

- [ ] **Step 2: No unit tests** (rendering — CLAUDE.md §4). The logic under
  test is entirely Tasks 3, 4, 11, 12's existing coverage; state this
  explicitly in the commit message.

- [ ] **Step 3: Gate**

  ```
  npx tsc --noEmit && npx vitest run src/routes/pages/Notebook
  ```
  Expected: the lane's full running total to date, 0 failed — report the
  exact number from your run (the plan estimates "≈ 100 passed" but the real
  number depends on every prior task's actual test count; do not report the
  plan's estimate as if it were your measured result).

- [ ] **Step 4: CHANGELOG**

  ```
  - **Properties + Code editor shell (L6 Task 15, D13).** Selecting a `js` cell opens Properties and Code side by side, writing through the same cell body; every other cell kind shows Code only.
  ```

- [ ] **Step 5: Commit**

  Explicit paths:
  ```
  git add src/routes/pages/Notebook/components/EditorPanes.tsx src/routes/pages/Notebook/components/CellFrame.tsx src/routes/pages/Notebook/index.tsx ../CHANGELOG.md
  ```
  Message, single line, no AI attribution trailer:
  ```
  app: Properties + Code editor shell (D13)
  ```

## Do not

- Do not build a second cell-selection state independent of whatever
  `Notebook/index.tsx` already tracks from Task 13 — one source of truth for
  "which cell is open."
- Do not mount `PropertiesForm` for a `math`, `table`, or `prose` cell — only
  `js`.
- Do not write a `.test.ts` for this task's two new components — both are
  rendering.
- Do not call `invoke`/any `ipc/*` function directly from either new
  component — every IPC call this task triggers goes through
  `workbookState`'s existing dispatch (Task 13) or `saveFlow` (Task 14).
- Do not build or run any cargo command in this worktree.

## Style / hygiene

Doc comment on every exported symbol; `// TODO(idl0):` never bare `// TODO`.

## Report back (concise)

Commit hash + `git show --stat`; the exact gate command and result line with
the real passed count (not the plan's "≈100" estimate); the exact mechanism
you used to prevent a Properties↔Code update loop, stated precisely enough
that a reviewer can trace it in the diff; confirmation `PropertiesForm` is
mounted only for `js` cells; per-step done/deviated; anything ambiguous you
resolved (say how) or that needs a lead ruling (stop and report instead of
guessing — CLAUDE.md §1).
