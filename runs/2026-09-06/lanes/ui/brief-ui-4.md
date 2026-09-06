# UI-4 — the shell: bars, mount-and-hide, resizable columns, command palette

The app frame. Bottom bar under 600 px, top bar above, tab order Device · Data ·
Notebook · Settings, every destination kept mounted so its state survives a
switch, a resizable column frame on wide with persisted widths, and a
`Ctrl/⌘-K` palette scaffold. This is the one task that may rewrite `App.tsx`
and `state/`. TDD for the pure modules; ONE commit.

Worktree: `…/idl1-app-worktrees/ui-4`. **Depends on UI-3 on `main`.**
UI-5/6/7 and UI-8 start only after this is merged.

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-4"
git merge-base --is-ancestor <UI-3 merge hash on main> HEAD && echo GATE-OK
test -f app/src/components/Toaster.tsx && echo TOASTER-OK
```
Both must print, else merge `main` (R19 pattern); any conflict outside
`CHANGELOG.md` is STOP and report.

## Files to read first

This lane's `PLAN.md`; `UI-DIRECTION.md` decisions 8, 10–14, 20, 37 and the
whole "App shell and navigation" section; `runs/2026-09-06/RULINGS-DIGEST.md`
— the process-rules block and the Device line ("`device_status` polls at 1 Hz
on mount plus a `visibilitychange` pause", R77.4/R78); `runs/2026-09-05/
WAVE2-OPERATING-BRIEF.md` §4 (effects rule **and its tightening**);
`app/src/App.tsx`, `app/src/routes/types.ts`, `app/src/state/AppState.tsx` and
its two test files; `app/src/routes/pages/Device/index.tsx` (read
`STATUS_POLL_DEPS` and the poll effect in full) and
`app/src/routes/pages/Device/statusPoll.ts` (`StatusPollDeps`,
`isVisible`/`onVisibilityChange`); `docs/vendor/react-19/`;
`docs/vendor/shadcn/` pages for `resizable` and `command`.

## Where

- **New:** `app/src/shell/AppShell.tsx`, `TopBar.tsx`, `BottomBar.tsx`,
  `RouteHost.tsx`, `CommandPalette.tsx`, `layout.ts`, `launchLayout.ts`,
  `columnPrefs.ts`, `routeVisibility.tsx`, plus a `*.test.ts` beside each pure
  module.
- **Lead-owned, allowed here (R92):** `app/src/App.tsx` (rewritten to mount the
  shell), `app/src/routes/types.ts` (tab order), `app/src/state/AppState.tsx`
  (new slices), `app/package.json` + lockfile (`cmdk`, `react-resizable-panels`
  at exact pins).
- **One-file exception:** `app/src/routes/pages/Device/index.tsx` — the
  `STATUS_POLL_DEPS.isVisible`/`onVisibilityChange` composition only (see
  "Mount-and-hide vs. the Device poll"). Change nothing else in that file;
  UI-5 owns the rest and must not undo it.
- **Also:** `CHANGELOG.md`.

## Interfaces

```ts
// app/src/shell/layout.ts
/** The three shell layouts (UI-DIRECTION "App shell and navigation").
 *  Breakpoints are 600 px and 1200 px, in CSS px, matching idl0's 600 dp
 *  bottom-bar switch (FLUTTER-UI-SURVEY §5). */
export type ShellLayout = "narrow" | "medium" | "wide";
export function resolveLayout(widthPx: number): ShellLayout;
/** Where navigation lives in a layout: bottom bar on narrow, top bar above. */
export function navPlacement(layout: ShellLayout): "bottom" | "top";
/** Whether the wide dockable column frame is used at all. */
export function usesColumns(layout: ShellLayout): boolean;

// app/src/shell/launchLayout.ts
/** Which destination the app opens on (R92, resolving the direction's open
 *  question): Device below 1200 px, the studio layout above it, and the last
 *  layout is remembered. `remembered` is null on a first run. */
export function initialRoute(widthPx: number, remembered: RouteId | null): RouteId;

// app/src/shell/columnPrefs.ts
/** Per-machine column widths and collapsed flags, `localStorage` under
 *  `idl1.shell.columns.v1` (the `idl1.<area>.<thing>.v<n>` shape
 *  `Settings/prefs.ts` and `Notebook/model/notebookPrefs.ts` already use).
 *  Never throws: a WebView that refuses storage yields the defaults, and a
 *  refused write is dropped — a remembered width is a convenience. */
export interface ColumnPrefs { widths: Record<ColumnId, number>; collapsed: ColumnId[]; }
export function readColumnPrefs(): ColumnPrefs;
export function writeColumnPrefs(prefs: ColumnPrefs): void;
/** Clamps a restored width to the column's min/max and drops unknown ids, so a
 *  hand-edited or stale document cannot produce an unusable layout. */
export function sanitizeColumnPrefs(raw: unknown): ColumnPrefs;

// app/src/shell/routeVisibility.tsx
/** True when a route's page should behave as "on screen": the window is
 *  visible AND this route is the active one. Under mount-and-hide every page
 *  stays mounted, so `document.visibilityState` alone is no longer the whole
 *  answer (see below). Pure; the context wrapper around it is not. */
export function composeVisibility(windowVisible: boolean, routeActive: boolean): boolean;
export function useRouteVisible(routeId: RouteId): boolean;
export function subscribeRouteVisible(routeId: RouteId, handler: () => void): () => void;
```

## Mount-and-hide vs. the Device poll (R78 — read this twice)

Decision 13 and the direction's "Persistence" line require **mount-and-hide,
not unmount**: `RouteHost` renders all four pages and hides the inactive ones
(`hidden` attribute / `display:none`, an `IndexedStack` equivalent —
`FLUTTER-UI-SURVEY.md` §5). That silently breaks R78: today Device polls
`device_status` at 1 Hz "on mount", and unmounting on tab-switch is what stops
it. Keep every page mounted and a hidden Device tab keeps a BLE link busy at
1 Hz forever.

Fix, in this task:
1. `routeVisibility.tsx` exposes `useRouteVisible` / `subscribeRouteVisible`,
   fed by the shell's active route and `document.visibilityState`.
2. In `Device/index.tsx`, `STATUS_POLL_DEPS.isVisible` becomes
   `composeVisibility(document.visibilityState === "visible", activeRoute === "device")`
   and `onVisibilityChange` subscribes to **both** sources. `statusPoll.ts`
   already pauses on `isVisible() === false` and resumes on the change
   callback, so no polling logic changes — only what "visible" means.
3. The subscription functions are module-scope stable references, exactly as
   `STATUS_POLL_DEPS` is today; do not put a function prop in any dependency
   array (operating brief §4 tightening — Critical on sight).
4. Do not change the poll interval, the link-lost rule, or any other page's
   effects. If another page has an effect that starts IPC on mount and would
   now run while hidden, **do not fix it here** — list it in the report and the
   lead rules.

Tests for the fix: `composeVisibility — window visible, route inactive —
false`; `— window hidden, route active — false`; `— both true — true`. Plus a
`statusPoll` test driving `isVisible` false-then-true through the existing
injected deps to prove the pause/resume path is the one being reused (extend
the existing `statusPoll.test.ts` rather than writing a parallel harness).

## The shell itself

- **Bottom bar (narrow):** four destinations in order Device · Data · Notebook ·
  Settings, 10 px uppercase tracked labels, the active indicator an amber
  (`--hivis`) hairline box with a `--surface-2` fill at 2 px radius — a box,
  not a pill (`FLUTTER-UI-SURVEY.md` §5). 44 px minimum hit target.
- **Top bar (medium/wide):** typeset wordmark (no logo, decision 4),
  destination tabs, active session/lap chips (read `state.selection`; render
  nothing when null), a **placeholder slot** for the playback transport that
  UI-11 fills, the palette trigger (`⌘/Ctrl-K`), and a device status dot fed
  from existing state only — **do not add an IPC call to the shell**.
- **Wide column frame:** `resizable` panels in the reference order library
  (280) | maths graph (flex, an empty shell with a one-line dim mono placeholder
  — decision 11 is explicit that the graph itself is out of scope) | properties
  (320) | notebook output (flex). Columns collapse to icons individually; the
  output column is never collapsible. Widths and collapsed state through
  `columnPrefs`.
- **Command palette:** `cmdk` via shadcn `command`, opened on `Ctrl/⌘-K`,
  populated with the four tab-switch commands and nothing else. The command
  list is a pure array a later lane appends to; type it so a lane can register
  commands without editing this file.
- Mount `<Toaster />` (UI-3) here, once.
- `routes/types.ts`: reorder `ROUTES` to Device · Data · Notebook · Settings.
  `AppState.initialAppState.route` is decided by `initialRoute` at startup, so
  the literal `"notebook"` default moves out of the module constant — keep a
  deterministic constant for tests and set the real value in the provider.

## Gate

```bash
cd app && npx tsc --noEmit && npx vitest run src/shell src/state src/routes/pages/Device
```
Non-zero `passed` required, and every pre-existing Device and AppState test
must still pass unchanged.

## Steps

- [ ] 1. Entry gate. 2. Pure modules + tests first: `layout`, `launchLayout`,
      `columnPrefs`, `composeVisibility`. 3. `RouteHost` mount-and-hide.
      4. Bars + indicator + palette + Toaster mount. 5. Resizable column frame
      with persisted widths. 6. `routes/types.ts` order; `AppState` slices
      (active route already exists — add only what the shell needs).
      7. The Device visibility composition, one file, nothing else.
      8. Gate. 9. `tokenSheet.test.ts` still green. 10. NUL check.
      11. CHANGELOG. 12. Commit `app: shell — bars, mount-and-hide, columns,
      command palette (UI-4)`.

## Do not

- Do not restyle any page's contents — UI-5/6/7/10.
- Do not add an effect that starts IPC anywhere in the shell.
- Do not build the React Flow maths graph; reserve the column only.
- Do not add a routing library (`routes/types.ts`'s doc comment records why).
- Do not touch any file under `Device/` other than the `STATUS_POLL_DEPS`
  composition, and do not touch `Data/`, `Settings/`, `Notebook/` at all.

## Spec discipline

**Spec-during** — the mount-and-hide/visibility rule changes what R78's
"polls on mount" means. Add a short note to `CHANGELOG.md` and state the new
rule in the report so the lead can fold it into the digest: *Device polls while
mounted, the window is visible, and Device is the active route.*

## Report back (≤15 lines)

Commit hash + `git show --stat`; `tsc` result; the filter's `passed` count and
confirmation that the pre-existing Device/AppState counts are unchanged; the
exact `cmdk`/`react-resizable-panels` pins; how `isVisible`/`onVisibilityChange`
were composed (paste the final `STATUS_POLL_DEPS` fields, ≤6 lines); any other
page effect that now runs while hidden; which `AppState` fields were added;
parity gaps; anything needing a ruling.

## Open questions

1. **`hidden` attribute vs. `display:none` for hidden routes.**
   *Recommendation:* the `hidden` attribute plus a CSS rule — it keeps the
   subtree out of the accessibility tree and out of tab order for free, which
   is the whole of decision 17's ambition.
2. **Does the notebook sandbox iframe survive being hidden?** An iframe in a
   `display:none` subtree keeps its document but stops laying out.
   *Recommendation:* accept it for this pass; UI-10 re-measures on becoming
   visible. If the sandbox turns out to need a resize signal, that is a UI-10
   question, not a shell change.
3. **Where does the remembered launch layout live?** *Recommendation:*
   `columnPrefs`'s document, one more field — one `localStorage` key for all
   per-machine shell state, not two.
4. **Session/lap chips in the top bar when nothing is selected.**
   *Recommendation:* render nothing; an empty chip is chrome that teaches
   nothing, and idl0 shows an empty state sentence instead (§8).
