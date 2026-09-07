# Review — UI-4 app shell (bars, mount-and-hide, columns, command palette)

Commit: `b86a008` on branch `ui-4` (worktree `idl1-app-worktrees/ui-4`), one commit on top of
the UI-3 merge (`0cc9ad2`/`dfcb06e`). Files touched (27): `CHANGELOG.md`, `app/package.json`
+ lockfile, `app/src/App.tsx`, `app/src/components/ui/{command,resizable}.tsx`,
`app/src/routes/pages/Device/{index.tsx,statusPoll.test.ts}`, `app/src/routes/types.ts`,
`app/src/shell/{AppShell,BottomBar,ColumnFrame,CommandPalette,RouteHost,TopBar}.tsx` +
`{columnPrefs,commands,launchLayout,layout,routeVisibility}.ts(x)` + their `*.test.ts`,
`app/src/state/AppState.tsx`, `app/src/styles/index.css`.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run
```
`tsc --noEmit`: clean, no errors. `vitest run`: **1000 passed / 108 test files passed**, no
failures, no skips. Also ran `npx vite build` once (both entries) after clearing `dist/`:
built cleanly (`main` + `notebook sandbox` sandbox entry both emitted, only a chunk-size
warning); `dist/` removed afterward per instructions.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | None found. | — |

## Verification notes

- **`resolveLayout`** matches the direction's 600/1200 px breakpoints exactly; boundary
  cases (599/600/1199/1200/2560) are each tested (`shell/layout.test.ts`).
- **Device poll under mount-and-hide (R78/R95 item 1):** `composeVisibility(windowVisible,
  routeActive)` is pure and tested for all four truth-table combinations
  (`routeVisibility.test.ts`). `Device/index.tsx`'s diff is scoped to exactly the
  `STATUS_POLL_DEPS.isVisible`/`onVisibilityChange` fields, as the brief required —
  `statusPoll.ts` itself is untouched (absent from the commit's file list, confirmed by
  `git diff f6d6140..b86a008 -- .../statusPoll.ts` being empty). The extended
  `statusPoll.test.ts` case drives the composed deps through the same pause/resume path
  used for plain window visibility, proving reuse rather than a parallel implementation.
  Traced the mount-order interaction between `RouteHost`'s `setActiveRoute` effect and
  Device's poll-start effect (child effects fire before the parent's in React's commit
  order, so `getActiveRoute()` can briefly read `null` when Device is the first-rendered
  route): the poll driver's own `isVisible()`-false branch subscribes via
  `subscribeRouteVisible`, and `RouteHost`'s effect firing immediately after synchronously
  notifies that same subscription, so the poll starts within the same commit with no
  missed or duplicated tick — not a bug, and covered functionally (if indirectly) by the
  effects rule the module follows.
- **Mount-and-hide:** `RouteHost` renders all four `ROUTE_ELEMENTS` (built once at module
  scope) at a stable position/key per route; only the `hidden` attribute plus the
  `.shell-route-panel[hidden]{display:none}` override in `index.css` (needed because a
  page's own layout classes can otherwise out-specificity `[hidden]`'s UA style) changes
  between active/inactive — no `key` churn on tab switch, confirmed by reading
  `RouteHost.tsx` and the CSS rule together.
- **`routeVisibility.tsx`** exports `composeVisibility`, `useRouteVisible` and
  `subscribeRouteVisible` (plus `setActiveRoute`/`getActiveRoute`) with doc comments
  describing the module-scope store — this is the shared signal UI-10 is expected to reuse
  per R95's ruling (item 2/3), and it is documented as such in its own comments and in
  `RouteHost.tsx`'s doc comment.
- **Column frame:** `resolveLayout`'s `wide` gate matches `usesColumns`; `ColumnFrame`
  renders the four columns in the direction's reference order (library 280 | maths flex |
  properties 320 | output flex), `output` is never collapsible
  (`COLLAPSIBLE_COLUMN_IDS`/`sanitizeCollapsed` both exclude it, and a test asserts a
  hand-edited `collapsed: ["output"]` document is dropped). Widths/collapse persist through
  `columnPrefs.ts`'s single `idl1.shell.columns.v1` key, which also holds `lastRoute`
  (R93 ruling: one key, not two). `readColumnPrefs`/`writeColumnPrefs` both wrap
  `localStorage` access in `try/catch` and fall back to `DEFAULT_COLUMN_PREFS` (read) or a
  silent no-op (write); tested for a throwing `getItem` and a throwing `setItem`, corrupt
  JSON, an out-of-range width (clamped), an unknown collapsed id (dropped), and an unknown
  `lastRoute` (dropped to `null`). The `ColumnFrame` remount when the Notebook route's
  layout crosses 1200 px (the column-wrapped element and the bare page element are
  different React element types at the same tree position) is real, but it does not fire on
  a same-layout tab switch, and the lead's R95 ruling has already accepted it for this pass
  and assigned the general re-measure/resize concern to UI-10 — not re-litigated here.
- **`initialRoute`** matches the R92 ruling (Device below 1200 px, the Notebook/studio route
  at and above it, a remembered route winning over width once one exists); all four cases
  tested including both a narrow and a wide remembered-override case.
- **Command palette:** `Ctrl/⌘-K` toggles `paletteOpen` in `AppShell.tsx`'s
  `keydown` listener (module-independent, effect depends on `[]` only, no function prop in
  its dependency array); `CommandPalette.tsx` renders shadcn's unmodified `CommandDialog`
  (Radix `Dialog` underneath, generated in this commit but not hand-edited beyond the
  standard shadcn template), so Escape-to-close and focus-return are Radix's built-in
  behaviour, not something this lane had to implement. `tabSwitchCommands` produces exactly
  the four nav commands in `ROUTES` order and nothing else, tested both for the id/group
  list and for one command's `run` actually navigating.
- **Effects audit (operating brief §4 + tightening):** three shell effects start no IPC —
  the resize listener (`useWindowWidth`), the `keydown` listener for the palette, and
  `RouteHost`'s `setActiveRoute(state.route)` sync (dependency array is `[state.route]`,
  a data value, not a callback). The one IPC effect at the shell's root
  (`fetchEngineVersion` in `AppShell.tsx`) is carried over verbatim from the old `Shell`
  component (`git show f6d6140:app/src/App.tsx` diffed byte-for-byte against the new
  location) — not new, and its dependency is `[dispatch]`, a stable `useReducer` dispatch.
  No effect anywhere in the diff cancels in-flight work in its cleanup.
- **No IPC added at the shell level:** `grep -rn "invoke(" app/src/shell/` returns nothing;
  `TopBar`'s device status dot is explicitly unwired (`StatusDot` fed no state, title says
  so), matching the brief's "do not add an IPC call to the shell" and R95's ruling that
  wiring it is a UI-5 follow-on.
- **Dependencies:** `cmdk@1.1.1` and `react-resizable-panels@4.12.4` are both exact pins (no
  `^`/`~`) in `package.json` and match the lockfile's resolved versions; no stray `cn`
  package was added (checked the `package.json` diff directly).
- **Styling discipline:** no colour literal outside `tokens.css` in any file this commit
  touches (`grep` for hex literals across the new shell/component files found none); the
  only `box-shadow` lines are the pre-existing UI-3 shadow-stripping rules
  (`box-shadow: none`), not a new shadow.
- **`BottomBar`/`TopBar`** match the direction: bottom bar order Device·Data·Notebook·
  Settings, 10 px uppercase tracked labels (`text-nav`), `--hivis` hairline box + `--surface-2`
  fill (not a pill) on the active item, `min-h-[var(--hit-target)]` (44 px) hit target; top
  bar carries the wordmark (no logo), destination tabs, a selection chip that renders
  nothing when `selection.sessionId` is `null`, a reserved playback-transport slot for
  UI-11, the `⌘K` trigger and the unwired status dot.
- **`routes/types.ts`** reorders `ROUTES` to Device·Data·Notebook·Settings per decision 10;
  `AppState.tsx`'s `TEST_DEFAULT_ROUTE` constant is kept for existing tests while the real
  provider resolves the launch route via `initialRoute`, exactly as the brief asked ("the
  literal `"notebook"` default moves out of the module constant").
- **CHANGELOG.md** entry for UI-4 accurately describes the shipped behaviour, including the
  R78-superseding rule ("Device polls while mounted, the window is visible, and Device is
  the active route") and the new exact-pinned dependencies; spec-during as declared.
- Pre-existing `Device`/`AppState` test files (`statusPoll.test.ts` prior cases,
  `AppState.test.ts`, `AppState.selection.test.ts`) are present unchanged except the one
  approved new `statusPoll.test.ts` case and pass in the full 1000/1000 run; no regression
  visible in the whole-suite result.
- The R95 ruling (already on record before this review) accepted this lane's report as-is
  on every open item raised (Device poll fixed here; sandbox/watcher/eval gating deferred to
  UI-10; one-shot mount reads elsewhere accepted; `lastRoute` placement, width-bound
  constants, unwired device dot, and the cross-1200px remount all accepted). Nothing in the
  code contradicts that ruling.

## Verdict rationale

The commit does exactly what the brief and UI-DIRECTION specify: bars at the right
breakpoints, true mount-and-hide with no remount on tab switch, a resizable column frame
with persisted and sanitized widths, a scoped command-palette scaffold, and the one
required fix to keep the Device poll from running forever in the background — all as pure,
unit-tested modules wired through effects that follow the tightened effects rule. No file
outside the lane's ownership was touched beyond the explicitly authorized one-line
composition in `Device/index.tsx`. The whole-suite gate (`tsc` + `vitest run`, 1000/1000)
and a full `vite build` both pass cleanly. The lead's R95 ruling has already resolved every
open question the implementer raised, and nothing in the landed code conflicts with it.

VERDICT: CLEAN
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\runs\2026-09-06\lanes\ui\review-ui-4.md
COUNTS: critical=0 important=0 minor=0
NOTES: R95 already ruled on every open item the implementer's report raised (Device poll fixed here; sandbox/eval gating deferred to UI-10; ColumnFrame's cross-1200px remount accepted); nothing in the code contradicts that ruling.
