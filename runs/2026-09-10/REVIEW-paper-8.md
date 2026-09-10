# Review: L9 paper lane, tasks 7 and 8 (R185 items 1 and 3)

**Commits:** `b6bb68d` (task 7), `25aed46` (task 8), range `a58db36..25aed46`.
**Worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\paper` (branch `paper`).

**Files touched:**
- `app/src/routes/pages/Notebook/components/PaperView.tsx`
- `app/src/routes/pages/Notebook/index.tsx`
- `app/src/routes/pages/Notebook/model/paperView.ts`
- `app/src/routes/pages/Notebook/model/report/paperDocument.ts`
- `app/src/routes/pages/Notebook/model/report/paperPalette.ts` (new)
- `app/src/routes/pages/Notebook/model/report/paperPalette.test.ts` (new)
- `app/src/routes/pages/Settings/ThemeSection.tsx`
- `app/src/routes/pages/Settings/prefs.ts`
- `app/src/routes/pages/Settings/prefs.test.ts`
- `app/src/routes/pages/Settings/prefsMigration.test.ts`
- `app/src/routes/pages/Settings/settingsBackend.test.ts`
- `app/src/routes/pages/Settings/theme.ts`
- `app/src/styles/paper.css`

**Test command (run once, from `app/`):**
```
npx tsc --noEmit
npx vitest run
```
**Result:** `tsc --noEmit` — no output, no errors. `vitest run` — `Test Files 184 passed (184)`, `Tests 1860 passed (1860)`. Matches the expected counts exactly.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `app/src/routes/pages/Notebook/model/editorPlacement.ts:27-33` | `outputIsReadOnly`'s doc comment still says "…the Properties form moves into a `Sheet` instead of sitting beside it," which was true pre-R185 but is now stale: the sheet holds the full editor (Properties+Code for `js`, Code alone for `math`/`table`), not the Properties form specifically. Not touched by either commit even though task 7 changed the meaning of the sheet this function gates. | Update the comment to say "the editor" rather than "the Properties form," or reference `EditorPanes` directly. |

No Critical or Important findings.

## Verification notes

- **Task 7, item 1 (sheet condition / placements):** the `outputIsReadOnly` clause was removed only from `editorPanesElement`'s *build* condition (`index.tsx`); every *render* site still gates on placement or `editorIsPortalHosted` explicitly — `panes` at `placement === "panes"` (`showPropertiesPane`), `inline` at `placement === "inline"` (line ~2651), the sheet inside `placement === "sheet"` (line ~3014), and the R109 portal slot unconditionally as before (line ~3040, untouched). No leakage of the editor into the wrong placement. `outputIsReadOnly` itself is still used, unaffected, by `model/paperView.ts` for a distinct purpose (detecting paper mode), so nothing else depended on the removed clause.
- **Task 7, item 2 (`PropertiesForm` import removal):** `PropertiesForm` is no longer imported directly by `Notebook/index.tsx`, but `EditorPanes` (unchanged by this diff) already renders `PropertiesForm` beside `CodePane` for `kind === "js"` and `CodePane` alone otherwise. The sheet now renders `editorPanesElement`, so a `js` cell still gets its Properties tab; nothing was lost. Confirmed in `EditorPanes.tsx`.
- **Task 8, item 3 (lenient default):** `prefs.ts`'s `parseUi` treats any `paper_theme` other than `"app"|"light"|"dark"` (including absent) as `DEFAULT_PREFS.ui.paper_theme` (`"app"`), covered by three new `prefs.test.ts` cases (absent, valid, unknown-value). The `prefsMigration.test.ts` and `settingsBackend.test.ts` edits only extend exact-equality fixtures to include the new required field's default — legitimate churn from the type shape change, not silencing an unrelated failure.
- **Task 8, item 4 (palette sourcing):** `PaperView.tsx` no longer imports `screenPalette.ts` or `printPalette.ts` directly (grep-verified); it imports only `paperPalette.ts`, which internally chooses between `buildScreenPalette` (for `"app"`/`"dark"`) and its own hardcoded light values (for `"light"`). The light path (`PAPER_LIGHT_*` constants) reads no live CSS var — confirmed no `documentVars`/`read(...)` call anywhere in the light branch of `buildPaperPalette`. `"dark"` resolves through the same live-token path as `"app"` today, which the module's own doc comment explains and accepts: `tokens.css` authors no light theme yet (decision 5), so "follow the app" and "force dark" are provably identical outputs until light tokens exist; `"app"` is still stored as a distinct value rather than collapsed into `"dark"`, so the two will diverge correctly once light tokens land. This is a deliberate, documented, and tested (`paperScheme`/`buildPaperPalette` unit tests) consequence of the current app-theme state, not a bug.
- **Task 8, item 5 (re-read on visibility):** `index.tsx`'s effect changed from `[]` (mount only) to `[routeVisible]`, guarded by `if (!routeVisible) return`. This is necessary because `Notebook`'s `notebookPrefsStore` and Settings' own `PrefsStore` are separate instances over the same `localStorage` backend and never hear each other's `subscribe` notifications (documented in the diff). `storedRegister`/`output_register` read-and-default logic is unchanged — same `prefs.ui.output_register` read, same fallback via `resolveRegister`, just re-triggered on route-visibility transitions instead of only on mount. No `NotebookPage`-level unit tests exist to regress (consistent with CLAUDE.md §4, "UI rendering is not unit-tested"), and `tsc`/`vitest` both pass clean.
- **Colour literals:** `paperPalette.ts`'s hex literals are in a `.ts` file, outside the `tokenSheet.test.ts` scan (which covers only `.css`/`.tsx`, a documented, pre-existing gap called out by that file's own `TODO(idl0)`). This exactly mirrors `printPalette.ts`'s pre-existing, R174-sanctioned pattern (identical hex values, same exemption rationale, same contrast-target test shape) — not a new violation. `paper.css`'s named CSS colours (`black`, `white`, `dimgray`, `gray`, `maroon`, `gainsboro`) mirror `report-print.css`'s existing convention and are not caught by the hex/rgb/hsl regex the tokenSheet test enforces.
- **Doc comments:** every new public symbol (`PaperViewProps.theme`, `PaperTheme`, `UiPrefs.paper_theme`, `buildPaperPalette`, `paperScheme`, `PAPER_LIGHT_CONTRAST_TARGET`, `PAPER_LIGHT_SERIES_COLOURS`, `handlePaperThemeChange`) carries a doc comment.
- **Tests:** new tests (`prefs.test.ts`, `paperPalette.test.ts`) follow the `thing — condition — result` naming convention and Arrange/Act/Assert shape consistent with the codebase's existing style for this kind of small pure-function test (matches `printPalette.test.ts`'s precedent).

## Verdict rationale

Both tasks implement their ruling faithfully: task 7 makes every cell kind editable through the same narrow sheet by building `EditorPanes` unconditionally and gating each render site by placement, with no loss of the `js` Properties form; task 8 adds a correctly-defaulted, leniently-parsed `paper_theme` preference, wires it through `ThemeSection` in the right position, and routes `PaperView`'s palette exclusively through a new `paperPalette.ts` module that never reads live tokens on the forced-light path and never touches the print palette. The gate command ran once and reported the exact expected counts (184 files / 1860 tests). The only issue found is a single stale doc comment describing behaviour the diff itself changed — not incorrect logic, just an unrefreshed sentence.

VERDICT: CLEAN
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\runs\2026-09-10\REVIEW-paper-8.md
COUNTS: critical=0 important=0 minor=1
NOTES: One stale doc comment (`outputIsReadOnly` in `editorPlacement.ts`) still describes pre-R185 behaviour; everything else in tasks 7 and 8 matches R185 items 1 and 3 exactly, and the gate ran once with the exact expected counts.
