# Review: Welcome panel behind an empty dock (R244), fix round

Commits reviewed: `5334e8c..10be395` (branch `dockview`): 10be395 (the whole delta is one
commit on top of the `dockview-react` dependency bump).

Files touched: `CHANGELOG.md`, `app/src/routes/pages/Notebook/index.tsx`,
`app/src/routes/pages/Notebook/model/notebookColumns.ts(+.test)`, `app/src/shell/AppShell.tsx`,
`app/src/shell/DataRootGate.tsx`, `app/src/shell/DockFrame.tsx`, `app/src/shell/WelcomeDialog.tsx` (new),
`app/src/shell/WelcomePanel.tsx` (new), `app/src/shell/commandTiers.ts`, `app/src/shell/dataRootPath.ts` (new),
`app/src/shell/dockLayout.test.ts`, `app/src/shell/layoutPresets.ts(+.test)`, `app/src/shell/menuModel.ts`,
`app/src/shell/outputSlot.ts`, `app/src/shell/recentWorkbooks.ts(+.test)` (new), `app/src/shell/welcomeItems.ts(+.test)` (new),
`runs/2026-09-06/ui/UI-DIRECTION.md`.

Test command: not re-run (per dispatch, tsc / full 264-file/2862-test vitest / madge / vite build already
green and not to be rerun). This review is entirely static: read against the diff, `git show`, and the prior
review's BLOCKER trace, cross-checked line-by-line rather than executed. No targeted vitest run was needed —
the two new test files (`welcomeItems.test.ts`, `recentWorkbooks.test.ts`) and the edited
`notebookColumns.test.ts` were verified by reading their assertions against the implementation, not by running
them.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| SHOULD FIX | `app/src/shell/DockFrame.tsx:220-228`, `app/src/shell/DockFrame.tsx:319-320`, `app/src/routes/pages/Notebook/index.tsx:588` | Three doc comments left over from before this delta still describe the never-all-off guard as *currently active*, even though this same delta deletes it from `notebookColumns.ts`. `scheduleReconcile`'s doc (`DockFrame.tsx:221-222`) says "`applyColumnToggleValue` carries `notebookColumns.ts`'s never-all-off guard, which returns the previous visibility..." in the present tense; the `onDidRemovePanel` handler's inline comment (`DockFrame.tsx:319-320`) says the page is "allowed to say no"; and `index.tsx:588` says "The never-all-off guard lives in `model/notebookColumns.ts` either way." All three are now false — a future maintainer reading `scheduleReconcile` to understand *why* it exists will be told it exists to route around a refusal that no longer happens, which is exactly the kind of doc/code mismatch that produced the BLOCKER this fix round exists to close. | Rewrite the three comments in the past tense (as `DockFrame.tsx:97-113`'s `DockWatermark` doc and `notebookColumns.ts:67-82`'s own doc already correctly do) or restate why `scheduleReconcile`/the "ask again" step still exist now that the model never refuses — e.g. purely for the React-flush timing reason the rest of `scheduleReconcile`'s doc already gives. |
| SHOULD FIX | `app/src/shell/WelcomePanel.tsx:85-90`, `app/src/shell/WelcomeDialog.tsx:24-27` | `WelcomePanel`'s `recent` list is `useMemo(() => readRecentWorkbooks(), [registered])`, justified by the comment "opening one replaces this panel with the notebook it opened" — but `WelcomeDialog.tsx`'s own doc comment says the opposite: "Clicking one leaves this dialog open... the command that replaces what is underneath is visible the moment the dialog is dismissed." So for the Help ▸ Welcome instance specifically, the panel is *not* replaced when a row is clicked, and `registered` does not change when a workbook opens (`viewToggle*` commands gate on `columnsToggleAvailable = !paperActive`, unrelated to `state.handle`; `workbookNew`/`workbookOpen`/etc. are not un/re-registered by opening a workbook either) — so a user who opens Help ▸ Welcome, clicks "New workbook", creates one, and leaves the dialog open sees a "Recent workbooks" list that never gains the workbook they just created, for as long as that dialog instance stays mounted. This is the stale-data trap the dispatch asked about, and it directly contradicts the `useMemo`'s own justification for the case that keeps the panel on screen the longest. | Depend on something that actually changes when `noteWorkbookOpened` is called — e.g. give `recentWorkbooks.ts` the same publish/subscribe shape as `outputSlot.ts`/`dataRootPath.ts` (a tiny store `WelcomePanel` can `useSyncExternalStore` on), or re-read `readRecentWorkbooks()` on the dialog's own `open` transition (`onOpenChange`/`useEffect` keyed on `open`) rather than on the registry snapshot. |
| Minor | `app/src/shell/welcomeItems.ts:56-58` | `WelcomeItem.command` is typed `string`, not `CommandId` (`commandTiers.ts:94`), so nothing in the type system enforces "always an id that already exists" beyond the tests in `welcomeItems.test.ts` (which do check every returned item's command against `COMMAND_IDS`, so this is enforced at test time, just not at compile time). | Type `command: CommandId` instead of `string`; the four literals already used (`COMMAND_IDS.workbookNew` etc.) are all valid `CommandId`s, so this is a type-only tightening. |

## Verdict rationale

This round correctly and verifiably closes the prior review's BLOCKER and Important finding. The never-all-off
guard's removal is traced end-to-end: `toggleNotebookColumn`/`notebookColumnVisibilityFrom` now always return a
new, changed record (confirmed against both the diff and the rewritten `notebookColumns.test.ts`, whose "turning
off the only visible pane" case now asserts `not.toBe(prev)` — the exact identity check that caused the original
bug), so `studioColumns.ts` always notifies and `DockFrame`'s `subscribeStudioColumns(reconcile)` always runs;
`shell/outputSlot.ts`'s new `studioDockMounted` flag is distinct from the portal-node presence and every one of
the three non-studio placement branches in `Notebook/index.tsx` (`panes`/`inline`/`sheet`) was moved from gating
on `outputIsPortalHosted` to gating on `!studioDockMounted`, which is the right variable — closing only the
Notebook *panel* (node goes null, dock stays mounted showing Welcome) can no longer make the page render its own
cell list underneath what the dock is already showing. `layoutPresets.ts` no longer duplicates
`dockLayout.ts`'s panel membership, and the stale cross-check tests were cleanly deleted rather than left to rot.
`welcomeItems.ts`'s command ids were checked one by one against `commandTiers.ts` and their registration sites,
and R244's constraints (no new command surface beyond the one declared `help.welcome`, no logic in the panel, no
new filesystem access) hold. What remains are two real but non-blocking issues: three comments this same delta
should have rewritten now describe a safety mechanism that no longer exists, and the Welcome panel's own
`useMemo` staleness reasoning is contradicted by the dialog variant's own documented behaviour, producing a
recent-workbooks list that can go stale for the whole life of an open Help ▸ Welcome dialog. Neither reintroduces
the original BLOCKER's dead end or leaves the dock and the model able to disagree, so this passes with fixes
requested rather than requiring rework.

VERDICT: NEEDS_FIXES
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\dockview\runs\2026-09-20\REVIEW-dockview-r244.md
COUNTS: critical=0 important=2 minor=1
NOTES: the BLOCKER and Important findings from the prior review are both verifiably fixed; remaining issues are stale doc comments describing the removed never-all-off guard as still active (DockFrame.tsx:220-228/319-320, index.tsx:588) and a `useMemo` staleness trap in WelcomePanel's recent-workbooks list that contradicts WelcomeDialog's own documented "stays open on click" behaviour.
