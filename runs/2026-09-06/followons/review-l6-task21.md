# Review — L6 Task 21 (Notebook empty state, New workbook, Rescan, picker)

Commit reviewed: `213b7c3` (branch `wave2-l6-followon2`, worktree
`idl1-app-worktrees/wave2-l6-followon2`). Files touched: `CHANGELOG.md`,
`docs/IDL0_SPEC.md` (§26.1, §26.6, new §26.8), and under
`app/src/routes/pages/Notebook/**`: `components/WorkbookBar.tsx` (new),
`index.tsx`, `model/jsCellNote.ts`+test (new), `model/notebookPrefs.ts`+test
(new), `model/workbookEntry.ts`+test (new), `model/openEvalDriver.ts`+test,
`model/workbookState.ts`+test.

Test command run once: `cd app && npx tsc --noEmit && npx vitest run
src/routes/pages/Notebook`. Result: tsc clean (no output); vitest — Test
Files 40 passed (40), Tests 423 passed (423). Matches the implementer's
reported numbers. Whole suite was not re-run (not authorized for the
reviewer; the implementer separately reported 93 files / 856 passed).

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No findings. | — |

## Verdict rationale

Every interface in the brief was implemented to spec and verified against
the code rather than the implementer's report: `jsCellNote`'s cause order
and exact copy match Interface 1 byte-for-byte, and `runEval`'s empty
`catch` (confirmed present in the pre-image via `git diff`) now dispatches
a typed `evalError` cleared on the next `evalResult`, rendered as
`role="alert"` above the cell list and never on the `markdownError` path.
`chooseWorkbookEntry`'s six required cases are all present and pass;
`runOpenAndEval` takes a `workbookId` parameter, no longer imports
`listWorkbooks`, and no longer dispatches "No workbooks found." — confirmed
by reading the diff, not just the tests. `notebookPrefs.ts` uses the
specified `idl1.notebook.ui.v1` key, wraps both read and write in
`try`/`catch`, and carries the required `// TODO(idl0):` naming the future
consolidation into `Settings`. `WorkbookBar` uses an inline `<input>` (no
`window.prompt`), disables Create on an empty/whitespace name and while
creating, shows the `<select>` only at `entry.kind === "choice"` with a
compact create/rescan pair at `"single"`, disables the picker while
`dirtyCellIds.size > 0` with a visible hint, and reports only
`workbooks_indexed`/`duration_ms` from `RebuildReport` (both real field
names, confirmed in `ipc/catalog.ts`) with units on the number. In
`index.tsx`, the workbook-list effect depends only on `[reloadSeq]` and
runs its one auto-`rebuild_catalog`-when-empty exactly once per mount via
`autoRebuiltRef`, guarded by `listSeqRef`, with no cleanup that cancels
in-flight work; the open/eval effect is keyed on `[sessionId,
selectedWorkbookId]` (data only) and starts nothing while `selectedWorkbookId`
is `null`. `handleCreate` opens the new workbook from its own handle before
rebuilding, exactly matching the two GATE facts the brief states about
`create_workbook` and `resolve_workbook_path`. A grep for
`SET_SELECTED_SESSION` across the diff returns nothing, confirming R81 Q3(a)
was honored, and `git diff --stat` confirms only `Notebook/**`, the two
allowed docs files, and no `package.json`/`App.tsx`/`state/`/`ipc/`/`Data/`/
`Settings/` changes. SPEC §26.8 is accurate to the shipped behavior, §26.1
gained exactly the one sentence specified, and §26.6 lists every parity gap
the brief named (worksheet tabs, tab rename/duplicate, workbook
rename/duplicate, browse-all modal, export/import/reload/delete, sync
settings dialog) each with a stated reason. Tests throughout follow the
`thing — condition — result` convention with clear Arrange/Act/Assert and
each asserts the specific behavior its name claims, not just a smoke check.
No `.sort`/`.filter` was applied to the workbook list. This is a clean,
carefully-scoped implementation with no deviations found.

VERDICT: CLEAN
