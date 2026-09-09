# Lane brief — the Notebook toolbar goes full-window, and charts stop painting over it

**Worktree:** `../idl1-app-worktrees/toolbar`, branch `toolbar`, off `main`.
App-only TypeScript. Do not touch `rust/`, never commit on `main`, never push.

**Spec discipline:** no contract change. `CHANGELOG.md` gets a line.

## Two reports from Isaac, using the app

> "i meant that top toolbar can go across the full screen, not just the
> notebook preview column of the notebook tab. Also, the charts end up on
> top of that tool bar instead of getting cut off when i scroll down."

Both are real. The first is a **correction to ruling R161**, which said the
toolbar spans "the tab" — the lane built exactly that, correctly. Isaac
wants it spanning the **window**.

## Task 1 — hoist the toolbar to the shell

The toolbar is currently the first child of the Notebook route's own root
(`routes/pages/Notebook/index.tsx`, the `<div className="flex flex-nowrap
items-center gap-2 overflow-x-auto border-b border-rule px-2 py-1">` under
the R161 comment). The route only owns its column area, so the toolbar can
never be wider than that from where it lives.

**Use the mechanism that already exists.** `shell/editorSlot.ts` +
`shell/EditorSlotColumn.tsx` already portal a route-owned element into a
shell-owned position (`getEditorSlotNode`/`setEditorSlotNode`/
`subscribeEditorSlot`/`useEditorSlotNode`, and `index.tsx` already consumes
it via `editorIsPortalHosted`). Add a **sibling** slot module for the
toolbar following that file's shape exactly — same subscribe/notify
pattern, its own module, not new exports bolted onto `editorSlot.ts` (R161
amended made this call once already for `notebookColumns.ts`: two concepts
sharing a convention stay two modules).

Render the slot host in `shell/AppShell.tsx`, as a full-width row **directly
below `TopBar`** and above the `min-h-0 flex-1` route area. When no route
fills it, the row must occupy **zero height** — no empty bar on the Data,
Device or Settings tabs. `hidden` alone is not enough if the row has padding
or a border; make sure an unfilled slot renders nothing at all.

The Notebook keeps ownership of the toolbar's *content* and its handlers —
only where it renders changes.

**A judgment call already made, do not re-decide:** the toolbar is its own
row under the shell `TopBar`, not merged into it. Merging the two into one
row is the obvious follow-up if Isaac wants the vertical space back, but it
means reconciling the toolbar's controls with `TopBar`'s selection chips,
which is a design pass, not this fix.

## Task 2 — charts must not paint over the toolbar

> "the charts end up on top of that tool bar instead of getting cut off"

A chart's container is positioned in viewport pixels and follows scroll in
JS, so it is out of normal flow and paints above in-flow content when the
two overlap. Scrolling a chart up under the toolbar puts it *over* the
toolbar instead of behind it.

**Diagnose before changing anything** — find where the chart container's
position and any `z-index` are actually set (start at
`components/ChartCell.tsx` and `components/JsCellFrame.tsx`) and report what
you find. Then:

- The toolbar row needs an **opaque background** (a token, never a literal —
  a transparent bar would show the chart through it even with a correct
  stacking order) and its own stacking context above the chart layer.
- Charts must be clipped at their scroll container's edge so one scrolling
  up disappears **behind** the toolbar, which is what "cut off" means here.
- Do not fix this by lowering the chart layer if that puts charts behind
  other in-flow content they currently sit above — check what else shares
  that layer first.

State the resulting layer order in a comment where the `z-index` values are
set, so the next person changing one can see the whole ordering in one
place. If the values are spread across files, that is itself worth
reporting.

Verify by scrolling a workbook with at least one chart cell far enough that
a chart passes under the toolbar.

## Gate

From `app/`: `npx tsc --noEmit`, then `npx vitest run`. Main's baseline is
**178 files / 1767 tests, all passing** — your run must be all-passing at or
above that. Pure logic added by this lane gets tests; the layout itself is
not unit-tested (CLAUDE.md §4).

## Rules

`CLAUDE.md` binds: Arrange/Act/Assert with blank lines, test names
`thing — condition — result`, doc comment on every public symbol, no colour
literals (tokens only), no AI attribution trailers. Commit per task. If a
placement or behaviour is not stated here — **stop and ask**.

## Report back (≤ 15 lines)

Tasks done; the gate's exact file/test counts; what you found about how
chart containers are positioned and layered; and anything that contradicts
this brief.
