# UI-10 — Notebook frame: cell chrome, two registers, editor placement

The workbook rendered as a document. Cell frames with a kicker, a status dot
and a code toggle; code collapsed at rest; two output registers (paper and
studio); and the editor in one of three places depending on width — IDE panes
on wide, inline on medium, a `Sheet` on narrow. ONE commit.

Worktree: `…/idl1-app-worktrees/ui-8` (the Notebook worktree).
**Depends on UI-9 committed there.** Merge `main` first (R19).

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-8"
git merge-base --is-ancestor <UI-9 commit hash> HEAD && echo GATE-OK
test -f app/src/routes/pages/Notebook/editor/cmTheme.ts && echo CM-OK
```
Both must print, else STOP and report.

## Files to read first

This lane's `PLAN.md`; `UI-DIRECTION.md` decisions 20, 29, 30, 31, 37 and the
"Notebook" paragraph of "Per-tab layout direction";
`runs/2026-09-06/RULINGS-DIGEST.md` (the Notebook block: prose is the one
permitted `dangerouslySetInnerHTML`, span errors show in place as text, a
definition-only cell mounts `JsCellFrame` while a mixed cell keeps `ChartCell`
— R66/R77/R78); `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §4 (effects rule);
`app/src/routes/pages/Notebook/index.tsx` (1 100 lines — read it before
touching anything), `components/{CellFrame,CellList,ChartCell,JsCellFrame,
CodePane,EditorPanes,PropertiesForm,ProseBlock,WorkbookBar,MathCell,TableCell,
ConflictBanner}.tsx`, `model/{cellLayout,notebookPrefs,proseBlocks}.ts`;
`app/src/components/**` (UI-2/UI-3 primitives); UI-7's `Settings/theme.ts` if
the register pref landed there.

## Where

- **New:** `model/outputRegister.ts` + test, `model/editorPlacement.ts` + test,
  `model/codeVisibility.ts` + test.
- **Edited:** `components/CellFrame.tsx` (today 43 lines — this is where the
  kicker, status dot, code toggle and error `NoteBlock` go),
  `components/CellList.tsx`, `EditorPanes.tsx` (Properties · Code as `Tabs`),
  `PropertiesForm.tsx`, `WorkbookBar.tsx` (the worksheet bar: workbook
  `Select`, worksheet `Tabs`, `+`, register switch), `JsCellFrame.tsx`,
  `ProseBlock.tsx`, and the layout half of `index.tsx`.
- `CHANGELOG.md`.
- The direction calls these `NotebookColumn`/`CellEditor`/`WorksheetBar`; the
  real names above are what exists. Keep the existing names.

## Interfaces

```ts
// model/outputRegister.ts
/** Notebook output has two user-switchable registers (decision 31): `paper`
 *  is prose in Plex Sans at a ~72ch measure with 24 px cell gaps; `studio` is
 *  raw `--bg`, dense, no measure, chart slots edge to edge. R92's default:
 *  paper on narrow, studio on wide, both switchable. */
export type OutputRegister = "paper" | "studio";
export function defaultRegister(widthPx: number): OutputRegister;
export function registerMetrics(r: OutputRegister): { measureCh: number | null; cellGapPx: number; family: "sans" | "mono" };

// model/editorPlacement.ts
/** Where the cell editor lives (decision 29): IDE panes beside the output on
 *  wide, an inline editor under the selected cell on medium, and a Sheet on
 *  narrow where the output is read-only paper. Shares the shell's 600/1200
 *  breakpoints — import `shell/layout.ts`'s `resolveLayout`, do not restate
 *  the numbers. */
export type EditorPlacement = "panes" | "inline" | "sheet";
export function editorPlacement(widthPx: number): EditorPlacement;
/** Narrow is read-only paper: the output shows no editor affordances at all. */
export function outputIsReadOnly(placement: EditorPlacement): boolean;

// model/codeVisibility.ts
/** Code is collapsed at rest and revealed per cell (decision 30). The set of
 *  revealed cell ids is UI state, not workbook content — it never reaches the
 *  file and is not persisted. */
export function toggleCode(revealed: ReadonlySet<string>, cellId: string): ReadonlySet<string>;
export function isCodeVisible(revealed: ReadonlySet<string>, cellId: string): boolean;
```

## What to build

- **`CellFrame`**: uppercase tracked kicker (cell name/index), a `StatusDot`
  for the cell's run state, a code toggle button, the selected state as a
  `--surface-2` fill plus the reserved `--good` inset bar, and an error
  `NoteBlock` in place when the cell failed. Span errors stay as in-place text
  (R66/R78) — do not promote one to a banner or a toast.
- **Registers**: one attribute on the output container (`data-register`) plus
  token-driven CSS. Paper uses `--font-sans` at line-height 1.5 and the
  measure; studio uses `--font-mono`, no measure, edge-to-edge slots. Read the
  user's choice from wherever UI-7 put it (`UiPrefs` preferred, see UI-7's
  question 1) and fall back to `defaultRegister(width)`.
- **Wide**: `Resizable` panes inside the shell's notebook column — maths graph
  is *not* here (UI-4 reserved it in the shell); this task's panes are cell
  editor (`Tabs`: Properties · Code) and output. Selecting a cell in the output
  focuses it in the editor.
- **Medium**: inline editor under the selected cell. **Narrow**: read-only
  paper, Properties in a `Sheet` via `sheetSideFor`.
- **Worksheet bar** under the top bar: workbook `Select`, worksheet `Tabs`,
  `+`, register switch. Keep every existing behaviour in `WorkbookBar.tsx`
  (rescan, create, dirty guard, rebuild report) — restyle, do not re-derive.

## Tests

`defaultRegister — 500 px — paper`; `— 1400 px — studio`;
`registerMetrics — paper — sans, a measure, 24 px gaps`; `— studio — mono, no
measure`; `editorPlacement — 400/800/1400 px — sheet/inline/panes`;
`editorPlacement — 600 and 1200 exactly — matches shell/layout.ts` (assert
against `resolveLayout`, so the two can never drift);
`outputIsReadOnly — sheet — true, others false`;
`toggleCode — an unrevealed cell — revealed, and the input set is unchanged`
(immutability matters: the set is React state); `toggleCode — twice — back to
collapsed`; `isCodeVisible — an unknown id — false`.

## Gate

```bash
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Notebook
```
Non-zero `passed`; every pre-existing Notebook test unchanged.

## Steps

- [ ] 1. Entry gate. 2. The three pure modules + tests. 3. `CellFrame` chrome.
      4. Register attribute + CSS. 5. Editor placement at the three widths.
      6. `EditorPanes` as Properties · Code `Tabs`. 7. Worksheet bar restyle +
      register switch. 8. Gate. 9. `tokenSheet.test.ts` green. 10. NUL check.
      11. CHANGELOG. 12. Commit `app: Notebook cell frame, output registers and
      editor placement (UI-10)`.

## Do not

- Do not change evaluation, the sandbox protocol, the save flow, the rebuild
  replay, or any `host/**` module. This task is chrome and layout only.
- Do not add or modify an effect that starts IPC or `postMessage` work
  (operating brief §4 tightening: a function prop in a dependency array beside
  a cancelling cleanup is Critical on sight).
- Do not build the React Flow maths graph (decision 11, non-goal).
- Do not persist the revealed-code set.
- Do not touch other pages or the shell beyond reading `shell/layout.ts`.

## Spec discipline

**Spec-during** — the output register is new user-visible behaviour. Add the
CHANGELOG bullet and name the register's storage location in the report.

## Report back (≤15 lines)

Commit hash + `git show --stat`; `tsc` result; the filter's `passed` count and
that pre-existing counts are unchanged; where the register preference is read
from and what happens when it is absent; whether `index.tsx` needed structural
change or only layout edits; confirmation that no `host/**` file was touched;
parity gaps (idl0 Analyze affordances not ported, each with a reason);
anything needing a ruling.

## Open questions

1. **Does the notebook's own `Resizable` split fight the shell's columns?**
   *Recommendation:* the shell owns the outer columns; this task's split lives
   *inside* the notebook output column and persists through UI-4's
   `columnPrefs` under its own ids, not a second storage key.
2. **Register default when the user has switched, then resized.**
   *Recommendation:* an explicit choice wins at every width; `defaultRegister`
   applies only when nothing is stored. Anything else silently overrides a
   decision the user made.
3. **A cell selected on wide, then the window narrows to paper.**
   *Recommendation:* keep the selection, drop the editor; on widening it comes
   back. Clearing the selection on a resize loses work-in-progress context.
