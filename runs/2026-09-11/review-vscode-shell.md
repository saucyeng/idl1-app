# Review: vscode-shell (commit 69a5442, ruling R220)

**Commit:** `69a5442` "shell: VS Code anatomy -- menu bar, activity bar, sidebar, status bar (R220)"
on branch `vscode-shell`, single commit reviewed against `main`.

**Files touched (38):** CHANGELOG.md; `runs/2026-09-06/ui/UI-DIRECTION.md`; shell chrome —
`AppShell.tsx`, `TitleBar.tsx` (new), `MenuBar.tsx` (new), `ActivityBar.tsx` (new),
`Sidebar.tsx` (new), `StatusBar.tsx` (new), `BottomBar.tsx`, `AboutDialog.tsx` (new),
`RootErrorBoundary.tsx`, `ToolbarSlotRow.tsx`, `ImportStatusChip.tsx`, `TopBar.tsx` (deleted);
pure modules — `menuModel.ts`+test, `activityBadges.ts`+test, `sidebarPrefs.ts`+test,
`memoryBudget.ts`+test, `activityIcons.ts`, `columnPrefs.ts`+test; stores —
`commandRegistry.ts`, `sidebarSlot.ts`, `deviceLink.ts`; route pages —
`Data/index.tsx`, `Data/ImportPanel.tsx`, `Device/index.tsx`, `Device/DeviceList.tsx` (new),
`Notebook/index.tsx`, `Notebook/components/NotebookSidebar.tsx` (new),
`Notebook/components/WorkbookMenuDialogs.tsx` (new), `Notebook/model/tileCache.ts`,
`Settings/index.tsx`; `styles/tokens.css`.

**Test command run:** `npx vitest run src/shell` from the worktree's `app/`.
**Result:** `Test Files 26 passed (26)`, `Tests 234 passed (234)`. Gates already reported
green by the implementer (`tsc --noEmit` exit 0; full `vitest run` 220 files / 2247 tests
vs. baseline 216/2198; `vite build` exit 0) were not rerun, per instructions.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `app/src/shell/menuModel.ts:149-150`, `AppShell.tsx:207`, `MenuBar.tsx` (render) | `Edit ▸ Undo` and `Edit ▸ Redo` are listed in `MENUS` with shortcuts, but no code anywhere calls `registerCommand`/`useCommand` for `edit.undo`/`edit.redo`. `resolveMenus` therefore always returns `enabled: false` for both, forever, on every route and every render — the Edit menu is two permanently-disabled items. `commandForEvent` correctly excludes them from the shell's keydown handler so the editor's own keymap can still handle `Ctrl+Z`/`Ctrl+Shift+Z` when focused, but that only helps the keyboard path; the menu *click* path has no handler at all, contradicting the commit's own CHANGELOG line "Every menu entry runs a command that already existed... and greys out when that command cannot run" (greying out implies it can become enabled; these two never can). This is the one item on the R220 command list that behaves differently from every other menu entry, and it is undocumented — no code comment or UI-DIRECTION note calls it out the way the Data-sidebar and worksheet-tabs deviations are called out elsewhere in this same commit. | Either register `edit.undo`/`edit.redo` against the focused editor's history commands (e.g. from the CodeMirror wrapper, gated on focus/availability) or remove them from `MENUS` and document why Undo/Redo are keyboard-only, the way the Data-sidebar and worksheet-tabs gaps are documented elsewhere in this commit. |
| Minor | `app/src/shell/AppShell.tsx` (render, `TitleBar` mount condition) | When `narrow === true` and `customTitleBar === false` (a platform with native window decorations at phone width), `TitleBar` is not mounted at all, so there is no menu bar and no "⋯" fallback — R220 item 3 says "the menu bar is absent (commands live in a ⋯ menu in the title strip)", which implies the title strip itself is still present. This matches the *old* TopBar's behaviour bit-for-bit (it also rendered nothing at narrow width without a custom title bar), so it is not a regression, but it is a real gap against the ruling's literal text in that one platform/width combination. | Confirm with the brief owner whether this combination is in scope (likely not reachable on the shipped desktop targets); if it is, mount `TitleBar collapsed` unconditionally at narrow widths. |
| Minor (documented, not a defect) | `app/src/routes/pages/Data/index.tsx` (new `railInSidebar` comment); `app/src/routes/pages/Notebook/components/NotebookSidebar.tsx` (top doc comment) | Two of R220 item 1's five sidebar-content lines are not delivered as written: Data's sidebar holds the filter rail, not the session list ("the list is a seven-column table... a change to the Data tab rather than to the shell"); Notebook's sidebar has no worksheet tabs ("this document model has no worksheet"). Both are called out explicitly in code comments and in the same commit's `UI-DIRECTION.md` "Not built, and why" section, rather than silently dropped, so they read as reasoned, disclosed deviations rather than the ambiguity-policy violation CLAUDE.md §1 is aimed at — but per the task instructions the brief's ruling text is what should have been asked about before landing, not decided and reported after the fact. | No code change needed; note as an open question for the lead/brief-owner to bless or reject explicitly (R220 addendum), since CLAUDE.md §1 puts the burden on asking first. |
| Minor | `app/src/shell/StatusBar.tsx` (`DEVICE_TEXT`) vs `app/src/shell/activityBadges.ts` (`DEVICE_BADGE` titles) | The device-lost state is worded differently in two places the user sees close together: the status-bar item says "Device not answering", the activity-bar badge's accessible title says "Device connected, not answering". Not a functional bug (two independent components, each documented), but a copy inconsistency a maintainer would probably want unified. | Share one string constant for the "lost" wording, or accept the divergence explicitly. |

## Correctness checks performed

- **Sidebar resize (`Sidebar.tsx`):** `onPointerDown` sets pointer capture and records `{pointerId, startX, startWidth}`; `onPointerMove`/`endDrag` both verify `drag.pointerId === event.pointerId` before acting; `endDrag` guards `releasePointerCapture` with `hasPointerCapture`; width during drag is computed as `startWidth + delta` (not from a possibly-stale `widthPx`), and `latestWidth.current = widthPx` is refreshed every render for the keyboard-resize and settle paths. No stale-closure or double-release bugs found.
- **Keydown routing (`AppShell.tsx` + `menuModel.commandForEvent`):** every bound shortcut requires `mod` (Ctrl/⌘) except none — all 12 shortcuts in `MENUS` carry `mod: true`, so plain typing in a text input or the CodeMirror editor is never intercepted (`commandForEvent`'s own test: "a bare letter — resolves to nothing"). `preventDefault()` fires only after `runCommand` succeeds, so a shortcut with no registered handler falls through to the browser/editor default rather than being silently swallowed. Undo/Redo are explicitly excluded from this handler so the focused editor's own keymap keeps them (see Important finding above re: the menu-click path).
- **`commandRegistry.ts` StrictMode double-invoke:** `unregisterCommand` compares handler identity before deleting (`if (handlers.get(id) !== handler) return`), so a StrictMode remount that registers-then-unregisters-then-registers again cannot have its live registration clobbered by the first mount's delayed cleanup. `useCommand`'s "latest ref" pattern re-registers only when `id`/`available` change, not on every render.
- **`sidebarPrefs.ts` sanitisation:** `clampSidebarWidth` rejects non-finite/non-number input and rounds; `sanitizeSidebarPrefs` rejects non-object/array input at both the document and per-shape level and rebuilds every `AspectClass` key from `ASPECT_CLASSES`, so a hand-edited or partial `localStorage` document can never produce a missing shape, an out-of-range width, or a non-boolean `collapsed`. Confirmed wired into `columnPrefs.ts`'s `sanitizeColumnPrefs`/`DEFAULT_COLUMN_PREFS`.
- **Dimensions vs. brief:** `--shell-title-bar-h: 32px`, `--shell-activity-bar-w: 48px`, `--shell-status-bar-h: 22px`, `SIDEBAR_MIN_WIDTH_PX = 200`, `SIDEBAR_MAX_WIDTH_PX = 480` all match R220 item 1 exactly. `Ctrl+1..4` for Go, `Ctrl+B` for the sidebar match items 1/2.
- **No duplicated controls found:** `ImportStatusChip` now has exactly one call site (`StatusBar.tsx`); `TopBar.tsx` was deleted outright, not left as dead code.
- **Docs/units/errors:** every new public export in the four pure modules and the three new stores carries a doc comment; `memoryBudget.ts`'s byte/percentage values and `sidebarPrefs.ts`'s px values are labelled; no `Err(String)`-equivalent or `unwrap()`-equivalent crash paths were introduced (this is a TS-only lane, so no Rust typed-error requirement applies); no bare `// TODO`.
- **Tests:** all new/changed test files (`menuModel.test.ts`, `activityBadges.test.ts`, `sidebarPrefs.test.ts`, `memoryBudget.test.ts`, `columnPrefs.test.ts`) follow `thing — condition — result` naming and Arrange/Act/Assert with blank lines; ran `npx vitest run src/shell` (26 files, 234 tests, all passing) to spot-check them directly.

## Verdict rationale

The shell reshape is careful, well-documented, and the pure modules (`menuModel.ts`,
`activityBadges.ts`, `sidebarPrefs.ts`, `memoryBudget.ts`) plus the new stores
(`commandRegistry.ts`, `sidebarSlot.ts`, `deviceLink.ts`) are exactly the kind of code CLAUDE.md
asks for — pure, tested, documented, with StrictMode and stale-pointer hazards handled
correctly. The two named deviations from R220 item 1 (Data's sidebar content, Notebook's
worksheet tabs) are disclosed in-line and in the same-lane UI-DIRECTION amendment rather than
silently dropped, which is the right way to handle an ambiguity discovered mid-build even
though CLAUDE.md §1 technically wants that asked before landing. The one real defect is the
Edit menu's Undo/Redo: they are listed with shortcuts and read by every test and by the
CHANGELOG as "runs a command that already existed... and greys out when that command cannot
run," but nothing in the codebase ever registers a handler for them, so they are permanently
disabled dead menu items — a real, if narrow, gap between what ships and what R220 and the
commit's own changelog claim. That is a single well-isolated fix (or a one-line honest
disclosure), not a structural problem, so this does not rise to a rework.

VERDICT: NEEDS_FIXES
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\vscode-shell\runs\2026-09-11\review-vscode-shell.md
COUNTS: critical=0 important=1 minor=3
NOTES: Edit ▸ Undo/Redo are listed with shortcuts in the menu tree but never registered anywhere, so they render permanently disabled — contradicts the commit's own CHANGELOG claim that every menu entry "greys out when that command cannot run" (implying it can also grey in).
