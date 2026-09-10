# Review: paper commit 0a48d0f (R185 test-surface follow-up)

Commit: `0a48d0f754d9571ce03935628cff861319e8e7c7` (branch `paper`, worktree
`idl1-app-worktrees/paper`)

Files touched:
- `app/src/routes/pages/Notebook/components/PaperView.tsx`
- `app/src/routes/pages/Notebook/index.tsx`
- `app/src/routes/pages/Notebook/model/paperSheet.ts` (new)
- `app/src/routes/pages/Notebook/model/paperSheet.test.ts` (new)
- `app/src/routes/pages/Notebook/model/report/paperPalette.ts`
- `app/src/routes/pages/Notebook/model/report/paperPalette.test.ts`
- `app/src/routes/pages/Settings/prefsMigration.test.ts`

Test command run once from `app/`: `npx tsc --noEmit` (clean, no output) and
`npx vitest run`.

Result: `Test Files 185 passed (185)`, `Tests 1868 passed (1868)` — matches
the dispatch's expected counts exactly.

## Targeted questions

**1. `paperSheetContent` — load-bearing or decorative?**
Decorative, and the commit is honest about it (its own doc comment says so).
`index.tsx`'s sheet body still renders `EditorPanes` unconditionally
(`{!editorIsPortalHosted && editorPanesElement}`, index.tsx ~3038), and
`EditorPanes.tsx` makes its own independent `if (kind !== "js")` branch
(EditorPanes.tsx:88) to decide Properties-vs-Code-alone. `paperSheetContent`
is consumed only to pick the sheet's **title** string
(`paperSheetTitle(paperSheetContent(openCell.kind))`, index.tsx:3037). So the
two kind→content decisions — EditorPanes' actual mount and paperSheet's
title — are two independently-hand-written copies of "js gets Properties,
everything else doesn't." They happen to agree today and are each tested,
but nothing enforces they stay in sync if a new `CellKindToken` is added;
a reviewer adding a fourth kind could update one and not the other and both
test suites would still pass in isolation. This is a real but minor
duplication, not a defect — matches what the dispatch asked to be told
plainly.

**2. `effectivePaperTheme` — forces vs follows, single isolation point?**
Confirmed correct. `"light"`/`"dark"` return unconditionally regardless of
`appTheme` (paperPalette.ts:118-119); `"app"` calls `appThemeScheme(appTheme)`
(paperPalette.ts:120), which is the single function that says "always dark,
today" (paperPalette.ts:124-127) with a doc comment naming it as the one
place light tokens landing would change. Tests exercise both forced branches
against both `dark` and `system` app themes, and both `"app"` sub-branches
(`dark`→dark, `system`→dark) — paperPalette.test.ts.

**3. `PaperView` — never reads print palette, light path reads no live CSS?**
Confirmed. `buildPaperPalette` only calls `buildScreenPalette(read)` (which
uses the injected `CssVarReader`) on the `"dark"` branch; the `"light"`
branch returns fixed literals and a `resolve` closure over
`PAPER_LIGHT_SERIES_COLOURS`, reading no token (paperPalette.ts:141-155).
`PaperView.tsx` imports `buildPaperPalette`/`documentVars`, never
`printPalette.ts`. Colour literals in `paperPalette.ts` are covered by the
module's own carried-over "defining a palette is its whole job" exemption,
same as `printPalette.ts` — consistent with house style's exemption pattern
rather than a new violation.

**4. `index.tsx` reading app theme — conflicts with `ThemeSection.tsx`?**
No conflict. `index.tsx` only reads `prefs.ui.theme` into local state
`appTheme` (index.tsx:828-832, 847) to feed `effectivePaperTheme`; it never
touches `document.documentElement` or `data-theme`. `ThemeSection.tsx` is
still the only place stamping `data-theme` (ThemeSection.tsx:78-82). Doc
comment on the new state explicitly notes this division of labour.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | app/src/routes/pages/Notebook/model/paperSheet.ts:1-46 / EditorPanes.tsx:88 | `paperSheetContent`'s kind→content rule is a second, independent hand-copy of the rule `EditorPanes`'s `if (kind !== "js")` branch already encodes; only the title consumes it, so the two can drift silently if a new `CellKindToken` is ever added (one file updated, the other's test still green). | Either have `EditorPanes` import `paperSheetContent` to pick its own branch, or leave as-is with a one-line comment in `EditorPanes.tsx` pointing at `paperSheet.ts` as the sibling decision, so the duplication is discoverable from either side. Not blocking for this commit given the brief explicitly asked for a title-only module. |
| Nit | app/src/routes/pages/Notebook/model/paperSheet.test.ts | `ALL_KINDS` list is manually kept in sync with `CellKindToken`'s union rather than derived; the comment claims "a new kind is a compile error here until it is given sheet content" but nothing actually makes the literal array a compile-time exhaustiveness check (a forgotten fourth string just silently omits coverage, no TS error). | Low stakes for a 3-member union; consider a `satisfies Record<CellKindToken, true>` style guard if this list grows. |

No Critical or Important findings. Spec/ruling compliance (item 1: sheet
title only, real dispatch lives in `EditorPanes`; item 2: forced schemes
ignore app theme, `"app"` follows via one isolated function; item 3: no
print-palette leak, light path reads no CSS vars; migration test) all match
what R185 and the dispatch describe, with no unrequested scope creep spotted
in the diff. Tests follow Arrange/Act/Assert (blank lines present in the new
migration test) and the `thing — condition — result` naming convention. No
colour literals were added outside the already-exempted `paperPalette.ts`
module. `tsc --noEmit` is clean and `vitest run` reports the exact expected
185 files / 1868 tests passing.

## Verdict rationale

The commit does exactly what R185's two missing test surfaces required: a
pure, tested `paperSheetContent`/`paperSheetTitle` module wired into the
sheet's title only (honestly documented as such, not misrepresented as the
real per-kind dispatch), a pure `effectivePaperTheme` resolver that forces
correctly and isolates the "no light tokens yet" fact in one function, a
`PaperView` that takes an already-resolved `scheme` and still never touches
the print palette or reads live tokens on the light path, and a migration
test that proves a pre-`paper_theme` prefs document reads back as `"app"`.
The one duplication (title-rule vs. mount-rule for cell kind) is real but
low-severity and was disclosed in the diff's own doc comments rather than
hidden.

VERDICT: CLEAN
